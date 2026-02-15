#include <iostream>
#include <string>
#include <vector>
#include <windows.h>

// Helper to split string by delimiter
std::vector<std::string> split(const std::string& s, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    size_t start = 0, end = 0;
    while ((end = s.find(delimiter, start)) != std::string::npos) {
        token = s.substr(start, end - start);
        tokens.push_back(token);
        start = end + 1;
    }
    tokens.push_back(s.substr(start));
    return tokens;
}

void Move(int x, int y) {
    double screen_w = GetSystemMetrics(SM_CXSCREEN);
    double screen_h = GetSystemMetrics(SM_CYSCREEN);
    INPUT input = { 0 };
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
    // Normalize coordinates to 65535 (Windows requirement)
    input.mi.dx = (LONG)(x * (65535.0 / screen_w));
    input.mi.dy = (LONG)(y * (65535.0 / screen_h));
    SendInput(1, &input, sizeof(INPUT));
}

void Click(const std::string& type) {
    INPUT inputs[2] = { 0 };
    if (type == "left") {
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    } else if (type == "right") {
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dwFlags = MOUSEEVENTF_RIGHTDOWN;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dwFlags = MOUSEEVENTF_RIGHTUP;
    }
    SendInput(2, inputs, sizeof(INPUT));
}

void TypeKey(const std::string& key) {
    INPUT inputs[2] = { 0 };
    inputs[0].type = INPUT_KEYBOARD;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;

    // Map string keys to virtual key codes
    if (key.length() == 1) {
        char c = key[0];
        if (c >= 'A' && c <= 'Z') {
            inputs[0].ki.wVk = c;
            inputs[1].ki.wVk = c;
        } else if (c >= '0' && c <= '9') {
            inputs[0].ki.wVk = c;
            inputs[1].ki.wVk = c;
        } else if (c == ' ') {
            inputs[0].ki.wVk = VK_SPACE;
            inputs[1].ki.wVk = VK_SPACE;
        } else if (c == ',') {
            inputs[0].ki.wVk = VK_OEM_COMMA;
            inputs[1].ki.wVk = VK_OEM_COMMA;
        } else if (c == '.') {
            inputs[0].ki.wVk = VK_OEM_PERIOD;
            inputs[1].ki.wVk = VK_OEM_PERIOD;
        } else {
            return; // Unknown key
        }
    } else if (key == "SPACE") {
        inputs[0].ki.wVk = VK_SPACE;
        inputs[1].ki.wVk = VK_SPACE;
    } else if (key == "ENTER") {
        inputs[0].ki.wVk = VK_RETURN;
        inputs[1].ki.wVk = VK_RETURN;
    } else if (key == "BACK") {
        inputs[0].ki.wVk = VK_BACK;
        inputs[1].ki.wVk = VK_BACK;
    } else {
        return; // Unknown key
    }

    SendInput(2, inputs, sizeof(INPUT));
}

int main() {
    // Optimizes I/O operations for speed
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "exit") break;

        // Protocol: "move:100:200" or "click:left"
        std::vector<std::string> parts = split(line, ':');
        if (parts.empty()) continue;

        if (parts[0] == "move" && parts.size() >= 3) {
            Move(std::stoi(parts[1]), std::stoi(parts[2]));
        } else if (parts[0] == "click") {
            std::string btn = (parts.size() >= 2) ? parts[1] : "left";
            Click(btn);
        } else if (parts[0] == "key" && parts.size() >= 2) {
            TypeKey(parts[1]);
        }
    }
    return 0;
}
