@echo off
rem Roda a Raro.ia localmente. Duplo-clique e pronto.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias ^(primeira vez, ~1 min^)...
  call npm install
)
echo.
echo Abrindo http://localhost:3000 ...
start "" http://localhost:3000
call npm run dev
pause
