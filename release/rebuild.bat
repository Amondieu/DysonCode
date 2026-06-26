@echo off
setlocal

set ROOT=C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode
set DEST=%ROOT%\release\win-unpacked\resources\app

echo.
echo [1/4] Killing DysonCode if running...
taskkill /F /IM DysonCode.exe 2>nul
timeout /t 1 /nobreak >nul

echo [2/4] Building (tsc + vite)...
cd /d %ROOT%
call npm run build
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED — exit code %ERRORLEVEL%
    pause
    exit /b 1
)

echo [3/4] Deploying to release...
xcopy /E /I /Y "%ROOT%\dist\main"     "%DEST%\dist\main\"
xcopy /E /I /Y "%ROOT%\dist\renderer" "%DEST%\dist\renderer\"
copy  /Y        "%ROOT%\package.json"  "%DEST%\package.json"

echo [4/4] Verifying timestamps...
echo --- dist\renderer\assets (source):
dir "%ROOT%\dist\renderer\assets\" | findstr /i ".js .css"
echo --- release\...\renderer\assets (deployed):
dir "%DEST%\dist\renderer\assets\" | findstr /i ".js .css"

echo.
echo DONE — start DysonCode.exe manually
echo %DEST%\..\..\..\DysonCode.exe
pause
