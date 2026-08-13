# Simulacao da migracao planilha -> Supabase.
#
# POR QUE ESTE ARQUIVO EXISTE
# ----------------------------
# O script de migracao precisa de tres coisas do ambiente, e uma delas e a
# chave service_role. Ela NAO e digitada aqui nem em lugar nenhum: este
# arquivo a LE do disco (service_role_secret.txt) e a coloca na variavel de
# ambiente do processo filho. Segredo vive como referencia, nunca como texto
# solto -- e por isso que este .ps1 pode ser lido por qualquer um sem risco.
#
# A simulacao NAO ESCREVE NADA no Supabase. Sem o argumento --aplicar, o
# script so le a planilha e relata, aba por aba, quantas linhas viriam e
# quantas seriam recusadas. Rodar isto duas vezes tem o mesmo efeito de
# rodar zero vezes.
#
# POR QUE ESTE ARQUIVO E ASCII PURO, SEM ACENTO E SEM TRAVESSAO:
# o PowerShell 5.1 le .ps1 sem BOM como ANSI, nao como UTF-8. Um travessao
# vira tres caracteres, um deles aspas, e a string quebra no meio -- o
# script morre com erro de sintaxe antes de rodar qualquer coisa. Ja
# aconteceu duas vezes aqui. ASCII puro nao tem esse problema em nenhuma
# maquina.

$ErrorActionPreference = "Stop"
$raiz = "C:\dev\Repositorios\RARO IA"
Set-Location $raiz

Write-Host "=== SIMULACAO DA MIGRACAO - nada sera escrito no Supabase ==="

# 1) As variaveis do .env.local (RARO_SHEETS_ID e companhia). Lidas do
#    arquivo, nunca transcritas: o valor vai do disco para o processo.
$aspas = [char]34
if (Test-Path ".env.local") {
  Get-Content ".env.local" | ForEach-Object {
    $linha = $_.Trim()
    if ($linha -ne "" -and -not $linha.StartsWith("#") -and $linha.Contains("=")) {
      $i = $linha.IndexOf("=")
      $nome = $linha.Substring(0, $i).Trim()
      $valor = $linha.Substring($i + 1).Trim().Trim($aspas)
      if ($nome -ne "" -and $valor -ne "") {
        [Environment]::SetEnvironmentVariable($nome, $valor, "Process")
      }
    }
  }
  Write-Host "[ok] .env.local carregado"
} else {
  Write-Host "[aviso] .env.local nao encontrado - seguindo com o id padrao da planilha"
}

# 2) O endereco do projeto Supabase. Publico, nao e segredo.
$env:NEXT_PUBLIC_SUPABASE_URL = "https://cymwaroayxngplwswzwk.supabase.co"

# 3) A chave service_role, lida do disco.
$arquivoChave = Join-Path $raiz "service_role_secret.txt"
if (-not (Test-Path $arquivoChave)) {
  Write-Host "[ERRO] service_role_secret.txt nao encontrado em $raiz"
  exit 2
}
$chave = (Get-Content $arquivoChave -Raw).Trim()
$env:SUPABASE_SERVICE_ROLE_KEY = $chave
Write-Host ("[ok] chave de servico carregada do arquivo (" + $chave.Length + " caracteres, valor nao exibido)")

# 4) Roda. --yes porque o tsx nao esta instalado nesta pasta e o npx vai
#    busca-lo; sem isso ele para esperando um "y" que ninguem vai digitar.
Write-Host "[..] rodando (pode levar alguns minutos na primeira vez)"
$saida = & npx --yes tsx "scripts/migrar-planilha-para-supabase.ts" 2>&1 | Out-String
$codigo = $LASTEXITCODE

# 5) Antes de gravar, varre a saida atras da chave. O script de migracao nao
#    imprime segredo nenhum -- esta linha existe para o caso de um dia
#    imprimir por acidente. Defesa que custa uma linha.
$saida = $saida.Replace($chave, "<<SEGREDO REMOVIDO>>")

$destino = Join-Path $raiz "simulacao-saida.txt"
Set-Content -Path $destino -Value $saida -Encoding UTF8
Add-Content -Path $destino -Value ("=== CODIGO DE SAIDA: " + $codigo + " ===") -Encoding UTF8

Write-Host $saida
Write-Host ("=== FIM - codigo de saida " + $codigo + " - gravado em simulacao-saida.txt ===")
