import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";
import { destinoDoNegocioValido, gerarCodigo } from "./link";

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas são mapeadas uma a uma. */
type Row = Record<string, any>;

export interface OrigemDeCaptura {
  origem: string;
  quantidade: number;
}

export interface LinkDeMarketing {
  id: string;
  codigo: string;
  destino: string;
  campanha: string;
  ativo: boolean;
  criadoEm: string;
  /** `null` significa leitura parcial; zero significa nenhum clique. */
  cliques: number | null;
  ultimoClique: string | null;
}

export interface DadosMarketing {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  capturasPorOrigem: OrigemDeCaptura[];
  links: LinkDeMarketing[];
}

const MOTIVO_SEM_CONEXAO = "Nenhuma conexão com o banco de dados configurada. O marketing não pode ser carregado agora.";
const MOTIVO_ERRO = "Não foi possível carregar o marketing agora. Tente novamente em instantes.";

function vazio(motivo: string): DadosMarketing {
  return { conectado: false, motivo, parcial: false, capturasPorOrigem: [], links: [] };
}

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\p{Cc}/gu, "").trim().slice(0, limite) : "";
}

function origemDe(valor: unknown): string {
  return texto(valor, 120) || "sem origem informada";
}

function avisar(operacao: string, erro: unknown): void {
  const codigo = (erro as { code?: unknown } | null)?.code;
  console.warn(`[marketing/dados] ${operacao} falhou`, String(codigo ?? "sem-codigo").slice(0, 40));
}

/** Busca as três fontes em paralelo; cada consulta seleciona só o que a tela mostra. */
export async function lerDadosMarketing(): Promise<DadosMarketing> {
  if (!supabaseConfigurado()) return vazio(MOTIVO_SEM_CONEXAO);

  try {
    const supabase = criarSupabaseServer();
    const [capturasRes, linksRes, cliquesRes] = await Promise.all([
      supabase.from("captura").select("utm_source, criado_em").order("criado_em", { ascending: false }),
      supabase
        .from("link_rastreado")
        .select("id, codigo, destino, campanha, ativo, criado_em")
        .order("criado_em", { ascending: false }),
      supabase.from("clique").select("link_id, quando").order("quando", { ascending: false }),
    ]);
    const erroDaEspinha = capturasRes.error ?? linksRes.error;
    if (erroDaEspinha) {
      avisar("lerDadosMarketing", erroDaEspinha);
      return vazio(MOTIVO_ERRO);
    }

    const contagem = new Map<string, number>();
    for (const captura of (capturasRes.data ?? []) as Row[]) {
      const origem = origemDe(captura.utm_source);
      contagem.set(origem, (contagem.get(origem) ?? 0) + 1);
    }
    const capturasPorOrigem = [...contagem]
      .map(([origem, quantidade]) => ({ origem, quantidade }))
      .toSorted((a, b) => b.quantidade - a.quantidade || a.origem.localeCompare(b.origem, "pt-BR"));

    const parcial = Boolean(cliquesRes.error);
    if (cliquesRes.error) avisar("lerDadosMarketing/clique", cliquesRes.error);
    const cliques = parcial ? [] : ((cliquesRes.data ?? []) as Row[]);
    const links = ((linksRes.data ?? []) as Row[]).map((link) => {
      const meusCliques = cliques
        .filter((clique) => clique.link_id === link.id)
        .map((clique) => texto(clique.quando, 40))
        .filter(Boolean);
      return {
        id: texto(link.id, 64),
        codigo: texto(link.codigo, 64),
        destino: texto(link.destino, 500),
        campanha: texto(link.campanha, 120),
        ativo: Boolean(link.ativo),
        criadoEm: texto(link.criado_em, 40),
        cliques: parcial ? null : meusCliques.length,
        ultimoClique: parcial || meusCliques.length === 0 ? null : meusCliques.toSorted().at(-1) ?? null,
      };
    });

    return { conectado: true, motivo: "", parcial, capturasPorOrigem, links };
  } catch (erro) {
    avisar("lerDadosMarketing", { code: erro instanceof Error ? erro.name : "excecao" });
    return vazio(MOTIVO_ERRO);
  }
}

/** Ação do formulário interno. A RLS ainda decide o papel e o workspace. */
export async function criarLinkRastreado(formData: FormData): Promise<void> {
  "use server";
  const destino = texto(formData.get("destino"), 500);
  const campanha = texto(formData.get("campanha"), 120);
  if (!destinoDoNegocioValido(destino)) redirect("/marketing?erro=destino-invalido");
  if (!supabaseConfigurado()) redirect("/marketing?erro=sem-conexao");

  try {
    const { error } = await criarSupabaseServer()
      .from("link_rastreado")
      .insert({ codigo: gerarCodigo(randomBytes(16)), destino, campanha, ativo: true });
    if (error) {
      avisar("criarLinkRastreado", error);
      redirect("/marketing?erro=nao-foi-possivel-criar");
    }
  } catch (erro) {
    avisar("criarLinkRastreado", { code: erro instanceof Error ? erro.name : "excecao" });
    redirect("/marketing?erro=nao-foi-possivel-criar");
  }

  revalidatePath("/marketing");
  redirect("/marketing");
}
