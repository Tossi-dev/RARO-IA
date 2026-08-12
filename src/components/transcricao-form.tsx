"use client";

// Registro de transcrição de uma reunião: colar TEXTO (sempre funciona)
// ou subir ÁUDIO → /api/transcrever (Groq Whisper + resumo IA quando
// as chaves existem; senão, demo claramente sinalizado).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { salvarTranscricaoManual } from "@/lib/actions";
import { Botao, TextArea, cx } from "./ui";

export function TranscricaoForm({ reuniaoId }: { reuniaoId: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<"texto" | "audio">("texto");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function enviarAudio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const arquivo = (form.elements.namedItem("audio") as HTMLInputElement)?.files?.[0];
    if (!arquivo) {
      setMsg("Escolha um arquivo de áudio.");
      return;
    }
    setEnviando(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("audio", arquivo);
      fd.append("reuniaoId", reuniaoId);
      const r = await fetch("/api/transcrever", { method: "POST", body: fd });
      const data = (await r.json()) as { ok?: boolean; provider?: string; erro?: string };
      if (!r.ok || !data.ok) throw new Error(data.erro || `HTTP ${r.status}`);
      setMsg(
        data.provider === "groq"
          ? "Áudio transcrito e resumido com IA."
          : "Transcrição registrada em modo demonstração (configure GROQ_API_KEY para áudio real)."
      );
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg(`Erro: ${(err as Error).message}`);
    } finally {
      setEnviando(false);
    }
  }

  const abas = [
    { id: "texto", rotulo: "Colar texto" },
    { id: "audio", rotulo: "Subir áudio (IA)" },
  ] as const;

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setModo(a.id)}
            className={cx(
              "rounded-lg px-2.5 py-1 text-xs",
              modo === a.id ? "bg-primaria/15 font-medium text-primaria-2" : "text-texto-2 hover:text-texto"
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {modo === "texto" ? (
        <form
          action={salvarTranscricaoManual}
          className="space-y-2"
          onSubmit={() => setMsg("Transcrição enviada — o resumo aparece ao recarregar.")}
        >
          <input type="hidden" name="reuniaoId" value={reuniaoId} />
          <TextArea
            name="texto"
            required
            placeholder="Cole aqui o resumo ou a transcrição da call…"
            className="min-h-[96px]"
          />
          <Botao>Salvar transcrição</Botao>
        </form>
      ) : (
        <form onSubmit={enviarAudio} className="space-y-2">
          <input
            type="file"
            name="audio"
            accept="audio/*,video/mp4"
            className="block w-full text-xs text-texto-2 file:mr-2 file:rounded-lg file:border file:border-borda file:bg-painel-2 file:px-3 file:py-1.5 file:text-xs file:text-texto"
          />
          <Botao>{enviando ? "Transcrevendo…" : "Transcrever e resumir"}</Botao>
        </form>
      )}
      {msg && <p className="mt-2 text-xs text-texto-2">{msg}</p>}
    </div>
  );
}
