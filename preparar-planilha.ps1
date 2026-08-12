# Cria as abas que faltam na planilha (INTERACOES e ENVIOS).
#
# O segredo NAO aparece em lugar nenhum: e lido do .env.local aqui dentro,
# usado na chamada e descartado. Nao vai para a tela nem para o log.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path '.env.local')) {
  Write-Host 'ERRO: nao achei o .env.local nesta pasta.' -ForegroundColor Red
  exit 1
}

$mapa = @{}
foreach ($linha in Get-Content '.env.local' -Encoding UTF8) {
  $l = $linha.Trim()
  if ($l -eq '' -or $l.StartsWith('#')) { continue }
  $i = $l.IndexOf('=')
  if ($i -le 0) { continue }
  $chave = $l.Substring(0, $i).Trim()
  $valor = $l.Substring($i + 1).Trim()
  if ($valor.Length -ge 2) {
    $a = $valor[0]
    if (($a -eq '"' -or $a -eq "'") -and $valor[$valor.Length - 1] -eq $a) {
      $valor = $valor.Substring(1, $valor.Length - 2)
    }
  }
  $mapa[$chave] = $valor
}

$url = $mapa['RARO_SHEETS_WEBAPP_URL']
$seg = $mapa['RARO_SHEETS_SEGREDO']

if ([string]::IsNullOrWhiteSpace($url) -or [string]::IsNullOrWhiteSpace($seg)) {
  Write-Host 'ERRO: RARO_SHEETS_WEBAPP_URL ou RARO_SHEETS_SEGREDO estao vazios no .env.local.' -ForegroundColor Red
  exit 1
}

$corpo = (@{ segredo = $seg; acao = 'criarAbas' } | ConvertTo-Json -Compress)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($corpo)

try {
  $r = Invoke-WebRequest -Uri $url -Method POST `
        -ContentType 'text/plain; charset=utf-8' `
        -Body $bytes -MaximumRedirection 5 -UseBasicParsing
  Write-Host ''
  Write-Host 'Resposta da planilha:' -ForegroundColor Cyan
  Write-Host $r.Content -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host ('FALHOU: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
