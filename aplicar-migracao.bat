@echo off
REM Atalho de duplo clique para a simulacao da migracao.
REM -ExecutionPolicy Bypass vale so para ESTE processo: nao altera nenhuma
REM configuracao da maquina, e some quando a janela fecha.
cd /d "C:\dev\Repositorios\RARO IA"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\dev\Repositorios\RARO IA\aplicar-migracao.ps1"
echo.
echo ================================================================
echo  Terminou. A saida completa esta em aplicacao-saida.txt
echo ================================================================
pause
