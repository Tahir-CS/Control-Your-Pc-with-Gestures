// OpsGhost Renderer Process
const { ipcRenderer } = require('electron');
const { FilesetResolver, HandLandmarker } = require('@mediapipe/tasks-vision');
const { GoogleGenAI, Modality } = require('@google/genai');

// State
let handLandmarker;
let geminiSession;
let isAgenticMode = false;
let isVideoSharing = false;
let isEmergencyStop = false;
let screenStream;
let lastGestureTime = 0;
let audioContext = null;
let audioQueue = [];
let isPlayingAudio = false;
const GESTURE_DEBOUNCE = 300; // ms for mouse clicks
const KEYBOARD_DEBOUNCE = 250; // ms for keyboard key presses

// Click state management to prevent drift and multiple clicks
let clickState = 'IDLE'; // IDLE, CLICK_DETECTED, WAITING_RELEASE
let stableCursorX = 0;
let stableCursorY = 0;
let lastClickState = false;
let clickStateTimestamp = 0; // Track when state changed (for recovery)
const STATE_TIMEOUT = 2000; // Auto-reset if stuck >2 seconds

// SoM (Set-of-Mark) element cache
let cachedSoMElements = []; // Stores last enumerated elements with coordinates

// DOM Elements
const cursorEl = document.getElementById('cursor');
const handCanvas = document.getElementById('handCanvas');
const ctx = handCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcam');
const screenCanvas = document.getElementById('screenCanvas');
const screenCtx = screenCanvas.getContext('2d');

const handStatusEl = document.getElementById('handStatus');
const gestureStatusEl = document.getElementById('gestureStatus');
const geminiStatusEl = document.getElementById('geminiStatus');
const agenticStatusEl = document.getElementById('agenticStatus');
const videoStatusEl = document.getElementById('videoStatus');
const agenticButton = document.getElementById('agenticButton');
const videoButton = document.getElementById('videoButton');
const transcriptionEl = document.getElementById('transcription');

// Keyboard elements (initialized after DOM loads)
let keyboardEl = null;
let keyboardToggleBtn = null;
let allKeys = [];
let isKeyboardVisible = false;
let hoveredKey = null;

// Multi-hand keyboard tracking
let handKeyHovers = {}; // { handIndex: keyName }
let handClickStates = {}; // { handIndex: 'IDLE' | 'CLICKING' }
let handLastKeyTime = {}; // { handIndex: timestamp } - for debouncing

// Track mouse-interactable elements
const statusPanel = document.getElementById('statusPanel');
let isOverPanel = false;

document.addEventListener('mousemove', (e) => {
  const panel = statusPanel.getBoundingClientRect();
  const wasOverPanel = isOverPanel;
  
  // Check if mouse is over any clickable UI element (status panel, keyboard button, or keyboard)
  let isOverClickableUI = false;
  
  // Check status panel
  if (e.clientX >= panel.left && e.clientX <= panel.right &&
      e.clientY >= panel.top && e.clientY <= panel.bottom) {
    isOverClickableUI = true;
  }
  
  // Check keyboard toggle button (if exists)
  if (keyboardToggleBtn) {
    const btnRect = keyboardToggleBtn.getBoundingClientRect();
    if (e.clientX >= btnRect.left && e.clientX <= btnRect.right &&
        e.clientY >= btnRect.top && e.clientY <= btnRect.bottom) {
      isOverClickableUI = true;
    }
  }
  
  // Check keyboard (if visible and exists)
  if (keyboardEl && isKeyboardVisible) {
    const kbRect = keyboardEl.getBoundingClientRect();
    if (e.clientX >= kbRect.left && e.clientX <= kbRect.right &&
        e.clientY >= kbRect.top && e.clientY <= kbRect.bottom) {
      isOverClickableUI = true;
    }
  }
  
  isOverPanel = isOverClickableUI;
  
  // Toggle mouse events if state changed
  if (isOverPanel !== wasOverPanel) {
    ipcRenderer.send('set-ignore-mouse-events', !isOverPanel, { forward: true });
  }
});

// Initialize
async function initialize() {
  handCanvas.width = window.innerWidth;
  handCanvas.height = window.innerHeight;
  
  initializeKeyboard();
  await initializeHandTracking();
  await initializeScreenCapture();
  
  geminiStatusEl.textContent = 'READY (Click Enable)';
  geminiStatusEl.style.color = '#ffaa00';
  
  startHandTracking();
}

// Initialize MediaPipe Hand Tracking
async function initializeHandTracking() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );
  
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2  // Track BOTH hands for fast 2-hand typing!
  });
  
  // Start webcam for hand tracking
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 }
  });
  webcamVideo.srcObject = stream;
  
}

// Initialize Desktop Screen Capture
async function initializeScreenCapture() {
  const sources = await ipcRenderer.invoke('get-desktop-sources');
  const primaryScreen = sources[0];
  
  screenStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: primaryScreen.id,
        minWidth: 1280,
        maxWidth: 1920,
        minHeight: 720,
        maxHeight: 1080
      }
    }
  });
}

// Initialize Gemini Live API
async function initializeGemini() {
  const apiKey = await ipcRenderer.invoke('get-api-key');
  
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE' || apiKey.trim() === '') {
    geminiStatusEl.textContent = 'NO API KEY';
    geminiStatusEl.style.color = '#ff4444';
    throw new Error('No API key found');
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    geminiSession = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        
        systemInstruction: `You are OpsGhost, an AI assistant that can HEAR the user's voice and control their computer.

🎯 CRITICAL RULE: When user says "click on X" → Use SET-OF-MARK method!
1. capture_screen() - Takes screenshot WITH numbered labels on every clickable element
2. You see the screenshot with RED numbered circles (#1, #2, #3...) on each button/link
3. Find which number matches what the user wants
4. click_element(id) - Click that number! PIXEL-PERFECT using OS coordinates!

═══════════════════════════════════════════════════════════════

🚀 TIER 1 - APP LAUNCHING (Instant!):
• search_and_launch(query) - Opens apps directly (chrome, calculator, notepad, etc.)
  Example: "open chrome" → search_and_launch("chrome")

• focus_window(title) - Switch to already-open windows
  Example: "switch to chrome" → focus_window("chrome")

═══════════════════════════════════════════════════════════════

🎯 TIER 2 - SET-OF-MARK CLICKING (Pixel-Perfect!) 🏆

**The #1 method for clicking ANY element accurately!**

### How it works:
1. **capture_screen()** → Takes screenshot + finds ALL clickable elements via Windows UI Automation
2. **You receive:** The screenshot with RED numbered labels (#1, #2, #3...) AND a text list of element names
3. **You pick:** Which number matches what the user wants
4. **click_element(id)** → Clicks the EXACT CENTER of that element using OS-level coordinates!

### Example:
User: "Click on my profile"
→ capture_screen()
→ You see screenshot. Response includes:
    #1: "Search" [edit]
    #2: "Notifications" [button]  
    #3: "Messages" [button]
    #4: "Profile" [button]
→ click_element(4) → 🎯 Pixel-perfect click on Profile!

### Why this is PERFECT:
- ✅ **Zero guessing** - You SEE the numbers on the screenshot
- ✅ **Pixel-perfect** - Coordinates come from Windows UI Automation (not AI vision math)
- ✅ **No scaling errors** - OS-level coordinates, not screenshot coordinates
- ✅ **Works everywhere** - Buttons, links, menus, checkboxes, inputs
- ✅ **Professional** - Same technique as Microsoft OmniParser & Claude Computer Use

### Fallback: Keyboard Shortcuts ⚡
Use shortcuts when they exist (faster than screenshot):
- New tab: press_shortcut("ctrl+t")
- Address bar: press_shortcut("ctrl+l")
- Close tab: press_shortcut("ctrl+w")
- Back/Forward: press_shortcut("alt+left") / press_shortcut("alt+right")
- Refresh: key_tap("F5")

### Fallback: Tab Navigation
If capture_screen() finds no elements, use Tab:
- navigate_with_tab(1) → press_enter()

═══════════════════════════════════════════════════════════════

⚡ TIER 3 - TYPING & SHORTCUTS:
• press_shortcut(keys) - Any key combo (Ctrl+T, Alt+Tab, etc.)
• type_string(text) - Type anything
• press_enter() - Press Enter key

═══════════════════════════════════════════════════════════════

📋 COMPLETE WORKFLOW EXAMPLES:

1. User: "Click on my profile"
   → capture_screen() → [See #4 is "Profile"] → click_element(4) → ✅ PERFECT!

2. User: "Open a new tab"
   → press_shortcut("ctrl+t") → ✅ INSTANT!

3. User: "Click the Subscribe button"
   → capture_screen() → [See #7 is "Subscribe"] → click_element(7) → ✅ PIXEL-PERFECT!

4. User: "Open Chrome and go to YouTube"
   → search_and_launch("chrome") → press_shortcut("ctrl+l") → type_string("youtube.com") → press_enter()

5. User: "Click on login"
   → capture_screen() → [See #2 is "Login"] → click_element(2) → ✅ EXACT!

6. User: "What do you see?" 
   → capture_screen() → Describe what you see

═══════════════════════════════════════════════════════════════

💡 DECISION FLOWCHART:
1. Does a keyboard shortcut exist? → YES: Use press_shortcut() (instant!)
2. Need to click something? → capture_screen() → click_element(id) (pixel-perfect!)
3. No elements found? → navigate_with_tab(1) → press_enter() (fallback)

⚡ TIPS:
• capture_screen() returns BOTH the screenshot AND a numbered element list
• click_element(id) uses the NUMBER, not a name! e.g. click_element(4) not click_element("Profile")
• If the element you need isn't in the list, try Tab navigation as fallback
• Always check shortcuts first - they're faster than screenshots!
• Be fast and confident: "I see Profile is #4, clicking it now!"`,
        
        tools: [
          {
            functionDeclarations: [
              {
                name: 'mouse_move',
                description: '⚠️ LOW-LEVEL: Move mouse to absolute pixel coordinates. Prefer click_element() for clicking UI elements! Only use for drag operations or custom coordinates.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    x: { type: 'NUMBER', description: 'X pixel coordinate' },
                    y: { type: 'NUMBER', description: 'Y pixel coordinate' }
                  },
                  required: ['x', 'y']
                }
              },
              {
                name: 'mouse_click',
                description: '⚠️ LOW-LEVEL: Click at current mouse position. Prefer click_element() which uses exact OS coordinates! Only use after mouse_move for special cases.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    button: { type: 'STRING', description: 'left or right' }
                  },
                  required: ['button']
                }
              },
              {
                name: 'type_string',
                description: 'Type a string of text',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    text: { type: 'STRING', description: 'Text to type' }
                  },
                  required: ['text']
                }
              },
              {
                name: 'key_tap',
                description: 'Press a keyboard key with optional modifiers',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    key: { type: 'STRING', description: 'Key to press (e.g., enter, tab, escape)' },
                    modifiers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Modifier keys' }
                  },
                  required: ['key']
                }
              },
              {
                name: 'launch_app',
                description: 'Launch an application on Windows. Supports: chrome, firefox, edge, notepad, calculator, explorer, cmd, powershell, vscode, etc.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    app_name: { type: 'STRING', description: 'Name of the application to launch (e.g., "chrome", "notepad", "calculator")' }
                  },
                  required: ['app_name']
                }
              },
              {
                name: 'search_and_launch',
                description: '🚀 INSTANT APP LAUNCHER: Opens applications directly (chrome, firefox, calculator, notepad, discord, spotify, etc.). Use this for ALL "open [app]" commands. Faster than Windows Search!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: { type: 'STRING', description: 'App name to launch (e.g., "chrome", "calculator", "notepad", "discord")' }
                  },
                  required: ['query']
                }
              },
              {
                name: 'press_shortcut',
                description: '⚡ FAST: Press keyboard shortcut combinations. Examples: "ctrl+t" (new tab), "alt+tab" (switch window), "ctrl+w" (close tab), "ctrl+l" (address bar), "win+d" (show desktop)',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    keys: { type: 'STRING', description: 'Shortcut keys with + separator (e.g., "ctrl+t", "alt+f4", "ctrl+shift+n")' }
                  },
                  required: ['keys']
                }
              },
              {
                name: 'focus_window',
                description: '🎯 SMART: Bring an existing window to the front by searching for text in its title (partial match). Example: focus_window("Chrome") finds "Google Chrome - New Tab"',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING', description: 'Part of the window title to search for (e.g., "Chrome", "Notepad", "Discord")' }
                  },
                  required: ['title']
                }
              },
              {
                name: 'get_active_window',
                description: '📍 Get the title of the currently focused window (for context awareness)',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'capture_screen',
                description: '📸 SMART CAPTURE: Takes screenshot with NUMBERED LABELS on all clickable elements (Set-of-Mark). Returns element list with IDs. ALWAYS call this FIRST before clicking anything! Then use click_element(id) to click any numbered element.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'click_element',
                description: '🎯 PIXEL-PERFECT CLICK: Click a numbered element from capture_screen(). Uses exact OS-level coordinates from UI Automation - NO guessing! MUST call capture_screen() first to get element numbers. Example: capture_screen() shows #4 is "Settings", then click_element(4).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    id: { type: 'NUMBER', description: 'Element number from the capture_screen() numbered overlay' }
                  },
                  required: ['id']
                }
              },
              {
                name: 'navigate_with_tab',
                description: '⬆️ FALLBACK: Press Tab to move through elements. Use as backup when click_element() doesn\'t work. Prefer capture_screen() → click_element(id) flow.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    count: { type: 'NUMBER', description: 'Number of Tab presses' }
                  }
                }
              },
              {
                name: 'get_focused_element',
                description: '❓ READ: Get text/type of currently focused element. Useful after Tab navigation. Limited in Chrome (may return empty names).',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'navigate_backwards',
                description: '⬅️ Shift+Tab to go backwards through UI elements. Use if you tab too far past the target.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    count: { type: 'NUMBER', description: 'Number of Shift+Tab presses' }
                  }
                }
              },
              {
                name: 'press_enter',
                description: '✅ ACTIVATE: Press Enter to activate the focused element. Use after navigate_with_tab() as fallback. Primary method is click_element().',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'press_space',
                description: '☑️ TOGGLE: Press Space to toggle checkboxes/radio buttons after tabbing to them.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'get_element_bounds',
                description: '📐 Get bounding box of currently focused element. Returns centerX, centerY, width, height. Prefer click_element() instead.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'click_element_center',
                description: '🎯 Click center of currently focused element using UI Automation bounds. Prefer click_element() with SoM IDs instead.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              }
            ]
          }
        ]
      },
      callbacks: {
        onopen: () => {
          geminiStatusEl.textContent = 'CONNECTED';
          geminiStatusEl.style.color = '#00ff00';
        },
        
        onmessage: (message) => {
          handleGeminiMessage(message);
        },
        
        onclose: () => {
          geminiStatusEl.textContent = 'DISCONNECTED';
          geminiStatusEl.style.color = '#ff4444';
        },
        
        onerror: (error) => {
          geminiStatusEl.textContent = 'ERROR';
          geminiStatusEl.style.color = '#ff0000';
          showTranscription(`Error: ${error.message}`);
        }
      }
    });
    
  } catch (error) {
    geminiStatusEl.textContent = 'ERROR';
    geminiStatusEl.style.color = '#ff0000';
    showTranscription(`Gemini Error: ${error.message}`);
  }
}

// Start Hand Tracking Loop
function startHandTracking() {
  function track() {
    if (webcamVideo.readyState === 4) {
      const results = handLandmarker.detectForVideo(webcamVideo, performance.now());
      processHandResults(results);
    }
    requestAnimationFrame(track);
  }
  track();
}

// Process Hand Tracking Results
function processHandResults(results) {
  ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  
  if (results.landmarks && results.landmarks.length > 0) {
    handStatusEl.textContent = `${results.landmarks.length} HAND(S)`;
    handStatusEl.style.color = '#00ff00';
    
    // Process EACH hand for keyboard interaction
    const gestures = [];
    results.landmarks.forEach((landmarks, index) => {
      // Draw this hand
      drawHandLandmarks(landmarks, index);
      
      // Get gesture for this hand
      const gesture = detectGesture(landmarks);
      gestures.push(gesture);
      
      // If keyboard is visible, check if THIS hand is hovering a key
      if (isKeyboardVisible) {
        checkKeyboardHoverForHand(gesture.x, gesture.y, index);
      }
    });
    
    // Use the PRIMARY hand for cursor control
    const primaryGesture = gestures[0];
    
    // Update gesture status
    const gestureTypes = gestures.map(g => g.type).join(' + ');
    gestureStatusEl.textContent = gestureTypes.toUpperCase();
    
    // Handle primary gesture (cursor movement + clicks)
    handleGesture(primaryGesture, results.landmarks[0]);
    
    // Handle keyboard typing from ALL hands
    if (isKeyboardVisible) {
      gestures.forEach((gesture, index) => {
        handleKeyboardGesture(gesture, index);
      });
    }
  } else {
    handStatusEl.textContent = 'NO';
    handStatusEl.style.color = '#ff4444';
    gestureStatusEl.textContent = 'NONE';
    cursorEl.style.display = 'none';
  }
}

// Draw Hand Landmarks
function drawHandLandmarks(landmarks, handIndex = 0) {
  // Different colors for each hand
  const colors = ['#00ff00', '#00ffff', '#ff00ff'];
  const color = colors[handIndex % colors.length];
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillStyle = color;
  
  // Draw connections
  const connections = [
    [0,1],[1,2],[2,3],[3,4], // Thumb
    [0,5],[5,6],[6,7],[7,8], // Index
    [0,9],[9,10],[10,11],[11,12], // Middle
    [0,13],[13,14],[14,15],[15,16], // Ring
    [0,17],[17,18],[18,19],[19,20], // Pinky
    [5,9],[9,13],[13,17] // Palm
  ];
  
  ctx.beginPath();
  connections.forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];
    ctx.moveTo(startPoint.x * handCanvas.width, startPoint.y * handCanvas.height);
    ctx.lineTo(endPoint.x * handCanvas.width, endPoint.y * handCanvas.height);
  });
  ctx.stroke();
  
  // Draw points
  landmarks.forEach((landmark) => {
    ctx.beginPath();
    ctx.arc(
      landmark.x * handCanvas.width,
      landmark.y * handCanvas.height,
      5,
      0,
      2 * Math.PI
    );
    ctx.fill();
  });
}

// Detect Gesture
function detectGesture(landmarks) {
  // Index finger tip (landmark 8) - for pinch detection
  const indexTip = landmarks[8];
  // Index finger BASE/knuckle (landmark 5) - for cursor position (STABLE!)
  const indexMCP = landmarks[5];
  
  // Middle finger tip (landmark 12)
  const middleTip = landmarks[12];
  const middleMCP = landmarks[9];
  
  // Thumb tip (landmark 4)
  const thumbTip = landmarks[4];
  
  // Calculate pinch distances (using fingertips)
  const indexThumbDist = Math.sqrt(
    Math.pow(indexTip.x - thumbTip.x, 2) +
    Math.pow(indexTip.y - thumbTip.y, 2)
  );
  
  const middleThumbDist = Math.sqrt(
    Math.pow(middleTip.x - thumbTip.x, 2) +
    Math.pow(middleTip.y - thumbTip.y, 2)
  );
  
  // Detect finger extensions
  const isIndexExtended = indexTip.y < indexMCP.y;
  const isMiddleExtended = middleTip.y < middleMCP.y;
  
  // Left Click = Index + Thumb pinch (middle extended)
  const isLeftClick = indexThumbDist < 0.06 && isMiddleExtended;
  
  // Right Click = Middle + Thumb pinch (index extended, not left clicking)
  const isRightClick = middleThumbDist < 0.06 && isIndexExtended && indexThumbDist > 0.08;
  
  // CRITICAL: Use index BASE (knuckle) for cursor position
  return {
    type: isLeftClick ? 'left_click' : isRightClick ? 'right_click' : 'point',
    x: (1 - indexMCP.x) * window.innerWidth,  // Using BASE not tip!
    y: indexMCP.y * window.innerHeight,        // Using BASE not tip!
    isLeftClick,
    isRightClick,
    isClicking: isLeftClick || isRightClick,
    isOpenPalm: false
  };
}

// Check for Open Palm (Emergency Stop)
function checkOpenPalm(landmarks) {
  // Check if all fingertips are above their respective MCPs
  const fingers = [
    { tip: 4, mcp: 2 },   // Thumb
    { tip: 8, mcp: 5 },   // Index
    { tip: 12, mcp: 9 },  // Middle
    { tip: 16, mcp: 13 }, // Ring
    { tip: 20, mcp: 17 }  // Pinky
  ];
  
  let extendedCount = 0;
  fingers.forEach(finger => {
    if (landmarks[finger.tip].y < landmarks[finger.mcp].y) {
      extendedCount++;
    }
  });
  
  return extendedCount >= 5;
}

// Handle Gesture
function handleGesture(gesture, landmarks) {
  const isClicking = gesture.isClicking;
  const now = Date.now();
  
  // Auto-recovery: If stuck in WAITING_RELEASE for too long, force reset
  if (clickState === 'WAITING_RELEASE' && (now - clickStateTimestamp) > STATE_TIMEOUT) {
    console.warn('⚠️ State timeout! Forcing reset to IDLE');
    clickState = 'IDLE';
    clickStateTimestamp = now;
  }
  
  // CURSOR ALWAYS MOVES (unless actively clicking)
  if (!isClicking || clickState === 'IDLE') {
    // Update stable position when hand is relaxed
    if (!isClicking) {
      stableCursorX = gesture.x;
      stableCursorY = gesture.y;
    }
    
    // Move cursor to index finger position
    cursorEl.style.display = 'block';
    cursorEl.style.left = gesture.x + 'px';
    cursorEl.style.top = gesture.y + 'px';
    
    // Move the real Windows cursor
    moveCursor(gesture.x, gesture.y);
    
    // Check keyboard hover
    if (isKeyboardVisible) {
      checkKeyboardHover(gesture.x, gesture.y);
    }
  }
  
  // Visual feedback
  if (isClicking) {
    cursorEl.classList.add('pinching');
    if (gesture.isLeftClick) {
      cursorEl.style.borderColor = '#00ffff'; // Cyan for left-click
    } else if (gesture.isRightClick) {
      cursorEl.style.borderColor = '#ff8800'; // Orange for right-click
    }
  } else {
    cursorEl.classList.remove('pinching');
    cursorEl.style.borderColor = '#00ff00'; // Green default
  }
  
  // STATE MACHINE for click detection
  if (isClicking && clickState === 'IDLE') {
    // Click gesture detected! FREEZE at stable position
    clickState = 'CLICK_DETECTED';
    clickStateTimestamp = now;
    
    // Execute action at STABLE position
    if (now - lastGestureTime > GESTURE_DEBOUNCE) {
      // Don't execute mouse clicks when keyboard is visible
      // (Keyboard typing is handled by handleKeyboardTyping() per-hand)
      if (!isKeyboardVisible || !isClickInsideKeyboard(stableCursorX, stableCursorY)) {
        const clickButton = gesture.isRightClick ? 'right' : 'left';
        executeClick(stableCursorX, stableCursorY, clickButton);
      }
      
      lastGestureTime = now;
      clickState = 'WAITING_RELEASE';
      clickStateTimestamp = now;
    }
    
  } else if (!isClicking && clickState === 'WAITING_RELEASE') {
    clickState = 'IDLE';
    clickStateTimestamp = now;
  } else if (!isClicking && clickState === 'CLICK_DETECTED') {
    // Released before executing - reset immediately
    clickState = 'IDLE';
    clickStateTimestamp = now;
  }
  
  lastClickState = isClicking;
}

// Move Cursor - Actually move the real Windows cursor!
function moveCursor(x, y) {
  ipcRenderer.invoke('execute-action', {
    type: 'mouse_move',
    x: Math.round(x),
    y: Math.round(y),
    fromGesture: true // Flag to indicate this is gesture control - no smoothing!
  }).catch(() => {});
}

function executeClick(x, y, button = 'left') {
  
  // Visual feedback first
  cursorEl.style.transform = 'translate(-50%, -50%) scale(1.5)';
  if (button === 'right') {
    cursorEl.style.background = 'rgba(255, 136, 0, 0.5)'; // Orange
  } else {
    cursorEl.style.background = 'rgba(0, 255, 255, 0.5)'; // Cyan
  }
  
  // Execute click at this position
  ipcRenderer.invoke('execute-action', {
    type: 'mouse_click',
    x: Math.round(x),
    y: Math.round(y),
    button: button,
    fromAI: false
  }).then(result => {
    if (!result || !result.success) {
      console.error(`${button.toUpperCase()} CLICK FAILED:`, result ? result.error : 'No response');
    }
    setTimeout(() => {
      cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
      cursorEl.style.background = 'transparent';
    }, 150);
  }).catch(err => {
    cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
    cursorEl.style.background = 'transparent';
  });
}

// Handle AI Stop (triggered by physical mouse movement)
async function handleMouseMovementStop() {
  if (!isAgenticMode) return;
  
  await ipcRenderer.invoke('emergency-stop');
  isAgenticMode = false;
  
  agenticButton.classList.remove('active');
  agenticButton.textContent = '🤖 ENABLE AI CONTROL';
  agenticStatusEl.textContent = 'OFF';
  agenticStatusEl.style.color = '#ff4444';
  
  showTranscription('Physical mouse detected - Agentic mode stopped');
  
  setTimeout(() => {
    hideTranscription();
  }, 3000);
}

// Agentic mode now only stops on ESC key press

// On-demand screen capture with SoM numbering
async function captureAndSendScreen() {
  if (!geminiSession || !isAgenticMode) {
    return { success: false, error: 'AI Control not active' };
  }
  
  try {
    const video = document.createElement('video');
    video.srcObject = screenStream;
    await video.play();
    
    // Wait for video to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get actual screen dimensions
    const screenW = window.screen.width;
    const screenH = window.screen.height;
    
    // Use full resolution for accuracy
    screenCanvas.width = screenW;
    screenCanvas.height = screenH;
    screenCtx.drawImage(video, 0, 0, screenCanvas.width, screenCanvas.height);
    
    // Enumerate all clickable elements via UI Automation
    let elements = [];
    try {
      const enumResult = await ipcRenderer.invoke('execute-action', { type: 'enumerate_elements', fromAI: true });
      if (enumResult.success && enumResult.elements && enumResult.elements.length > 0) {
        elements = enumResult.elements;
        cachedSoMElements = elements;
      }
    } catch (enumError) {}
    
    // Draw numbered labels on the screenshot
    if (elements.length > 0) {
      drawSoMLabels(screenCtx, elements, screenW, screenH);
    }
    
    // Resize to send size
    const sendCanvas = document.createElement('canvas');
    sendCanvas.width = 1920;
    sendCanvas.height = 1080;
    const sendCtx = sendCanvas.getContext('2d');
    sendCtx.drawImage(screenCanvas, 0, 0, sendCanvas.width, sendCanvas.height);
    
    return new Promise((resolve) => {
      sendCanvas.toBlob(async (blob) => {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = arrayBufferToBase64(arrayBuffer);
          
          // Send image to Gemini Live
          geminiSession.sendRealtimeInput({
            media: {
              mimeType: 'image/jpeg',
              data: base64
            }
          });
          
          resolve({ success: true, elementCount: elements.length });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      }, 'image/jpeg', 0.85);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Draw Set-of-Mark labels on canvas
function drawSoMLabels(ctx, elements, screenW, screenH) {
  for (const el of elements) {
    const { id, left, top, width, height, name } = el;
    
    // Skip elements with invalid bounds
    if (width < 5 || height < 5) continue;
    if (left < 0 || top < 0 || left > screenW || top > screenH) continue;
    
    // Draw semi-transparent highlight box around element
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, width, height);
    
    // Draw numbered label (red circle with white number)
    const labelX = left;
    const labelY = top;
    const labelSize = Math.max(16, Math.min(24, height * 0.6));
    
    // Red circle background
    ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
    ctx.beginPath();
    ctx.arc(labelX + labelSize / 2, labelY + labelSize / 2, labelSize / 2 + 2, 0, Math.PI * 2);
    ctx.fill();
    
    // White number text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${labelSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(id), labelX + labelSize / 2, labelY + labelSize / 2);
  }
  
  // Reset text alignment
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// Dual mode: On-demand + Continuous streaming
function startScreenStreaming() {
  const video = document.createElement('video');
  video.srcObject = screenStream;
  video.play();
  
  let lastScreenSent = 0;
  setInterval(() => {
    // Only stream video if sharing is enabled
    if (!geminiSession || !isAgenticMode || !isVideoSharing) return;
    
    // Throttle to 1 FPS
    const now = Date.now();
    if (now - lastScreenSent < 1000) return;
    lastScreenSent = now;
    
    screenCanvas.width = 1280;
    screenCanvas.height = 720;
    screenCtx.drawImage(video, 0, 0, screenCanvas.width, screenCanvas.height);
    
    screenCanvas.toBlob(async (blob) => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        
        // Send image to Gemini Live
        geminiSession.sendRealtimeInput({
          media: {
            mimeType: 'image/jpeg',
            data: base64
          }
        });
      } catch (error) {}
    }, 'image/jpeg', 0.6);
  }, 1000);
}

// Start microphone streaming to Gemini (PCM 16-bit 16kHz)
async function startMicrophoneStreaming() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    processor.onaudioprocess = (e) => {
      if (!geminiSession || !isAgenticMode) return;
      
      // Get Float32 audio data
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to PCM Int16
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const clamped = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = Math.floor(clamped * 0x7FFF);
      }
      
      // Convert to Base64
      const base64Audio = arrayBufferToBase64(pcm16.buffer);
      
      try {
        geminiSession.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio
          }
        });
      } catch (error) {}
    };
    
  } catch (error) {
    showTranscription('Microphone access denied');
  }
}

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Play audio from Gemini
function playGeminiAudio(base64Audio) {
  // Add to queue
  audioQueue.push(base64Audio);
  
  // Start playing if not already
  if (!isPlayingAudio) {
    playNextAudioChunk();
  }
}

// Play audio chunks from queue
async function playNextAudioChunk() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    return;
  }
  
  isPlayingAudio = true;
  const base64Audio = audioQueue.shift();
  
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 });
  }
  
  try {
    // Decode Base64 to PCM Int16
    const arrayBuffer = base64ToArrayBuffer(base64Audio);
    const pcm16 = new Int16Array(arrayBuffer);
    
    // Convert PCM Int16 to Float32 for Web Audio
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x7FFF;
    }
    
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    source.onended = () => playNextAudioChunk();
    source.start(0);
  } catch (error) {
    playNextAudioChunk();
  }
}

// Handle Gemini Messages
function handleGeminiMessage(message) {
  // Handle text responses
  if (message.serverContent && message.serverContent.modelTurn) {
    const parts = message.serverContent.modelTurn.parts || [];
    parts.forEach(part => {
      if (part.text) {
        showTranscription(part.text);
      }
      
      // Handle audio output (PCM from Gemini)
      if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
        playGeminiAudio(part.inlineData.data);
      }
    });
  }
  
  // Handle tool calls (CRITICAL for computer control)
  if (message.toolCall && message.toolCall.functionCalls) {
    message.toolCall.functionCalls.forEach(async (fc) => {
      await handleGeminiToolCall(fc);
    });
  }
}

// Handle Tool Calls from Gemini
async function handleGeminiToolCall(functionCall) {
  if (!isAgenticMode) return;
  
  showTranscription(`Executing: ${functionCall.name}`);
  
  let result;
  
  // Handle capture_screen locally - SoM annotated screenshot
  if (functionCall.name === 'capture_screen') {
    result = await captureAndSendScreen();
    
    // Build element list text for AI
    let elementListText = 'Screen captured and sent to you.';
    if (cachedSoMElements.length > 0) {
      elementListText += `\n\n📋 NUMBERED ELEMENTS ON SCREEN (${cachedSoMElements.length} found):\n`;
      for (const el of cachedSoMElements) {
        const nameStr = el.name ? `"${el.name}"` : '(unnamed)';
        elementListText += `  #${el.id}: ${nameStr} [${el.type}]\n`;
      }
      elementListText += '\n🎯 To click any element, use: click_element(id) with the number!';
      elementListText += '\nThe screenshot has RED numbered labels on each element.';
    } else {
      elementListText += '\nNo clickable elements detected by UI Automation. Use Tab navigation as fallback.';
    }
    
    // Send response back to Gemini with element index
    geminiSession.sendToolResponse({
      functionResponses: [{
        id: functionCall.id,
        name: functionCall.name,
        response: { success: true, result: elementListText }
      }]
    });
    return;
  }
  
  // Handle click_element locally (uses cached SoM data)
  if (functionCall.name === 'click_element') {
    const elementId = functionCall.args?.id;
    
    if (!elementId) {
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { success: false, error: 'Missing element id. Use capture_screen() first to see numbered elements.' }
        }]
      });
      return;
    }
    
    if (cachedSoMElements.length === 0) {
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { success: false, error: 'No cached elements. Call capture_screen() first!' }
        }]
      });
      return;
    }
    
    // Click via IPC with cached element data
    result = await ipcRenderer.invoke('execute-action', {
      type: 'click_element_by_id',
      elementId: parseInt(elementId),
      elements: cachedSoMElements,
      fromAI: true
    });
    
    if (result.success) {
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { 
            success: true, 
            result: `🎯 Clicked element #${elementId}: "${result.clickedElement}" at pixel (${result.clickedAt?.x}, ${result.clickedAt?.y})` 
          }
        }]
      });
    } else {
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { success: false, error: result.error || 'Click failed' }
        }]
      });
    }
    return;
  }
  
  // All other actions go through IPC to main process
  const action = {
    type: functionCall.name,
    ...functionCall.args,
    fromAI: true
  };
  
  try {
    result = await ipcRenderer.invoke('execute-action', action);
    
    if (result.success) {
      
      // Build rich response with context
      let responseData = { success: true };
      
      // Special handling for get_focused_element - return detailed info
      if (functionCall.name === 'get_focused_element') {
        const displayText = result.displayText || result.name || result.text || result.value || 'unnamed';
        responseData.result = `Focused element: "${displayText}" (type: ${result.type || 'unknown'})`;
        responseData.displayText = displayText;
        responseData.name = result.name || '';
        responseData.type = result.type || '';
        responseData.value = result.value || '';
        responseData.text = result.text || '';
        responseData.className = result.className || '';
        responseData.automationId = result.automationId || '';
      }
      // Special handling for get_element_bounds - return coordinates
      else if (functionCall.name === 'get_element_bounds') {
        responseData.result = `Element bounds: center (${result.centerX}, ${result.centerY}), size ${result.width}x${result.height}`;
        responseData.centerX = result.centerX || 0;
        responseData.centerY = result.centerY || 0;
        responseData.width = result.width || 0;
        responseData.height = result.height || 0;
        responseData.left = result.left || 0;
        responseData.top = result.top || 0;
      }
      // Special handling for click_element_center - confirm pixel-perfect click
      else if (functionCall.name === 'click_element_center') {
        const x = result.clickedAt?.x || 0;
        const y = result.clickedAt?.y || 0;
        responseData.result = `Pixel-perfect click at exact center (${x}, ${y})`;
        responseData.clickedAt = { x, y };
        responseData.elementSize = result.elementBounds || {};
      }
      // Special handling for get_active_window
      else if (result.title) {
        responseData.result = `Active window: ${result.title}`;
      }
      // Default success message
      else {
        responseData.result = 'Action completed successfully';
      }
      
      // CRITICAL: Send response back to Gemini to continue conversation
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: responseData
        }]
      });
    } else {
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { success: false, error: result.error }
        }]
      });
    }
  } catch (error) {
    geminiSession.sendToolResponse({
      functionResponses: [{
        id: functionCall.id,
        name: functionCall.name,
        response: { success: false, error: error.message }
      }]
    });
  }
}

// Show Transcription
function showTranscription(text) {
  transcriptionEl.textContent = text;
  transcriptionEl.classList.add('visible');
  
  setTimeout(() => {
    hideTranscription();
  }, 5000);
}

// Hide Transcription
function hideTranscription() {
  transcriptionEl.classList.remove('visible');
}

// Agentic Button Handler
agenticButton.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  isAgenticMode = !isAgenticMode;
  
  const result = await ipcRenderer.invoke('toggle-agentic-mode', isAgenticMode);
  
  if (isAgenticMode) {
    agenticButton.classList.add('active');
    agenticButton.textContent = '🛑 DISABLE AI CONTROL';
    agenticStatusEl.textContent = 'STARTING...';
    agenticStatusEl.style.color = '#ffaa00';
    
    // Initialize Gemini NOW (only when enabled)
    try {
      if (!geminiSession) {
        await initializeGemini();
      }
      
      // Start Gemini Live features if session exists
      if (geminiSession) {
        agenticStatusEl.textContent = 'ACTIVE';
        agenticStatusEl.style.color = '#00ff00';
        
        // Start voice streaming only (video is separate)
        startScreenStreaming(); // Initialize the interval but won't send until video enabled
        startMicrophoneStreaming();
        
        // Enable video sharing button
        videoButton.disabled = false;
        
        showTranscription('AI Control ENABLED - Voice active! Click "SHARE VIDEO" to enable screen sharing.');
      } else {
        throw new Error('Gemini session not initialized');
      }
    } catch (error) {
      console.error('❌ Gemini activation failed:', error);
      agenticStatusEl.textContent = 'ERROR';
      agenticStatusEl.style.color = '#ff4444';
      showTranscription('Failed to connect to Gemini.');
      isAgenticMode = false;
      agenticButton.classList.remove('active');
      agenticButton.textContent = '🤖 ENABLE AI CONTROL';
    }
  } else {
    agenticButton.classList.remove('active');
    agenticButton.textContent = '🤖 ENABLE AI CONTROL';
    agenticStatusEl.textContent = 'OFF';
    agenticStatusEl.style.color = '#ff4444';
    
    // Disable and reset video sharing
    isVideoSharing = false;
    videoButton.disabled = true;
    videoButton.classList.remove('active');
    videoButton.textContent = '📹 SHARE VIDEO';
    videoStatusEl.textContent = 'OFF';
    videoStatusEl.style.color = '#ff4444';
    
    showTranscription('AI Control DISABLED - Gesture control active');
  }
});

// Video Sharing Button Handler
videoButton.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (!isAgenticMode) {
    showTranscription('Enable AI Control first!');
    return;
  }
  
  isVideoSharing = !isVideoSharing;
  
  if (isVideoSharing) {
    videoButton.classList.add('active');
    videoButton.textContent = '🚫STOP VIDEO';
    videoStatusEl.textContent = 'STREAMING';
    videoStatusEl.style.color = '#00ffff';
    showTranscription('Video STREAMING enabled (1 FPS) - AI can see your screen');
  } else {
    videoButton.classList.remove('active');
    videoButton.textContent = '📹 SHARE VIDEO';
    videoStatusEl.textContent = 'ON-DEMAND';
    videoStatusEl.style.color = '#ffaa00';
    showTranscription('Video streaming OFF - AI captures on-demand when needed');
  }
});

// ==================== KEYBOARD FUNCTIONALITY ====================

// Check if click position is inside keyboard bounds
function isClickInsideKeyboard(x, y) {
  if (!keyboardEl) return false;
  const rect = keyboardEl.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Initialize keyboard
function initializeKeyboard() {
  keyboardEl = document.getElementById('keyboard');
  keyboardToggleBtn = document.getElementById('keyboardToggle');
  allKeys = document.querySelectorAll('.key');
  
  if (!keyboardEl || !keyboardToggleBtn) return;
  
  // Keyboard toggle button handler
  keyboardToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleKeyboard();
  });
  
  // Keyboard key click handlers (mouse/touch)
  allKeys.forEach(key => {
    key.addEventListener('click', (e) => {
      e.stopPropagation();
      typeKey(key.dataset.key);
    });
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      toggleKeyboard();
    }
  });
}

// Toggle keyboard visibility
function toggleKeyboard() {
  isKeyboardVisible = !isKeyboardVisible;
  if (isKeyboardVisible) {
    keyboardEl.classList.add('visible');
  } else {
    keyboardEl.classList.remove('visible');
    hoveredKey = null;
  }
}

// Check if cursor is hovering over a keyboard key (used by primary hand)
function checkKeyboardHover(x, y) {
  hoveredKey = null;
  
  if (!allKeys || allKeys.length === 0) return;
  
  allKeys.forEach(key => {
    const rect = key.getBoundingClientRect();
    const isOver = (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
    
    if (isOver) {
      hoveredKey = key.dataset.key;
    }
  });
}

// Check keyboard hover for EACH hand (multi-hand typing!)
function checkKeyboardHoverForHand(x, y, handIndex) {
  if (!allKeys || allKeys.length === 0) return;
  
  let hoveredKeyForHand = null;
  
  allKeys.forEach(key => {
    const rect = key.getBoundingClientRect();
    const isOver = (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
    
    if (isOver) {
      hoveredKeyForHand = key.dataset.key;
      // Add hover effect with hand-specific color
      if (!key.classList.contains('gesture-hover')) {
        key.classList.add('gesture-hover');
      }
    }
  });
  
  // Update this hand's hover state
  handKeyHovers[handIndex] = hoveredKeyForHand;
  
  // Remove hover from keys not hovered by ANY hand
  allKeys.forEach(key => {
    const keyName = key.dataset.key;
    const isHoveredByAnyHand = Object.values(handKeyHovers).includes(keyName);
    if (!isHoveredByAnyHand) {
      key.classList.remove('gesture-hover');
    }
  });
}

// Handle keyboard gesture from a specific hand
function handleKeyboardGesture(gesture, handIndex) {
  if (!isKeyboardVisible) return;
  
  const isClicking = gesture.isClicking;
  const hoveredKey = handKeyHovers[handIndex];
  const now = Date.now();
  
  // Initialize state for this hand
  if (!handClickStates[handIndex]) {
    handClickStates[handIndex] = 'IDLE';
    handLastKeyTime[handIndex] = 0;
  }
  
  const clickState = handClickStates[handIndex];
  const timeSinceLastKey = now - (handLastKeyTime[handIndex] || 0);
  
  if (isClicking && clickState === 'IDLE' && hoveredKey && timeSinceLastKey > KEYBOARD_DEBOUNCE) {
    // Transition to CLICKING first (prevents multiple triggers)
    handClickStates[handIndex] = 'CLICKING';
    handLastKeyTime[handIndex] = now;
    
    // Type the key!
    typeKey(hoveredKey);
    
  } else if (!isClicking && clickState === 'CLICKING') {
    // Release - ready for next key
    handClickStates[handIndex] = 'IDLE';
  }
}

// Type a key
async function typeKey(key) {
  
  try {
    const result = await ipcRenderer.invoke('execute-action', {
      type: 'type_key',
      key: key
    });
    
    if (result && result.success) {
      allKeys.forEach(k => {
        if (k.dataset.key === key) {
          k.style.background = '#00ff00';
          k.style.color = '#000';
          setTimeout(() => {
            k.style.background = '#1a1a1a';
            k.style.color = '#00ff00';
          }, 100);
        }
      });
    } else {
    }
  } catch (error) {
  }
}

// ==================== END KEYBOARD ====================

window.addEventListener('DOMContentLoaded', initialize);
