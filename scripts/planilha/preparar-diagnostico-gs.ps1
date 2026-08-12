# preparar-diagnostico-gs.ps1 - Raro.ia
#
# Faz duas coisas:
#   1. imprime a impressao digital do segredo do .env.local
#   2. coloca na area de transferencia um trecho curto de codigo para colar
#      no Apps Script, que imprime a impressao digital do valor gravado LA
#
# Impressao digital = SHA-256 encurtado. Serve para comparar dois segredos sem
# mostrar nenhum dos dois. Se as duas digitais forem iguais, o valor gravado no
# projeto que voce edita e o mesmo do .env.local - e entao o /exec so pode estar
# lendo de outro projeto.
#
# Rode assim:
#   powershell -ExecutionPolicy Bypass -File "C:\dev\Repositorios\RARO IA\scripts\planilha\preparar-diagnostico-gs.ps1"

$ErrorActionPreference = 'Stop'

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

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($segredo))
$hex = (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
$digital = $hex.Substring(0, 12)

# Trecho ASCII puro, curto de proposito: quanto menor, menor a chance de
# estragar na colagem.
$codigo = @'

function verSegredoRaro() {
  var v = PropertiesService.getScriptProperties().getProperty('RARO_SEGREDO');
  Logger.log('id do projeto: ' + ScriptApp.getScriptId());
  if (v === null) { Logger.log('RARO_SEGREDO: NAO EXISTE aqui'); return; }
  Logger.log('tamanho: ' + v.length);
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) { h += ('0' + (((b[i] + 256) % 256)).toString(16)).slice(-2); }
  Logger.log('digital: ' + h.substring(0, 12));
}
'@

Set-Clipboard -Value $codigo

Write-Host ''
Write-Host ('DIGITAL DAQUI (do .env.local): ' + $digital) -ForegroundColor Cyan
Write-Host ('Tamanho: ' + $segredo.Length + ' caracteres') -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Anote essa digital. O codigo ja esta na area de transferencia.' -ForegroundColor Green
Write-Host ''
Write-Host 'Agora, no Apps Script:' -ForegroundColor Yellow
Write-Host '  1. Clique em cima do codigo e aperte Ctrl+End'
Write-Host '  2. Aperte Enter duas vezes e depois Ctrl+V'
Write-Host '  3. Ctrl+S para salvar'
Write-Host '  4. Na barra de cima, na caixinha de funcoes, escolha verSegredoRaro'
Write-Host '  5. Clique em Executar'
Write-Host '  6. Copie o Registro de execucao e mande para o Coder'
Write-Host ''
Write-Host 'Se a digital de la for igual a de cima, o valor esta certo e o' -ForegroundColor DarkGray
Write-Host 'problema e que o /exec pertence a outro projeto de script.' -ForegroundColor DarkGray
Write-Host ''

$segredo = $null
[System.GC]::Collect()
