@echo off
chcp 65001 >nul
echo Starting DysonCode rebuild...
cd /d "%~dp0"
call release\win-unpacked\rebuild.bat
