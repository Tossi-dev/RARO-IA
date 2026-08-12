# Conectar o seu Claude ao Raro.ia

Este guia é para o dono do negócio. No fim dele, você abre o Claude, pergunta
*"como está o mês?"* ou *"com quem eu falo hoje?"* e ele responde lendo o seu
sistema — sem você abrir o painel, e **sem contratar chave de API nenhuma**:
usa a assinatura do Claude que você já paga.

O que torna isso possível é um **servidor MCP** publicado dentro do próprio
Raro.ia, no endereço `/api/mcp`. Você cola esse endereço em Conectores, e o
Claude passa a enxergar cinco ferramentas de consulta.

> **Nesta versão o Claude só LÊ.** Não existe nenhuma ferramenta que crie,
> altere, aprove ou envie coisa alguma. Se você pedir "manda mensagem para o
> Marcos", ele vai explicar que não consegue e dizer o que você precisa fazer
> no sistema. Isso é decisão de projeto, não limitação técnica: primeiro a
> gente confere se ele lê certo; escrever vem depois, com aprovação humana
> desenhada.

---

## Antes de tudo: leia isto uma vez

Quem se conecta ao Raro.ia **não é o aplicativo do Claude no seu computador** —
são os servidores da Anthropic, em nome dele. Duas consequências práticas:

1. O endereço precisa ser **público na internet** (a Vercel já é). Não adianta
   apontar para `localhost`.
2. Qualquer pessoa que descubra o endereço **e o token** lê o seu financeiro e
   a conversa dos seus clientes. O token é uma senha. Trate como senha.

---

## Passo 1 — Criar o token

O token é um texto secreto, longo e aleatório. Ele precisa ter **no mínimo 12
caracteres**; abaixo disso o sistema trata o conector como desligado e recusa
tudo, de propósito.

Gere um no terminal (Mac):

```bash
openssl rand -base64 32
```

Copie o resultado. Não mande esse texto por WhatsApp, não cole em conversa com
ninguém e não guarde em bloco de notas compartilhado.

---

## Passo 2 — Ligar o conector no servidor

Na Vercel, no projeto do Raro.ia:

**Settings → Environment Variables → Add**

| Campo | Valor |
| --- | --- |
| Name | `RARO_MCP_TOKEN` |
| Value | o texto que você gerou no Passo 1 |
| Environments | Production |

Salve e faça um **Redeploy** (variável nova só vale depois que o servidor
reinicia).

**Enquanto essa variável não existir, o conector não funciona — e isso é
intencional.** Sem ela o endereço responde "o conector não está ativado" e
recusa todo mundo. Ele nunca fica aberto por esquecimento de configuração.

---

## Passo 3 — Adicionar o conector no Claude

1. Abra o Claude (aplicativo do computador ou claude.ai).
2. Vá em **Personalizar → Conectores** (em conta Team/Enterprise, quem faz isso
   é o proprietário, em *Configurações da organização → Conectores*).
3. Clique em **Adicionar conector personalizado**.
4. Em **URL do servidor MCP remoto**, cole:

   ```
   https://SEU-ENDERECO.vercel.app/api/mcp
   ```

   (troque `SEU-ENDERECO` pelo domínio real do seu Raro.ia)

5. Abra a seção **Cabeçalhos de requisição** (*Request headers*).
   - Nome do cabeçalho: `Authorization`
   - Valor: `Bearer ` **seguido do seu token** — com a palavra `Bearer`, um
     espaço, e então o token.

   > O Claude envia o valor **exatamente como você digitar**. Ele não
   > acrescenta a palavra `Bearer` sozinho. Se você digitar só o token, o
   > servidor recusa.
   >
   > Exemplo do que digitar no campo de valor:
   > `Bearer 7Kq2f9XyR3...`

6. Clique em **Adicionar**.

Se der certo, o conector aparece na lista e, dentro de uma conversa, o botão
**+ → Conectores** mostra "Raro.ia — negócio e CRM" com cinco ferramentas.

### Se o campo "Cabeçalhos de requisição" não aparecer

Esse campo é recente e a Anthropic está liberando aos poucos. Se a sua conta
ainda não tiver, **não existe outro jeito de colar o token** — o Claude vai
tentar um fluxo de OAuth que este servidor não fala, e a conexão falha com
erro de autorização.

O que fazer:

- Peça a liberação do recurso ao suporte da Anthropic (é liberação por conta,
  não por plano).
- Ou avise quem cuida do sistema: a alternativa é implementar OAuth de verdade
  no Raro.ia, que é um trabalho maior (endpoints de autorização, registro
  dinâmico de cliente e emissão de token).

Não existe atalho seguro no meio do caminho. Deixar o endereço sem token para
"resolver depois" significaria publicar o seu financeiro e a conversa dos seus
clientes em endereço aberto.

---

## O que o Claude passa a saber perguntar

| Ferramenta | Responde a pergunta |
| --- | --- |
| `buscar_cliente` | "Quem é o Marcos?" — acha por nome, telefone (em qualquer escrita) ou e-mail |
| `historico_do_cliente` | "O que já rolou com a Marina?" — conversas, atividades, compras e a temperatura do lead, com o porquê |
| `fila_do_dia` | "Com quem eu falo hoje?" — na ordem de atenção, e quem está esperando resposta fura a fila |
| `resumo_do_negocio` | "Como está o mês?" — faturamento, custos, lucro, meta, ritmo e caixa |
| `alertas` | "O que precisa de mim agora?" — ordenado por reais em jogo |

Exemplos de pergunta que funcionam bem:

- *"Como está o faturamento do trimestre contra a meta?"*
- *"Quem está esperando resposta há mais tempo?"*
- *"Me dá o histórico do cliente de telefone 14 99123-4567."*
- *"Quais são os três alertas mais caros agora?"*

### Toda resposta diz de onde o número veio

Cada resultado termina com uma linha **`Origem:`** — qual base foi lida e qual
função calculou. O Claude foi instruído a repetir essa linha para você.

Isso existe para um caso específico: se o servidor estiver em modo de
demonstração, a linha diz **DEMONSTRAÇÃO (dados fictícios)**. Número dito com
confiança e sem procedência é como um sistema de gestão perde a confiança de
quem usa — e uma vez perdida, não volta.

**Se a linha de origem não aparecer, desconfie da resposta.**

Os números são calculados pelas **mesmas funções que desenham o painel**. Se o
Claude disser um faturamento diferente do que está na tela para o mesmo
período, isso é um defeito — relate.

---

## Segurança, em quatro linhas

- O token é uma senha do seu negócio inteiro. Não compartilhe.
- Para trocá-lo: mude `RARO_MCP_TOKEN` na Vercel, faça redeploy e atualize o
  valor no conector. O antigo para de funcionar na hora.
- Para desligar tudo de uma vez: apague a variável `RARO_MCP_TOKEN` e faça
  redeploy. O endereço passa a recusar todo mundo, inclusive quem tem o token
  antigo.
- O servidor nunca escreve o token em registro, em erro nem em resposta — e
  nunca explica *por que* uma tentativa foi recusada, porque explicar ajudaria
  quem está tentando adivinhar.

---

## Quando alguma coisa não funcionar

| O que você vê | O que é | O que fazer |
| --- | --- | --- |
| "o conector não está ativado" | `RARO_MCP_TOKEN` não existe no servidor | Passo 2, e redeploy |
| Erro de autorização ao conectar | Token errado, ou faltou o `Bearer ` no começo do valor | Refazer o Passo 3 item 5 |
| O Claude abre uma tela de login/autorização | O campo de cabeçalho não foi preenchido (ou não existe na sua conta) | Ver "Se o campo não aparecer", acima |
| Conecta, mas todo número vem zerado | O servidor está sem base conectada | A linha `Origem:` vai dizer isso; é configuração do Raro.ia, não do conector |
| O Claude quer criar/enviar algo | Não existe ferramenta de escrita nesta versão | Faça pelo painel |

---

## Detalhe técnico (para quem for mexer no código)

- Endpoint: `src/app/api/mcp/route.ts` — transporte *Streamable HTTP* da
  especificação MCP **2025-06-18**, com compatibilidade anunciada para
  `2025-03-26` e `2024-11-05`.
- `POST` recebe uma mensagem JSON-RPC 2.0 por requisição (lote em *array* saiu
  da especificação nesta revisão e é recusado). Responde `application/json`,
  ou `text/event-stream` quando o cliente só aceita SSE. Notificação recebe
  `202` sem corpo.
- `GET` e `DELETE` respondem `405`: o servidor não empurra mensagem e não
  mantém sessão (`Mcp-Session-Id` não é emitido — em função serverless, sessão
  em memória seria encontrada às vezes e perdida às vezes).
- Métodos implementados: `initialize`, `ping`, `tools/list`, `tools/call`,
  além de aceitar as notificações do cliente.
- O `401` sai **sem** cabeçalho `WWW-Authenticate`, de propósito: esse
  cabeçalho é o que empurra o cliente para a descoberta de OAuth, e este
  servidor não fala OAuth.
