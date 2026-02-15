@echo off
echo ========================================
echo   OpsGhost C++ Controller Compiler
echo ========================================
echo.
echo This script will compile the high-performance C++ controller.
echo.
echo Make sure you run this from:
echo "Developer PowerShell for VS 2022" or "Developer Command Prompt"
echo.
echo Press any key to start compilation...
pause > nul

echo.
echo Compiling controller.cpp...
echo.

cl /O2 /EHsc controller.cpp /link user32.lib

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   ✅ SUCCESS!
    echo ========================================
    echo.
    echo controller.exe has been created successfully!
    echo You can now run your OpsGhost app with: npm run electron
    echo.
) else (
    echo.
    echo ========================================
    echo   ❌ COMPILATION FAILED
    echo ========================================
    echo.
    echo Please make sure you are running this from:
    echo - Developer PowerShell for VS 2022
    echo - OR Developer Command Prompt for VS 2022
    echo.
    echo You can find it by pressing Windows Key and typing:
    echo "Developer PowerShell"
    echo.
)

echo Press any key to exit...
pause > nul
