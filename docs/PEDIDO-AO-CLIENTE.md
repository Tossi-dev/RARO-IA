# O que pedir ao dono da planilha

Documento curto de propósito: existe **uma** coisa a pedir ao cliente, e não é
um tutorial.

## A descoberta que encurta o pedido

Para abrir `Extensões > Apps Script` numa planilha **não é preciso ser dono
dela**. Basta ter permissão de **Editor**.

Isso muda completamente o tamanho do pedido:

| Caminho | O que o cliente precisa fazer | Risco |
| --- | --- | --- |
| ❌ Ele publica o Web App | Abrir o editor de script, colar 600 linhas, criar uma propriedade de script, publicar uma implantação escolhendo três opções corretas, copiar uma URL | Alto: qualquer passo errado gera um erro que ele não sabe ler, e a conversa vira suporte técnico por WhatsApp |
| ✅ Ele te dá acesso de Editor | Um clique em **Compartilhar**, digitar o e-mail, escolher **Editor**, enviar | Nenhum: é a mesma permissão de quem edita a planilha no dia a dia |

**Peça a segunda.** Depois disso o passo do `RARO_SHEETS_WEBAPP_URL` deixa de
depender dele — é você quem publica.

## Mensagem pronta para mandar

> Oi! Para o painel conseguir **gravar** de volta na planilha (hoje ele só lê),
> preciso instalar um script dentro dela. Consegue me adicionar como **Editor**?
>
> É em **Compartilhar** (botão azul no canto superior direito da planilha) →
> digita meu e-mail → escolhe **Editor** no menu ao lado → **Enviar**.
>
> Meu e-mail: `guilhermetossi2@gmail.com`
>
> É a mesma permissão de quem edita a planilha normalmente — não transfere a
> propriedade e você continua dono do arquivo, podendo remover o acesso quando
> quiser.

Se o cliente perguntar o que o script faz, a resposta honesta e curta:

> Ele só acrescenta linhas nas abas de lançamento (vendas, despesas,
> recebíveis, leads). As abas de resumo — PAINEL, DRE e FLUXO_CAIXA — são
> **bloqueadas por código**: o script recusa escrever nelas, porque são fórmulas
> suas e sobrescrevê-las apagaria seu trabalho.

## O que NÃO é preciso pedir

**Leitura já funciona.** O endpoint que o sistema usa para ler a planilha é
público e não pede login — foi verificado por requisição real, e ele devolve o
cabeçalho verdadeiro da aba VENDAS. Ou seja:

- `RARO_SHEETS_ID` sozinho já põe o painel lendo os dados reais.
- O acesso de Editor é necessário **só para a escrita**.

Isso significa que o sistema pode ir ao ar **hoje**, em modo só leitura,
enquanto a conversa com o cliente acontece. Em modo só leitura ele mostra a
planilha de verdade e, ao tentar gravar, recusa dizendo qual variável falta —
nunca inventa número para preencher a tela.

## Depois que o acesso chegar

1. Abrir a planilha → `Extensões` → `Apps Script`
2. Seguir `docs/PUBLICAR-APPS-SCRIPT.md` do começo ao fim (é você executando, não ele)
3. Rodar `scripts\planilha\configurar-planilha.ps1` — testa o Web App, cria as
   abas novas e calcula as variáveis
4. Preencher `RARO_SHEETS_WEBAPP_URL` no `.env.local`
5. Rodar `scripts\planilha\configurar-vercel.ps1` — registra as três variáveis
6. Rodar `deploy-vercel.bat`
7. Abrir https://raro-ia.vercel.app e conferir que a escrita passou a funcionar
