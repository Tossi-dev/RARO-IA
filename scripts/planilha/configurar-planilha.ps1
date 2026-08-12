# configurar-planilha.ps1 — Raro.ia
#
# Faz de uma vez os passos 8b, 9 e o cálculo do passo 10 do guia
# docs/PUBLICAR-APPS-SCRIPT.md: testa o Web App, cria as abas que faltam e
# imprime, prontas para copiar, as três variáveis da Vercel.
#
# O segredo é digitado escondido e NUNCA é impresso na tela, nunca vai na barra
# de endereço e nunca é gravado em arquivo. Ele viaja só no corpo do POST.
#
# Rode assim, no PowerShell, dentro da pasta do repositório:
#   powershell -ExecutionPolicy Bypass -File scripts\planilha\configurar-planilha.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Titulo($t) {
  Write-Host ''
  Write-Host ('=' * 68) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('=' * 68) -ForegroundColor DarkGray
}

Titulo 'Raro.ia - configurar a planilha como base de dados'

# ---------------------------------------------------------------- 1. planilha
Write-Host ''
Write-Host 'Cole a URL da planilha (aquela que voce abre no navegador).' -ForegroundColor Yellow
Write-Host 'Exemplo: https://docs.google.com/spreadsheets/d/XXXXXXXX/edit' -ForegroundColor DarkGray
$urlPlanilha = (Read-Host 'URL da planilha').Trim()

if ($urlPlanilha -match '/spreadsheets/d/([a-zA-Z0-9_-]+)') {
  $sheetsId = $Matches[1]
} elseif ($urlPlanilha -match '^[a-zA-Z0-9_-]{20,}$') {
  # ele colou so o ID
  $sheetsId = $urlPlanilha
} else {
  Write-Host ''
  Write-Host 'Nao consegui achar o ID nessa URL. Ele e o pedaco entre /d/ e /edit.' -ForegroundColor Red
  exit 1
}
Write-Host "ID da planilha: $sheetsId" -ForegroundColor Green

# ------------------------------------------------------------------ 2. web app
Write-Host ''
Write-Host 'Cole a URL do Web App do Apps Script (passo 7 do guia).' -ForegroundColor Yellow
Write-Host 'Ela termina em /exec. Se a sua termina em /dev, e a de teste - nao serve.' -ForegroundColor DarkGray
$webappUrl = (Read-Host 'URL do Web App').Trim()

if ($webappUrl -notmatch '/exec$') {
  Write-Host ''
  Write-Host 'Essa URL nao termina em /exec. Volte no passo 7 e copie a "URL do app da Web".' -ForegroundColor Red
  exit 1
}

# ------------------------------------------------------------------ 3. segredo
Write-Host ''
Write-Host 'Digite (ou cole) o segredo cadastrado em RARO_SEGREDO nas Propriedades do Script.' -ForegroundColor Yellow
Write-Host 'Ele nao aparece na tela enquanto voce digita. Isso e proposital.' -ForegroundColor DarkGray
$segredoSeguro = Read-Host 'Segredo' -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredoSeguro)
try {
  $segredo = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($segredo)) {
  Write-Host 'Segredo vazio. Abortando.' -ForegroundColor Red
  exit 1
}

# ------------------------------------------------------------- 4. teste (ping)
Titulo 'Teste 1 de 2 - o Web App esta vivo e o segredo bate?'

$corpoPing = @{ segredo = $segredo; acao = 'ping' } | ConvertTo-Json -Compress
try {
  $ping = Invoke-RestMethod -Uri $webappUrl -Method Post -Body $corpoPing -ContentType 'application/json'
} catch {
  Write-Host ''
  Write-Host 'A chamada falhou antes de chegar no script.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  Write-Host 'Causa mais comum: na publicacao, "Quem pode acessar" ficou diferente de'
  Write-Host '"Qualquer pessoa". Refaca o passo 5 do guia.'
  exit 1
}

if (-not $ping.ok) {
  Write-Host ''
  Write-Host ("O script respondeu, mas recusou: " + $ping.erro) -ForegroundColor Red
  Write-Host ''
  if ("$($ping.erro)" -match 'autoriz') {
    Write-Host 'Isso e o segredo nao batendo. Confira nas Configuracoes do projeto do'
    Write-Host 'Apps Script se a propriedade se chama exatamente RARO_SEGREDO (maiuscula,'
    Write-Host 'com underline) e se o valor e o mesmo que voce acabou de digitar.'
  }
  exit 1
}

Write-Host ''
Write-Host ("Respondeu OK. Versao do script publicada: " + $ping.versao) -ForegroundColor Green
if ($ping.versao -and $ping.versao -ne '2.1.0') {
  Write-Host ''
  Write-Host ("ATENCAO: a versao publicada e " + $ping.versao + ", e o repositorio esta na 2.1.0.") -ForegroundColor Yellow
  Write-Host 'Sem republicar, as abas COBRANCAS, INGESTAO e DESPESAS_RECORRENTES nao nascem.'
  Write-Host 'Cole o raro-sync.gs atual no editor, salve, e va em Implantar > Gerenciar'
  Write-Host 'implantacoes > lapis > Versao: Nova versao > Implantar. A URL continua a mesma.'
  Write-Host ''
  $seguir = Read-Host 'Quer seguir mesmo assim? (s/N)'
  if ($seguir -ne 's') { exit 1 }
}
if ($ping.planilha) { Write-Host ("Planilha: " + $ping.planilha) -ForegroundColor Green }

# ------------------------------------------------------------ 5. criar as abas
Titulo 'Teste 2 de 2 - criar as abas que faltam'

Write-Host ''
Write-Host 'Isso NAO mexe em nenhuma aba que ja existe, nao muda ordem e nao apaga nada.'
Write-Host 'As abas novas entram no fim. Rodar duas vezes e seguro.'
Write-Host ''

$corpoAbas = @{ segredo = $segredo; acao = 'criarAbas' } | ConvertTo-Json -Compress
$abas = Invoke-RestMethod -Uri $webappUrl -Method Post -Body $corpoAbas -ContentType 'application/json'

if (-not $abas.ok) {
  Write-Host ("Falhou: " + $abas.erro) -ForegroundColor Red
  exit 1
}

$criadas = @($abas.criadas)
$jaExistiam = @($abas.jaExistiam)

Write-Host ("Criadas agora (" + $criadas.Count + "): " + ($(if ($criadas.Count) { $criadas -join ', ' } else { 'nenhuma' }))) -ForegroundColor Green
Write-Host ("Ja existiam (" + $jaExistiam.Count + "): " + ($(if ($jaExistiam.Count) { $jaExistiam -join ', ' } else { 'nenhuma' }))) -ForegroundColor DarkGray

$todas = $criadas + $jaExistiam
foreach ($nova in @('COBRANCAS', 'INGESTAO', 'DESPESAS_RECORRENTES')) {
  if ($todas -contains $nova) {
    Write-Host ("  OK  " + $nova) -ForegroundColor Green
  } else {
    Write-Host ("  FALTA  " + $nova + " - o script publicado ainda e antigo. Republique.") -ForegroundColor Red
  }
}

# ----------------------------------------------------------- 6. saida p/ Vercel
Titulo 'Agora cole isso na Vercel'

Write-Host ''
Write-Host 'vercel.com > projeto raro-ia > Settings > Environment Variables.'
Write-Host 'Em cada uma, marque Production, Preview e Development. Nenhuma leva NEXT_PUBLIC_.'
Write-Host ''
Write-Host 'Name:  RARO_SHEETS_ID' -ForegroundColor Cyan
Write-Host "Value: $sheetsId"
Write-Host ''
Write-Host 'Name:  RARO_SHEETS_WEBAPP_URL' -ForegroundColor Cyan
Write-Host "Value: $webappUrl"
Write-Host ''
Write-Host 'Name:  RARO_SHEETS_SEGREDO' -ForegroundColor Cyan
Write-Host 'Value: (o mesmo segredo que voce digitou aqui - nao imprimo ele na tela)' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Depois de salvar as tres, rode o deploy:' -ForegroundColor Yellow
Write-Host '  cd /d "C:\dev\Repositorios\RARO IA" && deploy-vercel.bat'
Write-Host ''
Write-Host 'Variavel de ambiente nova so vale depois de um deploy novo.' -ForegroundColor DarkGray
Write-Host ''

# limpeza defensiva
$segredo = $null
[System.GC]::Collect()
