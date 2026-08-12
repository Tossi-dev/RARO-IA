@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===============================================
echo   Raro.ia - finalizar a correcao do WhatsApp
echo ===============================================
echo.
echo [1/3] Criando as abas INTERACOES e ENVIOS na planilha...
call powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-planilha.ps1"
echo.
echo [2/3] Testes do agente de WhatsApp...
echo.
pushd agente-whatsapp
call npx vitest run
popd
echo.
echo [3/3] Publicando o sistema na Vercel...
echo.
call npx vercel deploy --prod --scope guilhermes-projects-7de72796
echo.
echo ===============================================
echo   Terminou. Me manda o que apareceu acima.
echo ===============================================
pause
