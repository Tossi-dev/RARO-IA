# conferir-segredo.ps1 - Raro.ia
#
# Mostra as pontas do segredo que esta no .env.local, so para comparar de olho
# com o que esta gravado em RARO_SEGREDO no Apps Script. O miolo nao aparece.
#
# Rode assim:
#   cd "C:\dev\Repositorios\RARO IA"
#   powershell -ExecutionPolicy Bypass -File scripts\planilha\conferir-segredo.ps1

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $raiz '.env.local'

$segredo = $null
foreach ($linha in Get-Content $envPath) {
  if ($linha -like 'RARO_SHEETS_SEGREDO=*') {
    $segredo = $linha.Substring('RARO_SHEETS_SEGREDO='.Length).Trim().Trim('"').Trim("'")
    break
  }
}

if ([string]::IsNullOrWhiteSpace($segredo)) {
  Write-Host 'Nao achei RARO_SHEETS_SEGREDO no .env.local.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host ("Tamanho:     " + $segredo.Length + " caracteres") -ForegroundColor Green
Write-Host ("Comeca com:  " + $segredo.Substring(0, 8)) -ForegroundColor Cyan
Write-Host ("Termina com: " + $segredo.Substring($segredo.Length - 8)) -ForegroundColor Cyan
Write-Host ''
Write-Host 'Compare com a caixa Valor do RARO_SEGREDO no Apps Script.'
Write-Host 'Se as pontas baterem, o segredo esta certo e o problema e outro.'
Write-Host ''

$segredo = $null
[System.GC]::Collect()
