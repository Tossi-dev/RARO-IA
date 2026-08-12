# copiar-codigo-gs.ps1 - Raro.ia
#
# Coloca o conteudo inteiro do raro-sync.gs na area de transferencia, pronto
# para substituir TODO o codigo do editor do Apps Script (Ctrl+A, Ctrl+V).
#
# Substituir tudo, em vez de colar no fim, evita o acidente da vez passada:
# nada e "acrescentado" ao arquivo, entao nao existe linha 974 sobrando.
#
# Rode assim:
#   powershell -ExecutionPolicy Bypass -File "C:\dev\Repositorios\RARO IA\scripts\planilha\copiar-codigo-gs.ps1"

$ErrorActionPreference = 'Stop'

$arquivo = Join-Path $PSScriptRoot 'raro-sync.gs'

if (-not (Test-Path $arquivo)) {
  Write-Host ''
  Write-Host "Nao achei o arquivo: $arquivo" -ForegroundColor Red
  exit 1
}

$codigo = Get-Content $arquivo -Raw -Encoding UTF8
Set-Clipboard -Value $codigo

$linhas = ($codigo -split "`n").Count

Write-Host ''
Write-Host ("Copiado: " + $linhas + " linhas do raro-sync.gs.") -ForegroundColor Green
Write-Host ''
Write-Host 'Agora, no editor do Apps Script:' -ForegroundColor Yellow
Write-Host '  1. Clique em cima do codigo'
Write-Host '  2. Ctrl+A   (seleciona tudo que esta la)'
Write-Host '  3. Ctrl+V   (troca tudo pelo novo)'
Write-Host '  4. Ctrl+S   (salvar)'
Write-Host ''
Write-Host 'A primeira linha tem que virar /** e a ultima }' -ForegroundColor DarkGray
Write-Host ''
