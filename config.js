// OpsGhost Configuration
module.exports = {
  // Gesture Recognition Settings
  gestures: {
    pinchThreshold: 0.05,           // Distance threshold for pinch detection
    openPalmFingers: 5,              // Number of fingers for open palm gesture
    debounceTime: 300,               // Milliseconds between gesture actions
    smoothing: true,                 // Enable cursor smoothing
    smoothingFactor: 0.3             // Smoothing coefficient (0-1)
  },

  // Hand Tracking Settings
  handTracking: {
    targetFPS: 60,
    numHands: 1,
    modelComplexity: 1,               // 0=lite, 1=full, 2=heavy
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  },

  // Screen Capture Settings
  screenCapture: {
    width: 1280,
    height: 720,
    fps: 1,                           // Frames per second sent to Gemini
    quality: 0.8,                     // JPEG quality (0-1)
    format: 'image/jpeg'
  },

  // Gemini API Settings
  gemini: {
    model: 'gemini-1.5-flash',
    maxRetries: 3,
    timeout: 30000,                   // 30 seconds
    systemInstruction: `You are OpsGhost, a hands-free DevOps assistant. 
You can see the user's desktop screen and hear their voice.

When agentic mode is enabled, you can control the computer using these tools:
- mouse_move(x, y): Move cursor to specific screen coordinates
- mouse_click(button): Click mouse button (left/right)
- type_string(text): Type text on keyboard
- key_tap(key, modifiers): Press keyboard keys with modifiers

Safety rules:
1. Always confirm before executing destructive actions
2. Never access sensitive files without explicit permission
3. Stop immediately if user shows open palm gesture
4. Be helpful, efficient, and transparent about your actions

When asked to perform tasks, break them into clear steps and execute methodically.`
  },

  // Window Settings
  window: {
    transparent: true,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    clickThrough: true                // Allow clicks to pass through overlay
  },

  // UI Settings
  ui: {
    cursorSize: 20,
    cursorColor: '#00ff00',
    handLandmarkColor: '#00ff00',
    handConnectionColor: '#00ff00',
    statusPanelPosition: 'top-right',
    transcriptionDuration: 5000,      // Milliseconds to show transcriptions
    showHandVisualization: true
  },

  // Safety Settings
  safety: {
    agenticModeDefault: false,
    emergencyStopCooldown: 2000,      // Milliseconds before re-enabling after stop
    requireConfirmation: true,         // Require confirmation for destructive actions
    logAllActions: true,
    maxActionsPerMinute: 60           // Rate limiting
  },

  // Development Settings
  development: {
    showDevTools: false,
    verboseLogging: true,
    mockGemini: false,                // Use mock Gemini for testing
    disableActualMouseControl: false  // Prevent real mouse control during dev
  }
};
