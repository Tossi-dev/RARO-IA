# conectar-planilha.ps1 - Raro.ia
#
# POR QUE ESTE ARQUIVO EXISTE
# ---------------------------
# O configurar-planilha.ps1 pedia a URL da planilha, a URL do Web App e o
# segredo, todos colados a mao. Como a area de transferencia guarda UMA coisa
# so, copiar a URL da planilha apagava o segredo que estava la - e o que ia
# parar no campo "Segredo" era a URL. O Apps Script respondia "nao autorizado"
# e parecia erro de configuracao, quando era erro de colagem.
#
# Aqui nada e colado. O ID da planilha e o segredo saem do proprio .env.local,
# e a URL do Web App ja vem preenchida. O segredo nunca aparece na tela, nunca
# vai na barra de endereco e nunca e gravado em lugar novo: ele viaja so no
# corpo do POST.
#
# Rode assim, no PowerShell:
#   cd "C:\dev\Repositorios\RARO IA"
#   powershell -ExecutionPolicy Bypass -File scripts\planilha\conectar-planilha.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WEBAPP_PADRAO = 'https://script.google.com/macros/s/AKfycbyjX3N6ZkMQ_QEs0AGnG6OCIdHGUkp1CprRvVQg8Dj0euVIXg17OyXJ_72J3qmd6ADCRg/exec'

function Titulo($t) {
  Write-Host ''
  Write-Host ('=' * 68) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('=' * 68) -ForegroundColor DarkGray
}

function ValorDoEnv($linhas, $chave) {
  foreach ($linha in $linhas) {
    if ($linha -like "$chave=*") {
      return $linha.Substring($chave.Length + 1).Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

Titulo 'Raro.ia - conectar a planilha'

# ------------------------------------------------------------ 1. achar o .env
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $raiz '.env.local'

if (-not (Test-Path $envPath)) {
  Write-Host ''
  Write-Host "Nao achei o .env.local em: $envPath" -ForegroundColor Red
  Write-Host 'Rode este script de dentro da pasta do repositorio.' -ForegroundColor Red
  exit 1
}

$linhas = Get-Content $envPath
$sheetsId = ValorDoEnv $linhas 'RARO_SHEETS_ID'
$segredo = ValorDoEnv $linhas 'RARO_SHEETS_SEGREDO'

if ([string]::IsNullOrWhiteSpace($sheetsId)) {
  Write-Host 'Falta RARO_SHEETS_ID no .env.local.' -ForegroundColor Red
  exit 1
}
if ([string]::IsNullOrWhiteSpace($segredo)) {
  Write-Host 'Falta RARO_SHEETS_SEGREDO no .env.local.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host "Planilha: $sheetsId" -ForegroundColor Green
Write-Host ("Segredo: lido do .env.local, " + $segredo.Length + " caracteres (nao imprimo o valor)") -ForegroundColor Green

# ------------------------------------------------------------- 2. URL do app
Write-Host ''
Write-Host 'URL do Web App (aperte ENTER para usar a que ja esta aqui):' -ForegroundColor Yellow
Write-Host "  $WEBAPP_PADRAO" -ForegroundColor DarkGray
$webappUrl = (Read-Host 'URL').Trim()
if ([string]::IsNullOrWhiteSpace($webappUrl)) { $webappUrl = $WEBAPP_PADRAO }

if ($webappUrl -notmatch '/exec$') {
  Write-Host ''
  Write-Host 'Essa URL nao termina em /exec. A que termina em /dev e a de teste e nao serve.' -ForegroundColor Red
  exit 1
}

# --------------------------------------------------------------- 3. ping
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
  Write-Host '"Qualquer pessoa". Va em Implantar > Gerenciar implantacoes > lapis e ajuste.'
  exit 1
}

if (-not $ping.ok) {
  Write-Host ''
  Write-Host ("O script respondeu, mas recusou: " + $ping.erro) -ForegroundColor Red
  Write-Host ''
  Write-Host 'O segredo do .env.local nao e igual ao que esta em RARO_SEGREDO.'
  Write-Host 'No Apps Script: Configuracoes do projeto > Propriedades do script.'
  Write-Host 'Confira se o nome e exatamente RARO_SEGREDO e se o valor tem'
  Write-Host ("" + $segredo.Length + " caracteres, sem espaco sobrando no comeco ou no fim.")
  exit 1
}

Write-Host ''
Write-Host ("Respondeu OK. Versao publicada do script: " + $ping.versao) -ForegroundColor Green
if ($ping.planilha) { Write-Host ("Planilha ligada: " + $ping.planilha) -ForegroundColor Green }

if ($ping.versao -and $ping.versao -ne '2.1.0') {
  Write-Host ''
  Write-Host ("ATENCAO: a versao publicada e " + $ping.versao + " e o repositorio esta na 2.1.0.") -ForegroundColor Yellow
  Write-Host 'Sem republicar, as abas COBRANCAS, INGESTAO e DESPESAS_RECORRENTES nao nascem.'
  $seguir = Read-Host 'Seguir mesmo assim? (s/N)'
  if ($seguir -ne 's') { exit 1 }
}

# ---------------------------------------------------------- 4. criar as abas
Titulo 'Teste 2 de 2 - criar as abas que faltam'

Write-Host ''
Write-Host 'Isso NAO mexe em aba que ja existe, nao muda ordem e nao apaga nada.'
Write-Host 'As abas novas entram no fim. Rodar duas vezes e seguro.'

$corpoAbas = @{ segredo = $segredo; acao = 'criarAbas' } | ConvertTo-Json -Compress
$abas = Invoke-RestMethod -Uri $webappUrl -Method Post -Body $corpoAbas -ContentType 'application/json'

if (-not $abas.ok) {
  Write-Host ("Falhou: " + $abas.erro) -ForegroundColor Red
  exit 1
}

$criadas = @($abas.criadas)
$jaExistiam = @($abas.jaExistiam)

Write-Host ''
if ($criadas.Count) {
  Write-Host ("Criadas agora (" + $criadas.Count + "): " + ($criadas -join ', ')) -ForegroundColor Green
} else {
  Write-Host 'Criadas agora: nenhuma (ja estava tudo la)' -ForegroundColor Green
}
Write-Host ("Ja existiam (" + $jaExistiam.Count + "): " + ($(if ($jaExistiam.Count) { $jaExistiam -join ', ' } else { 'nenhuma' }))) -ForegroundColor DarkGray

$todas = $criadas + $jaExistiam
$faltou = $false
foreach ($nova in @('COBRANCAS', 'INGESTAO', 'DESPESAS_RECORRENTES')) {
  if ($todas -contains $nova) {
    Write-Host ("  OK     " + $nova) -ForegroundColor Green
  } else {
    Write-Host ("  FALTA  " + $nova + " - o script publicado ainda e antigo. Republique.") -ForegroundColor Red
    $faltou = $true
  }
}

# -------------------------------------------- 5. gravar a URL no .env.local
Titulo 'Gravando a URL no .env.local'

$jaTem = ValorDoEnv $linhas 'RARO_SHEETS_WEBAPP_URL'
if ($jaTem -eq $webappUrl) {
  Write-Host ''
  Write-Host 'Ja estava gravada, igualzinha. Nao mexi no arquivo.' -ForegroundColor DarkGray
} else {
  $novas = New-Object System.Collections.Generic.List[string]
  $trocou = $false
  foreach ($linha in $linhas) {
    if ($linha -like 'RARO_SHEETS_WEBAPP_URL=*') {
      $novas.Add("RARO_SHEETS_WEBAPP_URL=$webappUrl")
      $trocou = $true
    } else {
      $novas.Add($linha)
    }
  }
  if (-not $trocou) { $novas.Add("RARO_SHEETS_WEBAPP_URL=$webappUrl") }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($envPath, $novas, $utf8)
  Write-Host ''
  Write-Host 'RARO_SHEETS_WEBAPP_URL gravada no .env.local.' -ForegroundColor Green
}

# ------------------------------------------------------------ 6. proximo passo
Titulo 'Falta so a Vercel'

Write-Host ''
Write-Host 'RARO_SHEETS_ID e RARO_SHEETS_SEGREDO ja estao la. Falta esta:'
Write-Host ''
Write-Host 'vercel.com > projeto raro-ia > Settings > Environment Variables > Add New'
Write-Host ''
Write-Host 'Name:  RARO_SHEETS_WEBAPP_URL' -ForegroundColor Cyan
Write-Host "Value: $webappUrl"
Write-Host 'Marque Production, Preview e Development. Sem NEXT_PUBLIC_.' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Depois rode o deploy - variavel nova so vale com deploy novo:' -ForegroundColor Yellow
Write-Host '  cd /d "C:\dev\Repositorios\RARO IA" && deploy-vercel.bat'
Write-Host ''

if ($faltou) {
  Write-Host 'Lembrete: alguma aba nova nao nasceu. Republique o Apps Script antes do deploy.' -ForegroundColor Red
  Write-Host ''
}

# limpeza defensiva
$segredo = $null
[System.GC]::Collect()
