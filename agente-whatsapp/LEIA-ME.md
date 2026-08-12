# Agente de WhatsApp do Raro.ia

Este programa fica no seu MacBook e faz duas coisas:

1. copia as suas conversas de WhatsApp para o histórico do cliente no Raro.ia;
2. envia as mensagens que **você aprovou** dentro do Raro.ia.

Ele nunca escreve nada por conta própria. Se você não aprovou, não sai.

## O combinado, em uma frase

**O WhatsApp só funciona com o notebook ligado.** Não existe servidor: quem
conversa com o Raro.ia é a sua máquina. Notebook fechado, tampa baixada ou sem
internet significa WhatsApp parado — e o Raro.ia mostra isso na tela, em vez de
fingir que está conectado. Nada se perde: o que chegou fica guardado aqui e sobe
quando você abrir o notebook de novo.

---

## Primeira instalação

Você vai precisar de duas informações, que estão no Raro.ia (ou com quem
configurou ele para você):

- o **endereço do seu Raro.ia** (algo como `https://raro-ia.vercel.app`);
- a **senha do agente** (a mesma configurada no servidor).

### Passo 1 — instalar o Node.js

O programa roda em cima do Node.js. Se você nunca instalou:

1. abra <https://nodejs.org>;
2. clique no botão da esquerda (a versão **LTS**);
3. abra o arquivo baixado e vá clicando em "Continuar" até o fim.

### Passo 2 — clicar em `instalar.command`

Abra esta pasta no Finder e **dê dois cliques em `instalar.command`**.

> Se o macOS disser que "não pode ser aberto porque é de um desenvolvedor não
> identificado": clique com o **botão direito** no arquivo, escolha **Abrir** e
> confirme em **Abrir** de novo. Isso só é preciso na primeira vez.

Uma janela preta (o Terminal) vai abrir e conduzir você:

1. ele abre um arquivo de configuração para você preencher.
   Coloque o endereço na frente de `BASE_URL=` e a senha na frente de
   `RARO_AGENTE_SEGREDO=`. Salve com **Cmd+S** e feche a janela do texto;
2. ele baixa o que precisa. **Da primeira vez demora alguns minutos**, porque
   junto vem um navegador que roda o WhatsApp Web por dentro;
3. ele mostra um **QR Code** na janela preta.

### Passo 3 — ler o QR Code

No **celular**:

**WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho**

Aponte a câmera para o QR Code na tela do Mac.

Quando aparecer `WhatsApp conectado e pronto`, aperte **Control + C** e o
instalador termina sozinho. A partir daí o agente sobe junto com o Mac, toda vez
que você liga.

---

## O dia a dia

Não tem dia a dia. Ele trabalha sozinho, sem janela e sem ícone.

Para conferir se está funcionando, abra o Raro.ia: a tela mostra se o WhatsApp
está ligado agora e a que horas ele falou com o sistema pela última vez.

---

## Quando alguma coisa parar

### "O Raro.ia diz que o WhatsApp está desligado"

Confira, nesta ordem:

1. o **notebook está ligado** e com a tampa aberta?
2. tem **internet**?
3. o celular do WhatsApp está ligado e com internet? O WhatsApp Web depende dele.

Se estiver tudo certo e continuar desligado, vá para o próximo item.

### "Preciso ler o QR Code de novo"

Isso acontece quando você desconecta o aparelho pelo celular, troca de celular,
ou fica muito tempo sem usar. É rápido:

1. dê dois cliques em **`parar.command`**;
2. dê dois cliques em **`instalar.command`**;
3. leia o QR Code quando ele aparecer;
4. aperte **Control + C**.

### "Quero desligar por uns dias"

Dois cliques em **`parar.command`**. Ele para e não volta sozinho no próximo
login. Para religar, dois cliques em `instalar.command` — a sessão do WhatsApp
continua salva e o QR **não** vai ser pedido de novo.

### "Quero ver o que aconteceu"

Nesta pasta ficam `agente-saida.log` e `agente-erros.log`. Dois cliques abrem os
dois no editor de texto. Procure pelas linhas com `ERRO`.

---

## Perguntas que costumam aparecer

**Ele lê conversa de grupo?**
Não. Mensagem de grupo é descartada aqui mesmo, antes de sair da sua máquina.
Grupo não pertence à ficha de nenhum cliente.

**Ele responde meus clientes sozinho?**
Nunca. Ele só envia o que apareceu na fila do Raro.ia, e só aparece na fila o
que uma pessoa aprovou lá — com nome e horário de quem aprovou.

**Ele manda mensagem rápido demais? Meu número pode ser banido?**
O programa tem um freio de mão: **no máximo 1 mensagem a cada 20 segundos e 30
por hora**, sempre. Se você aprovar 40 mensagens de uma vez, elas saem aos
poucos ao longo do dia. É de propósito: disparo em rajada é justamente o que faz
o WhatsApp banir um número, e o número aqui é o seu, pessoal.

**E se a internet cair no meio?**
As mensagens ficam guardadas em um arquivo aqui na máquina e sobem quando a rede
voltar. Elas não se perdem nem se duplicam.

**Onde ficam meus dados?**
Em `~/Library/Application Support/RaroAgenteWhatsApp` — a sessão do WhatsApp, as
filas e o log. Nada disso vai para lugar nenhum além do seu próprio Raro.ia.

**Alguém consegue entrar no meu Mac por causa disso?**
Não. O programa só faz conexão de **saída**: é sempre ele que liga para o
Raro.ia, nunca o contrário. Não há porta aberta nem endereço público apontando
para a sua máquina.

---

## Recomeçar do zero (só se alguém pedir)

Isto apaga a sessão do WhatsApp e o que ainda não subiu. Use apenas se orientado:

1. dois cliques em `parar.command`;
2. no Finder, aperte **Cmd+Shift+G**, cole
   `~/Library/Application Support/RaroAgenteWhatsApp` e mova a pasta para o lixo;
3. dois cliques em `instalar.command` e leia o QR Code de novo.
