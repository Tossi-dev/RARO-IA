export const TIPOS_NO_GRAFO = ["dimensao", "meta", "passo", "sessao", "reflexao", "transcricao_referencia"] as const;
export type TipoNoGrafo = (typeof TIPOS_NO_GRAFO)[number];

export type NoGrafoCliente = Readonly<{
  id: string;
  clienteId: string;
  tipo: TipoNoGrafo;
  transcricaoAutorizada?: boolean;
}>;

export type ArestaGrafoCliente = Readonly<{ origemId: string; destinoId: string; tipo: string }>;
export type GrafoCliente = Readonly<{ clienteId: string; nos: readonly NoGrafoCliente[]; arestas: readonly ArestaGrafoCliente[] }>;
export type ResultadoGrafo = Readonly<{ ok: true; valor: GrafoCliente }> | Readonly<{ ok: false; erro: string }>;

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function ehTipoNoGrafo(valor: unknown): valor is TipoNoGrafo {
  return typeof valor === "string" && (TIPOS_NO_GRAFO as readonly string[]).includes(valor);
}

/** Monta somente relações fornecidas pelo profissional; não deduz relações novas. */
export function montarGrafoCliente(entrada: GrafoCliente): ResultadoGrafo {
  const clienteId = textoDe(entrada.clienteId);
  if (!clienteId) return { ok: false, erro: "Informe o cliente do grafo." };
  const ids = new Set<string>();
  for (const no of entrada.nos) {
    if (!no.id || no.clienteId !== clienteId) return { ok: false, erro: "Cada nó deve pertencer ao cliente do grafo." };
    if (ids.has(no.id)) return { ok: false, erro: "Cada nó do grafo precisa de identificador único." };
    if (!ehTipoNoGrafo(no.tipo)) return { ok: false, erro: "O tipo de nó não pertence ao grafo do cliente." };
    if (no.tipo === "transcricao_referencia" && no.transcricaoAutorizada !== true) {
      return { ok: false, erro: "A referência de transcrição exige autorização explícita." };
    }
    ids.add(no.id);
  }
  for (const aresta of entrada.arestas) {
    if (!ids.has(aresta.origemId) || !ids.has(aresta.destinoId)) {
      return { ok: false, erro: "Cada relação deve apontar para nós existentes." };
    }
    if (aresta.origemId === aresta.destinoId) return { ok: false, erro: "Uma relação não pode apontar para o próprio nó." };
    if (!textoDe(aresta.tipo)) return { ok: false, erro: "Informe o tipo da relação." };
  }
  return {
    ok: true,
    valor: {
      clienteId,
      // Whitelist fields deliberately.  A transcription is sensitive and
      // must never become a graph payload by accident (for example through
      // an untyped `texto` property received from a form or database row).
      nos: entrada.nos.map((no) => ({
        id: no.id,
        clienteId: no.clienteId,
        tipo: no.tipo,
        ...(no.tipo === "transcricao_referencia" && no.transcricaoAutorizada === true
          ? { transcricaoAutorizada: true }
          : {}),
      })),
      arestas: entrada.arestas.map((aresta) => ({ ...aresta })),
    },
  };
}

/** Relações de saída na mesma ordem em que foram explicitamente registradas. */
export function relacoesDe(grafo: GrafoCliente, noId: string): readonly ArestaGrafoCliente[] {
  return grafo.arestas.filter((aresta) => aresta.origemId === noId);
}
