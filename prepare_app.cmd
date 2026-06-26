@echo off
cd /d C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode
echo Creating app directory structure...
if exist app rmdir /s /q app
mkdir app
xcopy /e /i /q dist\main app\dist\main\
xcopy /e /i /q dist\renderer app\dist\renderer\
xcopy /e /i /q assets app\assets\
copy /y package.json app\package.json
copy /y tsconfig.json app\tsconfig.json
echo Done
