@echo off
rem Publica a Raro.ia na Vercel (producao), no scope do Guilherme.
rem Requer login previo: npx vercel login (uma vez so; fica cacheado no Windows).
cd /d "%~dp0"
echo === Deploy Raro.ia na Vercel ===
call npx vercel deploy --prod --scope guilhermes-projects-7de72796
echo.
echo Se aparecer erro de login, rode: npx vercel login
pause
