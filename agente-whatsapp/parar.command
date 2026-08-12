#!/bin/bash
#
# Desliga o agente de WhatsApp — para clicar duas vezes no Finder.
#
# O QUE ESTE ARQUIVO DELIBERADAMENTE NAO FAZ
# ------------------------------------------
# Nao apaga a sessao do WhatsApp e nao apaga as filas. Quem clica em "parar"
# quer parar hoje, nao recomecar do zero amanha: apagar a sessao obrigaria a ler
# o QR de novo, e apagar as filas jogaria fora conversa que ainda nao subiu.
# Para zerar de verdade existe uma instrucao separada no LEIA-ME, escrita para
# quem sabe o que esta fazendo.

set -u

ROTULO="ia.raro.agente-whatsapp"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"

echo ""
echo "  Desligando o agente de WhatsApp do Raro.ia..."

if [ -f "$PLIST" ]; then
  # `bootout` e o comando das versoes novas do macOS; `unload` cobre as antigas.
  # Rodar os dois nao faz mal: o que nao se aplica falha em silencio.
  launchctl bootout "gui/$(id -u)/$ROTULO" >/dev/null 2>&1
  launchctl unload "$PLIST" >/dev/null 2>&1
  # O arquivo sai junto para o agente nao voltar sozinho no proximo login — que
  # e exatamente a surpresa que alguem clicando em "parar" nao quer ter.
  rm -f "$PLIST"
  echo "  [ok] Agente parado e desligado da inicializacao automatica."
else
  echo "  [ok] O agente ja nao estava instalado como servico."
fi

echo ""
echo "  A sessao do WhatsApp continua salva: quando voce clicar em"
echo "  instalar.command de novo, nao vai precisar ler o QR Code."
echo ""
read -r -p "  Pressione Enter para fechar esta janela. " _
