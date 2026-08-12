# Liga a transcricao de audio (Groq) no localhost e na Vercel, de uma vez so.
#
# POR QUE ISTO E UM SCRIPT E NAO UM PASSO A PASSO
# -----------------------------------------------
# A mesma variavel precisa existir em DOIS lugares: no .env.local (localhost)
# e na Vercel (o que o Jefson usa). Fazer a mao e o tipo de tarefa em que se
# esquece um dos dois e depois se perde meia hora sem entender por que
# "funciona aqui e nao la".
#
# A AGENDA NAO ESTA MAIS AQUI, DE PROPOSITO
# -----------------------------------------
# Ela nao e mais variavel de ambiente: virou botao. Em /agenda existe
# "Conectar com o Google", que pede so leitura, e ao lado dele "Desconectar".
# Colocar a agenda de volta neste script seria oferecer dois caminhos para a
# mesma coisa — e o caminho pior, porque exige copiar um endereco secreto.
#
# O QUE ELE NAO FAZ
# -----------------
# Nao inventa valor, nao guarda copia em lugar nenhum e nao mostra na tela o
# que voce digitou. Campo em branco = nada e alterado.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$ESCOPO  = 'guilhermes-projects-7de72796'
$ARQUIVO = '.env.local'
$CHAVE   = 'GROQ_API_KEY'

if (-not (Test-Path $ARQUIVO)) {
  Write-Host "ERRO: nao achei o .env.local nesta pasta." -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '=== Transcricao de audio (Groq Whisper) ===' -ForegroundColor Cyan
Write-Host 'Onde achar: console.groq.com > API Keys > Create API Key.'
Write-Host 'Deixe em branco e de Enter para cancelar sem mudar nada.'
Write-Host ''

$valor = (Read-Host $CHAVE).Trim()

if ($valor -eq '') {
  Write-Host 'Cancelado. Nada foi alterado.' -ForegroundColor Gray
  exit 0
}

if ($valor -notmatch '^gsk_') {
  # Aviso e nao recusa: o prefixo pode mudar, e travar por causa disso seria
  # pior que gravar uma chave que a tela de integracoes vai reportar como
  # invalida na primeira transcricao.
  Write-Host 'AVISO: chave da Groq costuma comecar com "gsk_". Confira se nao colou a de outro servico.' -ForegroundColor Yellow
}

# --- .env.local -------------------------------------------------------------
$linhas = @(Get-Content $ARQUIVO -Encoding UTF8)
$achou = $false
for ($i = 0; $i -lt $linhas.Count; $i++) {
  if ($linhas[$i] -match "^\s*$CHAVE=") { $linhas[$i] = "$CHAVE=$valor"; $achou = $true }
}
if ($achou) { Set-Content $ARQUIVO -Value $linhas -Encoding UTF8 }
else { Add-Content $ARQUIVO -Value "`r`n$CHAVE=$valor" -Encoding UTF8 }
Write-Host "  .env.local: $CHAVE gravada." -ForegroundColor Green

# --- Vercel (producao) ------------------------------------------------------
Write-Host "  Vercel: enviando $CHAVE (producao)..." -ForegroundColor Gray
# Remover antes de adicionar: `env add` recusa variavel que ja existe, e sem
# isto rodar o script uma segunda vez falharia com uma mensagem confusa.
cmd /c "npx vercel env rm $CHAVE production --yes --scope $ESCOPO >nul 2>&1"
$valor | & npx vercel env add $CHAVE production --scope $ESCOPO
if ($LASTEXITCODE -eq 0) {
  Write-Host "  Vercel: $CHAVE gravada." -ForegroundColor Green
} else {
  Write-Host "  Vercel: FALHOU. Rode 'npx vercel login' e execute de novo." -ForegroundColor Red
}

Write-Host ''
Write-Host '=== Falta um passo ===' -ForegroundColor Cyan
Write-Host 'A Vercel so enxerga variavel nova no PROXIMO deploy. Rode:  deploy-vercel.bat'
Write-Host 'No localhost, reinicie o "npm run dev".'
Write-Host ''
