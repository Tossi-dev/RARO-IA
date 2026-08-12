@echo off
chcp 65001 >nul
cd /d "%~dp0"
call powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0conectar-integracoes.ps1"
pause
