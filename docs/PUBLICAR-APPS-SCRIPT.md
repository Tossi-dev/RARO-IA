# Publicar o Apps Script da planilha

Isso aqui é feito **uma vez**. No fim você vai ter duas coisas para colar na Vercel: uma URL e um
segredo. Reserve uns 15 minutos.

O que você está montando: um endereço de escrita para a planilha
`Base_Financeira_Operacao`. A leitura já funciona sem nada disso. O que falta é o caminho de
volta, para o sistema conseguir gravar uma venda, um recebível ou uma despesa direto na planilha.

Você vai precisar estar logado na conta Google que é **dona** da planilha.

---

## 1. Gerar o segredo (faça isso antes de tudo)

O segredo é a senha que separa "o sistema Raro.ia escrevendo na planilha" de "qualquer pessoa na
internet escrevendo na planilha". Ele precisa ser longo e aleatório, não uma frase que você
inventou.

Gere um assim, no PowerShell do Windows:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Ou, se estiver num terminal Linux ou Mac:

```bash
openssl rand -base64 36
```

Você vai ver uma sequência sem sentido de uns 48 caracteres. **É essa.** Cole num lugar
temporário — vai usar duas vezes nos próximos minutos.

**Onde esse segredo mora, no fim:** em dois lugares e só dois. Nas Propriedades do Script (passo
4) e nas variáveis de ambiente da Vercel (passo 10). **Não cole o segredo em nota do Obsidian, em
mensagem de WhatsApp ou em README.** Se quiser deixar registrado no vault, registre a
*referência*: "o segredo do Apps Script está nas Propriedades do Script da planilha
Base_Financeira_Operacao e na variável `RARO_SHEETS_SEGREDO` do projeto na Vercel". Isso basta
para você se localizar daqui a seis meses, e não vaza nada se o vault vazar.

---

## 2. Abrir o editor de script

1. Abra a planilha `Base_Financeira_Operacao` no navegador.
2. No menu de cima, clique em **Extensões** e depois em **Apps Script**.

Abre uma aba nova, fundo escuro, com um arquivo chamado `Código.gs` e umas três linhas dentro:

```javascript
function myFunction() {

}
```

No topo, o projeto vai estar com um nome genérico tipo "Projeto sem título". Clique nesse nome e
troque para **Raro.ia Sync**. Só para você achar depois.

---

## 3. Colar o código

1. Clique dentro do editor, no meio daquelas três linhas.
2. Selecione tudo (`Ctrl+A`) e apague.
3. Abra o arquivo `scripts/planilha/raro-sync.gs` do repositório, copie o conteúdo inteiro e cole
   ali.
4. Salve com `Ctrl+S`. O ícone de disquete no topo pisca e some.

O editor vai mostrar umas 940 linhas. À esquerda, embaixo de "Arquivos", continua aparecendo
`Código.gs` — o nome do arquivo não importa, o conteúdo sim.

Se aparecer alguma marcação vermelha, você provavelmente colou por cima de algo que sobrou.
Selecione tudo e cole de novo.

---

## 4. Cadastrar o segredo nas Propriedades do Script

O segredo **não fica dentro do código**, porque o código vai para o GitHub. Ele fica numa gaveta
separada do projeto do Apps Script.

1. Na barra lateral esquerda, clique na engrenagem: **Configurações do projeto**.
2. Role até o fim da página, até a seção **Propriedades do script**.
3. Clique em **Adicionar propriedade de script**.
4. Em **Propriedade**, escreva exatamente: `RARO_SEGREDO`
5. Em **Valor**, cole o segredo que você gerou no passo 1.
6. Clique em **Salvar propriedades do script**.

A propriedade aparece listada na tabela. O valor fica visível para quem tem acesso ao projeto —
por isso ele não é uma senha sua, é um segredo de máquina.

Escreveu `RARO_SEGREDO` com underline no meio e tudo maiúsculo? Confere de novo. Se o nome
estiver diferente, o script não acha e recusa tudo com "nao autorizado".

---

## 5. Publicar como Aplicativo da Web

1. Botão azul **Implantar** no canto superior direito, depois **Nova implantação**.
2. Abre uma janela. No canto esquerdo, ao lado de "Selecionar tipo", tem uma engrenagem.
   Clique nela e escolha **Aplicativo da Web**.
3. Preencha:
   - **Descrição**: `Raro.ia sync v2`
   - **Executar como**: **Eu (seu-email@gmail.com)** — precisa ser você, porque é a sua conta que
     tem permissão de escrever na planilha.
   - **Quem pode acessar**: **Qualquer pessoa**
4. Clique em **Implantar**.

Sobre o "Qualquer pessoa": é o que permite o servidor do sistema chamar a URL sem fazer login do
Google. Quem protege a planilha é o segredo do passo 4 — sem ele, toda requisição volta
`{"ok":false,"erro":"nao autorizado"}` e nada é escrito.

---

## 6. Autorizar o acesso (a tela do aviso amarelo)

Na primeira implantação o Google pede autorização. É aqui que quase todo mundo trava, então vai
com calma:

1. Aparece **Autorizar acesso**. Clique.
2. Abre uma janela de escolher conta. Escolha a conta dona da planilha.
3. Aparece uma tela cinza: **"O Google não verificou este app"**. Isso é normal e esperado — o
   app é seu, escrito por você, e você não pagou os 300 dólares de verificação do Google para
   um script que só a sua operação usa.
4. Clique em **Avançado**, o link pequeno embaixo à esquerda.
5. A tela expande e mostra **"Acessar Raro.ia Sync (não seguro)"**. Clique nesse link.
6. Na tela seguinte, o Google lista o que o script quer poder fazer: ver, editar, criar e excluir
   suas planilhas do Google, e se conectar a um serviço externo. Clique em **Permitir**.

Feito isso, volta a janela da implantação com o resultado.

---

## 7. Copiar a URL

A janela mostra **"Implantação atualizada"** com duas informações:

- **ID de implantação** — não precisa.
- **URL do app da Web** — **essa é a que interessa.**

Ela é comprida e termina em `/exec`, mais ou menos assim:

```
https://script.google.com/macros/s/AKfycb...................../exec
```

Clique em **Copiar** ao lado dela. Guarde junto do segredo, temporariamente.

Se terminar em `/dev` em vez de `/exec`, você copiou a URL de teste. A que vale é a `/exec`.

---

## 8. Testar antes de sair daqui

São dois testes. O primeiro confirma que a implantação está no ar; o segundo confirma que o
segredo está certo.

### 8a. A implantação está no ar?

Cole a URL do passo 7 no navegador, sem acrescentar nada, e dê Enter. Você deve ver:

```json
{"ok":true,"servico":"raro-sync","versao":"2.1.0"}
```

Só isso. Sem nome de planilha, sem lista de abas, sem contagem de linhas — **e é de propósito.**
Esse endereço é público: qualquer pessoa que tenha a URL chega nele. Ele responde "estou vivo" e
nada mais, porque um endereço público não conta o que existe do outro lado.

**Se aparecer uma página de erro do Google, ou pedir login:** a implantação ficou com "Quem pode
acessar" diferente de "Qualquer pessoa". Refaça o passo 5.

**Se aparecer erro de script:** volte ao editor, confira se o código foi colado inteiro.

### 8b. O segredo está certo?

**O segredo nunca vai na barra de endereço.** Tudo que você digita ali fica gravado no histórico
do navegador, no log de "Execuções" do Apps Script e em qualquer intermediário no caminho — e
fechar a aba depois não apaga nenhum dos três. Por isso o segredo viaja no *corpo* de um POST,
que não fica registrado em lugar nenhum desses.

Abra o PowerShell no Windows e rode, trocando as duas partes:

```powershell
$url = "COLE_AQUI_A_URL_QUE_TERMINA_EM_EXEC"
$corpo = @{ segredo = "COLE_AQUI_O_SEGREDO"; acao = "ping" } | ConvertTo-Json
Invoke-RestMethod -Uri $url -Method Post -Body $corpo -ContentType "application/json"
```

No Linux ou Mac, o mesmo por `curl`:

```bash
curl -sS -X POST "COLE_AQUI_A_URL_QUE_TERMINA_EM_EXEC" \
  -H "Content-Type: application/json" \
  -d '{"segredo":"COLE_AQUI_O_SEGREDO","acao":"ping"}'
```

Resposta esperada: `ok` verdadeiro, a versão, o nome da planilha, o fuso e a lista `abas` com a
contagem de linhas de cada uma. Se `ok` for `true`, está publicado e autenticando.

**Se aparecer `{"ok":false,"erro":"nao autorizado"}`:** o segredo que você mandou não bate com o
do passo 4. Volte em Configurações do projeto, confira o nome `RARO_SEGREDO` e o valor.

---

## 9. Adaptar a planilha (rodar `criarAbas` uma vez)

Este passo cria as 15 abas novas que o sistema precisa: `ALUNOS`, `PRODUTOS`, `RESPONSAVEIS`,
`LANCAMENTOS`, `CONTAS`, `MOVIMENTOS`, `CHARGEBACKS`, `CAMPANHAS`, `CONTEUDOS`, `TAREFAS`,
`ATIVIDADES`, `REUNIOES`, `COBRANCAS`, `INGESTAO` e `DESPESAS_RECORRENTES`.

**O que ele não faz:** não mexe em nenhuma aba que já existe, não muda a ordem das abas, não
apaga nada. As abas novas entram no fim, depois de todas as suas. Rodar duas vezes é seguro: na
segunda vez ele não faz nada e responde que as abas já existiam.

Como `criarAbas` é escrita, vai por POST — o mesmo caminho do passo 8b, e pela mesma razão: o
segredo fica no corpo, fora do histórico e fora dos logs. Abra o PowerShell no Windows e rode,
trocando as duas partes:

```powershell
$url = "COLE_AQUI_A_URL_QUE_TERMINA_EM_EXEC"
$corpo = @{ segredo = "COLE_AQUI_O_SEGREDO"; acao = "criarAbas" } | ConvertTo-Json
Invoke-RestMethod -Uri $url -Method Post -Body $corpo -ContentType "application/json"
```

Resposta esperada:

```
ok        criadas                                          jaExistiam
--        -------                                          ----------
True      {ALUNOS, PRODUTOS, RESPONSAVEIS, LANCAMENTOS...} {}
```

Volte na planilha. Lá embaixo, depois das abas que já existiam, apareceram as 15 novas, cada uma
com o cabeçalho na linha 1 em negrito e a primeira linha congelada.

Se `criadas` vier vazio e `jaExistiam` vier com os 15 nomes, é porque já rodou antes. Está certo.

Quem publicou o script antes da versão `2.1.0` já tinha 12 abas criadas. Rodar `criarAbas` de
novo depois de colar o script atualizado é seguro e é o esperado: as 12 antigas voltam em
`jaExistiam` e as três da coleta automática (`COBRANCAS`, `INGESTAO`, `DESPESAS_RECORRENTES`)
aparecem em `criadas`.

---

## 10. Colar as variáveis na Vercel

1. Abra [vercel.com](https://vercel.com), entre no projeto `raro-ia`.
2. **Settings** no menu de cima, **Environment Variables** na lista da esquerda.
3. Cadastre as três, uma de cada vez. Em cada uma, marque **Production**, **Preview** e
   **Development**:

| Name | Value |
|---|---|
| `RARO_SHEETS_ID` | o ID da planilha (o pedaço da URL entre `/d/` e `/edit`) |
| `RARO_SHEETS_WEBAPP_URL` | a URL do passo 7, terminada em `/exec` |
| `RARO_SHEETS_SEGREDO` | o segredo do passo 1 |

4. **Save** em cada uma.
5. Vá em **Deployments**, abra o deploy mais recente, menu de três pontos, **Redeploy**.
   Variável de ambiente nova só vale depois de um deploy novo.

Nenhuma das três leva prefixo `NEXT_PUBLIC_`. Tudo com `NEXT_PUBLIC_` é embutido no JavaScript
que chega no navegador de quem abre o site — qualquer visitante lê com Ctrl+U. Um segredo
publicado assim entrega permissão de escrita na planilha financeira da operação para o mundo
inteiro. As três ficam server-only.

---

## Pronto. E depois?

**Se você mudar o `raro-sync.gs`:** cole o código novo no editor, salve, e vá em **Implantar**,
**Gerenciar implantações**, ícone de lápis, **Versão: Nova versão**, **Implantar**. A URL
continua a mesma. Se você criar uma implantação *nova* em vez de atualizar a existente, a URL
muda e você precisa atualizar a Vercel.

**Se o segredo vazar:** gere outro (passo 1), troque nas Propriedades do Script (passo 4) e na
Vercel (passo 10), e faça o redeploy. Não precisa republicar nada.

**Para conferir se está tudo de pé depois:** os dois testes do passo 8 funcionam a qualquer
momento. O 8a (abrir a URL) responde só "estou vivo"; o 8b (POST com `acao: "ping"`) é o que
mostra as abas e a contagem de linhas. Nunca cole o segredo na barra de endereço para testar —
de lá ele não sai mais do histórico nem dos logs.

**Se um dia der errado:** o log fica no editor do Apps Script, em **Execuções** na barra lateral
esquerda. Mostra cada chamada, o horário e o erro.

**O que nunca fazer:** o sistema não escreve em `PAINEL`, `DRE`, `FLUXO_CAIXA`, `INSTRUCOES` e
`CONFIG`. Isso está travado no código, na lista `ABAS_PROIBIDAS`. As três primeiras são
calculadas por fórmula, e gravar valor em cima de fórmula apaga a fórmula em silêncio: o painel
para de calcular e ninguém percebe até o número não bater. Se um dia alguém pedir para tirar uma
aba dessa lista, a resposta é não.

A trava não é sensível a maiúscula, acento nem separador: `PAINEL`, `Painel`, `FLUXO_CAIXA`,
`Fluxo-Caixa`, `FLUXO CAIXA` e `INSTRUÇÕES` são todos recusados igualmente. Isso importa porque
o POST direto por PowerShell (passos 8b e 9) não passa pela checagem do sistema — nesse caminho o
`raro-sync.gs` é a única defesa.
