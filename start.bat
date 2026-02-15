@echo off
echo.
echo ========================================
echo    👻 OpsGhost - Starting...
echo ========================================
echo.
echo Checking environment...

if not exist ".env" (
    echo ⚠️  Warning: .env file not found!
    echo.
    echo Please create a .env file with:
    echo GEMINI_API_KEY=your_api_key_here
    echo.
    pause
    exit /b 1
)

echo ✅ Environment OK
echo.
echo Starting Electron application...
echo.
echo 📌 Controls:
echo    • Point finger = Move cursor
echo    • Pinch fingers = Click
echo    • Open palm = Emergency Stop
echo.
echo ⚠️  Agentic mode must be explicitly enabled!
echo.

npm run electron
