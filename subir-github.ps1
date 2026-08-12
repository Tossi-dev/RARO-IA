# Sobe as alteracoes do projeto Raro.ia para o GitHub.
# Da duplo-clique em subir-github.bat sempre que quiser subir uma alteracao.
# Roda tudo na SUA maquina, com a credencial que o Windows/Git Credential
# Manager ja guardou. Nenhum token e digitado/colado aqui.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "=== Subir Raro.ia para o GitHub ===" -ForegroundColor Cyan

$repoUrl = "https://github.com/Tossi-dev/raro-ia.git"

# Limpa lock travado (OneDrive as vezes segura o arquivo)
if(Test-Path ".git\index.lock"){
  Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
}

# Inicializa o repo se ainda nao existe
if(-not (Test-Path .git)){
  Write-Host "Inicializando repositorio git..." -ForegroundColor Yellow
  git init | Out-Null
}

# Garante identidade de commit (so define se estiver vazia)
$hasName = (git config user.name) 2>$null
if(-not $hasName){ git config user.name "Tossi-dev" }
$hasEmail = (git config user.email) 2>$null
if(-not $hasEmail){ git config user.email "tossi-dev@users.noreply.github.com" }

# Configura o remote origin
$remotes = git remote
if($remotes -notcontains "origin"){
  git remote add origin $repoUrl
} else {
  git remote set-url origin $repoUrl
}

# Garante branch main
$branch = git branch --show-current
if($branch -ne "main"){
  git branch -M main
}

# Add + commit
git add -A
$staged = git diff --cached --name-only
if($staged){
  $msg = "sync: " + (Get-Date -Format "yyyy-MM-dd HH:mm")
  git commit -m $msg | Out-Null
  Write-Host ("Commit criado: " + $msg) -ForegroundColor Green
} else {
  Write-Host "Nada novo para commitar." -ForegroundColor Yellow
}

# Push
Write-Host "Enviando para o GitHub..." -ForegroundColor Cyan
Write-Host "(Se o repositorio ainda nao existir, crie-o vazio em github.com/new com o nome raro-ia)" -ForegroundColor DarkGray
git push -u origin main

Write-Host "`n=== Concluido ===" -ForegroundColor Green
Write-Host ("Repositorio: " + $repoUrl.Replace(".git",""))
Read-Host "Enter para fechar"
