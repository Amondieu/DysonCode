@echo off
chcp 65001 >nul
title KORE API — Infisical

:: ── Check if logged in ──
infisical whoami >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [KORE] Not logged in to Infisical.
    echo [KORE] Run: infisical login
    echo [KORE] Then: infisical init
    pause
    exit /b 1
)

:: ── Run with Infisical secrets ──
echo [KORE] Starting with Infisical secrets...
infisical run -- uvicorn main:app --host 0.0.0.0 --port 8000 --reload

:: ── If failed ──
echo [KORE] Server exited with code %ERRORLEVEL%
pause
