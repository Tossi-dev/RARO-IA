export const STATUS_PASSO = ["pendente", "em_andamento", "concluido", "cancelado"] as const;
export type StatusPasso = (typeof STATUS_PASSO)[number];

export type PassoPlano = Readonly<{
  id: string;
  titulo: string;
  responsavel: string;
  status: StatusPasso;
}>;

export type PlanoDeAcao = Readonly<{
  planoId: string;
  clienteId: string;
  meta: string;
  prazo: string;
  passos: readonly PassoPlano[];
}>;

export type EntradaPasso = Readonly<{ id: unknown; titulo: unknown; responsavel: unknown }>;
export type EntradaPlanoDeAcao = Readonly<{
  planoId: unknown;
  clienteId: unknown;
  meta: unknown;
  prazo: unknown;
  passos?: readonly EntradaPasso[];
}>;

export type ResultadoPlano = Readonly<{ ok: true; valor: PlanoDeAcao }> | Readonly<{ ok: false; erro: string }>;
type ResultadoPassos = Readonly<{ ok: true; valor: readonly PassoPlano[] }> | Readonly<{ ok: false; erro: string }>;

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

function dataIsoFutura(valor: unknown, agoraIso: string): string | null {
  const texto = textoDe(valor);
  const isoComFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!isoComFuso.test(texto)) return null;
  const prazo = Date.parse(texto);
  const agora = Date.parse(agoraIso);
  if (!texto || Number.isNaN(prazo) || Number.isNaN(agora) || prazo <= agora) return null;
  return new Date(prazo).toISOString();
}

function criarPassos(entradas: readonly EntradaPasso[]): ResultadoPassos {
  const ids = new Set<string>();
  const passos: PassoPlano[] = [];
  for (const entrada of entradas) {
    const id = textoDe(entrada.id);
    const titulo = textoDe(entrada.titulo);
    const responsavel = textoDe(entrada.responsavel);
    if (!id || !titulo || !responsavel) return { ok: false, erro: "Cada passo precisa de identificador, título e responsável." };
    if (ids.has(id)) return { ok: false, erro: "Cada passo precisa de um identificador único." };
    ids.add(id);
    passos.push({ id, titulo, responsavel, status: "pendente" });
  }
  return { ok: true, valor: passos };
}

/** Cria um plano combinado; não escolhe metas ou passos em nome do cliente. */
export function criarPlanoDeAcao(entrada: EntradaPlanoDeAcao, agoraIso: string): ResultadoPlano {
  const planoId = textoDe(entrada.planoId);
  const clienteId = textoDe(entrada.clienteId);
  const meta = textoDe(entrada.meta);
  if (!planoId) return { ok: false, erro: "Informe o plano de ação." };
  if (!clienteId) return { ok: false, erro: "Informe o cliente do plano." };
  if (!meta) return { ok: false, erro: "Informe a meta do plano." };
  if (meta.length > 1000) return { ok: false, erro: "A meta deve ter no máximo 1000 caracteres." };
  const prazo = dataIsoFutura(entrada.prazo, agoraIso);
  if (!prazo) return { ok: false, erro: "Informe um prazo futuro válido." };
  const passos = criarPassos(entrada.passos ?? []);
  if (!passos.ok) return passos;
  return { ok: true, valor: { planoId, clienteId, meta, prazo, passos: passos.valor } };
}

function ehStatusPasso(valor: unknown): valor is StatusPasso {
  return typeof valor === "string" && (STATUS_PASSO as readonly string[]).includes(valor);
}

/** Retorna um novo plano: o argumento original nunca é mutado. */
export function atualizarPasso(plano: PlanoDeAcao, passoId: unknown, status: unknown): ResultadoPlano {
  const id = textoDe(passoId);
  if (!id || !ehStatusPasso(status)) return { ok: false, erro: "Informe o passo e o estado válidos." };
  let encontrado = false;
  const passos = plano.passos.map((passo) => {
    if (passo.id !== id) return passo;
    encontrado = true;
    return { ...passo, status };
  });
  if (!encontrado) return { ok: false, erro: "Passo não encontrado no plano." };
  return { ok: true, valor: { ...plano, passos } };
}

/** Mantém a ordem registrada e exclui ações concluídas ou canceladas. */
export function proximosPassosDe(plano: PlanoDeAcao): readonly PassoPlano[] {
  return plano.passos.filter((passo) => passo.status === "pendente" || passo.status === "em_andamento");
}
