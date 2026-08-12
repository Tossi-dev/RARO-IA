# configurar-vercel.ps1
#
# Le o .env.local desta maquina e registra as variaveis RARO_SHEETS_* no projeto
# do Vercel, nos tres ambientes (production, preview, development).
#
# POR QUE ESTE SCRIPT EXISTE
# --------------------------
# Nao ha ferramenta de MCP que escreva variavel de ambiente no Vercel. Sobra a
# interface web (digitar tres valores a mao, um deles com 48 caracteres, tres
# vezes cada -- um ambiente por vez) ou a CLI. A CLI ja esta logada nesta
# maquina, entao a CLI ganha.
#
# O QUE ELE NAO FAZ
# -----------------
# Nao imprime o valor de nenhum segredo na tela. Nao escreve valor em arquivo
# nenhum. Nao faz deploy -- registrar variavel no Vercel NAO reconstroi o site;
# o deploy continua sendo seu, pelo deploy-vercel.bat.
#
# ORDEM CORRETA
# -------------
#   1. rodar este script  (registra as variaveis)
#   2. rodar deploy-vercel.bat  (o build novo enxerga as variaveis)
# Invertido, o site sobe sem as variaveis e continua no modo vazio.
#
# COMO RODAR
#   powershell -ExecutionPolicy Bypass -File scripts\planilha\configurar-vercel.ps1
#
# Variavel ainda sem valor no .env.local (hoje: RARO_SHEETS_WEBAPP_URL) e
# PULADA, nao apagada e nao registrada vazia. Quando o Web App for publicado,
# basta preencher a linha no .env.local e rodar este script de novo.
#
# ---------------------------------------------------------------------------
# CORRECAO DA VERSAO 2 (o erro "NativeCommandError")
# ---------------------------------------------------------------------------
# A versao 1 morria na primeira chamada da CLI com:
#
#   node.exe : Vercel CLI 58.4.0 (Node.js 24.11.0)
#   + CategoryInfo : NotSpecified: (...) [], RemoteException
#   + FullyQualifiedErrorId : NativeCommandError
#
# Nao era erro do Vercel. A CLI imprime o proprio banner de versao no fluxo de
# ERRO (stderr), nao no de saida. Quando o PowerShell redireciona stderr de um
# programa externo com `2>&1` e o `$ErrorActionPreference` esta em `Stop`, ele
# trata QUALQUER linha de stderr como excecao terminante -- mesmo uma linha
# inofensiva como o numero da versao. O script abortava antes de registrar nada.
#
# Correcao: toda chamada a CLI passa pela funcao `ExecVercel`, que baixa o
# `$ErrorActionPreference` para `Continue` durante a chamada e volta ao normal
# depois. O sucesso passa a ser julgado pelo codigo de saida do processo
# (`$LASTEXITCODE`), que e o sinal correto, e nao pela presenca de stderr.

$ErrorActionPreference = 'Stop'

function Titulo($texto) {
  Write-Host ''
  Write-Host ('=' * 68) -ForegroundColor DarkGray
  Write-Host "  $texto" -ForegroundColor Cyan
  Write-Host ('=' * 68) -ForegroundColor DarkGray
}
function Ok($t)    { Write-Host "  [ok]    $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [aviso] $t" -ForegroundColor Yellow }
function Erro($t)  { Write-Host "  [erro]  $t" -ForegroundColor Red }
function Info($t)  { Write-Host "          $t" -ForegroundColor Gray }

<#
  Chama a CLI do Vercel sem deixar o stderr dela virar excecao.

  Devolve um objeto com:
    Codigo  - codigo de saida do processo (0 = sucesso)
    Saida   - tudo que a CLI escreveu (saida + erro), como texto unico

  `-Stdin` manda o valor pela entrada padrao. E assim que o segredo viaja: por
  argumento de linha de comando ele apareceria na lista de processos do Windows
  e no historico do shell.
#>
function ExecVercel {
  param(
    [Parameter(Mandatory = $true)][string[]]$Argumentos,
    [string]$Stdin = $null
  )
  $eapAntigo = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($null -ne $Stdin -and $Stdin -ne '') {
      $bruto = $Stdin | & vercel @Argumentos 2>&1
    } else {
      $bruto = & vercel @Argumentos 2>&1
    }
    $codigo = $LASTEXITCODE
    return [pscustomobject]@{
      Codigo = $codigo
      Saida  = ($bruto | Out-String)
    }
  } finally {
    $ErrorActionPreference = $eapAntigo
  }
}

<# Remove o segredo de qualquer texto antes de imprimir na tela. #>
function Mascarar([string]$texto, [string]$segredo) {
  if ([string]::IsNullOrEmpty($segredo)) { return $texto }
  return $texto.Replace($segredo, '<valor ocultado>')
}

# ---------------------------------------------------------------------------
# 0. Localizar a raiz do repositorio (o script vive em scripts\planilha\)
# ---------------------------------------------------------------------------
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $raiz

Titulo 'Raro.ia - registrar variaveis no Vercel'
Info "Repositorio: $raiz"

# ---------------------------------------------------------------------------
# 1. A CLI do Vercel existe?
# ---------------------------------------------------------------------------
if ($null -eq (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Erro 'A CLI do Vercel nao foi encontrada no PATH.'
  Info 'Instale com:  npm i -g vercel'
  Info 'Depois entre com:  vercel login'
  exit 1
}
Ok 'CLI do Vercel encontrada.'

# ---------------------------------------------------------------------------
# 2. O projeto esta vinculado? (.vercel\project.json)
# ---------------------------------------------------------------------------
$arquivoProjeto = Join-Path $raiz '.vercel\project.json'
if (-not (Test-Path $arquivoProjeto)) {
  Erro 'Pasta .vercel nao encontrada: este diretorio nao esta vinculado a um projeto.'
  Info 'Rode uma vez:  vercel link'
  exit 1
}
$projeto = Get-Content $arquivoProjeto -Raw | ConvertFrom-Json
Ok "Projeto vinculado: $($projeto.projectName)"
Info "projectId: $($projeto.projectId)"

# ---------------------------------------------------------------------------
# 3. Ler o .env.local
# ---------------------------------------------------------------------------
$arquivoEnv = Join-Path $raiz '.env.local'
if (-not (Test-Path $arquivoEnv)) {
  Erro '.env.local nao encontrado na raiz do repositorio.'
  Info 'E dele que este script tira os valores. Sem ele nao ha o que registrar.'
  exit 1
}

# Parser deliberadamente simples: NOME=valor, ignorando comentario e linha vazia.
# Nao interpreta aspas nem barra invertida -- nenhum dos nossos valores usa.
$valores = @{}
foreach ($linha in Get-Content $arquivoEnv) {
  $t = $linha.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $valores[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
}
Ok ".env.local lido ($($valores.Count) variaveis declaradas)."

$segredoParaMascarar = ''
if ($valores.ContainsKey('RARO_SHEETS_SEGREDO')) {
  $segredoParaMascarar = $valores['RARO_SHEETS_SEGREDO']
}
# Segundo segredo a mascarar: a chave do cliente OAuth do Google.
$segredoGoogle = ''
if ($valores.ContainsKey('GOOGLE_CLIENT_SECRET')) {
  $segredoGoogle = $valores['GOOGLE_CLIENT_SECRET']
}

# ---------------------------------------------------------------------------
# 4. Decidir o que sobe
# ---------------------------------------------------------------------------
# RARO_MODO fica de fora de proposito: 'demo' e opt-in local para desenvolver.
# Registrar demo no Vercel devolveria o dado inventado para a cara do cliente.
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET entram aqui porque o botao
# "Conectar com o Google" da tela /agenda so aparece quando os dois existem no
# servidor. O refresh_token do usuario NAO entra: ele nasce no navegador de
# quem clicou em Conectar e mora num cookie httpOnly, nunca em variavel.
$alvos = @(
  'RARO_SHEETS_ID',
  'RARO_SHEETS_WEBAPP_URL',
  'RARO_SHEETS_SEGREDO',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
)
$ambientes = @('production', 'preview', 'development')

$aSubir = @()
$pulados = @()
foreach ($nome in $alvos) {
  if ($valores.ContainsKey($nome) -and $valores[$nome] -ne '') { $aSubir += $nome }
  else { $pulados += $nome }
}

Titulo 'Plano'
foreach ($nome in $aSubir) {
  $v = $valores[$nome]
  if ($nome -eq 'RARO_SHEETS_SEGREDO' -or $nome -eq 'GOOGLE_CLIENT_SECRET') {
    Write-Host "  SOBE    $nome  ($($v.Length) caracteres - valor nao impresso)" -ForegroundColor Green
  } else {
    Write-Host "  SOBE    $nome  = $v" -ForegroundColor Green
  }
}
foreach ($nome in $pulados) {
  Write-Host "  PULA    $nome  (vazio no .env.local)" -ForegroundColor Yellow
}

if ($aSubir.Count -eq 0) {
  Erro 'Nenhuma variavel com valor. Nada a fazer.'
  exit 1
}

if ($pulados -contains 'RARO_SHEETS_WEBAPP_URL') {
  Write-Host ''
  Aviso 'Sem RARO_SHEETS_WEBAPP_URL o sistema entra em modo SO LEITURA.'
  Info 'Isso e legitimo e nao e erro: le a planilha real e recusa gravar,'
  Info 'dizendo qual variavel falta. Ninguem ve numero inventado.'
  Info 'Quando o Web App for publicado, preencha a linha e rode isto de novo.'
}

Write-Host ''
$resposta = Read-Host "Registrar $($aSubir.Count) variavel(is) em production, preview e development? (s/N)"
if ($resposta -ne 's' -and $resposta -ne 'S') {
  Aviso 'Cancelado. Nada foi alterado no Vercel.'
  exit 0
}

# ---------------------------------------------------------------------------
# 5. Registrar
# ---------------------------------------------------------------------------
# `vercel env add` NAO sobrescreve: se a variavel ja existe naquele ambiente ele
# recusa. Por isso removemos antes. A remocao falhar e o caso NORMAL na primeira
# execucao (nao havia o que remover), entao o resultado dela e ignorado de
# proposito -- so o `add` e julgado.

Titulo 'Registrando'
$erros = 0
$falhas = @()

foreach ($nome in $aSubir) {
  $valor = $valores[$nome]
  foreach ($amb in $ambientes) {

    # Remocao previa. Resultado ignorado: "nao existia" nao e problema.
    [void](ExecVercel -Argumentos @('env', 'rm', $nome, $amb, '--yes'))

    # Adicao, com o valor entrando pela entrada padrao.
    $r = ExecVercel -Argumentos @('env', 'add', $nome, $amb) -Stdin $valor

    if ($r.Codigo -eq 0) {
      Ok "$nome -> $amb"
    } else {
      Erro "$nome -> $amb  (codigo $($r.Codigo))"
      $erros++
      $falhas += [pscustomobject]@{
        Variavel = $nome
        Ambiente = $amb
        Detalhe  = (Mascarar (Mascarar $r.Saida $segredoParaMascarar) $segredoGoogle).Trim()
      }
    }
  }
}

# Detalhe das falhas so no fim, para nao poluir a lista de progresso.
if ($falhas.Count -gt 0) {
  Titulo 'Detalhe das falhas'
  foreach ($f in $falhas) {
    Write-Host "  $($f.Variavel) / $($f.Ambiente):" -ForegroundColor Red
    foreach ($l in ($f.Detalhe -split "`r?`n")) {
      if ($l.Trim() -ne '') { Info $l.Trim() }
    }
    Write-Host ''
  }
}

# ---------------------------------------------------------------------------
# 6. Conferir pela propria CLI
# ---------------------------------------------------------------------------
Titulo 'Conferencia (vercel env ls)'
# `vercel env ls` mostra NOME, ambiente e data -- nunca o valor. Seguro imprimir.
$listagem = ExecVercel -Argumentos @('env', 'ls')
Write-Host (Mascarar $listagem.Saida $segredoParaMascarar)

# ---------------------------------------------------------------------------
# 7. Fechamento
# ---------------------------------------------------------------------------
Titulo 'Resultado'
if ($erros -eq 0) {
  Ok "$($aSubir.Count) variavel(is) registrada(s) nos 3 ambientes."
} else {
  Erro "$erros registro(s) falharam. Confira o detalhe acima."
}

Write-Host ''
Write-Host '  PROXIMO PASSO OBRIGATORIO' -ForegroundColor Cyan
Info 'Variavel registrada NAO chega ao site sozinha: o build atual foi feito'
Info 'sem ela. Rode o deploy para o site passar a ler a planilha real:'
Write-Host ''
Write-Host '      deploy-vercel.bat' -ForegroundColor White
Write-Host ''
Info 'Depois abra https://raro-ia.vercel.app e confirme que sumiu o aviso'
Info 'de "Modo demonstracao". Build verde nao e prova de site funcionando.'
Write-Host ''
