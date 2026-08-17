@echo off
REM ============================================================
REM  Roda a bateria inteira do RARO.ia e guarda a saida em
REM  saida-testes.txt, na raiz do repo.
REM
REM  Existe porque o Claude roda os testes no Linux, e o
REM  node_modules desta pasta foi instalado para Windows: as duas
REM  coisas nao se misturam. Duplo clique aqui e a confirmacao na
REM  sua propria maquina ? e o arquivo de saida pode ser mandado
REM  de volta pra ele.
REM
REM  Sao tres etapas, na ordem em que uma depende da outra:
REM    1. tipagem   (tsc --noEmit)  ? nada compila torto
REM    2. testes    (npm test)      ? o comportamento
REM    3. build     (npm run build) ? o que a Vercel vai rodar
REM ============================================================
setlocal
cd /d "%~dp0"

REM travas de git que a ponte com o Claude deixa para tras
del /q ".git\index.lock" ".git\HEAD.lock" 2>nul
del /q ".git\objects\tmp_obj_*" 2>nul

where node >nul 2>nul || (echo Node nao encontrado. Instale o Node 20+ e rode de novo. & pause & exit /b 1)
if not exist "node_modules" (echo Faltam as dependencias. Rodando npm install... & call npm install)

set SAIDA=%~dp0saida-testes.txt
echo ============================================================> "%SAIDA%"
echo  RARO.ia - bateria completa                                >> "%SAIDA%"
echo  %DATE% %TIME%                                             >> "%SAIDA%"
echo ============================================================>> "%SAIDA%"

echo.
echo [1/3] Tipagem...
echo.>> "%SAIDA%"
echo ---------- 1. TIPAGEM (tsc --noEmit) ---------->> "%SAIDA%"
call npx tsc --noEmit >> "%SAIDA%" 2>&1
if errorlevel 1 (set FALHOU=tipagem& echo    FALHOU) else (echo    ok)

echo.
echo [2/3] Testes... (leva ~30s)
echo.>> "%SAIDA%"
echo ---------- 2. TESTES (npm test) ---------->> "%SAIDA%"
call npm test >> "%SAIDA%" 2>&1
if errorlevel 1 (set FALHOU=testes& echo    FALHOU) else (echo    ok)

echo.
echo [3/3] Build de producao... (leva ~1min)
echo.>> "%SAIDA%"
echo ---------- 3. BUILD (npm run build) ---------->> "%SAIDA%"
call npm run build >> "%SAIDA%" 2>&1
if errorlevel 1 (set FALHOU=build& echo    FALHOU) else (echo    ok)

echo.
echo ============================================================
if defined FALHOU (
  echo  VERMELHO na etapa: %FALHOU%
  echo  A saida inteira esta em saida-testes.txt ? manda esse
  echo  arquivo pro Claude que ele le o erro.
) else (
  echo  TUDO VERDE. Pode seguir para o docs\VIRADA-DE-CHAVE.md
  echo  do repo jefson-conteudo, passo 1.
)
echo ============================================================
echo.
echo Saida completa: %SAIDA%
pause
