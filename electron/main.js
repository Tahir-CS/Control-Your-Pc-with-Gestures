// Electron Main Process - OpsGhost
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
const controller = require('./windowsController');

let mainWindow;
let isAgenticMode = false;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Enable click-through so gesture clicks reach the real desktop
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile('renderer/index.html');
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Handle desktop capture request
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  return sources;
});

// Handle agentic mode toggle
ipcMain.handle('toggle-agentic-mode', async (event, enabled) => {
  isAgenticMode = enabled;
  return isAgenticMode;
});

// Handle mouse/keyboard control
ipcMain.handle('execute-action', async (event, action) => {
  const isAIAction = action.fromAI === true;
  
  if (isAIAction && !isAgenticMode) {
    return { success: false, error: 'Agentic mode disabled for AI actions' };
  }
  
  try {
    let result;
    switch (action.type) {
      case 'mouse_move':
        // Pass the fromGesture flag to enable instant movement
        result = await controller.moveMouse(action.x, action.y, action.fromGesture || false);
        break;
      case 'mouse_click':
        // Move to position first, then click
        if (action.x !== undefined && action.y !== undefined) {
          await controller.moveMouse(action.x, action.y, true); // Instant move for gestures
          await new Promise(r => setTimeout(r, 10)); // Tiny delay
        }
        result = await controller.mouseClick(action.button || 'left');
        break;
      case 'type_string':
        result = await controller.typeString(action.text);
        break;
      case 'type_key':
        result = await controller.typeKey(action.key);
        break;
      case 'key_tap':
        result = await controller.keyTap(action.key, action.modifiers || []);
        break;
      case 'launch_app':
        result = await controller.launchApp(action.app_name);
        break;
      case 'search_and_launch':
        result = await controller.searchAndLaunch(action.query);
        break;
      case 'press_shortcut':
        result = await controller.pressShortcut(action.keys);
        break;
      case 'focus_window':
        result = await controller.focusWindow(action.title);
        break;
      case 'get_active_window':
        result = await controller.getActiveWindow();
        break;
      case 'get_focused_element':
        result = await controller.getFocusedElement();
        break;
      case 'navigate_with_tab':
        result = await controller.navigateWithTab(action.count || 1);
        break;
      case 'navigate_backwards':
        result = await controller.navigateBackwards(action.count || 1);
        break;
      case 'press_enter':
        result = await controller.pressEnter();
        break;
      case 'press_space':
        result = await controller.pressSpace();
        break;
      case 'get_element_bounds':
        result = await controller.getElementBounds();
        break;
      case 'click_element_center':
        result = await controller.clickElementCenter();
        break;
      case 'enumerate_elements':
        result = await controller.enumerateClickableElements();
        break;
      case 'click_element_by_id':
        // Requires elements array passed from renderer (cached from enumerate)
        result = await controller.clickElementById(action.elementId, action.elements || []);
        break;
      default:
        return { success: false, error: 'Unknown action type' };
    }
    return result;
  } catch (error) {
    console.error('Execution error:', error);
    return { success: false, error: error.message };
  }
});

// Handle emergency stop
ipcMain.handle('emergency-stop', async () => {
  isAgenticMode = false;
  return { success: true };
});

// Send API key to renderer
ipcMain.handle('get-api-key', () => {
  return process.env.GEMINI_API_KEY || '';
});

// Handle dynamic mouse event toggling for UI interaction
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Cleanup C++ controller before quitting
  controller.shutdown();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure controller is stopped on app quit
  controller.shutdown();
});

console.log('👻 OpsGhost Electron Main Process Started');
