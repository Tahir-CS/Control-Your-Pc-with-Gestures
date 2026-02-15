// bridge.js - Run this on your computer with Node.js
const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const app = express();

app.use(cors());
app.use(express.json());

console.log("🔌 OpsGhost Bridge Running on Port 8999...");

// Spawn the C++ controller process
let controllerProcess = null;
try {
    controllerProcess = spawn('.\\controller.exe', [], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log("✅ Controller process started");
    
    controllerProcess.on('error', (err) => {
        console.error("❌ Controller Error:", err);
    });
    
    controllerProcess.on('exit', (code) => {
        console.log(`Controller exited with code ${code}`);
    });
} catch (e) {
    console.error("❌ Failed to start controller:", e);
}

app.get('/status', (req, res) => res.json({ status: 'online' }));

app.post('/command', (req, res) => {
    const { action, payload, x, y, button } = req.body;
    console.log(`⚡ Received: ${action}`, payload || `x:${x} y:${y}`);

    try {
        if (action === 'open') {
            // Windows: 'start', Mac: 'open', Linux: 'xdg-open'
            const cmd = process.platform === 'win32' ? `start ${payload}` : `open -a "${payload}"`;
            exec(cmd);
        } 
        else if (action === 'url') {
            const cmd = process.platform === 'win32' ? `start ${payload}` : `open "${payload}"`;
            exec(cmd);
        }
        else if (action === 'move' && controllerProcess) {
            // Send mouse move command to controller
            controllerProcess.stdin.write(`move:${x}:${y}\n`);
        }
        else if (action === 'click' && controllerProcess) {
            // Send click command to controller
            const clickType = button || 'left';
            controllerProcess.stdin.write(`click:${clickType}\n`);
        }
        else if (action === 'key' && controllerProcess) {
            // Send keyboard command to controller
            controllerProcess.stdin.write(`key:${payload}\n`);
        }
        res.json({ success: true, message: `Executed ${action}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(8999);

// Cleanup on exit
process.on('SIGINT', () => {
    if (controllerProcess) {
        controllerProcess.stdin.write('exit\\n');
        controllerProcess.kill();
    }
    process.exit();
});