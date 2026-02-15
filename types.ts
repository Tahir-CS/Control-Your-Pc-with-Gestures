export interface GestureState {
  x: number;
  y: number;
  isPinching: boolean;
  isRightClick: boolean;
  isLeftClick: boolean;
  handDetected: boolean;
  fingerExtended: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
}

export enum AppMode {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  AGENT_ACTIVE = 'AGENT_ACTIVE',
  DEPLOYING = 'DEPLOYING',
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  source: 'USER' | 'GEMINI' | 'SYSTEM';
}
