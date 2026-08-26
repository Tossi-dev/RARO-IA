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
$AgenteAdministrativo = "RARO-IA-T74-admin-local/1.0"

function Obter-UrlDoProjeto {
  $raiz = Split-Path -Parent $PSScriptRoot
  $arquivoEnv = Join-Path $raiz ".env.local"
  if (-not (Test-Path -LiteralPath $arquivoEnv)) {
    throw "Não encontrei .env.local para localizar o projeto Supabase."
  }

  $linha = Get-Content -LiteralPath $arquivoEnv |
    Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_URL=" } |
    Select-Object -First 1
  $url = ($linha -replace "^NEXT_PUBLIC_SUPABASE_URL=", "").Trim()
  if ([string]::IsNullOrWhiteSpace($url)) {
    throw "NEXT_PUBLIC_SUPABASE_URL está ausente em .env.local."
  }

  return $url.TrimEnd("/")
}

function Converter-ParaTextoPlano {
  param([Parameter(Mandatory)][Security.SecureString]$Valor)

  $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Valor)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
  }
}

function Falhar-SemSegredo {
  param([string]$Mensagem)
  throw $Mensagem
}

$url = Obter-UrlDoProjeto
if ($Verificar) {
  Write-Output "Verificação aprovada: o script usará apenas as 3 contas sintéticas do auditor e não fará rede neste modo."
  exit 0
}

$chaveSegura = Read-Host -AsSecureString "Cole a Secret key do projeto (não será exibida nem salva)"
$chave = $null
try {
  $chave = (Converter-ParaTextoPlano $chaveSegura).Trim()
  if ([string]::IsNullOrWhiteSpace($chave)) {
    Falhar-SemSegredo "A Secret key é obrigatória."
  }
  if (-not ($chave.StartsWith("sb_secret_") -or $chave.StartsWith("eyJ"))) {
    Falhar-SemSegredo "A chave informada não é uma Secret key do projeto. Use sb_secret_... ou a service_role legada, não token pessoal, publishable, anon ou Vercel."
  }

  # Chaves novas `sb_secret_...` não são JWTs: enviá-las como Bearer faz o
  # gateway rejeitar a chamada como "Invalid JWT". O cabeçalho `apikey` serve
  # também para a chave `service_role` legada e mantém a compatibilidade.
  $cabecalhos = @{ apikey = $chave }
  try {
    $lista = Invoke-RestMethod -Method Get -Uri "$url/auth/v1/admin/users?per_page=100&page=1" -Headers $cabecalhos -UserAgent $AgenteAdministrativo
  } catch {
    $codigo = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "indisponível" }
    Falhar-SemSegredo "Não foi possível listar as contas sintéticas (HTTP $codigo). Confira a Secret key e o projeto selecionado."
  }

  $usuarios = if ($null -ne $lista.users) { @($lista.users) } else { @($lista) }
  $usuariosPorPapel = [ordered]@{}
  foreach ($papel in $Contas.Keys) {
    $email = $Contas[$papel]
    $usuario = @($usuarios | Where-Object { $_.email -eq $email })
    if ($usuario.Count -ne 1) {
      Falhar-SemSegredo "A conta sintética de $papel não foi encontrada exatamente uma vez. Nenhuma senha foi alterada."
    }
    $usuariosPorPapel[$papel] = $usuario[0]
  }

  $senhasPorPapel = [ordered]@{}
  $senhasSeguras = [ordered]@{}
  foreach ($papel in $Contas.Keys) {
    $senhaSegura = Read-Host -AsSecureString "Defina a senha da conta $papel (mínimo 12 caracteres)"
    try {
      $senha = Converter-ParaTextoPlano $senhaSegura
      if ($senha.Length -lt 12) {
        Falhar-SemSegredo "A senha de $papel precisa ter ao menos 12 caracteres."
      }
      $senhasPorPapel[$papel] = $senha
      $senhasSeguras[$papel] = $senhaSegura
      $senhaSegura = $null
    } finally {
      $senha = $null
      if ($null -ne $senhaSegura) { $senhaSegura.Dispose() }
    }
  }

  try {
    foreach ($papel in $Contas.Keys) {
      $usuario = $usuariosPorPapel[$papel]
      $senha = $senhasPorPapel[$papel]
      $corpo = @{ password = $senha } | ConvertTo-Json -Compress
      try {
        Invoke-RestMethod -Method Put -Uri "$url/auth/v1/admin/users/$($usuario.id)" -Headers $cabecalhos -UserAgent $AgenteAdministrativo -ContentType "application/json" -Body $corpo | Out-Null
      } catch {
        Falhar-SemSegredo "Não foi possível atualizar a senha de $papel. As outras contas não serão processadas."
      }
      Write-Output "Senha da conta sintética $papel definida."
    }
  } finally {
    foreach ($papel in @($senhasPorPapel.Keys)) { $senhasPorPapel[$papel] = $null }
    foreach ($papel in @($senhasSeguras.Keys)) { $senhasSeguras[$papel].Dispose() }
  }

  Write-Output "Pronto. Teste os três papéis em http://localhost:3002/login e use Sair no menu do avatar entre os testes."
} finally {
  $chave = $null
  if ($null -ne $chaveSegura) { $chaveSegura.Dispose() }
}
