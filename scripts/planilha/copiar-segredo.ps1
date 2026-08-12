# copiar-segredo.ps1 - Raro.ia
#
# Coloca o RARO_SHEETS_SEGREDO do .env.local na area de transferencia,
# pronto para colar na propriedade RARO_SEGREDO do Apps Script.
#
# Nao imprime o segredo. So diz quantos caracteres foram copiados.
#
# Rode assim:
#   cd "C:\dev\Repositorios\RARO IA"
#   powershell -ExecutionPolicy Bypass -File scripts\planilha\copiar-segredo.ps1

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $raiz '.env.local'

if (-not (Test-Path $envPath)) {
  Write-Host ''
  Write-Host "Nao achei o .env.local em: $envPath" -ForegroundColor Red
  exit 1
}

# Laco explicito, e nao indexacao de pipeline: quando so uma linha casa, o
# PowerShell devolve a string em vez de um vetor, e [0] pega o primeiro
# CARACTERE. Foi assim que a letra "R" acabou virando o segredo do Apps Script.
$segredo = $null
foreach ($linha in Get-Content $envPath) {
  if ($linha -like 'RARO_SHEETS_SEGREDO=*') {
    $segredo = $linha.Substring('RARO_SHEETS_SEGREDO='.Length).Trim().Trim('"').Trim("'")
    break
  }
}

if ([string]::IsNullOrWhiteSpace($segredo)) {
  Write-Host ''
  Write-Host 'Nao achei a linha RARO_SHEETS_SEGREDO= no .env.local.' -ForegroundColor Red
  exit 1
}

Set-Clipboard -Value $segredo

Write-Host ''
Write-Host ("Copiado: " + $segredo.Length + " caracteres.") -ForegroundColor Green
Write-Host ''

if ($segredo.Length -ne 48) {
  Write-Host 'ATENCAO: o esperado era 48. Me avise antes de colar.' -ForegroundColor Yellow
  Write-Host ''
  exit 0
}

Write-Host 'Agora, SEM copiar mais nada:' -ForegroundColor Yellow
Write-Host '  1. Apps Script > engrenagem "Configuracoes do projeto"'
Write-Host '  2. Quadro "Propriedades do script" > botao Editar'
Write-Host '  3. Caixa do Valor do RARO_SEGREDO > Ctrl+A > Ctrl+V'
Write-Host '  4. Salvar propriedades do script'
Write-Host ''
Write-Host 'Depois volte aqui e rode:' -ForegroundColor Yellow
Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\planilha\conectar-planilha.ps1'
Write-Host ''

$segredo = $null
[System.GC]::Collect()
