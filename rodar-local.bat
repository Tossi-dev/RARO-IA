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
rem Não derruba outro projeto: escolhe a primeira porta livre conhecida.
set "PORTA="
for %%P in (3000 3001 3002 3003 3004 3005) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
  if errorlevel 1 (
    set "PORTA=%%P"
    goto :porta_encontrada
  )
)

echo.
echo Nenhuma porta livre entre 3000 e 3005. Feche um servidor local ou rode novamente.
pause
exit /b 1

:porta_encontrada
echo.
echo Abrindo http://localhost:%PORTA% ...
start "" http://localhost:%PORTA%
call npm run dev -- -p %PORTA%
pause
