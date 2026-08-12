# diagnostico-conexao.ps1 - Raro.ia
#
# POR QUE ESTE ARQUIVO EXISTE
# ---------------------------
# O ping recusa com "nao autorizado" mesmo com o segredo conferido dos dois
# lados, caractere por caractere nas pontas. Entao ou o valor tem sobra
# invisivel (espaco, quebra de linha) numa das pontas, ou o corpo do POST nao
# esta chegando no Apps Script - e nesse caso o segredo nunca foi o problema.
#
# O codigo do raro-sync.gs separa os dois casos sozinho:
#
#   JSON.parse((e && e.postData && e.postData.contents) || '{}')
#     -> corpo quebrado  = cai no catch   = responde "corpo invalido"
#     -> corpo ausente   = vira {}        = responde "nao autorizado"
#
# Entao mandar um corpo propositalmente quebrado e um teste limpo:
#   respondeu "corpo invalido" -> o corpo CHEGA, o problema e o valor
#   respondeu "nao autorizado" -> o corpo NAO CHEGA, o problema e o transporte
#
# Depois disso o script testa o segredo em varias formas (com espaco no fim,
# com quebra de linha, etc). Se alguma passar, sabemos exatamente que sujeira
# esta gravada na propriedade RARO_SEGREDO.
#
# Nao escreve nada em lugar nenhum. So pergunta.
#
# Rode assim:
#   powershell -ExecutionPolicy Bypass -File "C:\dev\Repositorios\RARO IA\scripts\planilha\diagnostico-conexao.ps1"

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WEBAPP = 'https://script.google.com/macros/s/AKfycbyjX3N6ZkMQ_QEs0AGnG6OCIdHGUkp1CprRvVQg8Dj0euVIXg17OyXJ_72J3qmd6ADCRg/exec'

# TLS 1.2: o Windows PowerShell 5.1 ainda sai com TLS 1.0 em algumas maquinas,
# e o Google recusa. Erro de handshake pareceria erro de autorizacao.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Titulo($t) {
  Write-Host ''
  Write-Host ('=' * 68) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('=' * 68) -ForegroundColor DarkGray
}

# Corpo vai como bytes UTF-8 de proposito: o PS 5.1 manda string como ASCII
# quando o ContentType nao declara charset, e isso ja estragou segredo alheio.
function Postar($texto) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($texto)
  try {
    $r = Invoke-RestMethod -Uri $WEBAPP -Method Post -Body $bytes `
      -ContentType 'application/json; charset=utf-8'
    return @{ ok = $true; resposta = $r }
  } catch {
    return @{ ok = $false; erro = $_.Exception.Message }
  }
}

function Descrever($r) {
  if (-not $r.ok) { return 'FALHOU antes de responder: ' + $r.erro }
  $x = $r.resposta
  if ($null -eq $x) { return '(resposta vazia)' }
  if ($x -is [string]) { return 'texto: ' + $x.Substring(0, [Math]::Min(120, $x.Length)) }
  if ($null -ne $x.erro) { return 'erro: ' + $x.erro }
  if ($x.ok -eq $true) { return 'OK  (versao ' + $x.versao + ')' }
  return ($x | ConvertTo-Json -Compress)
}

# --------------------------------------------------------------- o segredo
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

Titulo 'Raro.ia - diagnostico da conexao'
Write-Host ''
Write-Host ("Segredo do .env.local: " + $segredo.Length + " caracteres") -ForegroundColor Green

# ------------------------------------------------- 1. GET: o app esta vivo?
Titulo '1. O Web App responde? (GET)'
try {
  $get = Invoke-RestMethod -Uri $WEBAPP -Method Get
  Write-Host ''
  Write-Host ('   ' + ($get | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host ('   FALHOU: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host '   Sem GET nao adianta seguir: a implantacao nao esta publica.' -ForegroundColor Red
  exit 1
}

# ------------------------------------ 2. o corpo do POST chega do outro lado?
Titulo '2. O corpo do POST chega la? (mando um JSON quebrado de proposito)'

$sonda = Postar 'isto-nao-e-json'
$textoSonda = Descrever $sonda
Write-Host ''
Write-Host ('   resposta: ' + $textoSonda)

$corpoChega = $textoSonda -match 'corpo invalido'

Write-Host ''
if ($corpoChega) {
  Write-Host '   VEREDITO: o corpo CHEGA. O transporte esta bom.' -ForegroundColor Green
  Write-Host '   Entao a diferenca esta mesmo no valor gravado em RARO_SEGREDO.' -ForegroundColor Green
} else {
  Write-Host '   VEREDITO: o corpo NAO CHEGA no Apps Script.' -ForegroundColor Yellow
  Write-Host '   O segredo nunca foi o problema. E o transporte do POST.' -ForegroundColor Yellow
}

# --------------------------------------------- 3. variacoes do mesmo segredo
Titulo '3. Testando o segredo em varias formas'

$variantes = @(
  @{ nome = 'exato (48)'; valor = $segredo },
  @{ nome = 'com espaco no fim'; valor = ($segredo + ' ') },
  @{ nome = 'com espaco no comeco'; valor = (' ' + $segredo) },
  @{ nome = 'com quebra de linha no fim'; valor = ($segredo + "`n") },
  @{ nome = 'com CR LF no fim'; valor = ($segredo + "`r`n") },
  @{ nome = 'com CR no fim'; valor = ($segredo + "`r") },
  @{ nome = 'com TAB no fim'; valor = ($segredo + "`t") },
  @{ nome = 'com espaco nos dois lados'; valor = (' ' + $segredo + ' ') }
)

$venceu = $null
foreach ($v in $variantes) {
  $json = @{ segredo = $v.valor; acao = 'ping' } | ConvertTo-Json -Compress
  $r = Postar $json
  $d = Descrever $r
  $passou = ($d -like 'OK*')
  $cor = if ($passou) { 'Green' } else { 'DarkGray' }
  Write-Host ('   ' + $v.nome.PadRight(28) + ' -> ' + $d) -ForegroundColor $cor
  if ($passou -and -not $venceu) { $venceu = $v.nome }
  Start-Sleep -Milliseconds 300
}

# ------------------------------------------------------------- 4. o veredito
Titulo '4. Conclusao'
Write-Host ''

if ($venceu) {
  Write-Host ("PASSOU na forma: " + $venceu) -ForegroundColor Green
  Write-Host ''
  if ($venceu -eq 'exato (48)') {
    Write-Host 'O segredo esta certo. Rode agora o conectar-planilha.ps1.' -ForegroundColor Green
  } else {
    Write-Host 'Ou seja: o valor gravado em RARO_SEGREDO tem sobra invisivel.' -ForegroundColor Yellow
    Write-Host 'Da para deixar assim e funcionar, mas o certo e limpar a sobra' -ForegroundColor Yellow
    Write-Host 'na propriedade do Apps Script. Me mande esta tela.' -ForegroundColor Yellow
  }
} elseif ($corpoChega) {
  Write-Host 'O corpo chega, mas nenhuma forma do segredo foi aceita.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Isso quer dizer que o valor gravado em RARO_SEGREDO nao e este' -ForegroundColor Red
  Write-Host 'segredo - ou a implantacao publicada pertence a OUTRO projeto de' -ForegroundColor Red
  Write-Host 'script, e a propriedade que voce edita nao e a que o /exec le.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Nesse caso quem resolve e o dono da conta:' -ForegroundColor Yellow
  Write-Host '  Implantar > Gerenciar implantacoes > conferir se a URL bate.' -ForegroundColor Yellow
} else {
  Write-Host 'O corpo do POST nao chega no Apps Script.' -ForegroundColor Red
  Write-Host 'Nao adianta mexer mais no segredo. O ajuste e no transporte.' -ForegroundColor Red
  Write-Host 'Me mande esta tela que eu resolvo do meu lado.' -ForegroundColor Yellow
}
Write-Host ''

$segredo = $null
[System.GC]::Collect()
