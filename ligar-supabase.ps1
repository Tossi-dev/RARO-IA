# Liga o Supabase no ambiente local e sobe o app.
#
# O QUE ELE FAZ, E O QUE ELE NAO FAZ
# -----------------------------------
# Ele apenas TIRA O "# " de duas linhas do .env.local -- as que apontam para
# o projeto Supabase. Os valores ja estavam la, escritos e comentados; este
# script nao digita nem le nenhum deles, so remove o comentario. Nenhum
# segredo passa por fora do arquivo.
#
# Antes de mexer, guarda uma copia em _to_delete/ com a data. Se algo der
# errado, o caminho de volta e copiar essa copia por cima.
#
# ASCII puro de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI, e um
# unico travessao num comentario quebra o arquivo inteiro antes de rodar.

$raiz = "C:\dev\Repositorios\RARO IA"
Set-Location $raiz

$env_arquivo = Join-Path $raiz ".env.local"
if (-not (Test-Path $env_arquivo)) {
  Write-Host "[ERRO] .env.local nao encontrado em $raiz"
  exit 2
}

# 1) Copia de seguranca com data no nome.
$pasta_backup = Join-Path $raiz "_to_delete"
if (-not (Test-Path $pasta_backup)) { New-Item -ItemType Directory -Path $pasta_backup | Out-Null }
$carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $env_arquivo (Join-Path $pasta_backup ("env-local-antes-" + $carimbo + ".bak"))
Write-Host "[ok] copia de seguranca guardada em _to_delete"

# 2) Tira o comentario das duas linhas. `-replace` com ancora `^` para nao
#    pegar a linha errada, e Set-Content com UTF8 para nao estragar acento
#    de nenhuma outra linha do arquivo.
$linhas = Get-Content $env_arquivo
$antes = ($linhas | Where-Object { $_ -match '^#\s*NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=' }).Count
$novas = $linhas | ForEach-Object { $_ -replace '^#\s*(NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=)', '$1' }
Set-Content -Path $env_arquivo -Value $novas -Encoding UTF8

$depois = (Get-Content $env_arquivo | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=' }).Count
Write-Host ("[ok] linhas comentadas encontradas: " + $antes + " | linhas ativas agora: " + $depois)

if ($depois -lt 2) {
  Write-Host "[ERRO] esperava 2 linhas ativas. Nada foi perdido: a copia esta em _to_delete."
  exit 3
}

# 3) Sobe o app. Fica rodando ate voce fechar esta janela.
Write-Host ""
Write-Host "======================================================"
Write-Host " Subindo o MentorOS em http://localhost:3000"
Write-Host " Deixe esta janela ABERTA. Para parar, feche a janela."
Write-Host "======================================================"
Write-Host ""
npm run dev
