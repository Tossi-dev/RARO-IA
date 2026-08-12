# testar-conexao.ps1 - Raro.ia
#
# A implantacao publicada pelo proprio Tossi, em projeto proprio, com
# RARO_SEGREDO e RARO_PLANILHA_ID gravados por ele. Este script:
#
#   1. confere pelo GET se quem atende e mesmo a implantacao NOVA (versao
#      2.2.0 - a 2.1.0 era a do projeto antigo, que nunca aceitou o segredo)
#   2. faz o ping com o segredo do .env.local
#   3. se o ping passar, manda criarAbas
#   4. grava RARO_SHEETS_WEBAPP_URL no .env.local
#
# Nunca imprime o segredo.
#
# Rode assim:
#   powershell -ExecutionPolicy Bypass -File "C:\dev\Repositorios\RARO IA\scripts\planilha\testar-conexao.ps1"

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WEBAPP = 'https://script.google.com/macros/s/AKfycbyUDmZva8_h_72OWEHcY4N3GzNML78TH0w2m7CqIKOnO6jSIjvNW7jducFiwIhoRmyv/exec'

# O PowerShell 5.1 ainda sai com TLS 1.0 em algumas maquinas e o Google recusa.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Titulo($t) {
  Write-Host ''
  Write-Host ('=' * 66) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('=' * 66) -ForegroundColor DarkGray
}

# Corpo vai como bytes UTF-8: com string crua o PS 5.1 manda ASCII e estraga
# qualquer caractere fora da tabela basica.
function Postar($objeto) {
  $json = $objeto | ConvertTo-Json -Compress -Depth 10
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri $WEBAPP -Method Post -Body $bytes `
    -ContentType 'application/json; charset=utf-8'
}

# ------------------------------------------------------------- o segredo
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $raiz '.env.local'

# Laco explicito: com uma linha so, o pipeline devolve string e [0] pegaria
# o primeiro CARACTERE.
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

Titulo 'Raro.ia - testando a implantacao nova'
Write-Host ''
Write-Host ("Segredo do .env.local: " + $segredo.Length + " caracteres") -ForegroundColor DarkGray

# ------------------------------------------ 1. e a implantacao nova mesmo?
Titulo '1. Quem esta atendendo nesta URL?'
try {
  $vida = Invoke-RestMethod -Uri $WEBAPP -Method Get
} catch {
  Write-Host ''
  Write-Host ('FALHOU: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'A implantacao nao esta publica. Confira "Quem pode acessar: Qualquer pessoa".' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host ('   ' + ($vida | ConvertTo-Json -Compress)) -ForegroundColor Green

# Compara por NUMERO, nao por texto: "e igual a 2.2.1" dava alarme falso a cada
# correcao de bug, e "2.2.*" voltaria a dar quando subisse para 2.3. O que
# importa e uma coisa so: a implantacao que atende ser igual ou mais nova que a
# 2.2, que foi quando o acesso a planilha deixou de depender do dono dela.
$MINIMA = [version]'2.2'
$versaoOk = $false
try { $versaoOk = ([version]$vida.versao) -ge $MINIMA } catch { $versaoOk = $false }

if ($versaoOk) {
  Write-Host ''
  Write-Host ('   Versao ' + $vida.versao + ': implantacao correta.') -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host ('   ATENCAO: veio versao ' + $vida.versao + ', anterior a 2.2.') -ForegroundColor Yellow
  Write-Host '   O codigo colado no projeto pode nao ter sido salvo, ou a' -ForegroundColor Yellow
  Write-Host '   implantacao foi feita antes de salvar. Me avise antes de seguir.' -ForegroundColor Yellow
}

# --------------------------------------------------------------- 2. ping
Titulo '2. Ping (agora com o segredo)'
try {
  $ping = Postar @{ segredo = $segredo; acao = 'ping' }
} catch {
  Write-Host ''
  Write-Host ('FALHOU: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}

if (-not $ping.ok) {
  Write-Host ''
  Write-Host ('O script respondeu, mas recusou: ' + $ping.erro) -ForegroundColor Red
  Write-Host ''
  if ($ping.erro -like '*autorizado*') {
    Write-Host 'O RARO_SEGREDO gravado neste projeto novo nao bate com o .env.local.' -ForegroundColor Yellow
    Write-Host 'Rode copiar-segredo.ps1 e cole de novo na propriedade.' -ForegroundColor Yellow
  } else {
    Write-Host 'Me mande esta tela.' -ForegroundColor Yellow
  }
  exit 1
}

Write-Host ''
Write-Host ('   Planilha: ' + $ping.planilha) -ForegroundColor Green
Write-Host ('   Fuso:     ' + $ping.fuso) -ForegroundColor DarkGray
Write-Host ('   Abas:     ' + $ping.abas.Count) -ForegroundColor DarkGray
Write-Host ''
foreach ($a in $ping.abas) {
  $marca = if ($a.derivada) { '  (calculada, nao mexemos)' } else { '' }
  Write-Host ('     - ' + $a.nome.PadRight(24) + $a.linhas.ToString().PadLeft(6) + ' linhas' + $marca) -ForegroundColor DarkGray
}

# ---------------------------------------------------------- 3. criarAbas
Titulo '3. Criando as abas que faltam'
try {
  $criar = Postar @{ segredo = $segredo; acao = 'criarAbas' }
} catch {
  Write-Host ''
  Write-Host ('FALHOU: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}

if (-not $criar.ok) {
  Write-Host ''
  Write-Host ('Recusou: ' + $criar.erro) -ForegroundColor Red
  exit 1
}

Write-Host ''
if ($criar.criadas -and $criar.criadas.Count -gt 0) {
  Write-Host ('   Criadas agora (' + $criar.criadas.Count + '):') -ForegroundColor Green
  foreach ($n in $criar.criadas) { Write-Host ('     + ' + $n) -ForegroundColor Green }
} else {
  Write-Host '   Nenhuma aba nova precisou ser criada.' -ForegroundColor DarkGray
}
if ($criar.jaExistiam -and $criar.jaExistiam.Count -gt 0) {
  Write-Host ''
  Write-Host ('   Ja existiam (' + $criar.jaExistiam.Count + '), intocadas.') -ForegroundColor DarkGray
}

# ------------------------------------------ 4. gravar a URL no .env.local
Titulo '4. Guardando a URL no .env.local'

$linhas = New-Object System.Collections.Generic.List[string]
$achou = $false
foreach ($linha in Get-Content $envPath) {
  if ($linha -like 'RARO_SHEETS_WEBAPP_URL=*') {
    $linhas.Add('RARO_SHEETS_WEBAPP_URL=' + $WEBAPP)
    $achou = $true
  } else {
    $linhas.Add($linha)
  }
}
if (-not $achou) {
  $linhas.Add('')
  $linhas.Add('# URL do Web App do Apps Script (implantacao propria, projeto avulso).')
  $linhas.Add('RARO_SHEETS_WEBAPP_URL=' + $WEBAPP)
}

# UTF-8 sem BOM: o Next.js le o .env.local cru, e o BOM entra no nome da
# primeira variavel e a torna invisivel.
$semBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envPath, $linhas, $semBom)

Write-Host ''
Write-Host '   RARO_SHEETS_WEBAPP_URL gravada.' -ForegroundColor Green

# --------------------------------------------------------------- fecho
Titulo 'Conectado'
Write-Host ''
Write-Host 'Abas de entrada prontas. Se o fuso acima nao for America/Sao_Paulo,' -ForegroundColor Yellow
Write-Host 'conserte antes de lancar qualquer linha: na planilha, Arquivo >' -ForegroundColor Yellow
Write-Host 'Configuracoes > Geral > Fuso horario. Fuso errado desloca a data de' -ForegroundColor Yellow
Write-Host 'tudo que for gravado depois das 21h.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'As variaveis da Vercel entram pelo configurar-vercel.ps1.' -ForegroundColor DarkGray
Write-Host ''

$segredo = $null
[System.GC]::Collect()
