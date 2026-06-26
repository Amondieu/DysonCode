@echo off
cd /d C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode
echo Force killing any DysonCode processes...
taskkill /F /IM DysonCode.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo Renaming broken asar...
rename release\win-unpacked\resources\app.asar app.asar.bak
if exist release\win-unpacked\resources\app.asar echo FAILED - asar still exists && exit /b 1
echo asar renamed OK
echo Creating app directory...
mkdir release\win-unpacked\resources\app 2>nul
xcopy /E /Y /I dist release\win-unpacked\resources\app\dist
copy /Y package.json release\win-unpacked\resources\app\package.json
echo Creating node_modules symlink...
rmdir release\win-unpacked\resources\app\node_modules 2>nul
mklink /J release\win-unpacked\resources\app\node_modules C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\node_modules
echo === DONE - ready to launch ===
