"use client";

// Botão "gerar com IA" — chama /api/ia e mostra o resultado inline.
// Em modo demo (sem ANTHROPIC_API_KEY) o servidor devolve texto canned marcado.

import { Sparkles } from "lucide-react";
import { useState } from "react";

export function GerarTextoIA({
  prompt,
  rotulo = "Gerar com IA",
}: {
  prompt: string;
  rotulo?: string;
}) {
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await r.json()) as { texto?: string; provider?: string; erro?: string };
      if (!r.ok) throw new Error(data.erro || `HTTP ${r.status}`);
      setResultado(data.texto ?? "");
      setProvider(data.provider ?? "");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={gerar}
        disabled={carregando}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primaria px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primaria-2 disabled:opacity-60"
      >
        <Sparkles size={14} aria-hidden />
        {carregando ? "Gerando…" : rotulo}
      </button>
      {erro && <p className="mt-2 text-xs text-negativo">{erro}</p>}
      {resultado !== null && (
        <div className="mt-3 rounded-lg border border-primaria/30 bg-primaria/5 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-texto-2">
            {provider === "anthropic" ? "Gerado por IA (Claude)" : "Modo demonstração"}
          </p>
          <pre className="whitespace-pre-wrap font-body text-sm text-texto">{resultado}</pre>
        </div>
      )}
    </div>
  );
}
