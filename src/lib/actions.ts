"use server";

// Server Actions — toda escrita passa por aqui, validada com Zod na borda.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import QRCode from "qrcode";
import { dinheiroDeCampo } from "./dinheiro";
import { estadoDoAgente } from "./atendimento/pulso";
import { getDB, supabaseConfigurado } from "./data";
import { PALETA_AGRUPAMENTO } from "./cores";
import { CATEGORIA_CAIXA_LABEL } from "./domain";
import type { CategoriaCaixa } from "./types";
import { COOKIE_SIMULACAO, SIMULACAO_MAX_AGE } from "./data/simulacao";
import { COOKIE_DENSIDADE } from "./densidade";
import { COOKIE_GOOGLE } from "./integracoes/google-agenda";
import { COOKIE_TEMA } from "./tema";
import { criarEventoGoogle } from "./integracoes/calendar";
import { resumirTranscricao } from "./integracoes/ia";
import { criarSupabaseServer } from "./supabase/server";

const tudo = () => revalidatePath("/", "layout");

const zData = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
// Dinheiro digitado por gente, não por máquina: "1.234,56" tem que valer
// 1234,56, e não NaN. `z.coerce.number()` puro só entende o formato
// americano — ver src/lib/dinheiro.ts para a regra de ambiguidade do ponto.
// A mensagem de erro é escrita para o dono ler, não para o console.
const zDinheiro = z
  .preprocess(
    (v) => dinheiroDeCampo(v),
    z.number({ invalid_type_error: "Valor inválido. Use o formato 1.234,56." })
  )
  .pipe(z.number().min(0).max(10_000_000));

// ---------- Financeiro ----------

const DespesaSchema = z.object({
  data: zData,
  descricao: z.string().trim().min(2).max(200),
  categoria: z.string().trim().min(2).max(60),
  tipo: z.enum(["fixa", "variavel"]),
  valor: zDinheiro,
});

export async function criarDespesa(formData: FormData) {
  const d = DespesaSchema.parse(Object.fromEntries(formData));
  await getDB().addDespesa(d);
  tudo();
}

// ---------- CRM ----------

const AlunoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(20).default(""),
  email: z.string().trim().max(160).default(""),
  statusFunil: z.enum(["potencial", "novo", "recorrente", "inativo"]).default("potencial"),
  origem: z.string().trim().max(60).default(""),
  observacoes: z.string().trim().max(500).default(""),
});

export async function criarAluno(formData: FormData) {
  const a = AlunoSchema.parse(Object.fromEntries(formData));
  await getDB().addAluno(a);
  tudo();
}

const StatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["potencial", "novo", "recorrente", "inativo"]),
});

export async function mudarStatusAluno(formData: FormData) {
  const { id, status } = StatusSchema.parse(Object.fromEntries(formData));
  await getDB().setStatusAluno(id, status);
  tudo();
}

// criarLancamento (e o formulário "Planejar novo lançamento" que a chamava)
// saiu daqui na virada para mentoria: era a única tela que criava um
// lançamento, e o redirect terminava em "/lancamentos", rota removida.
// db.addLancamento() continua existindo no provider — só o gatilho de UI saiu.

// ---------- Matrículas e reembolsos ----------

const MatriculaSchema = z.object({
  alunoId: z.string().min(1),
  produtoId: z.string().min(1),
  lancamentoId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  afiliadoId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  valor: zDinheiro,
  formaPgto: z.enum(["pix", "dinheiro", "debito", "credito_vista", "credito_2x6x", "credito_7x12x"]),
  data: zData,
});

export async function registrarMatricula(formData: FormData) {
  const m = MatriculaSchema.parse(Object.fromEntries(formData));
  await getDB().addMatricula(m);
  tudo();
}

const TarefaSchema = z.object({ id: z.string().min(1) });

export async function alternarTarefa(formData: FormData) {
  const { id } = TarefaSchema.parse(Object.fromEntries(formData));
  await getDB().toggleTarefa(id);
  tudo();
}

const ReembolsoSchema = z.object({
  matriculaId: z.string().min(1),
  valor: zDinheiro,
  data: zData,
  motivo: z.string().trim().max(300).default(""),
});

export async function registrarReembolso(formData: FormData) {
  const r = ReembolsoSchema.parse(Object.fromEntries(formData));
  await getDB().addReembolso(r);
  tudo();
}

// ---------- Cadastro base: produto, responsável e conta ----------
//
// Sem estas três, a planilha não tem fonte de renda (produto), braço/comissão
// (responsável) nem caixa (conta) — é o buraco que deixa o painel calcular
// certo e mostrar vazio.

const ProdutoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  tipo: z.enum(["low_ticket", "high_ticket", "mentoria"]),
  precoBase: zDinheiro,
  // Vem de um <select> com valores "true"/"false" — não de checkbox, porque
  // `z.coerce.boolean()` trataria QUALQUER texto não vazio (inclusive "false")
  // como verdadeiro e o produto nasceria sempre ativo.
  ativo: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  // `Braco` deixou de ser união fixa de três palavras (ver types.ts): agora é
  // o id de um agrupamento cadastrado pelo usuário, ou vazio quando o produto
  // não pertence a nenhum.
  braco: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v)),
  categoria: z.enum(["curso", "mentoria", "servico", "produto", "assinatura", "evento"]),
});

export async function criarProduto(formData: FormData) {
  const p = ProdutoSchema.parse(Object.fromEntries(formData));
  await getDB().addProduto(p);
  tudo();
}

const ResponsavelSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  braco: z.string().trim().min(1).max(60),
  comissaoPadrao: z.coerce.number().min(0).max(100),
  metaMensal: zDinheiro.default(0),
});

export async function criarResponsavel(formData: FormData) {
  const r = ResponsavelSchema.parse(Object.fromEntries(formData));
  await getDB().addResponsavel(r);
  tudo();
}

const ContaSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  tipo: z.enum(["corrente", "poupanca", "gateway", "caixa_fisico", "investimento"]),
  saldoInicial: zDinheiro.default(0),
  braco: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v)),
});

export async function criarConta(formData: FormData) {
  const c = ContaSchema.parse(Object.fromEntries(formData));
  await getDB().addConta(c);
  tudo();
}

/**
 * Cadastra a conta E DEVOLVE ela — a variante que a importação de extrato usa.
 *
 * Por que não dá para reaproveitar `criarConta` acima: lá o retorno é `void` e
 * quem chama depende de a página inteira recarregar para ver a conta nova. Na
 * tela de extrato isso seria destrutivo — as linhas do arquivo lido moram no
 * estado do navegador, e um recarregamento joga fora o trabalho de conferência
 * que a pessoa acabou de fazer. Aqui a conta volta pronta e a tela só a
 * acrescenta na lista, sem perder nada do que está na frente do dono.
 *
 * O id vem de quem GRAVOU (`addConta` devolve), e não de uma releitura da
 * base. A primeira versão relia a lista para achar a conta nova e quebrou em
 * produção com HTTP 500: no modo planilha a leitura passa pelo endpoint
 * público do Google, que serve uma cópia em cache e ainda não enxergava a
 * linha recém-inserida. A conta tinha sido criada; só não voltava.
 */
export async function criarContaEDevolver(
  formData: FormData
): Promise<{ id: string; nome: string }> {
  const c = ContaSchema.parse(Object.fromEntries(formData));
  const id = await getDB().addConta(c);
  tudo();
  return { id, nome: c.nome };
}

// ---------- Camada de caixa: importação de extrato bancário ----------
//
// `lerExtrato` (src/lib/extrato) só LÊ o arquivo e devolve linhas para a tela
// mostrar — nada é gravado ali. Esta Server Action é o único caminho que
// grava de verdade, e por isso NUNCA é chamada direto do upload: ela recebe
// a lista já CONFERIDA por uma pessoa na tela (linha removida, conta
// escolhida), nunca o resultado cru da leitura. Pular essa conferência
// deixaria um erro de leitura do arquivo (banco errado, formato mal
// detectado) virar lançamento de caixa sem ninguém ver.

// Lista real de categorias do plano de contas de caixa (ver `CategoriaCaixa`
// em types.ts) — construída a partir de `CATEGORIA_CAIXA_LABEL` (domain.ts)
// em vez de reescrita à mão aqui, para não existirem duas listas que possam
// divergir entre si.
const TODAS_CATEGORIAS_CAIXA = Object.keys(CATEGORIA_CAIXA_LABEL) as [
  CategoriaCaixa,
  ...CategoriaCaixa[],
];

const LinhaExtratoSchema = z.object({
  data: zData,
  descricao: z.string().trim().min(1).max(300),
  // Sinal preservado do extrato: positivo entra, negativo sai — por isso não
  // usa `zDinheiro` (que exige >= 0).
  valor: z.coerce.number().finite().min(-10_000_000).max(10_000_000),
  tipo: z.enum(["entrada", "saida"]),
  documento: z.string().trim().max(120).default(""),
  // Categoria que o dono confirmou/corrigiu no passo de conferência da tela
  // (ver src/components/extrato-importar.tsx) — validada contra o plano de
  // contas real, não uma lista inventada aqui.
  categoria: z.enum(TODAS_CATEGORIAS_CAIXA),
  impressaoDigital: z.string().trim().min(1),
});

const ImportarExtratoSchema = z.object({
  contaId: z.string().min(1),
  origem: z.enum(["ofx", "csv", "texto"]),
  linhas: z.array(LinhaExtratoSchema).min(1).max(2000),
});

export async function importarExtratoBancario(dados: unknown) {
  const { contaId, origem, linhas } = ImportarExtratoSchema.parse(dados);
  const resultado = await getDB().importarExtrato(linhas, contaId, origem);
  tudo();
  return resultado;
}

// ---------- CRM automático: fila de saída do WhatsApp ----------
//
// A ÚNICA porta que põe mensagem na fila de envio. Ela não envia nada: grava
// uma linha com o texto, quem aprovou e quando. Quem envia é o agente local no
// Mac do dono, e ele só recebe da fila o que passou por aqui.
//
// A distância entre escrever e sair é o desenho inteiro do recurso: mensagem
// saindo no nome do dono sem alguém ter lido é o único erro deste sistema que
// o CLIENTE FINAL percebe — e o que o cliente final percebe não se desfaz com
// um deploy.

const EnvioSchema = z.object({
  alunoId: z.string().trim().min(1),
  texto: z.string().trim().min(1).max(4000),
});

export async function aprovarEnvioWhatsapp(dados: unknown): Promise<{ ok: boolean; erro?: string }> {
  const { alunoId, texto } = EnvioSchema.parse(dados);
  const db = getDB();

  const aluno = (await db.listAlunos()).find((a) => a.id === alunoId);
  if (!aluno) return { ok: false, erro: "Cliente não encontrado." };
  if (!aluno.telefone.trim()) {
    // Sem telefone não há para onde mandar. Enfileirar assim mesmo deixaria a
    // mensagem parada para sempre sem ninguém entender por quê.
    return { ok: false, erro: "Este cliente não tem telefone cadastrado." };
  }

  // Quem aprovou entra no registro. Sem Supabase não existe sessão nomeada, e
  // aí fica registrado o que é verdade — "o dono, pela tela" —, nunca um nome
  // inventado.
  let quem = "dono (sem login)";
  if (supabaseConfigurado()) {
    const s = criarSupabaseServer();
    const { data } = await s.auth.getUser();
    quem = data.user?.email ?? quem;
  }

  await db.aprovarEnvio({ alunoId, telefone: aluno.telefone, texto, autorizadoPor: quem });
  tudo();
  return { ok: true };
}

// ---------- CRM automático: conectar o WhatsApp pela tela ----------
//
// O que esta ação resolve: antes, ligar o WhatsApp exigia abrir um terminal no
// Mac do dono e ler o QR Code ali dentro. Isso funciona para quem programa e
// trava todo mundo mais. Agora o agente local manda a string do QR junto com o
// pulso, esta ação desenha o código e a tela do CRM mostra — a pessoa aponta o
// celular para a tela em que ela já está trabalhando.
//
// O DESENHO É FEITO AQUI, NO SERVIDOR, de propósito: assim o navegador recebe
// uma imagem pronta e nenhuma biblioteca de QR precisa ir junto no pacote que
// o cliente baixa.
//
// Segurança: quem lê este QR ganha a sessão de WhatsApp do dono. Ele só é
// devolvido para dentro do sistema (que já exige senha para abrir), nunca é
// gravado em lugar nenhum, e vence em segundos — ver QR_VALIDO_SEGUNDOS.

export interface EstadoWhatsapp {
  ligado: boolean;
  precisaQr: boolean;
  minutosDesdeUltimoPulso: number | null;
  versao: string;
  /** SVG do QR, pronto para a tag <img>. `null` quando não há QR válido agora. */
  qrSvg: string | null;
}

export async function estadoWhatsapp(): Promise<EstadoWhatsapp> {
  const e = estadoDoAgente(new Date());

  let qrSvg: string | null = null;
  if (e.qr) {
    try {
      const svg = await QRCode.toString(e.qr, {
        type: "svg",
        margin: 1,
        // Alto contraste e fundo branco SEMPRE, inclusive no tema escuro: a
        // câmera do celular lê contraste, não estética. QR desenhado em cinza
        // sobre grafite fica bonito na tela e não abre no telefone.
        color: { dark: "#000000", light: "#ffffff" },
      });
      qrSvg = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch {
      // Falhar em desenhar o QR não pode derrubar a tela do CRM inteira: a
      // pessoa perde o atalho, não o sistema.
      qrSvg = null;
    }
  }

  return {
    ligado: e.ligado,
    precisaQr: e.precisaQr,
    minutosDesdeUltimoPulso: e.minutosDesdeUltimoPulso,
    versao: e.versao,
    qrSvg,
  };
}

// ---------- Cadastro OPCIONAL de agrupamento ----------
//
// Agrupamento é cadastro do usuário, não posicionamento fixo do produto (ver
// nota de dívida em types.ts). A cor é validada contra `PALETA_AGRUPAMENTO`
// (o mesmo hex já usado no resto do design system) — não aceita hex livre
// digitado pelo formulário, porque cor arbitrária quebraria a leitura de um
// gráfico ao lado das outras cores do sistema.

const AgrupamentoSchema = z.object({
  nome: z.string().trim().min(2).max(60),
  cor: z.enum(PALETA_AGRUPAMENTO),
  ordem: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function criarAgrupamento(formData: FormData) {
  const a = AgrupamentoSchema.parse(Object.fromEntries(formData));
  await getDB().addAgrupamento(a);
  tudo();
}

// ---------- Autenticação (só com Supabase configurado) ----------
//
// ATENÇÃO a quem for "atualizar isto para o modo planilha": as duas guardas
// abaixo NÃO são guardas de modo de dados — são guardas de AUTENTICAÇÃO. Quem
// faz login e logout aqui é o Supabase Auth; sem projeto Supabase não existe
// sessão para abrir nem para encerrar, então `supabaseConfigurado()` é
// exatamente a condição certa e trocá-la por `modoDados()` chamaria
// `criarSupabaseServer()` sem URL e derrubaria a Server Action.
//
// As guardas de MODO DE DADOS (as que impediriam o modo demonstração de fingir
// que gravou) não moram neste arquivo: toda escrita passa por `getDB()`, e é o
// provider selecionado em `@/lib/data` que decide se grava em memória, no
// Postgres ou na planilha. Por isso nenhuma escrita daqui precisou ser liberada
// para o modo planilha — nenhuma delas estava bloqueada por falta de Supabase.

export async function entrar(formData: FormData) {
  // guarda de autenticação, não de dados: sem Supabase Auth não há o que validar.
  if (!supabaseConfigurado()) redirect("/");
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const supabase = criarSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect("/login?erro=1");
  tudo();
  redirect("/");
}

export async function sair() {
  // idem: só há sessão para encerrar onde há Supabase Auth.
  if (supabaseConfigurado()) {
    const supabase = criarSupabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

// ============================================================
// Expansão v2 — CRM, reuniões, financeiro avançado e conteúdo
// ============================================================

// ---------- CRM ----------

const NotaSchema = z.object({
  alunoId: z.string().min(1),
  texto: z.string().trim().min(2).max(1000),
});

export async function criarNota(formData: FormData) {
  const { alunoId, texto } = NotaSchema.parse(Object.fromEntries(formData));
  const db = getDB();
  await db.addNota({ alunoId, autor: "Gestão", texto });
  await db.addAtividade({ alunoId, tipo: "nota", titulo: "Nota adicionada", detalhe: texto });
  tudo();
}

const AtividadeSchema = z.object({
  alunoId: z.string().min(1),
  tipo: z.enum(["contato", "whatsapp", "ligacao", "email", "evento"]),
  titulo: z.string().trim().min(2).max(160),
  detalhe: z.string().trim().max(600).default(""),
});

export async function registrarAtividade(formData: FormData) {
  const a = AtividadeSchema.parse(Object.fromEntries(formData));
  await getDB().addAtividade(a);
  tudo();
}

const MoverEstagioSchema = z.object({
  alunoId: z.string().min(1),
  estagioId: z.string().min(1),
});

export async function moverAlunoEstagio(formData: FormData) {
  const { alunoId, estagioId } = MoverEstagioSchema.parse(Object.fromEntries(formData));
  const db = getDB();
  const estagio = (await db.listEstagios()).find((e) => e.id === estagioId);
  if (!estagio) throw new Error("estágio inválido");
  await db.setEstagioAluno(alunoId, estagio);
  await db.addAtividade({
    alunoId,
    tipo: "sistema",
    titulo: `Movido para "${estagio.nome}"`,
    detalhe: "",
  });
  tudo();
}

const TarefaGestaoSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  detalhe: z.string().trim().max(400).default(""),
  responsavel: z.string().trim().max(80).default(""),
  prazo: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(zData.nullable()),
  prioridade: z.enum(["alta", "media", "baixa"]).default("media"),
  alunoId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
  lancamentoId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
});

export async function criarTarefa(formData: FormData) {
  const t = TarefaGestaoSchema.parse(Object.fromEntries(formData));
  await getDB().addTarefaGestao(t);
  tudo();
}

const IdSchema = z.object({ id: z.string().min(1) });

export async function alternarTarefaGestao(formData: FormData) {
  const { id } = IdSchema.parse(Object.fromEntries(formData));
  await getDB().concluirTarefa(id);
  tudo();
}

// ---------- Reuniões (Google Calendar quando configurado) ----------

const ReuniaoSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  data: zData,
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracaoMin: z.coerce.number().min(15).max(480).default(60),
  comQuem: z.string().trim().max(160).default(""),
  alunoId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
  lancamentoId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
  turmaId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
});

function somarMinutos(data: string, hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  const dias = Math.floor(total / 1440);
  const hm = total % 1440;
  const d = new Date(`${data}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const dataFim = d.toISOString().slice(0, 10);
  return `${dataFim}T${String(Math.floor(hm / 60)).padStart(2, "0")}:${String(hm % 60).padStart(2, "0")}:00`;
}

export async function marcarReuniao(formData: FormData) {
  const r = ReuniaoSchema.parse(Object.fromEntries(formData));
  const inicio = `${r.data}T${r.hora}:00`;
  const fim = somarMinutos(r.data, r.hora, r.duracaoMin);
  // cria no Google Calendar quando as credenciais existem (senão segue local)
  let googleEventId = "";
  let link = "";
  try {
    const ev = await criarEventoGoogle({ titulo: r.titulo, inicio, fim, descricao: r.comQuem });
    googleEventId = ev.googleEventId;
    link = ev.link;
  } catch {
    // falha no Google não impede o registro local
  }
  const db = getDB();
  await db.addReuniao({
    titulo: r.titulo,
    inicio,
    fim,
    comQuem: r.comQuem,
    alunoId: r.alunoId,
    lancamentoId: r.lancamentoId,
    turmaId: r.turmaId,
    link,
    googleEventId,
  });
  if (r.alunoId) {
    await db.addAtividade({
      alunoId: r.alunoId,
      tipo: "evento",
      titulo: `Reunião marcada — ${r.titulo}`,
      detalhe: `${r.data} às ${r.hora}`,
    });
  }
  tudo();
}

const TranscricaoManualSchema = z.object({
  reuniaoId: z.string().min(1),
  texto: z.string().trim().min(10).max(20000),
});

export async function salvarTranscricaoManual(formData: FormData) {
  const { reuniaoId, texto } = TranscricaoManualSchema.parse(Object.fromEntries(formData));
  let resumo = "";
  try {
    resumo = (await resumirTranscricao(texto)).texto;
  } catch {
    resumo = "";
  }
  await getDB().addTranscricao({ reuniaoId, origem: "manual", texto, resumo });
  tudo();
}

// ---------- Financeiro avançado ----------

const OrcamentoSchema = z.object({
  categoria: z.string().trim().min(2).max(60),
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  valorPrevisto: zDinheiro,
});

export async function salvarOrcamento(formData: FormData) {
  const o = OrcamentoSchema.parse(Object.fromEntries(formData));
  await getDB().setOrcamento(o.categoria, o.periodo, o.valorPrevisto);
  tudo();
}

const MetaFinSchema = z.object({
  tipo: z.enum(["faturamento", "lucro"]),
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  alvo: zDinheiro,
});

export async function salvarMetaFinanceira(formData: FormData) {
  const m = MetaFinSchema.parse(Object.fromEntries(formData));
  await getDB().setMetaFinanceira(m.tipo, m.periodo, m.alvo);
  tudo();
}

// ---------- Conteúdo & redes ----------

const PilarSchema = z.object({
  conteudoId: z.string().min(1),
  pilar: z.enum(["gancho", "desenvolvimento", "cta"]),
  texto: z.string().trim().max(600).default(""),
  nota: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().min(0).max(10).nullable()),
});

export async function salvarPilar(formData: FormData) {
  const p = PilarSchema.parse(Object.fromEntries(formData));
  await getDB().setPilar(p.conteudoId, p.pilar, p.texto, p.nota);
  tudo();
}

const CampanhaSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  tipo: z.enum(["pago", "organico"]),
  canal: z.string().trim().min(2).max(30),
  objetivo: z.string().trim().max(300).default(""),
  orcamento: zDinheiro.default(0),
  inicio: zData,
  fim: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(zData.nullable()),
  conteudoId: z.string().transform((v) => (v === "" ? null : v)).nullable().default(null),
});

export async function criarCampanha(formData: FormData) {
  const c = CampanhaSchema.parse(Object.fromEntries(formData));
  await getDB().addCampanha(c);
  tudo();
}

// ---------- Filtros globais (P0 — fundação) ----------
//
// MUDANÇA DE EIXO (ver ./filtros): a lente global deixou de ser "braço" (três
// valores fixos) e virou FONTE DE RENDA — "todos" ou o id de um produto
// ativo cadastrado. Por isso o schema troca de `z.enum` fechado para
// `z.string()`: não existe mais lista fixa para validar contra.

const FiltroGlobalSchema = z.object({
  fonte: z.string().trim().min(1).max(60),
  range: z.coerce.number().int().refine((v) => [7, 30, 90, 365].includes(v), "período inválido"),
});

export async function setFiltroGlobal(fonte: string, range: number) {
  const f = FiltroGlobalSchema.parse({ fonte, range });
  const jar = cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" as const };
  jar.set("raro_fonte", f.fonte, opts);
  jar.set("raro_range", String(f.range), opts);
  tudo();
}

// ---------- Aparência e simulação ----------

/**
 * Tema em cookie, não em localStorage: o servidor precisa escrever
 * `data-tema` no <html> já na primeira resposta. Com localStorage a tela
 * abriria escura e piscaria para clara a cada navegação.
 */
export async function setTema(tema: string) {
  const t = z.enum(["escuro", "claro"]).parse(tema);
  cookies().set(COOKIE_TEMA, t, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  tudo();
}

/**
 * Desconecta a conta Google da agenda.
 *
 * Apagar o cookie é o suficiente: o refresh_token só existia ali. Nada foi
 * gravado em banco, planilha ou variável de ambiente. Para revogar também do
 * lado do Google, o caminho é a página de contas conectadas da própria conta.
 */
export async function desconectarGoogleAgenda() {
  cookies().delete(COOKIE_GOOGLE);
  // A tentativa de consentimento pode ter deixado o `state` pela metade (o
  // dono abriu a tela do Google e fechou). Sair e o momento certo de limpar.
  cookies().delete("raro_google_state");
  tudo();
  // Redireciona em vez de so revalidar: sem isto a pagina volta na forma
  // "agenda nao conectada" e nada explica por que -- quem clicou fica sem
  // saber se funcionou ou se quebrou. Com a marca na URL, a tela confirma o
  // que aconteceu e diz onde revogar tambem do lado do Google.
  redirect("/agenda?desconectado=1");
}

/**
 * Quanta informação cada tela abre de uma vez.
 *
 * Mesmo mecanismo do tema, e pela mesma razão: quem escreve `data-densidade`
 * no <html> é o servidor. Nada é apagado no modo simples — a memória de
 * cálculo continua inteira dentro do modal que o próprio cartão abre.
 */
export async function setDensidade(densidade: string) {
  const d = z.enum(["simples", "completo"]).parse(densidade);
  cookies().set(COOKIE_DENSIDADE, d, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  tudo();
}

/**
 * Liga/desliga os dados fictícios de demonstração.
 *
 * Cookie de 12h e por navegador: quem receber o link não herda a simulação.
 * Enquanto está ligada, a faixa no topo de toda tela diz que o número é
 * inventado — dado fabricado nunca pode se passar por dado real.
 */
export async function setSimulacao(ligada: boolean) {
  const jar = cookies();
  if (ligada) {
    jar.set(COOKIE_SIMULACAO, "1", {
      path: "/",
      maxAge: SIMULACAO_MAX_AGE,
      sameSite: "lax",
    });
  } else {
    jar.set(COOKIE_SIMULACAO, "", { path: "/", maxAge: 0 });
  }
  tudo();
}
