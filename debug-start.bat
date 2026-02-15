@echo off
echo.
echo ========================================
echo    👻 OpsGhost - Debugging Environment
echo ========================================
echo.

echo Checking for .env files...

if exist ".env" (
    echo ✅ .env found
) else (
    echo ❌ .env NOT found
)

if exist ".env.local" (
    echo ✅ .env.local found
    echo.
    echo Contents of .env.local:
    type .env.local
) else (
    echo ❌ .env.local NOT found
)

echo.
echo ========================================
echo    Starting OpsGhost...
echo ========================================
echo.

npm run electron
