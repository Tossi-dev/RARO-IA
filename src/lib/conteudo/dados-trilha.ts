// Leitura das trilhas — a da gestão e a do mentorado.
//
// Molde de `src/lib/mentoria/dados.ts` e `portal.ts`: nunca lança, devolve
// `conectado`/`motivo` em vez de exceção, e o motivo é texto humano sem nome
// de tabela, coluna nem código de erro.
//
// ============================================================
// A DECISÃO PRINCIPAL: A LEITURA APAGA O CONTEÚDO NÃO LIBERADO
// ============================================================
//
// Uma aula que ainda não abriu chega ao portal com `urlVideo` e `texto`
// VAZIOS. Não é a tela que esconde — quando a linha sai daqui, o conteúdo já
// não está nela.
//
// Tela que decide esconder é tela que um dia esquece: basta um componente
// novo, um `JSON.stringify` num log, um export para depuração. Este projeto já
// viu isso acontecer três vezes nesta fase (o `.ics`, o `console.warn` da
// transcrição, a frase do consentimento) — sempre a mesma forma, sempre uma
// porta blindada e a do lado aberta.
//
// E por isso as DUAS portas fecham juntas. Apagar só a `urlVideo` protegeria a
// aula de vídeo e deixaria a aula de TEXTO vazar inteira, que é o mesmo
// conteúdo por outro campo.
//
// ⚠ O LIMITE HONESTO DESTA PROTEÇÃO. Ela vale para quem lê pelo app. A RLS de
// `trilha_aula` (migração 0019) decide por TRILHA, não por data de liberação:
// um mentorado matriculado que faça um GET direto no PostgREST com a anon key
// alcança a `url_video` de uma aula ainda fechada. O impacto é ver uma aula
// antes da hora, não acessar conteúdo de outra pessoa. Fechar isso de verdade
// pede a condição de data dentro da política — uma migração que ainda não
// existe, e que está registrada como próximo passo em vez de ficar prometida
// aqui.

import { aulasLiberadas, type AulaLiberada } from "./liberacao";
import {
  progressoDaTrilha,
  temDireitoAoCertificado,
  type MarcaDeProgresso,
  type ProgressoDaTrilha,
} from "./progresso-trilha";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres, mesmo padrão de `Row` em `mentoria/dados.ts`. Cada campo passa
   por um mapeador, nunca por `as Tipo`. */
type Row = Record<string, any>;

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. As trilhas não podem ser carregadas agora.";
const MOTIVO_ERRO_LEITURA = "Não foi possível carregar as trilhas agora. Tente novamente em instantes.";
const MOTIVO_ERRO_AULAS =
  "As trilhas foram lidas, mas não foi possível carregar as aulas. A lista pode estar incompleta.";

function avisar(operacao: string, erro: unknown): void {
  const e = (erro ?? {}) as { code?: string };
  // Só o código. Mensagem de terceiro pode ecoar o corpo da requisição.
  console.warn(`[conteudo/dados-trilha] ${operacao} falhou`, String(e.code ?? "sem-codigo").slice(0, 40));
}

export interface Trilha {
  id: string;
  workspaceId: string;
  nome: string;
  descricao: string;
  programaId: string | null;
  ativa: boolean;
  criadoEm: string;
}

export interface TrilhaAula {
  id: string;
  workspaceId: string;
  trilhaId: string;
  ordem: number;
  titulo: string;
  tipo: string;
  urlVideo: string;
  texto: string;
  duracaoMin: number;
  liberaEmDias: number;
  criadoEm: string;
}

/** A aula como o MENTORADO a recebe: com o estado de liberação e sem o que ainda não abriu. */
export interface AulaDoMentorado extends TrilhaAula {
  liberada: boolean;
  /** Dia civil em que abre, "AAAA-MM-DD". */
  abreNoDia: string | null;
  /** Vazio quando liberada; texto humano quando não. */
  motivo: string;
  concluida: boolean;
}

export interface ListaTrilhas {
  conectado: boolean;
  motivo: string;
  /** `true` quando parte da leitura falhou — a lista existe, mas pode estar incompleta. */
  parcial: boolean;
  trilhas: Array<{ trilha: Trilha; aulas: TrilhaAula[] }>;
}

export interface MinhaTrilha {
  conectado: boolean;
  motivo: string;
  /** `false` = conectou, mas quem está logado não tem ficha de mentorado. */
  ehMentorado: boolean;
  trilhas: Array<{
    trilha: Trilha;
    /** A data de início da matrícula — a base da liberação gradual. */
    inicio: string;
    aulas: AulaDoMentorado[];
    progresso: ProgressoDaTrilha;
    temCertificado: boolean;
  }>;
}

function linhaParaTrilha(r: Row): Trilha {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    nome: r.nome ?? "",
    descricao: r.descricao ?? "",
    programaId: r.programa_id ?? null,
    ativa: Boolean(r.ativa ?? true),
    criadoEm: r.criado_em,
  };
}

function linhaParaAula(r: Row): TrilhaAula {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    trilhaId: r.trilha_id,
    ordem: Number(r.ordem ?? 0),
    titulo: r.titulo ?? "",
    tipo: r.tipo ?? "video",
    urlVideo: r.url_video ?? "",
    texto: r.texto ?? "",
    duracaoMin: Number(r.duracao_min ?? 0),
    liberaEmDias: Number(r.libera_em_dias ?? 0),
    criadoEm: r.criado_em,
  };
}

function listaDesconectada(motivo: string): ListaTrilhas {
  return { conectado: false, motivo, parcial: false, trilhas: [] };
}

function minhaDesconectada(motivo: string): MinhaTrilha {
  return { conectado: false, motivo, ehMentorado: false, trilhas: [] };
}

function porOrdem(a: TrilhaAula, b: TrilhaAula): number {
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  // Empate de `ordem` é dado comum (o mentor cadastrou duas aulas sem
  // numerar). O desempate pelo título mantém a lista estável entre dois
  // carregamentos — sem ele, a mesma trilha apareceria em ordens diferentes.
  return a.titulo.localeCompare(b.titulo, "pt-BR");
}

/** Todas as trilhas do workspace, com as aulas. Para a gestão. */
export async function lerTrilhas(): Promise<ListaTrilhas> {
  if (!supabaseConfigurado()) return listaDesconectada(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();
    const [trilhasRes, aulasRes] = await Promise.all([
      s.from("trilha").select("*"),
      s.from("trilha_aula").select("*"),
    ]);

    if (trilhasRes.error) {
      avisar("lerTrilhas/trilha", trilhasRes.error);
      return listaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    const trilhas = ((trilhasRes.data ?? []) as Row[]).map(linhaParaTrilha);

    // Falha SÓ nas aulas não derruba a lista de trilhas — mas é DITA. Devolver
    // as trilhas com zero aulas em silêncio leria como "nenhuma trilha tem
    // aula cadastrada", que é uma afirmação sobre o trabalho de quem montou.
    if (aulasRes.error) {
      avisar("lerTrilhas/aulas", aulasRes.error);
      return {
        conectado: true,
        motivo: MOTIVO_ERRO_AULAS,
        parcial: true,
        trilhas: trilhas.map((trilha) => ({ trilha, aulas: [] })),
      };
    }

    const aulas = ((aulasRes.data ?? []) as Row[]).map(linhaParaAula);

    return {
      conectado: true,
      motivo: "",
      parcial: false,
      trilhas: trilhas.map((trilha) => ({
        trilha,
        aulas: aulas.filter((a) => a.trilhaId === trilha.id).sort(porOrdem),
      })),
    };
  } catch (excecao) {
    avisar("lerTrilhas", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return listaDesconectada(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * As trilhas de quem está logado, com liberação e progresso já resolvidos.
 *
 * UM parâmetro, e é o relógio. O id do mentorado NÃO entra por aqui: ele sai
 * de `rpc("mentorado_atual")`, que pergunta ao banco quem é o usuário da
 * sessão. É a mesma defesa de `lerPortal` contra o buraco clássico de trocar o
 * número na URL — e o teste trava a aridade justamente para que ninguém
 * acrescente um segundo parâmetro sem perceber o que está abrindo.
 */
export async function lerMinhaTrilha(agoraIso: string): Promise<MinhaTrilha> {
  if (!supabaseConfigurado()) return minhaDesconectada(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();

    const { data: meuId, error: erroRpc } = await s.rpc("mentorado_atual");
    if (erroRpc) {
      avisar("lerMinhaTrilha/rpc", erroRpc);
      return minhaDesconectada(MOTIVO_ERRO_LEITURA);
    }
    // Conectou e não é mentorado: estado diferente de "não consegui ler", e a
    // tela precisa saber a diferença. Nenhuma consulta acontece a partir daqui.
    if (!meuId) return { conectado: true, motivo: "", ehMentorado: false, trilhas: [] };

    const [matriculasRes, trilhasRes, aulasRes, progressoRes] = await Promise.all([
      s.from("trilha_matricula").select("*").eq("mentorado_id", meuId),
      s.from("trilha").select("*"),
      s.from("trilha_aula").select("*"),
      s.from("progresso_trilha").select("*").eq("mentorado_id", meuId),
    ]);

    const erro = matriculasRes.error ?? trilhasRes.error ?? aulasRes.error ?? progressoRes.error;
    if (erro) {
      avisar("lerMinhaTrilha", erro);
      return minhaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    const matriculas = ((matriculasRes.data ?? []) as Row[]).filter((m) => Boolean(m.ativa));
    const trilhas = new Map(((trilhasRes.data ?? []) as Row[]).map((r) => [r.id as string, linhaParaTrilha(r)]));
    const aulas = ((aulasRes.data ?? []) as Row[]).map(linhaParaAula);
    const marcas: MarcaDeProgresso[] = ((progressoRes.data ?? []) as Row[]).map((r) => ({
      aulaId: r.trilha_aula_id,
      concluida: Boolean(r.concluida),
    }));
    const concluidas = new Set(marcas.filter((m) => m.concluida).map((m) => m.aulaId));

    const resultado: MinhaTrilha["trilhas"] = [];
    for (const matricula of matriculas) {
      const trilha = trilhas.get(matricula.trilha_id as string);
      // Matrícula apontando para trilha que a RLS não devolveu: acontece se a
      // trilha perdeu o vínculo com o programa. Ignorar é o certo — o
      // contrário seria desenhar uma trilha sem nome nem aula.
      if (!trilha) continue;

      const daTrilha = aulas.filter((a) => a.trilhaId === trilha.id).sort(porOrdem);
      const inicio = String(matricula.inicio ?? "");
      const liberacao = aulasLiberadas(
        daTrilha.map((a) => ({ id: a.id, liberaEmDias: a.liberaEmDias })),
        inicio,
        agoraIso,
      );
      const porId = new Map<string, AulaLiberada>(liberacao.map((l) => [l.id, l]));

      const aulasDoMentorado: AulaDoMentorado[] = daTrilha.map((aula) => {
        const estado = porId.get(aula.id);
        const liberada = estado?.liberada ?? false;
        return {
          ...aula,
          // AQUI a aula fechada perde o conteúdo — as duas portas juntas.
          urlVideo: liberada ? aula.urlVideo : "",
          texto: liberada ? aula.texto : "",
          liberada,
          abreNoDia: estado?.abreNoDia ?? null,
          motivo: estado?.motivo ?? "",
          concluida: concluidas.has(aula.id),
        };
      });

      resultado.push({
        trilha,
        inicio,
        aulas: aulasDoMentorado,
        progresso: progressoDaTrilha(liberacao, marcas),
        temCertificado: temDireitoAoCertificado(liberacao, marcas),
      });
    }

    return { conectado: true, motivo: "", ehMentorado: true, trilhas: resultado };
  } catch (excecao) {
    avisar("lerMinhaTrilha", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return minhaDesconectada(MOTIVO_ERRO_LEITURA);
  }
}
