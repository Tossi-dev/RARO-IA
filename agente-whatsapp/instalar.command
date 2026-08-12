#!/bin/bash
#
# Instalador do agente de WhatsApp do Raro.ia — para clicar duas vezes no Finder.
#
# POR QUE UM .command E NAO UM README COM PASSOS
# ---------------------------------------------
# Quem vai rodar isto e o dono da mentoria, no MacBook dele, sem saber o que e
# npm nem terminal. Cada passo manual e um passo que ele vai errar sozinho as
# 22h de um domingo. Entao o arquivo faz tudo e so PARA quando precisa de uma
# decisao humana de verdade: preencher o .env e ler o QR Code.
#
# POR QUE O QR APARECE ANTES DE INSTALAR O SERVICO
# ------------------------------------------------
# Depois de instalado, o agente sobe pelo launchd — sem terminal aberto, sem
# ninguem olhando. QR Code desenhado num lugar que ninguem ve nao serve para
# nada. Por isso a ordem e: roda aqui na frente, com o Terminal aberto, ele le o
# QR, e SO DEPOIS o agente vira servico.

set -u

PASTA="$(cd "$(dirname "$0")" && pwd)"
cd "$PASTA" || exit 1

ROTULO="ia.raro.agente-whatsapp"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"

echo ""
echo "==================================================="
echo "  Agente de WhatsApp do Raro.ia — instalacao"
echo "==================================================="
echo ""

# ---------------------------------------------------------------- 1. o Node
# O agente roda em Node. Sem ele nada acontece, e a mensagem de erro nativa
# ("command not found") nao ajuda ninguem a resolver.
if ! command -v node >/dev/null 2>&1; then
  echo "  [x] O Node.js nao esta instalado nesta maquina."
  echo ""
  echo "      Baixe a versao LTS em https://nodejs.org (o botao da esquerda),"
  echo "      instale normalmente e clique neste arquivo de novo."
  echo ""
  read -r -p "      Pressione Enter para fechar. " _
  exit 1
fi

NODE_BIN="$(command -v node)"
NODE_MAIOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAIOR" -lt 20 ]; then
  echo "  [x] Seu Node e a versao $NODE_MAIOR e o agente precisa da 20 ou maior."
  echo "      Baixe a versao LTS em https://nodejs.org e clique aqui de novo."
  echo ""
  read -r -p "      Pressione Enter para fechar. " _
  exit 1
fi
echo "  [ok] Node encontrado ($(node -v))."

# ------------------------------------------------------------ 2. o arquivo .env
# O .env carrega o segredo e por isso nunca vem pronto no pacote. A copia do
# exemplo acontece aqui para o dono nao precisar saber copiar arquivo oculto.
if [ ! -f "$PASTA/.env" ]; then
  cp "$PASTA/.env.example" "$PASTA/.env"
  echo ""
  echo "  [!] Criei o arquivo de configuracao e vou abri-lo agora."
  echo "      Preencha BASE_URL e RARO_AGENTE_SEGREDO, salve (Cmd+S) e feche."
  echo ""
  read -r -p "      Pressione Enter para abrir o arquivo. " _
  open -e "$PASTA/.env"
  echo ""
  read -r -p "      Terminou de preencher e salvar? Pressione Enter para seguir. " _
fi
echo "  [ok] Configuracao encontrada."

# ----------------------------------------------------------- 3. dependencias
echo ""
echo "  Instalando as dependencias. Na primeira vez demora alguns minutos,"
echo "  porque baixa o navegador que o WhatsApp Web usa por dentro."
echo ""
if ! npm install --no-audit --no-fund; then
  echo ""
  echo "  [x] A instalacao das dependencias falhou (a mensagem esta acima)."
  echo "      Quase sempre e internet instavel: tente de novo em outra rede."
  echo ""
  read -r -p "      Pressione Enter para fechar. " _
  exit 1
fi
echo ""
echo "  [ok] Dependencias instaladas."

# ------------------------------------------------------- 4. o servico antigo
# Descarregar antes de rodar na frente evita o pior sintoma possivel: duas
# copias do agente disputando a MESMA sessao do WhatsApp, que derruba as duas e
# faz parecer que o WhatsApp e que caiu.
if [ -f "$PLIST" ]; then
  launchctl bootout "gui/$(id -u)/$ROTULO" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1
  echo "  [ok] Parei a versao que ja estava rodando."
fi

# --------------------------------------------------------------- 5. o QR Code
echo ""
echo "==================================================="
echo "  Agora vou ligar o WhatsApp aqui na sua frente."
echo ""
echo "  Se aparecer um QR Code, faca no CELULAR:"
echo "    WhatsApp > Configuracoes > Aparelhos conectados"
echo "    > Conectar um aparelho > aponte para a tela."
echo ""
echo "  Quando aparecer 'WhatsApp conectado e pronto',"
echo "  pressione Control + C para continuar a instalacao."
echo "==================================================="
echo ""

# O Ctrl+C do dono nao pode matar o instalador junto com o agente: ele e o
# SINAL de que a leitura do QR terminou. O trap transforma a interrupcao em
# "siga para o proximo passo".
trap 'echo ""; echo "  [ok] Sessao do WhatsApp gravada nesta maquina."' INT
node "$PASTA/index.js"
trap - INT

# ---------------------------------------------------- 6. subir sozinho no login
# RunAtLoad sobe junto com o login. KeepAlive levanta de novo se o processo
# morrer — e ele morre mesmo: o navegador embutido cai sozinho de vez em quando,
# e o agente prefere sair e nascer limpo a insistir em cima do estado sujo.
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTFIM
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ROTULO</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PASTA/index.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$PASTA</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ThrottleInterval</key>
  <integer>30</integer>

  <key>StandardOutPath</key>
  <string>$PASTA/agente-saida.log</string>
  <key>StandardErrorPath</key>
  <string>$PASTA/agente-erros.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLISTFIM

launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl load "$PLIST" >/dev/null 2>&1

echo ""
echo "==================================================="
echo "  Pronto."
echo ""
echo "  O agente sobe sozinho toda vez que voce liga o Mac."
echo "  Ele so funciona com o notebook LIGADO e com internet."
echo ""
echo "  Para desligar: clique em parar.command, nesta pasta."
echo "  Duvidas: abra o LEIA-ME.md, nesta pasta."
echo "==================================================="
echo ""
read -r -p "  Pressione Enter para fechar esta janela. " _
