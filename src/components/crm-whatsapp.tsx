"use client";

// O cartão do WhatsApp na Central de Clientes — e o botão que liga o WhatsApp
// sem ninguém abrir um terminal.
//
// O PROBLEMA QUE ELE RESOLVE
// --------------------------
// Antes, conectar exigia abrir o Terminal no Mac do dono e ler um QR Code
// desenhado com caracteres de texto. Isso funciona para quem programa e trava
// todo mundo mais — e o pedido do cliente foi explícito: tem que servir para o
// especialista e para quem está começando.
//
// Agora o agente local manda a string do QR junto com o sinal de vida, o
// servidor desenha, e a pessoa aponta o celular para a tela do CRM em que ela
// já está trabalhando. Nenhum terminal, nenhum arquivo, nenhum comando.
//
// A CADÊNCIA, E POR QUE ELA MUDA
// ------------------------------
// Parado, o cartão pergunta o estado de minuto em minuto — é informação de
// rodapé, não vale gastar rede. Com o painel de conexão aberto, passa a
// perguntar a cada três segundos: o WhatsApp troca o QR a cada vinte e poucos
// segundos, e um código vencido na tela faz a pessoa apontar o celular, nada
// acontecer, e concluir que o sistema está quebrado.

import { QrCode, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { EstadoWhatsapp } from "@/lib/actions";
import { Card, cx } from "./ui";

const INTERVALO_PARADO_MS = 60_000;
const INTERVALO_CONECTANDO_MS = 3_000;

export function CrmWhatsapp({
  inicial,
  consultar,
}: {
  inicial: EstadoWhatsapp;
  consultar: () => Promise<EstadoWhatsapp>;
}) {
  const [estado, setEstado] = useState<EstadoWhatsapp>(inicial);
  const [conectando, setConectando] = useState(false);

  const atualizar = useCallback(async () => {
    try {
      setEstado(await consultar());
    } catch {
      // Falha de rede aqui não merece tela de erro: o cartão simplesmente
      // continua mostrando o último estado conhecido até a próxima tentativa.
    }
  }, [consultar]);

  useEffect(() => {
    const ms = conectando ? INTERVALO_CONECTANDO_MS : INTERVALO_PARADO_MS;
    const t = setInterval(atualizar, ms);
    return () => clearInterval(t);
  }, [conectando, atualizar]);

  // Conectou de verdade? O painel se fecha sozinho. Deixar um QR já lido na
  // tela é convite para alguém ler de novo por engano.
  useEffect(() => {
    if (estado.ligado && conectando) setConectando(false);
  }, [estado.ligado, conectando]);

  const nuncaFalou = estado.minutosDesdeUltimoPulso === null;

  return (
    <Card
      titulo="WhatsApp"
      acao={
        estado.ligado ? (
          <span className="text-xs font-medium text-positivo">conectado</span>
        ) : (
          <span className="text-xs font-medium text-texto-3">desconectado</span>
        )
      }
    >
      <p className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={cx(
            "inline-block h-2 w-2 rounded-full",
            estado.ligado ? "bg-positivo" : "bg-texto-4"
          )}
        />
        {estado.ligado ? "Conversas entrando sozinhas" : "Desconectado"}
      </p>

      <p className="mt-2 text-xs leading-snug text-texto-3">
        {nuncaFalou
          ? "O programa do WhatsApp ainda não foi instalado no computador do dono."
          : estado.ligado
            ? "Tudo que for aprovado sai em instantes."
            : `Último sinal há ${estado.minutosDesdeUltimoPulso} min. Mensagens aprovadas ficam na fila e saem no próximo login.`}
      </p>

      {!estado.ligado ? (
        <button
          type="button"
          onClick={() => {
            setConectando(!conectando);
            if (!conectando) void atualizar();
          }}
          className={cx(
            "toque trans mt-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
            conectando
              ? "border border-borda-sutil text-texto-2 hover:border-borda hover:text-texto"
              : "bevel bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press text-white hover:brightness-110"
          )}
        >
          {conectando ? (
            <>
              <X size={14} aria-hidden strokeWidth={1.75} /> Fechar
            </>
          ) : (
            <>
              <QrCode size={14} aria-hidden strokeWidth={1.75} /> Conectar WhatsApp
            </>
          )}
        </button>
      ) : null}

      {conectando ? (
        <div className="mt-3 rounded-2xl border border-borda-sutil bg-painel-2 p-3">
          {estado.qrSvg ? (
            <>
              <p className="mb-2 text-xs leading-snug text-texto-2">
                No celular do dono: <strong>WhatsApp → Configurações → Aparelhos conectados →
                Conectar aparelho</strong>. Aponte a câmera para o código abaixo.
              </p>
              {/* Fundo branco fixo, também no tema escuro: a câmera lê
                  contraste, e QR bonito em cinza sobre grafite não abre. */}
              <div className="flex justify-center rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={estado.qrSvg} alt="QR Code para conectar o WhatsApp" width={200} height={200} />
              </div>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-texto-3">
                <RefreshCw size={11} aria-hidden className="animate-spin [animation-duration:3s]" />
                O código troca sozinho a cada poucos segundos
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium">Esperando o programa do computador</p>
              <p className="mt-1 text-xs leading-snug text-texto-3">
                O QR Code aparece aqui assim que o programa estiver rodando no Mac do dono. Se ainda
                não foi instalado, é uma vez só:
              </p>
              <ol className="mt-2 space-y-1.5 text-[11px] leading-snug text-texto-2">
                <li>
                  <strong>1.</strong> Copie a pasta <code className="font-mono">agente-whatsapp</code>{" "}
                  para o Mac dele.
                </li>
                <li>
                  <strong>2.</strong> Dois cliques em{" "}
                  <code className="font-mono">instalar.command</code>.
                </li>
                <li>
                  <strong>3.</strong> Preencha o endereço do sistema e a senha do agente no arquivo
                  que abrir.
                </li>
                <li>
                  <strong>4.</strong> Volte aqui — o QR Code aparece nesta janela sozinho.
                </li>
              </ol>
            </>
          )}
        </div>
      ) : null}

      {estado.precisaQr && !conectando ? (
        <p className="mt-2 rounded-xl border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-aviso">
          A sessão caiu. Clique em Conectar para ler o código de novo.
        </p>
      ) : null}
    </Card>
  );
}
