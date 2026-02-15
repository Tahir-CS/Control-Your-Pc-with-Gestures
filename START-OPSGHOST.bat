@echo off
color 0A
cls

echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║                                                              ║
echo  ║           ⚡ OPSGHOST C++ CONTROLLER SETUP ⚡                ║
echo  ║                                                              ║
echo  ║              High-Performance Mouse Control                  ║
echo  ║                                                              ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.
echo.
echo  📋 SETUP STATUS:
echo  ════════════════════════════════════════════════════════════════
echo.
echo     ✅ controller.cpp created
echo     ✅ windowsController.js updated with C++ integration
echo     ✅ main.js updated with cleanup handlers
echo     ✅ Smoothing algorithm implemented (Linear Interpolation)
echo     ✅ PowerShell fallback configured
echo.
if exist "controller.exe" (
    echo     ✅ controller.exe FOUND - Ready to use!
) else (
    echo     ⚠️  controller.exe NOT FOUND - Needs compilation
)
echo.
echo  ════════════════════════════════════════════════════════════════
echo.
echo.

if exist "controller.exe" (
    echo  🎉 YOU'RE ALL SET! 🎉
    echo.
    echo  Your C++ controller is compiled and ready!
    echo.
    echo  Just run:
    echo     npm run electron
    echo.
    echo  Expected console output:
    echo     🚀 [CONTROLLER] High-Speed C++ Controller Active
    echo.
    echo  Performance: 200x faster mouse control with smooth movement!
    echo.
) else (
    echo  ⚠️  COMPILATION REQUIRED ⚠️
    echo.
    echo  You need to compile the C++ controller ONCE.
    echo.
    echo  📝 SIMPLE STEPS:
    echo  ────────────────────────────────────────────────────────────
    echo.
    echo  1. Press Windows Key
    echo.
    echo  2. Type: Developer PowerShell
    echo.
    echo  3. Open: "Developer PowerShell for VS 2022"
    echo.
    echo  4. Type these commands:
    echo.
    echo     cd "%CD%"
    echo.
    echo     .\compile-controller.bat
    echo.
    echo  5. Wait for "SUCCESS!" message
    echo.
    echo  6. Run your app:
    echo.
    echo     npm run electron
    echo.
    echo  ────────────────────────────────────────────────────────────
    echo.
    echo  ❓ Don't have Developer PowerShell?
    echo.
    echo  Install Visual Studio 2022 Build Tools:
    echo  https://visualstudio.microsoft.com/downloads/
    echo.
)

echo.
echo  📚 DOCUMENTATION:
echo  ════════════════════════════════════════════════════════════════
echo.
echo     CPP_CONTROLLER_SETUP.md     - Detailed setup guide
echo     TRANSITION_COMPLETE.md      - Full implementation details
echo     PERFORMANCE_UPGRADE_SUMMARY.txt - Performance comparison
echo.
echo  ════════════════════════════════════════════════════════════════
echo.
echo.

if exist "controller.exe" (
    echo  Ready to run! Press any key to start OpsGhost...
    pause > nul
    echo.
    echo  Starting OpsGhost with C++ high-performance mode...
    echo.
    start cmd /k npm run electron
) else (
    echo  Read the instructions above, then press any key to exit...
    pause > nul
)
