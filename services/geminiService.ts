import { GoogleGenAI, LiveSession, Modality, FunctionDeclaration, Type } from "@google/genai";

// Tools Definition

const openAppTool: FunctionDeclaration = {
  name: 'openApplication',
  description: 'Opens a desktop application like Google Chrome or Terminal.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: { type: Type.STRING, description: 'The name of the app (e.g., Chrome, Terminal)' }
    },
    required: ['appName']
  }
};

const browseUrlTool: FunctionDeclaration = {
  name: 'browseUrl',
  description: 'Navigates the browser to a specific URL.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING, description: 'The URL or keyword to navigate to (e.g., gcp, google, console)' }
    },
    required: ['url']
  }
};

const deployTool: FunctionDeclaration = {
  name: 'deployApplication',
  description: 'Deploys the current application to Google Cloud Run. Only works if GCP Console is open.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      serviceName: { type: Type.STRING, description: 'The name of the service to deploy' },
      region: { type: Type.STRING, description: 'The GCP region' }
    },
    required: ['serviceName']
  }
};

const navigateTool: FunctionDeclaration = {
  name: 'navigateConsole',
  description: 'Navigates to a specific section of the Google Cloud Console.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      section: { type: Type.STRING, description: 'The section to navigate to (e.g., Compute Engine, Cloud Run, IAM)' }
    },
    required: ['section']
  }
};

export class OpsGhostService {
  private ai: GoogleGenAI;
  private session: LiveSession | null = null;
  
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(
    onAudioData: (data: ArrayBuffer) => void,
    onTranscription: (text: string, isUser: boolean) => void,
    onToolCall: (name: string, args: any) => Promise<any>
  ) {
    // --------------------------------------------------------
    // CONNECTING TO GEMINI LIVE API
    // This establishes a real-time WebSocket connection
    // --------------------------------------------------------
    this.session = await this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        tools: [{ functionDeclarations: [deployTool, navigateTool, openAppTool, browseUrlTool] }],
        systemInstruction: `You are OpsGhost, an AI agent capable of controlling a computer desktop.
        
        Current Capabilities:
        1. You can open applications (Chrome).
        2. You can navigate to websites (Google Cloud Console).
        3. Once inside the Cloud Console, you can manage resources (Deploy, Navigate menus).

        Tone: Professional, concise, robotic but helpful. "Minority Report" style.
        
        If the user says "Open Chrome", call 'openApplication'.
        If the user says "Go to GCP" or "Cloud Console", call 'browseUrl'.
        If the user says "Deploy", call 'deployApplication'.
        
        Always confirm the action verbally before or while doing it.`,
      },
      callbacks: {
        onopen: () => {
          console.log("OpsGhost Connected");
        },
        onmessage: async (message) => {
          // Handle Audio
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            onAudioData(this.base64ToArrayBuffer(audioData));
          }

          // Handle Tool Calls
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              console.log("Tool Called:", fc.name, fc.args);
              const result = await onToolCall(fc.name, fc.args);
              
              // Send response back to Gemini
              if (this.session) {
                this.session.sendToolResponse({
                  functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result }
                  }
                });
              }
            }
          }
        },
        onclose: () => {
          console.log("OpsGhost Disconnected");
        },
        onerror: (err) => {
          console.error("OpsGhost Error:", err);
        }
      }
    });
  }

  async sendAudioChunk(base64PcmData: string) {
    if (this.session) {
      this.session.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64PcmData
        }
      });
    }
  }

  disconnect() {
    this.session = null;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}