// Mouse/Keyboard Control Module for Windows
// High-Performance C++ Controller with PowerShell Fallback
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = promisify(exec);

// C++ Controller Process
let cppProcess = null;
let useCppController = false;

// Smoothing variables for natural cursor movement
let currentX = 0;
let currentY = 0;
const SMOOTHING_FACTOR = 0.3; // 0.1 = Very smooth/slow, 0.9 = Very fast/jittery

// PowerShell execution wrapper with timeout (Fallback)
async function execPowerShell(command, timeoutMs = 2000) {
  console.log(`   [POWERSHELL] Starting execution (timeout: ${timeoutMs}ms)...`);
  try {
    const { stdout, stderr } = await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "${command}"`,
      { timeout: timeoutMs }
    );
    console.log(`   [POWERSHELL] Execution completed`);
    if (stderr) {
      console.warn('   [POWERSHELL] stderr:', stderr);
    }
    if (stdout) {
      console.log('   [POWERSHELL] stdout:', stdout);
    }
    return { success: true, stdout };
  } catch (error) {
    console.error('   [POWERSHELL] Execution failed:', error.message);
    console.error('   [POWERSHELL] Error code:', error.code);
    console.error('   [POWERSHELL] Signal:', error.signal);
    return { success: false, error: error.message };
  }
}

// Start the C++ controller process
function startCppController() {
  const exePath = path.join(__dirname, '..', 'controller.exe');
  
  // Check if controller.exe exists
  if (!fs.existsSync(exePath)) {
    console.log('⚠️  [CONTROLLER] controller.exe not found. Using PowerShell fallback.');
    console.log('   To enable high-performance mode:');
    console.log('   1. Open "Developer PowerShell for VS 2022"');
    console.log('   2. Run: .\\compile-controller.bat');
    useCppController = false;
    return;
  }
  
  try {
    cppProcess = spawn(exePath);
    cppProcess.stdin.setEncoding('utf-8');
    
    cppProcess.on('error', (err) => {
      console.error('❌ [CONTROLLER] C++ Controller failed to start:', err);
      console.log('   Falling back to PowerShell mode...');
      useCppController = false;
      cppProcess = null;
    });

    cppProcess.on('exit', (code) => {
      console.log(`⚠️  [CONTROLLER] C++ process exited with code ${code}`);
      cppProcess = null;
      useCppController = false;
    });

    useCppController = true;
    console.log("🚀 [CONTROLLER] High-Speed C++ Controller Active");
  } catch (error) {
    console.error('❌ [CONTROLLER] Failed to start C++ controller:', error);
    console.log('   Using PowerShell fallback...');
    useCppController = false;
    cppProcess = null;
  }
}

// Stop the C++ controller process
function stopCppController() {
  if (cppProcess) {
    try {
      cppProcess.stdin.write('exit\n');
      cppProcess.kill();
      cppProcess = null;
      console.log('🛑 [CONTROLLER] C++ Controller stopped');
    } catch (error) {
      console.error('❌ [CONTROLLER] Error stopping C++ controller:', error);
    }
  }
  useCppController = false;
}

class WindowsController {
  constructor() {
    // Start the C++ controller on initialization
    startCppController();
  }

  async moveMouse(x, y, fromGesture = false) {
    // Use C++ Controller
    if (useCppController && cppProcess) {
      try {
        // If from gesture control, move INSTANTLY (no smoothing)
        // If from AI, apply gentle smoothing for natural movement
        let targetX, targetY;
        
        if (fromGesture) {
          // INSTANT movement for gesture control
          targetX = Math.round(x);
          targetY = Math.round(y);
          // Update current position to match
          currentX = x;
          currentY = y;
        } else {
          // Smooth movement for AI control
          currentX = currentX + (x - currentX) * 0.3;
          currentY = currentY + (y - currentY) * 0.3;
          targetX = Math.round(currentX);
          targetY = Math.round(currentY);
        }

        // Send command to C++ controller
        cppProcess.stdin.write(`move:${targetX}:${targetY}\n`);
        // Removed verbose logging for movement
        return { success: true, mode: 'cpp' };
      } catch (error) {
        console.error('❌ [CONTROLLER] C++ move failed, using fallback:', error);
        // Fall through to PowerShell
      }
    }
    
    // PowerShell Fallback
    const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`;
    const result = await execPowerShell(cmd, 1000);
    return result;
  }

  async mouseClick(button = 'left') {
    // Use C++ Controller
    if (useCppController && cppProcess) {
      try {
        cppProcess.stdin.write(`click:${button}\n`);
        return { success: true, mode: 'cpp' };
      } catch (error) {
        console.error('❌ [CONTROLLER] C++ click failed, using fallback:', error);
        // Fall through to PowerShell
      }
    }
    
    // PowerShell Fallback
    try {
      const clickCode = button === 'left' ? '0x02' : '0x08';
      const upCode = button === 'left' ? '0x04' : '0x10';
      
      const cmd = `Add-Type -MemberDefinition '[DllImport(\\"user32.dll\\")]public static extern void mouse_event(int dwFlags,int dx,int dy,int cButtons,int dwExtraInfo);' -Name M -Namespace W; [W.M]::mouse_event(${clickCode},0,0,0,0); Start-Sleep -Milliseconds 50; [W.M]::mouse_event(${upCode},0,0,0,0)`;
      
      const result = await execPowerShell(cmd, 1500);
      
      if (!result.success) {
        console.error('❌ [CONTROLLER] Mouse click error');
      }
      return result;
    } catch (error) {
      console.error('❌ [CONTROLLER] Mouse click error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Clean shutdown method
  shutdown() {
    stopCppController();
  }

  async typeString(text) {
    try {
      // Escape for SendKeys
      const escaped = text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\+/g, '{+}')
        .replace(/\^/g, '{^}')
        .replace(/%/g, '{%}')
        .replace(/~/g, '{~}')
        .replace(/\(/g, '{(}')
        .replace(/\)/g, '{)}')
        .replace(/{/g, '{{}')
        .replace(/}/g, '{}}')
        .replace(/\[/g, '{[}')
        .replace(/\]/g, '{]}');

      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;
      return await execPowerShell(cmd, 3000);
    } catch (error) {
      console.error('Type string error:', error);
      return { success: false, error: error.message };
    }
  }

  async typeKey(key) {
    // Try C++ controller first
    if (useCppController && cppProcess) {
      try {
        cppProcess.stdin.write(`key:${key}\n`);
        return { success: true };
      } catch (error) {
        console.error('   [C++] Key write error:', error);
        // Fall back to PowerShell
      }
    }

    // PowerShell fallback
    try {
      // Map keys for SendKeys format
      let sendKey = key;
      if (key === 'SPACE') sendKey = ' ';
      else if (key === 'ENTER') sendKey = '{ENTER}';
      else if (key === 'BACK') sendKey = '{BACKSPACE}';
      else if (key.length === 1) sendKey = key; // Single character
      else sendKey = `{${key}}`; // Wrap in brackets

      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')`;
      return await execPowerShell(cmd, 1500);
    } catch (error) {
      console.error('   [POWERSHELL] Key error:', error);
      return { success: false, error: error.message };
    }
  }

  async keyTap(key, modifiers = []) {
    try {
      let keyString = key;
      if (modifiers.length > 0) {
        const modMap = { 'ctrl': '^', 'alt': '%', 'shift': '+', 'command': '^' };
        const modPrefix = modifiers.map(m => modMap[m.toLowerCase()] || '').join('');
        keyString = `${modPrefix}{${key}}`;
      } else {
        keyString = `{${key}}`;
      }

      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keyString}')`;
      return await execPowerShell(cmd, 1500);
    } catch (error) {
      console.error('Key tap error:', error);
      return { success: false, error: error.message };
    }
  }

  async launchApp(appName) {
    console.log(`🚀 [CONTROLLER] launchApp called: ${appName}`);
    try {
      // Map common app names to actual executables
      const appMap = {
        'chrome': 'chrome',
        'google chrome': 'chrome',
        'browser': 'chrome',
        'firefox': 'firefox',
        'edge': 'msedge',
        'microsoft edge': 'msedge',
        'notepad': 'notepad',
        'calculator': 'calc',
        'calc': 'calc',
        'explorer': 'explorer',
        'file explorer': 'explorer',
        'cmd': 'cmd',
        'command prompt': 'cmd',
        'powershell': 'powershell',
        'terminal': 'powershell',
        'vscode': 'code',
        'code': 'code',
        'visual studio code': 'code'
      };

      const executable = appMap[appName.toLowerCase()] || appName;
      const cmd = `Start-Process ${executable}`;
      
      console.log(`   [CONTROLLER] Launching: ${executable}`);
      const result = await execPowerShell(cmd, 3000);
      
      if (result.success) {
        console.log(`✅ [CONTROLLER] ${appName} launched successfully`);
      }
      return result;
    } catch (error) {
      console.error(`❌ [CONTROLLER] Failed to launch ${appName}:`, error);
      return { success: false, error: error.message };
    }
  }

  // FAST: Direct app launch - Much faster than Windows Search!
  async searchAndLaunch(query) {
    try {
      // Try direct launch first - fastest method!
      const appMap = {
        'chrome': 'chrome',
        'google chrome': 'chrome',
        'firefox': 'firefox',
        'edge': 'msedge',
        'microsoft edge': 'msedge',
        'notepad': 'notepad',
        'calculator': 'calc',
        'calc': 'calc',
        'explorer': 'explorer',
        'file explorer': 'explorer',
        'cmd': 'cmd',
        'command prompt': 'cmd',
        'powershell': 'powershell',
        'terminal': 'powershell',
        'vscode': 'code',
        'code': 'code',
        'visual studio code': 'code',
        'discord': 'discord',
        'spotify': 'spotify',
        'slack': 'slack',
        'teams': 'teams',
        'outlook': 'outlook'
      };
      
      const normalizedQuery = query.toLowerCase().trim();
      const executable = appMap[normalizedQuery] || query;
      
      // Use Start-Process - instant!
      const cmd = `Start-Process ${executable}`;
      const result = await execPowerShell(cmd, 2000);
      
      if (result.success) {
        return { success: true, method: 'direct-launch', app: executable };
      }
      
      // Fallback: try as file path or command
      const fallbackCmd = `Start-Process '${query}'`;
      const fallbackResult = await execPowerShell(fallbackCmd, 2000);
      return fallbackResult;
      
    } catch (error) {
      console.error('❌ [CONTROLLER] Launch failed:', error);
      return { success: false, error: error.message };
    }
  }

  // IMPROVED: Focus window by title with better Alt+Tab integration
  async focusWindow(titleSubstring) {
    try {
      // Method 1: Direct window focus
      const cmd = `
        $windows = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.MainWindowTitle -like '*${titleSubstring}*' } | Select-Object -First 1
        if ($windows) {
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class WinAPI {
              [DllImport("user32.dll")]
              public static extern bool SetForegroundWindow(IntPtr hWnd);
              [DllImport("user32.dll")]
              public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
              [DllImport("user32.dll")]
              public static extern bool IsIconic(IntPtr hWnd);
            }
"@
          $handle = $windows.MainWindowHandle
          # Restore if minimized
          if ([WinAPI]::IsIconic($handle)) {
            [WinAPI]::ShowWindow($handle, 9)
          }
          # Bring to front
          [WinAPI]::SetForegroundWindow($handle)
          Write-Output "SUCCESS: Focused - $($windows.MainWindowTitle)"
        } else {
          Write-Output "ERROR: No window found matching: ${titleSubstring}"
          exit 1
        }
      `;
      
      const result = await execPowerShell(cmd, 3000);
      
      if (result.success && result.stdout && result.stdout.includes('SUCCESS')) {
        return { success: true, message: result.stdout };
      } else {
        // Fallback: Use Alt+Tab if direct focus fails
        console.log('Trying Alt+Tab fallback...');
        await this.pressShortcut('alt+tab');
        return { success: true, method: 'alt-tab-fallback' };
      }
    } catch (error) {
      console.error('❌ [CONTROLLER] Focus window failed:', error);
      return { success: false, error: error.message };
    }
  }

  // OPTIMIZED: Press keyboard shortcut (like Ctrl+T, Alt+Tab, Win+D)
  async pressShortcut(keys) {
    try {
      // Map to SendKeys format
      const shortcutMap = {
        'ctrl': '^',
        'alt': '%',
        'shift': '+',
        'win': '^{ESC}' // Win key approximation
      };
      
      let sendKeysStr = '';
      const parts = keys.toLowerCase().split('+').map(k => k.trim());
      
      parts.forEach((part, idx) => {
        if (shortcutMap[part]) {
          sendKeysStr += shortcutMap[part];
        } else if (idx === parts.length - 1) {
          // Last part is the actual key
          if (part.length === 1) {
            sendKeysStr += part;
          } else {
            sendKeysStr += `{${part}}`;
          }
        }
      });
      
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr}')`;
      const result = await execPowerShell(cmd, 1000);
      return result;
    } catch (error) {
      console.error('❌ [CONTROLLER] Shortcut failed:', error);
      return { success: false, error: error.message };
    }
  }

  // OPTIMIZED: Get active window title (for context)
  async getActiveWindow() {
    try {
      const cmd = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          using System.Text;
          public class WinAPI {
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")]
            public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          }
"@
        $handle = [WinAPI]::GetForegroundWindow()
        $title = New-Object System.Text.StringBuilder 256
        [WinAPI]::GetWindowText($handle, $title, 256)
        Write-Output $title.ToString()
      `;
      
      const result = await execPowerShell(cmd, 1500);
      if (result.success && result.stdout) {
        return { success: true, title: result.stdout.trim() };
      }
      return { success: false };
    } catch (error) {
      console.error('❌ [CONTROLLER] Get active window failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== TAB NAVIGATION WITH VERIFICATION ====================
  // Much more accurate than mouse coordinates - can verify before clicking!
  
  // Get information about currently focused UI element (ENHANCED VERSION)
  async getFocusedElement() {
    try {
      const cmd = `
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        
        try {
          $automation = [System.Windows.Automation.AutomationElement]::FocusedElement
          
          if ($automation -ne $null) {
            $name = $automation.Current.Name
            $type = $automation.Current.LocalizedControlType
            $className = $automation.Current.ClassName
            $automationId = $automation.Current.AutomationId
            $helpText = $automation.Current.HelpText
            $value = ""
            $text = ""
            
            # Try to get value (for text inputs)
            try {
              $valuePattern = $automation.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
              if ($valuePattern -ne $null) {
                $value = $valuePattern.Current.Value
              }
            } catch {}
            
            # Try to get text content (for text elements, links, buttons)
            try {
              $textPattern = $automation.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
              if ($textPattern -ne $null) {
                $range = $textPattern.DocumentRange
                $text = $range.GetText(-1)
              }
            } catch {}
            
            # Try LegacyIAccessible pattern (works with more UIs including Chrome)
            try {
              $legacyPattern = $automation.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern)
              if ($legacyPattern -ne $null) {
                $legacyName = $legacyPattern.Current.Name
                $legacyValue = $legacyPattern.Current.Value
                
                # Use legacy name if main name is empty
                if ([string]::IsNullOrEmpty($name) -and -not [string]::IsNullOrEmpty($legacyName)) {
                  $name = $legacyName
                }
                # Use legacy value if empty
                if ([string]::IsNullOrEmpty($value) -and -not [string]::IsNullOrEmpty($legacyValue)) {
                  $value = $legacyValue
                }
              }
            } catch {}
            
            # Use text content if name is empty
            if ([string]::IsNullOrEmpty($name) -and -not [string]::IsNullOrEmpty($text)) {
              $name = $text.Trim()
            }
            
            # Use help text if name is still empty
            if ([string]::IsNullOrEmpty($name) -and -not [string]::IsNullOrEmpty($helpText)) {
              $name = $helpText
            }
            
            # Create JSON output
            $output = @{
              name = if ($name) { $name } else { "" }
              type = if ($type) { $type } else { "unknown" }
              value = if ($value) { $value } else { "" }
              className = if ($className) { $className } else { "" }
              automationId = if ($automationId) { $automationId } else { "" }
              text = if ($text) { $text.Trim() } else { "" }
            }
            
            Write-Output ($output | ConvertTo-Json -Compress)
          } else {
            Write-Output '{"name":"","type":"none","value":"","className":"","automationId":"","text":""}'
          }
        } catch {
          $errMsg = $_.Exception.Message
          Write-Output "{""name"":"""",""type"":""error"",""value"":"""",""className"":"""",""automationId"":"""",""text"":""$errMsg""}"
        }
      `;
      
      const result = await execPowerShell(cmd, 2000);
      
      if (result.success && result.stdout) {
        try {
          const focusData = JSON.parse(result.stdout.trim());
          
          // Return enhanced data with all possible text sources
          return { 
            success: true, 
            name: focusData.name || '',
            type: focusData.type || 'unknown',
            value: focusData.value || '',
            className: focusData.className || '',
            automationId: focusData.automationId || '',
            text: focusData.text || '',
            // Provide best display text (priority: name > text > value > automationId)
            displayText: focusData.name || focusData.text || focusData.value || focusData.automationId || ''
          };
        } catch (parseError) {
          return { success: false, error: 'Failed to parse focus data', raw: result.stdout };
        }
      }
      
      return { success: false, error: 'No focused element found' };
    } catch (error) {
      console.error('❌ [CONTROLLER] Get focused element failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Navigate forward with Tab key (moves selection through UI elements)
  async navigateWithTab(count = 1) {
    try {
      // Press Tab multiple times
      let tabString = '';
      for (let i = 0; i < count; i++) {
        tabString += '{TAB}';
      }
      
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${tabString}')`;
      const result = await execPowerShell(cmd, 1500);
      return { success: true, count: count };
    } catch (error) {
      console.error('❌ [CONTROLLER] Tab navigation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Navigate backward with Shift+Tab (goes to previous UI element)
  async navigateBackwards(count = 1) {
    try {
      // Press Shift+Tab multiple times
      let tabString = '';
      for (let i = 0; i < count; i++) {
        tabString += '+{TAB}'; // + means Shift in SendKeys
      }
      
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${tabString}')`;
      const result = await execPowerShell(cmd, 1500);
      return { success: true, count: count };
    } catch (error) {
      console.error('❌ [CONTROLLER] Shift-Tab navigation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Press Enter to activate the currently focused element
  async pressEnter() {
    try {
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`;
      const result = await execPowerShell(cmd, 1000);
      return { success: true };
    } catch (error) {
      console.error('❌ [CONTROLLER] Press Enter failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Press Space (for checkboxes, radio buttons, toggle buttons)
  async pressSpace() {
    try {
      const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(' ')`;
      const result = await execPowerShell(cmd, 1000);
      return { success: true };
    } catch (error) {
      console.error('❌ [CONTROLLER] Press Space failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== PIXEL-PERFECT CLICKING ====================
  // Get exact bounding rectangle of currently focused element
  async getElementBounds() {
    try {
      const cmd = `
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        
        try {
          $automation = [System.Windows.Automation.AutomationElement]::FocusedElement
          
          if ($automation -ne $null) {
            $rect = $automation.Current.BoundingRectangle
            
            # Calculate center point
            $centerX = [int]($rect.Left + ($rect.Width / 2))
            $centerY = [int]($rect.Top + ($rect.Height / 2))
            
            # Create JSON output
            $output = @{
              left = [int]$rect.Left
              top = [int]$rect.Top
              width = [int]$rect.Width
              height = [int]$rect.Height
              centerX = $centerX
              centerY = $centerY
              right = [int]$rect.Right
              bottom = [int]$rect.Bottom
            }
            
            Write-Output ($output | ConvertTo-Json -Compress)
          } else {
            Write-Output '{"left":0,"top":0,"width":0,"height":0,"centerX":0,"centerY":0,"right":0,"bottom":0}'
          }
        } catch {
          $errMsg = $_.Exception.Message
          Write-Output "{""error"":""$errMsg""}"
        }
      `;
      
      const result = await execPowerShell(cmd, 2000);
      
      if (result.success && result.stdout) {
        try {
          const boundsData = JSON.parse(result.stdout.trim());
          
          if (boundsData.error) {
            return { success: false, error: boundsData.error };
          }
          
          return { 
            success: true, 
            left: boundsData.left || 0,
            top: boundsData.top || 0,
            width: boundsData.width || 0,
            height: boundsData.height || 0,
            centerX: boundsData.centerX || 0,
            centerY: boundsData.centerY || 0,
            right: boundsData.right || 0,
            bottom: boundsData.bottom || 0
          };
        } catch (parseError) {
          return { success: false, error: 'Failed to parse bounds data', raw: result.stdout };
        }
      }
      
      return { success: false, error: 'No bounds found' };
    } catch (error) {
      console.error('❌ [CONTROLLER] Get element bounds failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Click at the exact center of the currently focused element (PIXEL-PERFECT!)
  async clickElementCenter() {
    try {
      // Get the exact bounding box of focused element
      const boundsResult = await this.getElementBounds();
      
      if (!boundsResult.success) {
        return { success: false, error: 'Could not get element bounds' };
      }
      
      const { centerX, centerY, width, height } = boundsResult;
      
      // Validate bounds
      if (width === 0 || height === 0) {
        return { success: false, error: 'Element has zero size' };
      }
      
      console.log(`🎯 [PIXEL-PERFECT] Clicking center of element at (${centerX}, ${centerY})`);
      
      // Move to exact center and click
      const moveResult = await this.mouseMove(centerX, centerY);
      if (!moveResult.success) {
        return { success: false, error: 'Failed to move mouse' };
      }
      
      // Small delay to ensure mouse is positioned
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const clickResult = await this.mouseClick('left');
      if (!clickResult.success) {
        return { success: false, error: 'Failed to click' };
      }
      
      return { 
        success: true, 
        clickedAt: { x: centerX, y: centerY },
        elementBounds: { width, height }
      };
    } catch (error) {
      console.error('❌ [CONTROLLER] Click element center failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new WindowsController();
