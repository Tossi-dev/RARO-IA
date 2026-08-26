[CmdletBinding()]
param(
  [switch]$Verificar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Contas = [ordered]@{
  mentorado = "rls-audit-mentorado@audit.invalid"
  comercial = "rls-audit-comercial@audit.invalid"
  gestor = "rls-audit-gestor@audit.invalid"
}
$AgenteAdministrativo = "RARO-IA-T74-auditor-local/1.0"

function Converter-ParaTextoPlano {
  param([Parameter(Mandatory)][Security.SecureString]$Valor)

  $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Valor)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
  }
}

function Obter-ConfiguracaoPublica {
  $raiz = Split-Path -Parent $PSScriptRoot
  $arquivoEnv = Join-Path $raiz ".env.local"
  if (-not (Test-Path -LiteralPath $arquivoEnv)) {
    throw "Não encontrei .env.local para localizar a configuração pública do Supabase."
  }

  $linhas = Get-Content -LiteralPath $arquivoEnv
  $valores = @{}
  foreach ($nome in @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    $linha = $linhas | Where-Object { $_ -match "^$nome=" } | Select-Object -First 1
    $valor = ($linha -replace "^$nome=", "").Trim()
    if ([string]::IsNullOrWhiteSpace($valor)) {
      throw "$nome está ausente em .env.local."
    }
    $valores[$nome] = $valor
  }

  return @{ Url = $valores["NEXT_PUBLIC_SUPABASE_URL"].TrimEnd("/"); ChaveAnonima = $valores["NEXT_PUBLIC_SUPABASE_ANON_KEY"] }
}

function Obter-LinhasSinteticas {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][hashtable]$Cabecalhos,
    [Parameter(Mandatory)][string]$Tabela,
    [Parameter(Mandatory)][string]$Consulta
  )

  try {
    return @(Invoke-RestMethod -Method Get -Uri "$Url/rest/v1/$Tabela`?$Consulta" -Headers $Cabecalhos -UserAgent $AgenteAdministrativo)
  } catch {
    throw "Não foi possível consultar o alvo sintético $Tabela."
  }
}

function Exigir-UmaLinha {
  param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Linhas, [Parameter(Mandatory)][string]$Nome)

  if ($Linhas.Count -ne 1) {
    throw "O alvo sintético $Nome precisa existir exatamente uma vez."
  }
  return $Linhas[0]
}

function Exigir-Quantidade {
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Linhas,
    [Parameter(Mandatory)][string]$Nome,
    [Parameter(Mandatory)][int]$Esperado
  )

  if ($Linhas.Count -ne $Esperado) {
    throw "O alvo sintético $Nome precisa ter exatamente $Esperado linha(s)."
  }
}

function Obter-JwtEfemero {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][string]$ChaveAnonima,
    [Parameter(Mandatory)][string]$Email,
    [Parameter(Mandatory)][string]$Senha,
    [Parameter(Mandatory)][string]$Papel
  )

  try {
    $resposta = Invoke-RestMethod -Method Post -Uri "$Url/auth/v1/token?grant_type=password" -Headers @{ apikey = $ChaveAnonima } -UserAgent $AgenteAdministrativo -ContentType "application/json" -Body (@{ email = $Email; password = $Senha } | ConvertTo-Json -Compress)
  } catch {
    throw "Não foi possível autenticar a conta sintética $Papel."
  }
  if ([string]::IsNullOrWhiteSpace($resposta.access_token)) {
    throw "A conta sintética $Papel não devolveu uma sessão válida."
  }
  return $resposta.access_token
}

function Montar-AlvosAuditoria {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][hashtable]$Cabecalhos
  )

  $mentoradoAlheio = Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "mentorado" "select=id,perfil_id&nome=like.%5BAUDIT%25&perfil_id=is.null") "mentorado alheio"
  $mentoradoProprio = Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "mentorado" "select=id,perfil_id&nome=like.%5BAUDIT%25&perfil_id=not.is.null") "mentorado próprio"
  $oportunidade = Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "oportunidade" "select=id,workspace_id&mentorado_id=eq.$($mentoradoAlheio.id)") "oportunidade"
  $workspace = $oportunidade.workspace_id

  $leituraAlheia = [ordered]@{
    cobranca = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "cobranca" "select=id&mentorado_id=eq.$($mentoradoAlheio.id)") "cobranca").id
    oportunidade = $oportunidade.id
    analise_sessao = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "analise_sessao" "select=id&mentorado_id=eq.$($mentoradoAlheio.id)") "analise_sessao").id
    analise_call = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "analise_call" "select=id&oportunidade_id=eq.$($oportunidade.id)") "analise_call").id
    alerta_risco = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "alerta_risco" "select=id&mentorado_id=eq.$($mentoradoAlheio.id)") "alerta_risco").id
    patrimonio = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "patrimonio" "select=id&workspace_id=eq.$workspace&nome=like.%5BAUDIT%25") "patrimonio").id
    investimento = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "investimento" "select=id&workspace_id=eq.$workspace&nome=like.%5BAUDIT%25") "investimento").id
    renda_pessoal = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "renda_pessoal" "select=id&workspace_id=eq.$workspace&fonte=like.%5BAUDIT%25") "renda_pessoal").id
  }

  $post = Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "post" "select=id&workspace_id=eq.$workspace&titulo=like.%5BAUDIT%25") "post"
  # A oportunidade já foi validada como uma única sentinela; assim a consulta
  # não depende de serialização de texto e ainda não pode alcançar proposta real.
  $proposta = Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "proposta" "select=id,token&oportunidade_id=eq.$($oportunidade.id)") "proposta"
  return [ordered]@{
    leituraAlheia = $leituraAlheia
    patchAlheio = [ordered]@{
      progresso_trilha = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "progresso_trilha" "select=id&mentorado_id=eq.$($mentoradoAlheio.id)") "progresso alheio").id
      onboarding_progresso = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "onboarding_progresso" "select=id&mentorado_id=eq.$($mentoradoAlheio.id)") "onboarding alheio").id
      post_destinatario = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "post_destinatario" "select=id&post_id=eq.$($post.id)&mentorado_id=eq.$($mentoradoAlheio.id)") "destinatário alheio").id
    }
    patchProprio = [ordered]@{
      progresso_trilha = (Exigir-UmaLinha (Obter-LinhasSinteticas $Url $Cabecalhos "progresso_trilha" "select=id&mentorado_id=eq.$($mentoradoProprio.id)") "progresso próprio").id
    }
    mentoradoAlheioId = $mentoradoAlheio.id
    tokenPropostaPublica = $proposta.token
    propostaId = $proposta.id
  }
}

if ($Verificar) {
  Write-Output "T74_CHECK_OK: modo seguro sem rede, prompt ou segredo."
  exit 0
}

$configuracao = Obter-ConfiguracaoPublica
$chaveSegura = Read-Host -AsSecureString "Cole a Secret key do MentorOS (não será exibida nem salva)"
$chave = $null
$senhas = [ordered]@{}
$senhasSeguras = [ordered]@{}
$tokens = [ordered]@{}
$anteriores = @{}
try {
  $chave = (Converter-ParaTextoPlano $chaveSegura).Trim()
  if (-not ($chave.StartsWith("sb_secret_") -or $chave.StartsWith("eyJ"))) {
    throw "A Secret key administrativa é obrigatória."
  }
  foreach ($papel in $Contas.Keys) {
    $segura = Read-Host -AsSecureString "Senha da conta sintética $papel"
    $senha = Converter-ParaTextoPlano $segura
    if ($senha.Length -lt 12) { throw "A senha da conta sintética $papel é inválida." }
    $senhas[$papel] = $senha
    $senhasSeguras[$papel] = $segura
  }

  $cabecalhos = @{ apikey = $chave }
  $alvos = Montar-AlvosAuditoria $configuracao.Url $cabecalhos
  $propostaId = $alvos.propostaId
  $null = $alvos.Remove("propostaId")
  Exigir-Quantidade (Obter-LinhasSinteticas $configuracao.Url $cabecalhos "proposta_visita" "select=id&proposta_id=eq.$propostaId") "visita sintética antes da auditoria" 1
  foreach ($papel in $Contas.Keys) {
    $tokens[$papel] = Obter-JwtEfemero $configuracao.Url $configuracao.ChaveAnonima $Contas[$papel] $senhas[$papel] $papel
  }

  $variaveis = [ordered]@{
    SUPABASE_AUDIT_URL = $configuracao.Url
    SUPABASE_AUDIT_ANON_KEY = $configuracao.ChaveAnonima
    SUPABASE_AUDIT_MENTORADO_A_TOKEN = $tokens.mentorado
    SUPABASE_AUDIT_COMERCIAL_TOKEN = $tokens.comercial
    SUPABASE_AUDIT_GESTOR_TOKEN = $tokens.gestor
    SUPABASE_AUDIT_ALVOS_JSON = $alvos | ConvertTo-Json -Compress -Depth 5
  }
  foreach ($nome in $variaveis.Keys) {
    $anteriores[$nome] = [Environment]::GetEnvironmentVariable($nome, "Process")
    [Environment]::SetEnvironmentVariable($nome, $variaveis[$nome], "Process")
  }

  $tsx = Join-Path (Split-Path -Parent $PSScriptRoot) "node_modules\\.bin\\tsx.cmd"
  if (-not (Test-Path -LiteralPath $tsx)) { throw "tsx não está instalado; nenhuma auditoria foi executada." }
  & $tsx (Join-Path $PSScriptRoot "auditar-rls-fase2.ts")
  if ($LASTEXITCODE -ne 0) { throw "A auditoria RLS reprovou." }
  Exigir-Quantidade (Obter-LinhasSinteticas $configuracao.Url $cabecalhos "proposta_visita" "select=id&proposta_id=eq.$propostaId") "visita sintética depois da auditoria" 2
} finally {
  foreach ($nome in @($anteriores.Keys)) { [Environment]::SetEnvironmentVariable($nome, $anteriores[$nome], "Process") }
  foreach ($papel in @($senhas.Keys)) { $senhas[$papel] = $null }
  foreach ($papel in @($tokens.Keys)) { $tokens[$papel] = $null }
  $chave = $null
  if ($null -ne $chaveSegura) { $chaveSegura.Dispose() }
  foreach ($papel in @($senhasSeguras.Keys)) { $senhasSeguras[$papel].Dispose() }
}
