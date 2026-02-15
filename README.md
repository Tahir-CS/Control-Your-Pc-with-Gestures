# 👻 OpsGhost - AI-Powered Gesture Desktop Control

<div align="center">

**Control Your Computer With Hand Gestures + AI Vision Voice Assistant**

🖐️ No Mouse Required | 🎤 Voice Commands | 🤖 AI Vision | ⚡ Real Windows Control

[![Frostbyte Hackathon 2026](https://img.shields.io/badge/Frostbyte-Hackathon%202026-blue)](https://frostbyte-hackathon.devpost.com/)
[![AI & ML](https://img.shields.io/badge/Category-AI%20%26%20ML-green)](https://frostbyte-hackathon.devpost.com/)

</div>

---

## 🌟 What is OpsGhost?

OpsGhost is a revolutionary **touchless desktop control system** that combines:
- **Hand Gesture Recognition** (MediaPipe) - Control mouse & keyboard with air gestures
- **AI Vision Assistant** (Google Gemini Live) - AI sees your screen and responds to voice commands  
- **Real Desktop Automation** - Actually controls Windows (not just a demo!)
- **Virtual Gesture Keyboard** - Type in mid-air with 2-hand support

**Perfect for:** Accessibility, hands-free computing, futuristic workflows, multitasking while cooking/eating, presentations

---

## ✨ Key Features

### 🖐️ **Gesture Controls**
- **Move Cursor**: Point with index finger (tracks knuckle for stability!)
- **Left Click**: Pinch index finger + thumb (👌)
- **Right Click**: Pinch middle finger + thumb
- **Virtual Keyboard**: Open with Ctrl+K, type with pinch gestures
- **2-Hand Typing**: Use both hands simultaneously for fast typing!

### 🤖 **AI Vision Assistant**
- **Screen Awareness**: Gemini AI sees what's on your screen
- **Voice Commands**: "Open Chrome", "Click the red button", "Type hello world"
- **Agentic Mode**: AI can control mouse, keyboard, launch apps
- **Real-time Communication**: Gemini Live API with audio streaming

### ⚡ **Performance**
- **C++ Controller**: High-speed Windows SendInput API
- **Instant Response**: No smoothing on gesture clicks
- **State Recovery**: Auto-resets if stuck (2-second timeout)
- **Debouncing**: 250ms keyboard, 300ms mouse prevents false triggers

---

## 🚀 Quick Start

### Prerequisites
- Windows 10/11
- Node.js 18+
- g++ compiler (MinGW or VS)
- Webcam
- [Gemini API Key](https://aistudio.google.com/apikey) (FREE!)

### Installation

```bash
# 1. Clone & install
git clone https://github.com/yourusername/opsghost.git
cd opsghost
npm install

# 2. Set up API key
# Copy .env.example to .env.local and add your key
cp .env.example .env.local
# Edit .env.local with your Gemini API key

# 3. Compile C++ controller (one-time)
./compile-controller.bat

# 4. Start bridge (Terminal 1)
node bridge.cjs

# 5. Start app (Terminal 2)
npm run electron
```

**Done!** 🎉 Wave at your webcam and control your computer!

---

## 🎮 Usage

1. **Position cursor**: Point with index finger
2. **Click**: Pinch gesture (index+thumb)
3. **Open keyboard**: Ctrl+K
4. **AI control**: Click "🤖 ENABLE AI CONTROL"
5. **Voice commands**: "Open Chrome", "Type hello", etc.

---

## 🛠️ Tech Stack

- **Hand Tracking**: MediaPipe Hand Landmarker (GPU)
- **AI**: Google Gemini 2.0 Live API
- **Control**: C++ Windows SendInput API
- **UI**: Electron + React + TypeScript
- **Backend**: Node.js + Express

---

## 🏆 Innovation Highlights

1. **Stable Clicks**: Tracks finger knuckle (not tip) → zero cursor drift!
2. **2-Hand Typing**: Independent state machines for each hand
3. **C++ Performance**: 10-50x faster than scripting
4. **Auto Recovery**: Never freezes - resets after 2s timeout
5. **AI Vision**: Multimodal AI sees and controls your screen

---

## 📹 Demo

[Video Demo](#) | [Screenshots](#)

---

## 🤝 Contributing

Built for **Frostbyte Hackathon 2026**. Contributions welcome!

---

## 📜 License

MIT License

---

## 🙏 Acknowledgments

- MediaPipe Team
- Google Gemini
- Frostbyte Hackathon
- Open Source Community

---

<div align="center">

**Made with 🤖 for Frostbyte Hackathon 2026**

⭐ Star if you like it! | 🐛 Report issues | 🤝 Contribute

</div>
