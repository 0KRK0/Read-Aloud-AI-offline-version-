@echo off
title ReadAloud AI
echo Starting ReadAloud AI...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
