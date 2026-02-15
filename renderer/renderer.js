// OpsGhost Renderer Process
const { ipcRenderer, desktopCapturer } = require('electron');
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
  console.log('👻 OpsGhost initializing...');
  
  // Set canvas size to screen size
  handCanvas.width = window.innerWidth;
  handCanvas.height = window.innerHeight;
  
  // Initialize keyboard elements and event listeners
  initializeKeyboard();
  
  await initializeHandTracking();
  await initializeScreenCapture();
  
  // DON'T initialize Gemini yet - only when user enables AI Control
  geminiStatusEl.textContent = 'READY (Click Enable)';
  geminiStatusEl.style.color = '#ffaa00';
  
  startHandTracking();
  
  console.log('✅ OpsGhost ready!');
}

// Initialize MediaPipe Hand Tracking
async function initializeHandTracking() {
  console.log('🖐️ Initializing hand tracking...');
  
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
  
  console.log('✅ Hand tracking initialized');
}

// Initialize Desktop Screen Capture
async function initializeScreenCapture() {
  console.log('🖥️ Initializing screen capture...');
  
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
  
  console.log('✅ Screen capture initialized');
}

// Initialize Gemini Live API with REAL bidirectional streaming
async function initializeGemini() {
  console.log('🧠 Initializing Gemini Live API...');
  
  const apiKey = await ipcRenderer.invoke('get-api-key');
  
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE' || apiKey.trim() === '') {
    console.warn('⚠️  Gemini API key not set in .env or .env.local!');
    geminiStatusEl.textContent = 'NO API KEY';
    geminiStatusEl.style.color = '#ff4444';
    throw new Error('No API key found');
  }
  
  console.log('✅ API Key loaded:', apiKey.substring(0, 10) + '...');
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // REAL Gemini Live API with bidirectional streaming
    geminiSession = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        // MUST set modalities to AUDIO for voice interaction
        responseModalities: [Modality.AUDIO],
        
        systemInstruction: `You are OpsGhost, an AI assistant that can HEAR the user's voice and control their computer.

🎯 CRITICAL RULE: When user says "click on X" or "click the Y button" → ALWAYS use TAB navigation!
NEVER capture screen to find click coordinates. TAB navigation is 100x more accurate!

═══════════════════════════════════════════════════════════════

🚀 TIER 1 - APP LAUNCHING (Instant!):
• search_and_launch(query) - Opens apps directly (chrome, calculator, notepad, etc.)
  Example: "open chrome" → search_and_launch("chrome")
  Example: "open calculator" → search_and_launch("calculator")

• focus_window(title) - Switch to already-open windows
  Example: "switch to chrome" → focus_window("chrome")
  Example: "go to discord" → focus_window("discord")

═══════════════════════════════════════════════════════════════

🎯 TIER 2 - TAB NAVIGATION WITH SMART CLICKING:

**When user says "click on X" - TAB to find, then click:**

### PRIMARY METHOD: Tab + Read + Enter (WORKS EVERYWHERE!) ✅
**Reliable workflow that works with Chrome, Electron, everything:**

1. **navigate_with_tab(1)** - Tab to next element
2. **get_focused_element()** - Try to read element text (may not work in Chrome)
3. **Check if it matches** what user wants
4. **If YES → press_enter()** (keyboard focus ALWAYS works!)

**Example Workflows:**

**"Click on my profile":**
- navigate_with_tab(1) → get_focused_element() → {displayText: "Search"} → ❌ Not "Profile"
- navigate_with_tab(1) → get_focused_element() → {displayText: ""} → ❌ Empty (Chrome web content)
- navigate_with_tab(1) → get_focused_element() → {displayText: "Profile"} → ✅ MATCH!
- press_enter() → ✅ Clicked! (Keyboard focus is reliable!)

**"Click the Subscribe button":**
- Keep tabbing, checking names when available
- When get_focused_element() returns empty in Chrome: count tabs or try press_enter()
- press_enter() when you think you found it → ✅ Works!

**Why Tab + Enter is MOST RELIABLE:**
- ✅ **Keyboard focus ALWAYS works** - Browser respects Tab navigation
- ✅ **press_enter() is universal** - Works in Chrome, Firefox, native apps
- ✅ **No Chrome limitations** - Doesn't rely on UI Automation text
- ✅ **Fast** - Direct keyboard activation

**Chrome Limitation:**
- Chrome web content doesn't expose element names through UI Automation properly
- get_focused_element() might return empty names in Chrome
- BUT keyboard focus still works! press_enter() will click the right element
- Solution: Tab until you estimate you reached the target, then press_enter()

**Alternative for Native Apps:**
- click_element_center() works PERFECT for native Windows apps, Electron apps
- For Chrome web content: Use press_enter() instead
- Check result.className: if "Chrome_WidgetWin_1" → use press_enter()

**Smart Strategy:**
1. Try get_focused_element() - if it returns good text, use it!
2. If className is "Chrome_WidgetWin_1" or text is empty → Chrome web content
3. In Chrome: Tab 3-5 times based on visual layout guess, then press_enter()
4. For native apps: Use click_element_center() for pixel-perfect clicks

### FALLBACK: Keyboard Shortcuts ⚡ (When applicable)
- Opening new tab? → press_shortcut("ctrl+t")
- Focus address bar? → press_shortcut("ctrl+l")
- Close tab? → press_shortcut("ctrl+w")
- Go back/forward? → press_shortcut("alt+left") or press_shortcut("alt+right")
- Refresh page? → key_tap("F5")
- **Use shortcuts ONLY when action matches perfectly** (new tab, address bar, etc.)

### AVOID: Screen Capture for Clicking ❌
**DO NOT use capture_screen() to guess tab positions - use sequential tabbing!**
- capture_screen() is for "what do you see?" questions only

═══════════════════════════════════════════════════════════════

📋 COMPLETE WORKFLOW EXAMPLES:

Request: "Click on my profile"
Decision: No shortcut → Tab and use press_enter()
→ navigate_with_tab(1) → get_focused_element() → check if name matches
→ navigate_with_tab(1) → get_focused_element() → keep checking
→ navigate_with_tab(1) → get_focused_element() → "Profile" or estimate reached
→ press_enter() → ✅ Clicked!

Request: "Open new tab"
Decision: Shortcut exists! → Use it instantly
→ press_shortcut("ctrl+t")
→ "New tab opened!"

Request: "Click the subscribe button"
Decision: No shortcut → Tab and press_enter()
→ navigate_with_tab(1) → get_focused_element() → "Video title" or "" → ❌
→ navigate_with_tab(1) → get_focused_element() → "Subscribe" or estimate → ✅ Found it!
→ press_enter() → ✅ Clicked! (Works in Chrome!)

Request: "Go to address bar"
Decision: Shortcut exists! → Use it
→ press_shortcut("ctrl+l")
→ "Address bar focused!"

═══════════════════════════════════════════════════════════════

💡 DECISION FLOWCHART:
1. Does a keyboard shortcut exist for this action?
   YES → Use press_shortcut() (instant!)
   NO ↓

2. Is it a specific button/link the user named?
   YES → LOOP: navigate_with_tab(1) → get_focused_element() → check text (if available) → if match press_enter(), else repeat
   NO ↓

3. Tab 3-5 times based on layout estimate, then press_enter()

═══════════════════════════════════════════════════════════════

Functions Available:
• navigate_with_tab(1) - Tab to next element (ONE at a time!)
• get_focused_element() - Read element text (works in native apps, limited in Chrome)
• press_enter() - RELIABLE CLICKING! Works everywhere (Chrome, native apps, all browsers)
• press_shortcut(keys) - Keyboard shortcuts (fastest!)
• click_element_center() - Pixel-perfect (only for native Windows apps, NOT Chrome web content)
• ❌ capture_screen() - Only for "what do you see?" questions, NOT for clicking!

═══════════════════════════════════════════════════════════════

⚡ TIER 3 - TYPING & SHORTCUTS:
• press_shortcut(keys) - Any key combo (Ctrl+T, Alt+Tab, etc.)
• type_string(text) - Type anything
• press_enter() - Press Enter key

═══════════════════════════════════════════════════════════════

📋 COMPLETE WORKFLOW EXAMPLES:

Request: "Open Chrome and go to YouTube"
→ search_and_launch("chrome")
→ [wait 2 sec]
→ press_shortcut("ctrl+l")
→ type_string("youtube.com")
→ press_enter()

Request: "Click on my profile"
→ [No shortcut exists]
→ navigate_with_tab(1) → get_focused_element() → "Search bar" or "" → ❌
→ navigate_with_tab(1) → get_focused_element() → "" → ❌ (Chrome doesn't expose names)
→ navigate_with_tab(1) → get_focused_element() → "Profile" or estimate → ✅ Try it!
→ press_enter() → ✅ Clicked! (Keyboard focus works!)

Request: "Click the subscribe button"
→ navigate_with_tab(1) → get_focused_element() → empty in Chrome
→ navigate_with_tab(1) → get_focused_element() → empty
→ navigate_with_tab(1) → estimate reached target → press_enter() → ✅ Works!
→ click_element_center() → 🎯 Exact center click!
→ "Subscribed!" ✅ PIXEL-PERFECT!

Request: "Open new tab"
→ [Shortcut exists!]
→ press_shortcut("ctrl+t")
→ "New tab!"

Request: "What do you see on my screen?"
→ capture_screen()
→ [then describe what you see]

═══════════════════════════════════════════════════════════════

⚡ EXECUTION TIPS:
• Check for shortcuts FIRST - they're instant (ctrl+t, ctrl+l, ctrl+w)!
• For clicking in Chrome: TAB to estimate position → press_enter() (most reliable!)
• get_focused_element() might return empty in Chrome web content (limitation!)
• If className="Chrome_WidgetWin_1" → Chrome web, use press_enter() not click_element_center()
• For native Windows apps: get_focused_element() works well, can use click_element_center()
• Keep tabbing until you find it (usually 3-7 elements)
• press_enter() is MORE RELIABLE than click_element_center() for web content!
• Be confident: "Tabbed 3 times, pressing enter to click!"
• Keyboard focus ALWAYS works - even when UI Automation doesn't!`,
        
        tools: [
          {
            functionDeclarations: [
              {
                name: 'mouse_move',
                description: '❌ INACCURATE - DO NOT USE! Mouse coordinates are terribly inaccurate! Use visual tab counting instead: capture_screen() → count tab positions → navigate_with_tab(N) → press_enter()',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    x: { type: 'NUMBER', description: 'X coordinate (INACCURATE!)' },
                    y: { type: 'NUMBER', description: 'Y coordinate (INACCURATE!)' }
                  },
                  required: ['x', 'y']
                }
              },
              {
                name: 'mouse_click',
                description: '❌ AVOID - Use Tab navigation instead! Mouse clicking is unreliable. For clicking: capture_screen() → count positions → navigate_with_tab(N) → press_enter()',
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
                description: '📸 SCREEN VIEW ONLY: Capture screen for "what do you see?" questions. DO NOT use for clicking! For clicking, use navigate_with_tab(1) + get_focused_element() loop instead.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'navigate_with_tab',
                description: '🎯 PRIMARY CLICKING METHOD: Press Tab to move to next element. Use ONE at a time! Always call get_focused_element() after to read what element you landed on. Loop: tab(1) → get_focused_element() → check text → if match press_enter(), else repeat.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    count: { type: 'NUMBER', description: 'Number of Tab presses (use 1 for step-by-step!)' }
                  }
                }
              },
              {
                name: 'get_focused_element',
                description: '❓ READ TEXT (Limited in Chrome): Get text of focused element. Returns {displayText, name, type, className}. NOTE: Chrome web content often returns EMPTY names! Check className - if "Chrome_WidgetWin_1" you\'re in Chrome web. Use for native apps or as hint, but don\'t rely on it for Chrome!',
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
                description: '✅ PRIMARY CLICKING METHOD: Press Enter to activate the focused element. MOST RELIABLE - works in Chrome, Firefox, native apps, everywhere! Use after navigate_with_tab(). Keyboard focus ALWAYS works even when UI Automation doesn\'t!',
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
                description: '� GET COORDINATES (Native Apps): Get bounding box of focused element. Returns centerX, centerY, width, height. WARNING: Only works for native Windows apps, NOT Chrome web content! Chrome returns whole window bounds.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'click_element_center',
                description: '🎯 PIXEL-PERFECT (Native Apps Only): Click exact center using UI Automation bounds. WARNING: Only works for native Windows apps, Electron, NOT Chrome web content! For Chrome, use press_enter() instead. Check className first!',
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
          console.log('✅ Gemini Live connected!');
          geminiStatusEl.textContent = 'CONNECTED';
          geminiStatusEl.style.color = '#00ff00';
        },
        
        onmessage: (message) => {
          console.log('📨 Gemini message:', message);
          handleGeminiMessage(message);
        },
        
        onclose: () => {
          console.log('🔌 Gemini disconnected');
          geminiStatusEl.textContent = 'DISCONNECTED';
          geminiStatusEl.style.color = '#ff4444';
        },
        
        onerror: (error) => {
          console.error('❌ Gemini error:', error);
          geminiStatusEl.textContent = 'ERROR';
          geminiStatusEl.style.color = '#ff0000';
          showTranscription(`Error: ${error.message}`);
        }
      }
    });
    
    console.log('✅ Gemini Live session created!');
    
  } catch (error) {
    console.error('❌ Gemini initialization failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    geminiStatusEl.textContent = 'ERROR';
    geminiStatusEl.style.color = '#ff0000';
    
    // Show specific error message
    showTranscription(`❌ Gemini Error: ${error.message}`);
    
    // Fallback: Basic mode
    console.log('⚠️  Using basic mode without Live API');
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
  // Clear canvas
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
    
    // Use the PRIMARY hand (first detected) for cursor control
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
  
  // CRITICAL FIX: Use index BASE (knuckle) for cursor position, NOT tip!
  // The base doesn't move during pinch, making cursor super stable!
  // FIX MIRRORING: Flip X coordinate (1 - x inverts it)
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
    // Gesture released - ready for next click
    clickState = 'IDLE';
    clickStateTimestamp = now;
    console.log('✅ Released - ready for next click');
  } else if (!isClicking && clickState === 'CLICK_DETECTED') {
    // Released before executing - reset immediately
    clickState = 'IDLE';
    clickStateTimestamp = now;
  }
  
  lastClickState = isClicking;
}

// Move Cursor - Actually move the real Windows cursor!
function moveCursor(x, y) {
  // Send IPC to main process to move REAL Windows cursor
  ipcRenderer.invoke('execute-action', {
    type: 'mouse_move',
    x: Math.round(x),
    y: Math.round(y),
    fromGesture: true // Flag to indicate this is gesture control - no smoothing!
  }).catch(err => {
    // Silent fail - don't spam console with movement errors
  });
}

// Execute Click (Simulates real mouse click at gesture position)
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
    // Click executed
    if (!result || !result.success) {
      console.error(`❌ ========== ${button.toUpperCase()} CLICK FAILED ==========`);
      console.error('   Error:', result ? result.error : 'No response');
    }
    
    // Reset visual
    setTimeout(() => {
      cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
      cursorEl.style.background = 'transparent';
    }, 150);
  }).catch(err => {
    console.error(`❌ ========== ${button.toUpperCase()} CLICK ERROR (CATCH) ==========`);
    console.error('   Exception:', err);
    cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
    cursorEl.style.background = 'transparent';
  });
}

// Handle AI Stop (triggered by physical mouse movement)
async function handleMouseMovementStop() {
  if (!isAgenticMode) return;
  
  console.log('🖱️ Physical mouse detected - Stopping agentic mode');
  
  await ipcRenderer.invoke('emergency-stop');
  isAgenticMode = false;
  
  agenticButton.classList.remove('active');
  agenticButton.textContent = '🤖 ENABLE AI CONTROL';
  agenticStatusEl.textContent = 'OFF';
  agenticStatusEl.style.color = '#ff4444';
  
  showTranscription('🖱️ Physical mouse detected - Agentic mode stopped');
  
  setTimeout(() => {
    hideTranscription();
  }, 3000);
}

// Agentic mode now only stops on ESC key press (handled in keydown listener)

// OPTIMIZED: On-demand screen capture (only when AI requests it)
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
    
    screenCanvas.width = 1280;
    screenCanvas.height = 720;
    screenCtx.drawImage(video, 0, 0, screenCanvas.width, screenCanvas.height);
    
    return new Promise((resolve) => {
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
          
          resolve({ success: true });
        } catch (error) {
          console.error('Error sending screen frame:', error);
          resolve({ success: false, error: error.message });
        }
      }, 'image/jpeg', 0.6);
    });
  } catch (error) {
    console.error('Error capturing screen:', error);
    return { success: false, error: error.message };
  }
}

// DUAL MODE: On-demand + Continuous streaming option
// Screen is captured on-demand via capture_screen() function
// OR continuously streamed if video sharing is enabled
function startScreenStreaming() {
  const video = document.createElement('video');
  video.srcObject = screenStream;
  video.play();
  
  let lastScreenSent = 0;
  setInterval(() => {
    // Only stream video if video sharing is ENABLED (cost-conscious option)
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
      } catch (error) {
        console.error('Error sending screen frame:', error);
      }
    }, 'image/jpeg', 0.6);
  }, 1000); // Check every second, send at 1 FPS
  
  console.log('📹 Screen streaming initialized (1 FPS when enabled)');
}

// Start microphone streaming to Gemini (REAL PCM 16-bit 16kHz)
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
    // Reduce buffer size for lower latency: 2048 instead of 4096
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
        // Clamp to [-1, 1] and scale to 16-bit range
        const clamped = Math.min(1, Math.max(-1, inputData[i]));
        pcm16[i] = Math.floor(clamped * 0x7FFF);
      }
      
      // Convert to Base64
      const base64Audio = arrayBufferToBase64(pcm16.buffer);
      
      // Send to Gemini Live API (with error handling)
      try {
        geminiSession.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio
          }
        });
      } catch (error) {
        console.error('Error sending audio chunk:', error);
      }
    };
    
    console.log('🎤 Microphone streaming started (PCM 16kHz, buffer: 2048)');
  } catch (error) {
    console.error('❌ Microphone setup failed:', error);
    showTranscription('❌ Microphone access denied');
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

// Play audio from Gemini (REAL PCM Int16 to Float32 conversion with queue)
function playGeminiAudio(base64Audio) {
  // Add to queue
  audioQueue.push(base64Audio);
  
  // Start playing if not already
  if (!isPlayingAudio) {
    playNextAudioChunk();
  }
}

// Play audio chunks from queue for smooth playback
async function playNextAudioChunk() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    return;
  }
  
  isPlayingAudio = true;
  const base64Audio = audioQueue.shift();
  
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 }); // Match Gemini output
  }
  
  try {
    // Decode Base64 to PCM Int16
    const arrayBuffer = base64ToArrayBuffer(base64Audio);
    const pcm16 = new Int16Array(arrayBuffer);
    
    // Convert PCM Int16 to Float32 for Web Audio
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x7FFF; // Normalize to [-1, 1]
    }
    
    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    
    // Play audio
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    // When this chunk finishes, play next
    source.onended = () => {
      playNextAudioChunk();
    };
    
    source.start(0);
    
    console.log('🔊 Playing audio chunk:', float32.length, 'samples, queue:', audioQueue.length);
  } catch (error) {
    console.error('❌ Audio playback error:', error);
    // Continue to next chunk even if this one fails
    playNextAudioChunk();
  }
}

// Handle Gemini Messages (REAL Live API)
function handleGeminiMessage(message) {
  console.log('📨 Processing message:', message);
  
  // Handle text responses
  if (message.serverContent && message.serverContent.modelTurn) {
    const parts = message.serverContent.modelTurn.parts || [];
    parts.forEach(part => {
      if (part.text) {
        console.log('💬 Gemini says:', part.text);
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

// Handle Tool Calls from Gemini (REAL implementation with response)
async function handleGeminiToolCall(functionCall) {
  if (!isAgenticMode) {
    console.log('⚠️  Tool call blocked - AI Control is OFF');
    return;
  }
  
  console.log('🔧 Gemini Tool Call:', functionCall.name, functionCall.args);
  showTranscription(`🔧 Executing: ${functionCall.name}`);
  
  let result;
  
  // Handle capture_screen locally (no IPC needed)
  if (functionCall.name === 'capture_screen') {
    result = await captureAndSendScreen();
    
    // Send response back to Gemini
    geminiSession.sendToolResponse({
      functionResponses: [{
        id: functionCall.id,
        name: functionCall.name,
        response: { success: true, result: 'Screen captured and sent to you' }
      }]
    });
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
      console.log('✅ Gemini action executed:', action.type);
      
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
      console.error('❌ Gemini action failed:', result.error);
      
      // Send error response back
      geminiSession.sendToolResponse({
        functionResponses: [{
          id: functionCall.id,
          name: functionCall.name,
          response: { success: false, error: result.error }
        }]
      });
    }
  } catch (error) {
    console.error('❌ Tool call execution error:', error);
    
    // Send error response
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
  console.log('🖱️ Agentic button clicked!');
  e.stopPropagation();
  
  isAgenticMode = !isAgenticMode;
  console.log('🤖 Agentic mode toggled to:', isAgenticMode);
  
  const result = await ipcRenderer.invoke('toggle-agentic-mode', isAgenticMode);
  console.log('📡 IPC result:', result);
  
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
        
        showTranscription('🤖 AI Control ENABLED - Voice active! Click "SHARE VIDEO" to enable screen sharing.');
      } else {
        throw new Error('Gemini session not initialized');
      }
    } catch (error) {
      console.error('❌ Gemini activation failed:', error);
      agenticStatusEl.textContent = 'ERROR';
      agenticStatusEl.style.color = '#ff4444';
      showTranscription('❌ Failed to connect to Gemini. Check console for details.');
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
    
    showTranscription('🔒 AI Control DISABLED - Gesture control active');
  }
});

// Video Sharing Button Handler
videoButton.addEventListener('click', async (e) => {
  console.log('📹 Video button clicked!');
  e.stopPropagation();
  
  if (!isAgenticMode) {
    showTranscription('⚠️  Enable AI Control first!');
    return;
  }
  
  isVideoSharing = !isVideoSharing;
  console.log('📹 Video sharing toggled to:', isVideoSharing);
  
  if (isVideoSharing) {
    videoButton.classList.add('active');
    videoButton.textContent = '🚫STOP VIDEO';
    videoStatusEl.textContent = 'STREAMING';
    videoStatusEl.style.color = '#00ffff';
    showTranscription('📹 Video STREAMING enabled (1 FPS continuous) - AI can see your screen! ⚠️ Costs more tokens');
  } else {
    videoButton.classList.remove('active');
    videoButton.textContent = '📹 SHARE VIDEO';
    videoStatusEl.textContent = 'ON-DEMAND';
    videoStatusEl.style.color = '#ffaa00';
    showTranscription('💰 Video streaming OFF - AI can still capture screen on-demand when needed (saves tokens!)');
  }
});

// ==================== KEYBOARD FUNCTIONALITY ====================

// Check if click position is inside keyboard bounds
function isClickInsideKeyboard(x, y) {
  if (!keyboardEl) return false;
  const rect = keyboardEl.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Initialize keyboard elements and event listeners
function initializeKeyboard() {
  console.log('⌨️ Initializing virtual keyboard...');
  
  keyboardEl = document.getElementById('keyboard');
  keyboardToggleBtn = document.getElementById('keyboardToggle');
  allKeys = document.querySelectorAll('.key');
  
  if (!keyboardEl || !keyboardToggleBtn) {
    console.error('❌ Keyboard elements not found!');
    return;
  }
  
  console.log(`✅ Found ${allKeys.length} keyboard keys`);
  
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
  
  // Keyboard shortcut: Ctrl+K
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      toggleKeyboard();
      console.log('⌨️ Ctrl+K pressed - toggling keyboard');
    }
  });
  
  console.log('✅ Virtual keyboard initialized!');
}

// Toggle keyboard visibility
function toggleKeyboard() {
  isKeyboardVisible = !isKeyboardVisible;
  if (isKeyboardVisible) {
    keyboardEl.classList.add('visible');
    console.log('⌨️ Virtual keyboard opened');
  } else {
    keyboardEl.classList.remove('visible');
    hoveredKey = null;
    console.log('⌨️ Virtual keyboard closed');
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
      // Visual feedback
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
      console.error(`❌ Failed to type key '${key}':`, result ? result.error : 'No response');
    }
  } catch (error) {
    console.error(`❌ Type key error:`, error);
  }
}

// ==================== END KEYBOARD FUNCTIONALITY ====================

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);

console.log('👻 OpsGhost Renderer Process Ready');
