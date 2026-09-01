# Prontidão operacional local

Antes de um commit ou troca de máquina, execute:

```powershell
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\tsx\dist\cli.mjs' .\scripts\verificar-prontidao-local.ts
```

O verificador usa apenas `git ls-files`: analisa nomes já rastreados, nunca
abre `.env` e nunca mostra um valor. Ele bloqueia arquivos de ambiente reais,
chaves e artefatos gerados. `.env.example` é permitido porque documenta nomes,
não segredos.

Quando houver bloqueio, remova somente o caminho confirmado do **índice** com
`git rm --cached -- <caminho>` e mantenha o arquivo local. Em seguida execute
o verificador outra vez. Não cole chave, token ou conteúdo de `.env` no
terminal, no Git ou em conversas.

Esta verificação não substitui autorização para banco, deploy ou produção.
