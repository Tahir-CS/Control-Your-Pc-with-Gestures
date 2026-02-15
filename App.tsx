import React, { useEffect, useRef, useState } from 'react';
import { initializeHandLandmarker, detectGesture } from './services/gestureService';
import { OpsGhostService } from './services/geminiService';
import { MockGCP } from './components/MockGCP';
import { TerminalOverlay } from './components/TerminalOverlay';
import { DesktopEnv } from './components/DesktopEnv';
import { BrowserWindow, GoogleSearchMock } from './components/BrowserWindow';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { GestureState, AppMode } from './types';
import { convertFloat32ToInt16, arrayBufferToBase64, playAudioQueue } from './utils/audioUtils';

type OSState = 'DESKTOP' | 'BROWSER_EMPTY' | 'BROWSER_GCP';

const App: React.FC = () => {
  // App State
  const [osState, setOsState] = useState<OSState>('DESKTOP');
  const [browserUrl, setBrowserUrl] = useState('');
  
  // Real Desktop Bridge State
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [useRealDesktop, setUseRealDesktop] = useState(false); // User preference toggle

  // Virtual Keyboard State
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);

  // Existing State
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const [gesture, setGesture] = useState<GestureState>({ 
    x: 0, y: 0, 
    isPinching: false, 
    isLeftClick: false, 
    isRightClick: false, 
    handDetected: false,
    fingerExtended: { thumb: false, index: false, middle: false, ring: false, pinky: false }
  });
  const [currentSection, setCurrentSection] = useState('Dashboard');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [geminiActive, setGeminiActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsGhostRef = useRef<OpsGhostService | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioStartTimeRef = useRef<number>(0);
  const leftClickDebounceRef = useRef<number>(0);
  const rightClickDebounceRef = useRef<number>(0);
  const keyboardClickDebounceRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Initialize Hardware
  useEffect(() => {
    let mounted = true;
    const initHardware = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 }, 
          audio: { sampleRate: 16000, channelCount: 1 } 
        });
        
        if (!mounted) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.log("Video play error:", e));
        }

        await initializeHandLandmarker();

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        
      } catch (err) {
        console.error("Hardware Init Error:", err);
      }
    };

    initHardware();
    return () => {
      mounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (analyserRef.current) (analyserRef.current.context as AudioContext).close();
    };
  }, []);

  // 2. Bridge Connection Checker
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const res = await fetch('http://localhost:8999/status').catch(() => null);
        if (res && res.ok) {
          setBridgeConnected(true);
        } else {
          setBridgeConnected(false);
        }
      } catch (e) {
        setBridgeConnected(false);
      }
    };
    
    // Check every 5 seconds
    const interval = setInterval(checkBridge, 5000);
    checkBridge(); // Initial check
    return () => clearInterval(interval);
  }, []);

  // 3. Manage Gemini Session
  useEffect(() => {
    if (!geminiActive || !streamRef.current) return;

    let inputCtx: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const startSession = async () => {
      if (!process.env.API_KEY) {
        alert("Please set a valid API_KEY.");
        setGeminiActive(false);
        return;
      }
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextAudioStartTimeRef.current = audioContextRef.current.currentTime;

      inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      source = inputCtx.createMediaStreamSource(streamRef.current!);
      processor = inputCtx.createScriptProcessor(4096, 1, 1);

      opsGhostRef.current = new OpsGhostService();
      
      processor.onaudioprocess = (e) => {
        if (!opsGhostRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmInt16 = convertFloat32ToInt16(inputData);
        opsGhostRef.current.sendAudioChunk(arrayBufferToBase64(pcmInt16.buffer));
      };
      
      source.connect(processor);
      processor.connect(inputCtx.destination);

      await opsGhostRef.current.connect(
        (audioData) => {
             if (audioContextRef.current) {
                playAudioQueue(audioContextRef.current, [audioData], nextAudioStartTimeRef);
            }
        },
        (text, isUser) => {},
        async (name, args) => {
            console.log("TOOL EXECUTED:", name, args);
            if (name === 'openApplication') return handleOpenApp(args.appName);
            if (name === 'browseUrl') return handleBrowseUrl(args.url);
            if (name === 'deployApplication') return handleDeploy(args);
            if (name === 'navigateConsole') return handleNavigate(args);
            return "Tool not found";
        }
      );
    };

    startSession();
    return () => {
      opsGhostRef.current?.disconnect();
      processor?.disconnect();
      source?.disconnect();
      inputCtx?.close();
      audioContextRef.current?.close();
    };
  }, [geminiActive, useRealDesktop, bridgeConnected]); // Re-connect if mode changes to update system instructions? (Optional, kept simple)

  // ESC Key to Disable AI Agent + Ctrl+K for keyboard
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // ESC to disable AI
      if (e.key === 'Escape' && geminiActive) {
        setTerminalLogs(prev => [...prev, "⚠ MANUAL OVERRIDE: ESC KEY PRESSED"]);
        setGeminiActive(false);
        setMode(AppMode.IDLE);
        setShowKeyboard(false);
        setKeyboardActive(false);
      }
      // Toggle keyboard with Ctrl+K
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        console.log('⌨️ Ctrl+K pressed - toggling keyboard');
        setShowKeyboard(prev => {
          const newState = !prev;
          console.log('Keyboard state:', newState);
          return newState;
        });
        setKeyboardActive(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [geminiActive]);

  // Auto-show keyboard when clicking on input fields
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        setShowKeyboard(true);
        setKeyboardActive(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Keep keyboard open, user can close with Ctrl+K if needed
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Gesture & Mic Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastMouseSendTime = 0;
    
    const loop = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const result = detectGesture(videoRef.current);
        setGesture(result);

        if (cursorRef.current && result.handDetected) {
           const screenX = result.x * window.innerWidth;
           const screenY = result.y * window.innerHeight;
           cursorRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
           
           // Send mouse position to real desktop (throttled to ~60Hz)
           const now = Date.now();
           if (useRealDesktop && bridgeConnected && now - lastMouseSendTime > 16) {
              lastMouseSendTime = now;
              sendBridgeCommand('move', '', screenX, screenY);
           }
           
           // Handle Left Click (Index + Thumb pinch)
           if (result.isLeftClick && Date.now() - leftClickDebounceRef.current > 500) {
              leftClickDebounceRef.current = Date.now();
              
              // Real Desktop Mode
              if (useRealDesktop && bridgeConnected) {
                  console.log('🖱️ Sending LEFT CLICK to desktop at', screenX, screenY);
                  sendBridgeCommand('click', '', screenX, screenY, 'left');
              } else {
                  // Web mockup mode - click DOM elements
                  const elem = document.elementFromPoint(screenX, screenY);
                  if (elem instanceof HTMLElement) {
                      elem.click();
                      console.log('Clicked element:', elem.tagName, elem.className);
                  }
              }
              
              // Cyan Ripple for left click
              const ripple = document.createElement('div');
              ripple.className = 'fixed rounded-full bg-cyan-500/50 w-8 h-8 pointer-events-none animate-ping z-50';
              ripple.style.left = `${screenX - 16}px`;
              ripple.style.top = `${screenY - 16}px`;
              document.body.appendChild(ripple);
              setTimeout(() => ripple.remove(), 500);
           }
           
           // Handle Right Click (Middle + Thumb pinch)
           if (result.isRightClick && Date.now() - rightClickDebounceRef.current > 500) {
              rightClickDebounceRef.current = Date.now();
              
              // Real Desktop Mode
              if (useRealDesktop && bridgeConnected) {
                  console.log('🖱️ Sending RIGHT CLICK to desktop at', screenX, screenY);
                  sendBridgeCommand('click', '', screenX, screenY, 'right');
              } else {
                  // Web mockup mode - trigger context menu
                  const elem = document.elementFromPoint(screenX, screenY);
                  if (elem instanceof HTMLElement) {
                      const event = new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: screenX,
                        clientY: screenY
                      });
                      elem.dispatchEvent(event);
                  }
              }
              
              // Orange Ripple for right click
              const ripple = document.createElement('div');
              ripple.className = 'fixed rounded-full bg-orange-500/50 w-8 h-8 pointer-events-none animate-ping z-50';
              ripple.style.left = `${screenX - 16}px`;
              ripple.style.top = `${screenY - 16}px`;
              document.body.appendChild(ripple);
              setTimeout(() => ripple.remove(), 500);
           }
        }
      }

      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setMicVolume(sum / dataArray.length);
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [geminiActive, keyboardActive, useRealDesktop, bridgeConnected]);

  // --- TOOL HANDLERS ---
  const sendBridgeCommand = async (action: string, payload: string, x?: number, y?: number, button?: string) => {
    try {
      const body: any = { action };
      if (payload) body.payload = payload;
      if (x !== undefined) body.x = Math.round(x);
      if (y !== undefined) body.y = Math.round(y);
      if (button) body.button = button;
      
      const res = await fetch('http://localhost:8999/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (e) {
      console.error("Bridge Error", e);
      return { success: false };
    }
  };

  const handleOpenApp = async (appName: string) => {
      // REAL MODE
      if (useRealDesktop && bridgeConnected) {
         await sendBridgeCommand('open', appName);
         return `Command sent to open ${appName} on host machine.`;
      }
      
      // SIMULATION MODE
      if (appName.toLowerCase().includes('chrome')) {
          setOsState('BROWSER_EMPTY');
          setBrowserUrl('');
          return "Opening Google Chrome simulation.";
      }
      return "App not found in simulation.";
  };

  const handleBrowseUrl = async (url: string) => {
      // REAL MODE
      if (useRealDesktop && bridgeConnected) {
         // If it's a search term, google it. If it's a url, open it.
         let finalUrl = url;
         if (!url.includes('.') || url.includes(' ')) {
           finalUrl = `https://google.com/search?q=${encodeURIComponent(url)}`;
         } else if (!url.startsWith('http')) {
           finalUrl = `https://${url}`;
         }
         await sendBridgeCommand('url', finalUrl);
         return `Opening ${finalUrl} on host machine browser.`;
      }

      // SIMULATION MODE
      if (url.toLowerCase().includes('gcp') || url.toLowerCase().includes('console') || url.toLowerCase().includes('cloud')) {
          setOsState('BROWSER_GCP');
          setBrowserUrl('https://console.cloud.google.com/dashboard');
          return "Navigating to Google Cloud Platform Console simulation.";
      }
      setBrowserUrl(url);
      setOsState('BROWSER_EMPTY'); 
      return `Navigating to ${url}`;
  };

  const handleDeploy = async (args: any) => {
    // REAL MODE (Mocked for now as we don't have a real CLI bridge command yet, but conceptually same)
    if (useRealDesktop && bridgeConnected) {
        return "I have triggered the deployment pipeline on your local terminal.";
    }

    if (osState !== 'BROWSER_GCP') return "Error: You must be in the GCP Console to deploy.";
    setMode(AppMode.DEPLOYING);
    setShowTerminal(true);
    setTerminalLogs(prev => [...prev, `INITIATING DEPLOYMENT SEQUENCE...`]);
    await new Promise(r => setTimeout(r, 2000));
    setTerminalLogs(prev => [...prev, `SUCCESS: Service [${args.serviceName}] is now live.`]);
    setMode(AppMode.AGENT_ACTIVE);
    return "Deployment successful.";
  };

  const handleNavigate = async (args: any) => {
    if (useRealDesktop && bridgeConnected) {
        return `Navigating real browser to ${args.section}... (Bridge capability limited to URL opening)`;
    }
    
    if (osState !== 'BROWSER_GCP') return "Error: You must be in the GCP Console.";
    if (['Dashboard', 'Cloud Run', 'Compute Engine', 'IAM'].includes(args.section)) {
        setCurrentSection(args.section);
        return `Navigated to ${args.section}.`;
    }
    return "Section not found.";
  };

  const toggleGemini = () => {
    if (geminiActive) {
      opsGhostRef.current?.disconnect();
      setGeminiActive(false);
      setMode(AppMode.IDLE);
    } else {
      setMode(AppMode.LISTENING);
      setGeminiActive(true);
    }
  };

  const handleKeyboardPress = (key: string) => {
    console.log('Keyboard Key Pressed:', key);
    
    // Handle the key press
    let keyToSend = key;
    if (key === 'SPACE') keyToSend = ' ';
    
    // Type into active element
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const input = activeElement as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentValue = input.value;
      
      if (key === 'BACK') {
        if (start > 0) {
          input.value = currentValue.slice(0, start - 1) + currentValue.slice(end);
          input.setSelectionRange(start - 1, start - 1);
        }
      } else if (key === 'ENTER') {
        // Trigger form submission or new line
        if (input.tagName === 'TEXTAREA') {
          input.value = currentValue.slice(0, start) + '\\n' + currentValue.slice(end);
          input.setSelectionRange(start + 1, start + 1);
        }
      } else {
        input.value = currentValue.slice(0, start) + keyToSend + currentValue.slice(end);
        input.setSelectionRange(start + 1, start + 1);
      }
      
      // Trigger input event
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Also send to real desktop if bridge is connected and in real mode
    if (useRealDesktop && bridgeConnected) {
      sendBridgeCommand('key', key);
    }
  };

  const manualUrlChange = (url: string) => {
      if (url.includes('console.cloud.google.com')) {
          setOsState('BROWSER_GCP');
          setBrowserUrl('https://console.cloud.google.com/dashboard');
      } else {
          setBrowserUrl(url);
      }
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden ${geminiActive ? 'cursor-none' : ''} bg-gray-900 text-white font-sans`}>
      <video ref={videoRef} className="absolute top-0 left-0 opacity-0 pointer-events-none -z-50" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      {/* 1. OS LAYER (Desktop & Windows) */}
      <DesktopEnv onIconClick={(app) => app === 'Chrome' && setOsState('BROWSER_EMPTY')} />

      {/* Browser Window Overlay (Only in Mock Mode) */}
      {osState !== 'DESKTOP' && !useRealDesktop && (
          <BrowserWindow 
            url={browserUrl} 
            onUrlChange={manualUrlChange}
            onClose={() => setOsState('DESKTOP')}
          >
              {osState === 'BROWSER_EMPTY' && <GoogleSearchMock />}
              {osState === 'BROWSER_GCP' && <MockGCP currentSection={currentSection} />}
          </BrowserWindow>
      )}

      {/* 2. HUD & CONTROLS */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        
        {/* Status Bar Top Right */}
        <div className="absolute top-4 right-4 flex flex-col items-end space-y-2 pointer-events-auto">
           {/* Connection Status */}
           <div className={`px-4 py-2 rounded-lg backdrop-blur-md border flex items-center space-x-3 shadow-lg transition-colors
               ${geminiActive ? 'bg-black/90 border-cyan-500/50 text-cyan-400' : 'bg-black/40 border-gray-600/50 text-gray-400'}`}>
               <div className={`w-3 h-3 rounded-full ${geminiActive ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`}></div>
               <span className="font-mono font-bold tracking-widest">{geminiActive ? 'OPSGHOST ONLINE' : 'SYSTEM IDLE'}</span>
           </div>

           {/* Bridge Status Toggle */}
           <div 
             onClick={() => setUseRealDesktop(!useRealDesktop)}
             className={`px-4 py-2 rounded-lg backdrop-blur-md border flex items-center space-x-3 shadow-lg transition-colors cursor-pointer
               ${bridgeConnected ? 'border-green-500/50' : 'border-red-500/50'} bg-black/60`}
            >
               <i className={`fa-solid fa-server ${bridgeConnected ? 'text-green-500' : 'text-red-500'}`}></i>
               <div className="flex flex-col items-start">
                   <span className="text-xs font-bold text-gray-400 uppercase">Desktop Bridge</span>
                   <div className="flex items-center space-x-2">
                       <span className={`text-sm font-bold ${bridgeConnected ? 'text-green-400' : 'text-red-400'}`}>
                           {bridgeConnected ? 'CONNECTED' : 'DISCONNECTED'}
                       </span>
                       {bridgeConnected && (
                           <span className={`text-[10px] px-1 rounded ${useRealDesktop ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-400'}`}>
                               {useRealDesktop ? 'ON' : 'OFF'}
                           </span>
                       )}
                   </div>
               </div>
           </div>
           
           {/* Mic Visualizer */}
           <div className="flex items-center space-x-2 bg-black/60 px-3 py-1 rounded border border-gray-700">
             <i className="fa-solid fa-microphone text-xs text-gray-400"></i>
             <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${Math.min(100, (micVolume / 50) * 100)}%` }}></div>
             </div>
           </div>
        </div>

        {/* Start Button & Keyboard Toggle */}
        <div className="absolute bottom-10 left-10 pointer-events-auto flex items-end space-x-4">
            {!geminiActive && (
                <button 
                    onClick={toggleGemini} 
                    className="group bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-4 rounded-lg font-bold shadow-[0_0_15px_rgba(6,182,212,0.5)] flex items-center space-x-3 transition-all transform hover:scale-105"
                >
                    <i className="fa-solid fa-power-off text-xl group-hover:animate-pulse"></i>
                    <div className="text-left">
                        <div className="text-sm opacity-80">ACTIVATE AGENT</div>
                        <div className="text-lg leading-none">Initialize OpsGhost</div>
                    </div>
                </button>
            )}
            
            {/* Keyboard Toggle Button */}
            <button
                onClick={() => {
                    console.log('🎹 Keyboard button clicked! Current state:', showKeyboard);
                    setShowKeyboard(prev => {
                        const newState = !prev;
                        console.log('🎹 New keyboard state:', newState);
                        return newState;
                    });
                    setKeyboardActive(prev => !prev);
                }}
                className={`px-4 py-3 rounded-lg font-bold shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105 ${
                    showKeyboard 
                        ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)]' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
            >
                <i className="fa-solid fa-keyboard text-lg"></i>
                <span>{showKeyboard ? 'Hide' : 'Show'} Keyboard</span>
            </button>
        </div>

        {/* INTELLIGENT COMMAND GUIDE (Dynamic Help) */}
        {geminiActive && (
            <div className="absolute bottom-10 right-10 bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-lg max-w-sm shadow-2xl animate-in slide-in-from-right duration-500">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Voice Command Uplink</div>
                
                {/* Gesture Controls Info */}
                <div className="mb-3 pb-3 border-b border-white/10">
                  <div className="text-xs font-bold text-cyan-400 mb-2">✋ GESTURE CONTROLS</div>
                  <div className="space-y-1 text-xs text-white/70">
                    <div>👆+👍 = Left Click (Cyan)</div>
                    <div>🖕+👍 = Right Click (Orange)</div>
                    <div>⌨️ Ctrl+K = Toggle Keyboard</div>
                    <div>⎋ ESC = Disable AI Agent</div>
                  </div>
                </div>

                {osState === 'DESKTOP' && (
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2 text-white">
                            <i className="fa-solid fa-comment-dots text-cyan-400"></i>
                            <span>"Open Google Chrome"</span>
                        </div>
                        <div className="flex items-center space-x-2 text-white/50 text-sm">
                            <i className="fa-regular fa-hand-pointer"></i>
                            <span>Or Pinch the Chrome Icon</span>
                        </div>
                    </div>
                )}

                {osState === 'BROWSER_EMPTY' && (
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2 text-white">
                            <i className="fa-solid fa-comment-dots text-cyan-400"></i>
                            <span>"Go to GCP Console"</span>
                        </div>
                        <div className="flex items-center space-x-2 text-white/50 text-sm">
                            <i className="fa-regular fa-hand-pointer"></i>
                            <span>Or Pinch Address Bar</span>
                        </div>
                    </div>
                )}

                {osState === 'BROWSER_GCP' && (
                    <div className="space-y-2">
                         <div className="flex items-center space-x-2 text-white">
                            <i className="fa-solid fa-comment-dots text-cyan-400"></i>
                            <span>"Deploy this service"</span>
                        </div>
                        <div className="flex items-center space-x-2 text-white">
                            <i className="fa-solid fa-comment-dots text-cyan-400"></i>
                            <span>"Go to Compute Engine"</span>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Terminal Overlay (Conditional) */}
        <div className="pointer-events-auto"> 
            <TerminalOverlay isVisible={showTerminal} logs={terminalLogs} />
        </div>

      </div>

      {/* VIRTUAL KEYBOARD */}
      <VirtualKeyboard 
        isVisible={showKeyboard}
        onKeyPress={handleKeyboardPress}
        cursorPosition={{ x: gesture.x * window.innerWidth, y: gesture.y * window.innerHeight }}
        isHovering={gesture.handDetected}
      />

      {/* GHOST CURSOR */}
      <div 
        ref={cursorRef} 
        className={`fixed top-0 left-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[9999] transition-opacity duration-300
            ${!gesture.handDetected ? 'opacity-0' : 'opacity-100'}
        `}
      >
        <div className={`relative transition-transform duration-200 ${gesture.isPinching ? 'scale-75' : 'scale-100'}`}>
             <svg width="60" height="60" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Outer circle with color based on click type */}
                <circle 
                  cx="20" 
                  cy="20" 
                  r="18" 
                  stroke={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  strokeWidth="4" 
                />
                {/* Inner dot when clicking */}
                <circle 
                  cx="20" 
                  cy="20" 
                  r="6" 
                  fill={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  opacity={gesture.isPinching ? "1" : "0"} 
                />
                {/* Crosshair lines */}
                <line 
                  x1="20" y1="0" x2="20" y2="12" 
                  stroke={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  strokeWidth="4"
                />
                <line 
                  x1="20" y1="28" x2="20" y2="40" 
                  stroke={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  strokeWidth="4"
                />
                <line 
                  x1="0" y1="20" x2="12" y2="20" 
                  stroke={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  strokeWidth="4"
                />
                <line 
                  x1="28" y1="20" x2="40" y2="20" 
                  stroke={gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : '#000000'} 
                  strokeWidth="4"
                />
             </svg>
             
             <div className="absolute top-12 left-12 bg-black border-2 border-black px-3 py-2 rounded font-bold uppercase tracking-widest shadow-xl">
                 <span style={{ 
                   color: gesture.isLeftClick ? '#06b6d4' : gesture.isRightClick ? '#f97316' : 'white' 
                 }}>
                   {gesture.isLeftClick ? 'LEFT CLICK' : gesture.isRightClick ? 'RIGHT CLICK' : gesture.isPinching ? 'CLICK' : 'ACTIVE'}
                 </span>
             </div>
        </div>
      </div>
    </div>
  );
};

export default App;