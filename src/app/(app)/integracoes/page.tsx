import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  CircleDollarSign,
  Database,
  FileSpreadsheet,
  Link2,
  ListChecks,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

// Módulo J — Integrações, Pagamentos & Conciliação (Blueprint v3 §4-J).
// "É o que tira o app do modo demonstração": status real de cada conexão,
// eventos de webhook, conciliação gateway × vendas e mapa de produtos.

import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, type Tom } from "@/components/ui";
import type { Composicao } from "@/lib/composicao";
import { getDB, modoDados, supabaseConfigurado } from "@/lib/data";
import { fmtBRLExato, fmtDateTime, fmtNum } from "@/lib/format";
import { googleAppConfigurado } from "@/lib/integracoes/google-agenda";
import { conexaoGoogleAtivaDaOrganizacao, type ResultadoConexaoGoogle } from "@/lib/integracoes/google-conexao-servidor";
import { conexaoAssistidaPorId, gatewayConfigurado, inicioAssistido, proximaConexaoAssistidaPendente, type ConexaoAssistida } from "@/lib/integracoes/conexao-assistida";
import { iaConfigurada } from "@/lib/integracoes/ia";
import { metaConfigurada, tiktokConfigurado } from "@/lib/integracoes/social";
import { sttConfigurado } from "@/lib/integracoes/stt";
import { ABAS, type OrigemAba, type PapelAba } from "@/lib/sheets/abas";
import { sheetsConfigurado, sheetsEscritaConfigurada, sheetsId } from "@/lib/sheets/config";
import { lerAbas } from "@/lib/sheets/ler";
import { avisosDeMapeamento } from "@/lib/sheets/mapear";
import type { StatusIntegracao, WebhookEvento } from "@/lib/types";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

const TOM_EVENTO: Record<WebhookEvento["tipo"], Tom> = {
  venda: "verde",
  reembolso: "vermelho",
  chargeback: "vermelho",
  assinatura: "azul",
};

const TOM_STATUS: Record<WebhookEvento["status"], Tom> = {
  processado: "verde",
  pendente: "ouro",
  erro: "vermelho",
};

/**
 * Uma conexão pode estar de pé PELA METADE — é o caso da planilha lendo mas
 * ainda não escrevendo. `StatusIntegracao` só tem ligado/desligado, então a
 * pendência e o selo entram aqui, sem mexer no tipo compartilhado.
 */
type Conexao = StatusIntegracao & {
  /** O que ainda falta mesmo com a integração já conectada. */
  pendencia?: string;
  selo?: string;
  seloTom?: Tom;
};

const ROTULO_PAPEL: Record<PapelAba, string> = {
  entrada: "Entrada",
  derivada: "Derivada (fórmula do dono)",
  config: "Configuração",
};

const TOM_PAPEL: Record<PapelAba, Tom> = {
  entrada: "azul",
  derivada: "ouro",
  config: "cinza",
};

const ROTULO_ORIGEM: Record<OrigemAba, string> = {
  planilha: "Já existia na planilha",
  sistema: "Criada pela adaptação",
};

/** O id da planilha não é segredo, mas também não precisa aparecer inteiro na tela. */
function idResumido(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function IconeConexao({ id }: { id: string }) {
  const comum = { size: 23, strokeWidth: 1.6, "aria-hidden": true } as const;
  if (id === "supabase") return <Database {...comum} />;
  if (id === "planilha") return <FileSpreadsheet {...comum} />;
  if (id === "agenda-leitura" || id === "calendar") return <CalendarDays {...comum} />;
  if (id === "stt" || id === "ia") return <Sparkles {...comum} />;
  return <Link2 {...comum} />;
}

function KpiIntegracao({ rotulo, valor, detalhe, tom = "azul", children }: { rotulo: string; valor: string; detalhe: string; tom?: "azul" | "ciano" | "ouro"; children: ReactNode }) {
  const cor = tom === "ouro" ? "border-ouro/85 text-ouro" : tom === "ciano" ? "border-cyan-300/75 text-cyan-200" : "border-primaria-2/90 text-primaria-2";
  return <article className="flex min-h-[102px] items-center gap-4 rounded-xl border border-borda bg-painel/70 px-5 py-4 shadow-[0_12px_30px_rgba(0,0,0,.12)]"><span className={`grid size-[68px] shrink-0 place-items-center rounded-full border ${cor}`}>{children}</span><div className="min-w-0"><p className="text-sm text-texto-2">{rotulo}</p><p className="mt-0.5 text-[29px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-texto">{valor}</p><p className="mt-1 truncate text-[11px] text-texto-3">{detalhe}</p></div></article>;
}

function SeloConexao({ conexao }: { conexao: Conexao }) {
  const pendente = !conexao.conectado || Boolean(conexao.pendencia);
  const classe = pendente ? conexao.conectado ? "border-ouro/45 bg-ouro/10 text-ouro" : "border-borda bg-poco text-texto-2" : "border-positivo/45 bg-positivo/10 text-positivo";
  const texto = conexao.selo ?? (conexao.conectado ? "Conectada" : "Configurar");
  return <span className={`inline-flex shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${classe}`}>{texto}</span>;
}

type OrientacaoPendente = {
  motivo: string;
  responsavel: string;
  proximoPasso: string;
};

/** Textos da página principal: orientam sem transformar a tela em manual técnico. */
function orientacaoPendente(conexao: Conexao, resultadoGoogle: ResultadoConexaoGoogle | null, uatSintetico: boolean): OrientacaoPendente {
  if (uatSintetico) {
    return {
      motivo: "Esta integração está isolada neste login de homologação.",
      responsavel: "Ambiente de homologação",
      proximoPasso: "Mantenha a integração suspensa neste login sintético.",
    };
  }
  switch (conexao.id) {
    case "supabase":
      return { motivo: "A base segura da organização ainda não está conectada.", responsavel: "Equipe da plataforma", proximoPasso: "Preparar a organização no ambiente seguro antes de usar dados reais." };
    case "planilha":
      return conexao.conectado
        ? { motivo: "A leitura está ativa, mas a escrita ainda não está pronta.", responsavel: "Equipe da plataforma", proximoPasso: "Concluir a preparação da escrita e validar com dados de teste." }
        : { motivo: "A planilha da operação ainda não está conectada.", responsavel: "Equipe da plataforma", proximoPasso: "Preparar a conexão por organização e validar com dados de teste." };
    case "gateway":
      return { motivo: "A confirmação automática de Pix ainda depende da escolha do fornecedor.", responsavel: "Responsável pela operação e equipe da plataforma", proximoPasso: "Definir o fornecedor e aprovar um teste em ambiente de homologação." };
    case "calendar":
      if (!resultadoGoogle || resultadoGoogle.ok) return { motivo: "Não há conexão Google ativa confirmada para esta organização.", responsavel: "Administrador da organização", proximoPasso: "Quando a plataforma estiver preparada, usar apenas a tela oficial do Google." };
      if (resultadoGoogle.motivo === "conexao_revogada") return { motivo: "A conexão Google desta organização foi revogada.", responsavel: "Administrador da organização", proximoPasso: "Reconectar somente pela tela oficial do Google quando for apropriado." };
      if (resultadoGoogle.motivo === "nao_conectado") return { motivo: "Não há conexão Google ativa confirmada para esta organização.", responsavel: "Administrador da organização", proximoPasso: "Quando a plataforma estiver preparada, usar apenas a tela oficial do Google." };
      return { motivo: "Não foi possível confirmar o estado da conexão Google desta organização.", responsavel: "Equipe da plataforma", proximoPasso: "Verificar a plataforma antes de qualquer nova tentativa." };
    case "stt":
      return { motivo: "A transcrição automática ainda não está disponível para esta organização.", responsavel: "Equipe da plataforma", proximoPasso: "Definir o uso seguro e confirmar os consentimentos antes de habilitar." };
    case "ia":
      return { motivo: "O apoio automático por IA ainda não está disponível para esta organização.", responsavel: "Equipe da plataforma", proximoPasso: "Definir o uso seguro e confirmar os consentimentos antes de habilitar." };
    case "meta":
      return { motivo: "As métricas de Instagram e Facebook ainda não foram autorizadas.", responsavel: "Equipe da plataforma", proximoPasso: "Preparar a autorização da conta comercial e testar em ambiente seguro." };
    case "tiktok":
      return { motivo: "As métricas do TikTok ainda não foram autorizadas.", responsavel: "Equipe da plataforma", proximoPasso: "Preparar a autorização da conta comercial e testar em ambiente seguro." };
    default:
      return { motivo: "Esta integração ainda precisa de preparação.", responsavel: "Equipe da plataforma", proximoPasso: "Conferir a preparação segura antes de habilitar." };
  }
}

function resumoHumano(conexao: Conexao, resultadoGoogle: ResultadoConexaoGoogle | null, uatSintetico: boolean): string {
  if (uatSintetico && conexao.id !== "supabase") return "Bloqueada neste login de homologação; nenhuma comunicação externa é realizada.";
  if (!conexao.conectado || conexao.pendencia) return orientacaoPendente(conexao, resultadoGoogle, uatSintetico).motivo;
  if (conexao.id === "calendar" && resultadoGoogle?.ok) return "Vínculo autenticado da organização confirmado.";
  return "Configuração local detectada; homologação com o fornecedor não confirmada.";
}

function rotuloEstadoDoCatalogo(estado: ConexaoAssistida["estado"]): string {
  if (estado === "em_preparacao") return "Em preparação";
  if (estado === "decisao_pendente") return "Aguardando definição";
  return "Disponível quando preparada";
}

function ConexaoGoogleAssistida({
  oauthPronto,
  resultado,
  proxima,
  pendenciaOperacional,
}: {
  oauthPronto: boolean;
  resultado: ResultadoConexaoGoogle;
  proxima: ConexaoAssistida | null;
  pendenciaOperacional?: string;
}) {
  const conexao = conexaoAssistidaPorId("calendar");
  const inicio = inicioAssistido("calendar");
  if (!conexao || !inicio) return null;
  const revogada = !resultado.ok && resultado.motivo === "conexao_revogada";
  const naoConectada = !resultado.ok && resultado.motivo === "nao_conectado";
  const falhaFechada = !resultado.ok && !revogada && !naoConectada;

  return (
    <section id="conexao-google-calendar" data-conexao-autonoma="google-calendar" className="mt-3 rounded-xl border border-primaria/30 bg-primaria/5 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-primaria/45 bg-poco text-primaria-2"><CalendarDays size={22} strokeWidth={1.6} aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primaria-2">Conexão guiada</p>
            <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.03em]">{resultado.ok ? "Google conectado" : "Conecte sua agenda com o Google"}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-texto-2">
              {resultado.ok
                ? "Esta organização já autorizou uma conta Google. A leitura e a criação de eventos de sessão usam este mesmo vínculo; o iCal legado não é necessário."
                : revogada
                  ? "A conexão Google desta organização foi revogada. Reconecte somente pela tela oficial do Google."
                  : naoConectada
                    ? `${conexao.acessa} Você confere as permissões e escolhe a conta diretamente no Google.`
                    : "Não foi possível confirmar a conexão Google desta organização agora. Nenhum status de sucesso foi assumido."}
            </p>
          </div>
        </div>
        {resultado.ok ? (
          <div className="flex flex-wrap gap-2">
            <a href="/agenda" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primaria px-4 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2">
              Ver agenda <ArrowRight size={16} aria-hidden />
            </a>
            <a href="/agenda" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2">
              Gerenciar conexão
            </a>
          </div>
        ) : oauthPronto && !falhaFechada ? (
          <a href={inicio.href} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primaria px-4 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2">
            {revogada ? "Reconectar Google Calendar" : "Conectar Google Calendar"} <ArrowRight size={16} aria-hidden />
          </a>
        ) : (
          <span className="max-w-sm rounded-lg border border-ouro/35 bg-ouro/10 px-3 py-2 text-sm leading-relaxed text-ouro">{falhaFechada ? "Confira a sessão e a configuração segura da plataforma antes de tentar novamente." : "A conexão segura do Google está sendo preparada pela plataforma."}</span>
        )}
      </div>
      <div className="mt-4 grid gap-3 border-t border-borda pt-4 text-xs leading-relaxed text-texto-2 md:grid-cols-2">
        {resultado.ok ? (
          <>
            <p><span className="font-medium text-texto">Próxima integração:</span> {proxima ? `${proxima.nome} — ${rotuloEstadoDoCatalogo(proxima.estado)}. ${pendenciaOperacional ?? proxima.antesDeConectar}` : "Nenhuma pendência disponível no catálogo atual."}</p>
            <p><span className="font-medium text-texto">Próximo passo:</span> {proxima ? pendenciaOperacional ?? proxima.proximoPasso : "As opções do catálogo já foram concluídas ou tratadas como opcionais."}</p>
          </>
        ) : (
          <>
            <p><span className="font-medium text-texto">Antes de continuar:</span> {conexao.antesDeConectar}</p>
            <p><span className="font-medium text-texto">Sua senha continua privada:</span> Somente a tela oficial do Google recebe sua senha.</p>
          </>
        )}
      </div>
    </section>
  );
}

export default async function Integracoes(props: { searchParams?: { todas?: string } }) {
  const { searchParams } = props ?? {};
  const uatSintetico = await contaUatSinteticaAtual();
  const googleOauthPronto = !uatSintetico && googleAppConfigurado();
  // A UI recebe somente o resultado fechado da consulta autenticada por
  // organização; a função não seleciona nem desserializa tokens ou eventos.
  const conexaoGoogle = uatSintetico
    ? null
    : await conexaoGoogleAtivaDaOrganizacao().catch((): ResultadoConexaoGoogle => ({
        ok: false,
        motivo: "erro_de_armazenamento",
      }));
  const db = getDB();
  const podeLerProvider = !uatSintetico || modoDados() === "supabase";
  const [eventos, matriculas, produtos] = podeLerProvider
    ? await Promise.all([db.listEventosWebhook(), db.listMatriculas(), db.listProdutos()])
    : [[], [], []];

  // Leitura REAL da planilha, aba por aba (só quando há id configurado).
  // `lerAbas` nunca lança: aba inexistente, planilha fechada ou Google fora do ar
  // voltam como erro dentro do resultado — e o erro aparece na tela, não some.
  const leituras = !uatSintetico && sheetsConfigurado() ? await lerAbas(ABAS.map((a) => a.nome)) : null;
  const abas = ABAS.map((a) => {
    const r = leituras?.[a.nome];
    return {
      ...a,
      linhas: r?.linhas.length ?? 0,
      erro: leituras ? (r ? r.erro : "a leitura desta aba não voltou no lote") : null,
    };
  });
  const abasEntrada = abas.filter((a) => a.papel === "entrada");
  const abasEntradaOk = abasEntrada.filter((a) => a.erro === null);
  const abasComLinhas = abas.filter((a) => a.linhas > 0);
  const totalLinhas = abas.reduce((s, a) => s + a.linhas, 0);
  const abasAFaltar = abas.filter((a) => a.origem === "sistema" && a.erro !== null);
  const idPlanilha = sheetsId();

  // ---- avisos de conversão da planilha ----
  // ORDEM IMPORTA: `avisosDeMapeamento()` só devolve alguma coisa DEPOIS de o
  // mapeamento ter rodado. Quem roda mapeamento nesta página não é o `lerAbas`
  // acima (ele devolve linha crua, título -> texto, sem converter nada): é o
  // `getDB()` do topo, quando o provider ativo é o da planilha — `listProdutos`
  // e `listMatriculas` convertem PRODUTOS, VENDAS, RECEBIVEIS e RESPONSAVEIS.
  // Por isso a leitura do acumulador vem aqui, depois dos dois `await`.
  //
  // Com Supabase ligado o provider da planilha NÃO é usado (a precedência é do
  // banco), nenhuma conversão roda nesta requisição e uma lista vazia diria
  // "está tudo reconhecido" sem ninguém ter conferido. Daí a distinção abaixo.
  const planilhaEhABase = modoDados() === "planilha";
  const avisosConversao = planilhaEhABase ? avisosDeMapeamento() : [];

  const gatewayConectado = gatewayConfigurado();
  const conexoesConfiguradas: Conexao[] = [
    {
      id: "supabase",
      nome: "Supabase (banco de dados)",
      categoria: "dados",
      conectado: supabaseConfigurado(),
      // Sem Supabase o app pode estar na planilha, na demonstração ou em nada:
      // afirmar "dados fictícios" aqui repetiria o erro que criou o modo vazio.
      detalhe: supabaseConfigurado()
        ? "Dados reais ativos — o modo demonstração está desligado."
        : modoDados() === "planilha"
          ? "Sem Supabase: a base em uso é a planilha do Google."
          : modoDados() === "demo"
            ? "App rodando com dados fictícios em memória (RARO_MODO=demo)."
            : "Sem base de dados conectada: o app não lê nem grava número nenhum.",
      passo: "Criar projeto em supabase.com, rodar as migrações e definir NEXT_PUBLIC_SUPABASE_URL + ANON_KEY (guia: supabase/README.md).",
    },
    {
      // Três estados honestos e distintos: desligada, lendo mas sem escrever,
      // e lendo e escrevendo. O estado do meio é o mais perigoso de esconder —
      // é onde o app mostra dado real do dono e ainda não devolve nada a ele.
      id: "planilha",
      nome: "Planilha do Google (Base_Financeira_Operacao)",
      categoria: "dados",
      conectado: sheetsConfigurado(),
      detalhe: !sheetsConfigurado()
        ? "Nenhuma planilha ligada: falta RARO_SHEETS_ID. O sistema não lê nem escreve na Base_Financeira_Operacao."
        : sheetsEscritaConfigurada()
          ? `Leitura e escrita ativas na planilha ${idResumido(idPlanilha ?? "")}: o app lê as abas pelo endereço público e grava pelo Apps Script publicado. As abas de fórmula (PAINEL, DRE, FLUXO_CAIXA) seguem somente leitura, de propósito.`
          : `O sistema LÊ a planilha ${idResumido(idPlanilha ?? "")}, mas ainda NÃO ESCREVE nela: falta RARO_SHEETS_WEBAPP_URL e/ou RARO_SHEETS_SEGREDO. Venda, recebível ou despesa registrados no app não chegam ao arquivo do dono.`,
      passo:
        "Definir RARO_SHEETS_ID com o id da planilha Base_Financeira_Operacao e deixá-la compartilhada como \"qualquer pessoa com o link\" (guia: docs/PUBLICAR-APPS-SCRIPT.md).",
      pendencia: sheetsEscritaConfigurada()
        ? undefined
        : "Publicar o Apps Script como Web App e definir RARO_SHEETS_WEBAPP_URL + RARO_SHEETS_SEGREDO para ligar a escrita (guia: docs/PUBLICAR-APPS-SCRIPT.md).",
      selo: !sheetsConfigurado() ? "Desligada" : sheetsEscritaConfigurada() ? "Lê e escreve" : "Só leitura",
      seloTom: !sheetsConfigurado() ? "cinza" : sheetsEscritaConfigurada() ? "verde" : "ouro",
    },
    {
      id: "gateway",
      nome: "Confirmação automática de Pix",
      categoria: "pagamento",
      conectado: gatewayConectado,
      detalhe: gatewayConectado
        ? "Endpoint /api/webhooks/pagamento validando assinatura."
        : "Não existe gateway de infoproduto neste negócio: o dono recebe só por Pix. A confirmação automática precisa vir de API de banco, PSP ou agregador de Open Finance — caminho ainda não decidido.",
      passo:
        "Escolher por onde o Pix é confirmado: API de banco (Inter/Sicoob/BB — mais barato, exige conta PJ), PSP (aceita PF, taxa maior) ou Open Finance (lê PF, consentimento vence). Depois definir WEBHOOK_SECRET e apontar o webhook para /api/webhooks/pagamento.",
    },
    {
      id: "calendar",
      nome: "Google Calendar",
      categoria: "agenda",
      conectado: conexaoGoogle?.ok ?? false,
      detalhe: conexaoGoogle?.ok
        ? "Conectada por OAuth para esta organização; lê a agenda e cria os eventos de sessão autorizados."
        : "Sem conexão OAuth ativa para esta organização. O iCal legado, quando existir, continua sendo apenas uma alternativa separada de leitura.",
      passo: "Conectar pela tela oficial do Google quando a plataforma estiver preparada para esta organização.",
      selo: conexaoGoogle?.ok ? "Conectada" : "Não conectada",
      seloTom: conexaoGoogle?.ok ? "verde" : "cinza",
    },
    {
      id: "stt",
      nome: "Transcrição de áudio (Groq Whisper)",
      categoria: "ia",
      conectado: sttConfigurado(),
      detalhe: sttConfigurado() ? "Upload de áudio vira texto automaticamente." : "Só colar texto manual (modo demo).",
      passo: "Definir GROQ_API_KEY (console.groq.com — gratuito para começar).",
    },
    {
      id: "ia",
      nome: "IA de resumo e copy (Anthropic)",
      categoria: "ia",
      conectado: iaConfigurada(),
      detalhe: iaConfigurada() ? "Resumos e roteiros gerados pela API real." : "Textos ilustrativos (modo demo).",
      passo: "Definir ANTHROPIC_API_KEY.",
    },
    {
      id: "meta",
      nome: "Instagram / Facebook (Meta)",
      categoria: "redes",
      conectado: metaConfigurada(),
      detalhe: metaConfigurada() ? "Métricas sincronizadas da Graph API." : "Métricas de conteúdo fictícias (modo demo).",
      passo: "App Review na Meta + META_ACCESS_TOKEN (processo mais longo — iniciar cedo).",
    },
    {
      id: "tiktok",
      nome: "TikTok",
      categoria: "redes",
      conectado: tiktokConfigurado(),
      detalhe: tiktokConfigurado() ? "Métricas sincronizadas da API oficial." : "Métricas fictícias (modo demo).",
      passo: "Cadastro em developers.tiktok.com + TIKTOK_ACCESS_TOKEN.",
    },
  ];

  const conexoes: Conexao[] = uatSintetico
    ? conexoesConfiguradas.map((conexao) =>
        conexao.id === "supabase"
          ? conexao
          : {
              ...conexao,
              conectado: false,
              detalhe: "Bloqueada neste login de homologação para impedir leitura, envio ou cobrança em serviço externo.",
              passo: "Use uma conta não sintética somente fora da homologação.",
              pendencia: undefined,
              selo: "Isolada no UAT",
              seloTom: "cinza",
            }
      )
    : conexoesConfiguradas;

  const ativas = conexoes.filter((c) => c.conectado).length;
  // Nomes das duas listas, para a memória de cálculo dizer QUAIS estão de pé.
  const nomesAtivas = conexoes.filter((c) => c.conectado).map((c) => c.nome);
  const nomesPendentes = conexoes.filter((c) => !c.conectado).map((c) => c.nome);
  const nomesPelaMetade = conexoes.filter((c) => c.conectado && c.pendencia).map((c) => c.nome);
  const idsConcluidosNoCatalogo = conexoesConfiguradas
    .filter((conexao) => conexao.conectado && !conexao.pendencia)
    .map((conexao) => conexao.id);
  if (conexaoGoogle?.ok) idsConcluidosNoCatalogo.push("agenda-leitura");
  const proximaConexao = proximaConexaoAssistidaPendente(idsConcluidosNoCatalogo);
  const pendenciaDaProxima = conexoesConfiguradas.find((conexao) => conexao.id === proximaConexao?.id)?.pendencia;
  const orientacaoGuiadaDaProxima =
    proximaConexao?.id === "planilha" && pendenciaDaProxima
      ? "A leitura já está ativa; a escrita ainda precisa ser preparada pela plataforma. Você não precisa fornecer chaves."
      : pendenciaDaProxima;

  // ---- conciliação: eventos do gateway × vendas registradas ----
  const vendasEvt = eventos.filter((e) => e.tipo === "venda" && e.status === "processado");
  const brutoGateway = vendasEvt.reduce((s, e) => s + e.valor, 0);
  const taxasGateway = vendasEvt.reduce((s, e) => s + e.taxa, 0);
  const liquidoEsperado = brutoGateway - taxasGateway;
  const comErro = eventos.filter((e) => e.status === "erro").length;
  const pendentes = eventos.filter((e) => e.status === "pendente").length;
  // demo: eventos derivam das últimas vendas → conciliação fecha 1:1
  const conciliadas = Math.min(vendasEvt.length, matriculas.length);
  const divergencia = 0;
  const processados = eventos.filter((e) => e.status === "processado").length;
  const alertasConfiguracao = conexoes.filter((conexao) => !conexao.conectado || Boolean(conexao.pendencia));
  const eventosRecentes = [...eventos].sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm)).slice(0, 3);

  // Demonstração é MODO, não "ausência de Supabase": com a planilha ligada o
  // app roda com o dado real do dono e nada aqui pode se anunciar como fictício.
  const demo = modoDados() === "demo";

  // A conta do total de linhas é a soma aba a aba — mas composição estruturada
  // pede pelo menos duas partes; com uma aba só (ou nenhuma) a frase é honesta
  // e a estrutura seria teatro.
  const composicaoLinhas: Composicao =
    abasComLinhas.length >= 2
      ? {
          formula: "soma",
          partes: abasComLinhas.map((a) => ({ rotulo: `Aba ${a.nome}`, valor: a.linhas })),
          nota: `Linhas de dado devolvidas por cada aba nesta leitura (cabeçalho já descontado). As ${abas.length - abasComLinhas.length} aba(s) vazias ou com erro entram como zero e não aparecem na lista acima. Linha totalmente em branco é DESCARTADA na leitura (paraObjetos, em src/lib/sheets/csv.ts), então esta é a contagem de linhas com algum conteúdo — não a altura da aba na planilha. Também não é o número de registros do negócio: uma linha com conteúdo pode ser um rascunho ou um total digitado à mão.`,
        }
      : `${totalLinhas} linha(s) lida(s) no total. ${abasComLinhas.length === 1 ? `Só a aba ${abasComLinhas[0].nome} devolveu dado nesta leitura` : "Nenhuma aba devolveu dado nesta leitura"} — as demais voltaram vazias ou com erro, e por isso não há soma de partes a mostrar.`;

  return (
    <main data-integracoes-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-10">
      <p className="sr-only">Diagnóstico de integrações. Esta tela só inicia OAuth seguro quando a plataforma já estiver preparada; não recebe credenciais e mantém o isolamento da homologação sintética.</p>

      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(30px,3vw,36px)] font-medium leading-none tracking-[-0.045em]">Integrações</h1>
          <p className="mt-2 text-[15px] text-texto-2">Conecte sua operação, mantenha dados seguros e saiba o que precisa de atenção</p>
        </div>
        <nav aria-label="Ações de integrações" className="flex flex-wrap items-center justify-end gap-2">
          <a href="#integracoes-por-area" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><Settings2 size={18} aria-hidden /> Guia de conexão</a>
          <a href="#todas-integracoes-pendentes" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><ListChecks size={18} aria-hidden /> Ver todas as integrações</a>
          <a href="#eventos-integracoes" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><ListChecks size={18} aria-hidden /> Ver eventos</a>
          <a href="#integracoes-por-area" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primaria px-5 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2"><Link2 size={18} aria-hidden /> Configurar integração</a>
        </nav>
      </header>

      <section data-integracoes-kpis="quatro" aria-label="Indicadores de integrações" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiIntegracao rotulo="Conexões ativas" valor={`${ativas}/${conexoes.length}`} detalhe="estado checado nesta abertura"><Link2 size={28} strokeWidth={1.6} aria-hidden /></KpiIntegracao>
        <KpiIntegracao rotulo="Alertas de configuração" valor={fmtNum(alertasConfiguracao.length)} detalhe={alertasConfiguracao.length ? "conexões pendentes" : "nenhuma pendência"} tom="ouro"><CircleAlert size={28} strokeWidth={1.6} aria-hidden /></KpiIntegracao>
        <KpiIntegracao rotulo="Eventos processados" valor={fmtNum(processados)} detalhe={demo ? "fluxo simulado" : "na base atual"} tom="ciano"><Activity size={28} strokeWidth={1.6} aria-hidden /></KpiIntegracao>
        <KpiIntegracao rotulo="Conciliação" valor="—" detalhe="não medida sem gateway real" tom="ciano"><CircleDollarSign size={28} strokeWidth={1.6} aria-hidden /></KpiIntegracao>
      </section>

      {!uatSintetico && (
        <ConexaoGoogleAssistida
          oauthPronto={googleOauthPronto}
          resultado={conexaoGoogle!}
          proxima={proximaConexao}
          pendenciaOperacional={orientacaoGuiadaDaProxima}
        />
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.68fr)_minmax(320px,1fr)]">
        <section id="integracoes-por-area" data-integracoes-inventario="completo" className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
          <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Todas as integrações ({conexoes.length})</h2>
          <ul className="mt-4 divide-y divide-borda">
            {conexoes.map((conexao) => <li key={conexao.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0"><span className="grid size-14 shrink-0 place-items-center rounded-lg border border-borda bg-poco text-primaria-2"><IconeConexao id={conexao.id} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-texto">{conexao.nome}</span><span className="mt-1 block text-xs leading-relaxed text-texto-2">{resumoHumano(conexao, conexaoGoogle, uatSintetico)}</span></span><SeloConexao conexao={conexao} /></li>)}
          </ul>
          <p className="mt-4 border-t border-borda pt-3 text-xs leading-relaxed text-texto-3">O status mostra a preparação local conhecida nesta abertura. Uma conexão preparada não substitui a homologação com o fornecedor nem executa comunicação externa.</p>
        </section>

        <aside className="grid content-start gap-3">
          <section id="todas-integracoes-pendentes" data-integracoes-pendentes="todas" className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Todas as integrações pendentes ({alertasConfiguracao.length})</h2>
            {alertasConfiguracao.length ? <ul className="mt-3 divide-y divide-borda">{alertasConfiguracao.map((conexao) => { const orientacao = orientacaoPendente(conexao, conexaoGoogle, uatSintetico); return <li key={conexao.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><CircleAlert size={22} aria-hidden className="mt-0.5 shrink-0 text-ouro" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{conexao.nome}</span><span className="mt-1 block text-xs leading-relaxed text-texto-2">{orientacao.motivo}</span><span className="mt-1 block text-xs leading-relaxed text-texto-2"><strong className="font-medium text-texto">Quem resolve:</strong> {orientacao.responsavel}</span><span className="mt-1 block text-xs leading-relaxed text-texto-2"><strong className="font-medium text-texto">Próximo passo seguro:</strong> {orientacao.proximoPasso}</span></span></li>; })}</ul> : <p className="mt-4 text-sm text-texto-3">Nenhuma integração pendente neste momento.</p>}
          </section>

          <section className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Atividade recente</h2>
            {eventosRecentes.length ? <ul className="mt-3 divide-y divide-borda">{eventosRecentes.map((evento) => <li key={evento.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${evento.status === "processado" ? "bg-positivo" : evento.status === "erro" ? "bg-negativo" : "bg-ouro"}`} aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium capitalize">{evento.tipo}</span><span className="mt-1 block text-xs text-texto-3">{fmtDateTime(evento.recebidoEm)}</span></span></li>)}</ul> : <p className="mt-4 text-sm text-texto-3">Nenhum evento recebido nesta fonte.</p>}
          </section>
        </aside>
      </div>

      <section id="eventos-integracoes" className="mt-3 rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
        <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Eventos e conciliação</h2>
        {eventos.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-[640px] w-full text-left text-sm"><thead className="border-b border-borda text-xs text-texto-2"><tr><th className="pb-3 font-medium">Evento</th><th className="px-3 pb-3 font-medium">Origem</th><th className="px-3 pb-3 font-medium">Recebido em</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody>{eventos.slice(0, 4).map((evento) => <tr key={evento.id} className="border-b border-borda/90 last:border-0"><td className="py-3.5 font-medium capitalize">{evento.tipo}</td><td className="px-3 py-3.5 capitalize text-texto-2">{evento.gateway}</td><td className="px-3 py-3.5 text-xs text-texto-2">{fmtDateTime(evento.recebidoEm)}</td><td className="py-3.5"><Badge tom={TOM_STATUS[evento.status]}>{evento.status}</Badge></td></tr>)}</tbody></table></div> : <div className="mt-4"><Vazio>Os eventos e a conciliação aparecem quando uma origem estiver conectada.</Vazio></div>}
      </section>

      <details id="diagnosticos-completos" open={searchParams?.todas === "1"} className="mt-5 rounded-xl border border-borda bg-painel/40">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-texto [&::-webkit-details-marker]:hidden">Diagnósticos e dados completos <span className="ml-2 text-xs font-normal text-texto-3">inclui detalhes de conexões, mapa, planilha e webhook</span></summary>
        <div className="border-t border-borda px-5 pb-5 pt-1">
      <PageHeader
        titulo="Integrações & Conciliação"
        sub="A fundação de dados reais: conexões, eventos do gateway e conciliação — o que tira o app do modo demonstração"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* O cartão mostra uma razão ("4/7"), não um número somável — então a
            composição é a forma string, que NOMEIA cada conexão de pé e cada
            uma que falta, em vez de fingir uma conta de partes. */}
        <Stat
          label="Conexões ativas"
          valor={`${ativas}/${conexoes.length}`}
          deltaPct={null}
          hint=""
          formato="numero"
          composicao={`${ativas} de ${conexoes.length} integrações mapeadas estão conectadas. De pé: ${nomesAtivas.join(", ") || "nenhuma"}. Ainda desligadas: ${nomesPendentes.join(", ") || "nenhuma"}.${nomesPelaMetade.length ? ` Conectadas pela metade (contam como de pé, mas ainda têm pendência): ${nomesPelaMetade.join(", ")}.` : ""} Google Calendar usa a checagem autenticada do vínculo desta organização, sem expor token nem consultar eventos; as demais linhas usam suas verificações locais.`}
          origem="Checagem em tempo de requisição: supabaseConfigurado(), sheetsConfigurado(), WEBHOOK_SECRET, conexaoGoogleAtivaDaOrganizacao(), sttConfigurado(), iaConfigurada(), metaConfigurada() e tiktokConfigurado() · lista fixa de integrações do Módulo J"
        />
        {/* total de eventos = processados + pendentes + com erro (o status só
            admite estes três valores, então a soma fecha exatamente) */}
        <Stat
          label="Eventos recebidos"
          valor={String(eventos.length)}
          deltaPct={null}
          hint={demo ? "fluxo simulado (demo)" : "últimos 100"}
          formato="numero"
          valorNumerico={eventos.length}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Processados e já refletidos no financeiro", valor: processados },
              { rotulo: "Aguardando processamento", valor: pendentes },
              { rotulo: "Com erro de mapeamento", valor: comErro },
            ],
            nota: demo
              ? "Modo demonstração: os eventos são gerados a partir das próprias vendas do app, não chegaram de um gateway real. Em produção esta lista é o log do endpoint /api/webhooks/pagamento."
              : "Log do endpoint /api/webhooks/pagamento. Evento com erro de mapeamento NÃO entra no financeiro — fica retido de propósito, para não subir venda torta.",
          }}
          origem="listEventosWebhook() → contagem dos eventos agrupados pelo campo de status (processado, pendente, erro)"
        />
        {/* Dois números num cartão só: não há uma conta única a abrir, então a
            composição descreve os dois com precisão. MENOR é melhor nos dois. */}
        <Stat
          label="Pendentes / erro"
          valor={`${pendentes} / ${comErro}`}
          deltaPct={null}
          hint={comErro ? "há evento para revisar" : ""}
          invertida
          formato="numero"
          composicao={`De ${eventos.length} evento(s) recebido(s), ${pendentes} ainda aguarda(m) processamento e ${comErro} parou(param) com erro de mapeamento; os outros ${processados} já entraram no financeiro. Aqui menor é melhor: evento parado é venda que o financeiro ainda não enxergou. Erro de mapeamento quase sempre é produto do gateway sem correspondente interno — confira o mapa de produtos abaixo.`}
          origem="listEventosWebhook() → contagem dos eventos com status pendente e com status erro, sem recorte de período"
        />
        {/* HONESTIDADE: `divergencia` é literalmente a constante 0 no código
            (linha do comentário "demo: eventos derivam das últimas vendas").
            Não existe conta por trás dela ainda — a composição diz isso. */}
        <Stat
          label="Divergência de conciliação"
          valor={fmtBRLExato(divergencia)}
          deltaPct={null}
          hint={`${conciliadas} vendas conciliadas`}
          invertida
          formato="moeda"
          valorNumerico={divergencia}
          composicao={`Zero por construção, não por conferência: no modo atual os eventos de webhook são derivados das próprias vendas já registradas, então gateway e app batem 1:1 (${conciliadas} venda(s)) e não há como divergir. Este número só passa a valer alguma coisa com gateway real ligado — aí ele vira líquido esperado pelo gateway (${fmtBRLExato(liquidoEsperado)} = bruto ${fmtBRLExato(brutoGateway)} − taxas ${fmtBRLExato(taxasGateway)}) menos o líquido efetivamente baixado no app. Enquanto isso, trate como não medido.`}
          origem="Constante fixada em 0 na própria página (src/app/(app)/integracoes/page.tsx) enquanto não há gateway real conectado — não vem de listEventosWebhook() nem de listMatriculas()"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Conexões">
          <ul className="space-y-3">
            {conexoes.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 border-b border-borda-sutil pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span
                      aria-hidden
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${c.conectado ? "bg-positivo" : "bg-texto-4"}`}
                    />
                    {c.nome}
                  </p>
                  <p className="mt-0.5 text-xs text-texto-2">{c.detalhe}</p>
                  {!c.conectado && <p className="mt-1 text-xs text-texto-3">→ {c.passo}</p>}
                  {c.conectado && c.pendencia && (
                    <p className="mt-1 text-xs text-texto-3">→ {c.pendencia}</p>
                  )}
                </div>
                <Badge tom={c.seloTom ?? (c.conectado ? "verde" : "cinza")}>
                  {c.selo ?? (c.conectado ? "Conectada" : "Demo")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card titulo="Conciliação — gateway × vendas">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-2">
                <span className="text-texto-2">Bruto informado pelo gateway</span>
                <span className="font-medium tabular-nums">{fmtBRLExato(brutoGateway)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-texto-2">Taxas retidas</span>
                <span className="tabular-nums text-negativo">− {fmtBRLExato(taxasGateway)}</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-borda-sutil pt-2">
                <span className="text-texto-2">Líquido esperado em conta</span>
                <span className="font-medium tabular-nums">{fmtBRLExato(liquidoEsperado)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-texto-2">Vendas conciliadas no app</span>
                <span className="tabular-nums text-positivo">{conciliadas}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-texto-2">Divergência</span>
                <span className="font-medium tabular-nums text-positivo">{fmtBRLExato(divergencia)}</span>
              </li>
            </ul>
            {comErro > 0 && (
              <p className="mt-3 rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
                {comErro} evento(s) com erro de mapeamento — confira o mapa de produtos abaixo.
              </p>
            )}
          </Card>

          <Card titulo="Mapa de produtos (externo → interno)">
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto na MentorOS</Th>
                  <Th>ID no gateway</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p, i) => {
                  // Fora da demonstração NÃO EXISTE mapa: `Produto` não tem campo de
                  // id de gateway, a planilha não tem coluna para ele e não há tabela
                  // de correspondência. O selo segue o identificador — sem id, ele diz
                  // que não há mapeamento; o verde fica reservado para quando houver.
                  const idExterno = demo ? `hotmart:PRD-${4210 + i * 17}` : "";
                  return (
                    <tr key={p.id}>
                      <Td className="font-medium">{p.nome}</Td>
                      <Td className="font-mono text-xs text-texto-2">{idExterno || "—"}</Td>
                      <Td>
                        {demo ? (
                          <Badge tom="cinza">Exemplo</Badge>
                        ) : idExterno ? (
                          <Badge tom="verde">Mapeado</Badge>
                        ) : (
                          <Badge tom="ouro">Sem mapeamento</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
            <p className="mt-2 text-xs text-texto-3">
              Cada produto do gateway precisa apontar para um produto interno — venda sem mapa vira evento de erro
              (nunca entra torta no financeiro).{" "}
              {demo
                ? "Os identificadores acima são ilustrativos: em demonstração não há gateway ligado para conferir contra."
                : "Este mapa ainda não existe: não há campo de identificador de gateway em Produto, nem coluna correspondente na planilha, nem tabela de correspondência — por isso nenhum produto aparece como mapeado. A coluna vazia e o selo dizem o mesmo, e nenhum dos dois promete uma ligação que o sistema não tem."}
            </p>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------------------
          A planilha como BASE DE DADOS. Não é status de variável de
          ambiente: aqui a página bate na planilha de verdade, aba por aba,
          e mostra o que voltou — inclusive o que não voltou.
          --------------------------------------------------------------- */}
      {uatSintetico ? (
        <div className="mt-4">
          <Card titulo="Diagnóstico da planilha isolado no UAT">
            <p className="text-sm leading-relaxed text-texto-2">
              Esta conta sintética não consulta a planilha configurada, não calcula indicadores de
              sincronização e não exibe o identificador do arquivo externo.
            </p>
          </Card>
        </div>
      ) : sheetsConfigurado() ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat
              label="Abas de entrada sincronizadas"
              valor={`${abasEntradaOk.length}/${abasEntrada.length}`}
              deltaPct={null}
              hint=""
              formato="numero"
              composicao={`${abasEntradaOk.length} de ${abasEntrada.length} abas de entrada do contrato responderam sem erro nesta leitura. Responderam: ${abasEntradaOk.map((a) => a.nome).join(", ") || "nenhuma"}. Não responderam: ${abasEntrada.filter((a) => a.erro !== null).map((a) => a.nome).join(", ") || "nenhuma"}. Não há conta por trás: é o resultado de uma chamada real à planilha, aba por aba, feita no carregamento desta página. Abas de fórmula e de configuração ficam fora desta contagem porque o sistema não sincroniza dado com elas.`}
              origem="lerAbas() sobre as abas de papel entrada do contrato (src/lib/sheets/abas.ts) — endereço público de leitura da planilha Base_Financeira_Operacao, com um minuto de cache"
            />
            <Stat
              label="Linhas lidas na planilha"
              valor={fmtNum(totalLinhas)}
              deltaPct={null}
              hint=""
              formato="numero"
              valorNumerico={totalLinhas}
              composicao={composicaoLinhas}
              origem={`lerAbas() sobre as ${abas.length} abas do contrato (src/lib/sheets/abas.ts) — contagem das linhas do arquivo devolvido por cada aba, já sem o cabeçalho`}
            />
            <Stat
              label="Abas que ainda faltam criar"
              valor={String(abasAFaltar.length)}
              deltaPct={null}
              hint={abasAFaltar.length ? "criar na planilha do dono" : ""}
              invertida
              formato="numero"
              valorNumerico={abasAFaltar.length}
              composicao={`${abasAFaltar.length} aba(s) que a adaptação precisa criar na planilha voltaram com erro nesta leitura: ${abasAFaltar.map((a) => a.nome).join(", ") || "nenhuma"}. Erro de leitura é o único sinal disponível — o endereço público responde erro tanto para aba inexistente quanto para planilha fora do ar ou que deixou de ser pública, então confira a mensagem de cada linha da tabela antes de sair criando aba. Abas que já existiam no arquivo do dono nunca entram nesta conta, mesmo que falhem.`}
              origem="lerAbas() sobre as abas de origem sistema do contrato (src/lib/sheets/abas.ts) — contagem das que voltaram com erro nesta requisição"
            />
          </div>

          <Card titulo={`Planilha como base de dados — ${abas.length} abas do contrato`}>
            <p className="mb-3 text-xs text-texto-3">
              Leitura ao vivo da planilha {idResumido(idPlanilha ?? "")}. Cada linha é uma aba do
              contrato: o que o sistema espera encontrar e o que a planilha devolveu agora.
            </p>
            <Tabela>
              <thead>
                <tr>
                  <Th>Aba</Th>
                  <Th>Papel</Th>
                  <Th>Origem</Th>
                  <Th num>Linhas lidas</Th>
                  <Th>Leitura</Th>
                </tr>
              </thead>
              <tbody>
                {abas.map((a) => (
                  <tr key={a.nome}>
                    <Td className="font-mono text-xs font-medium">{a.nome}</Td>
                    <Td>
                      <Badge tom={TOM_PAPEL[a.papel]}>{ROTULO_PAPEL[a.papel]}</Badge>
                    </Td>
                    <Td className="text-texto-2">{ROTULO_ORIGEM[a.origem]}</Td>
                    <Td num className="tabular-nums">
                      {a.erro === null ? fmtNum(a.linhas) : "—"}
                    </Td>
                    <Td className="max-w-[420px]">
                      {a.erro === null ? (
                        <span className="text-positivo">▲ leu sem erro</span>
                      ) : (
                        <span className="text-negativo">▼ {a.erro}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            <p className="mt-2 text-xs text-texto-3">
              As abas de papel derivado (PAINEL, DRE, FLUXO_CAIXA) são calculadas por fórmula dentro
              da planilha e o sistema nunca escreve nelas — gravar valor ali apagaria a conta do
              dono.
            </p>
          </Card>

          {/* -----------------------------------------------------------
              O que a conversão TROCOU. A regra do produto é nunca ajustar
              em silêncio: se a planilha trouxe um valor fora do vocabulário
              do sistema, ele foi substituído, e a substituição aparece aqui
              em vez de sumir dentro de um número que parece certo.
              ----------------------------------------------------------- */}
          <Card titulo="Valores que a planilha trouxe e o sistema não reconheceu">
            {!planilhaEhABase ? (
              <p className="text-sm text-texto-2">
                O Supabase está ligado e tem precedência sobre a planilha: nesta configuração o app
                lê a planilha só para o diagnóstico da tabela acima, que é leitura crua — título de
                coluna e texto da célula, sem converter valor nenhum. Nenhuma conversão roda nesta
                requisição, então não há aviso a apurar. Estes avisos aparecem quando o sistema
                estiver operando com a planilha como base de dados.
              </p>
            ) : avisosConversao.length ? (
              <>
                <p className="mb-3 text-xs text-texto-3">
                  Cada item abaixo é uma substituição feita na conversão: o valor escrito na
                  planilha não existe no vocabulário do sistema e foi lido como outro. O registro é
                  por VALOR distinto, não por linha — o mesmo valor repetido em duzentas linhas
                  aparece uma vez só, e esta tela não sabe quantas linhas foram afetadas.
                </p>
                <ul className="space-y-2">
                  {avisosConversao.map((aviso) => (
                    <li key={aviso} className="flex items-start gap-2 text-sm text-texto-2">
                      <span aria-hidden className="mt-0.5 shrink-0 text-ouro">
                        ▬
                      </span>
                      <span className="flex-1">{aviso}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-texto-2">
                Nenhuma substituição registrada até agora. O acumulador está vazio.
              </p>
            )}
            {planilhaEhABase && (
              <p className="mt-3 text-xs text-texto-3">
                Alcance desta lista: ela é o acumulado do processo do servidor desde que ele subiu,
                não desta requisição — pode conter aviso gerado por outra tela, e pode ainda não
                conter aviso de uma aba que nenhuma tela leu. Nesta página, quem converte é a
                camada de dados (PRODUTOS, VENDAS, RECEBIVEIS e RESPONSAVEIS); a tabela de abas
                acima é leitura crua e não gera aviso. O acumulador guarda no máximo 300 avisos.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="mt-4">
          <Card titulo="Planilha como base de dados">
            <p className="text-sm text-texto-2">
              Nenhuma planilha ligada: falta a variável{" "}
              <code className="font-mono text-xs">RARO_SHEETS_ID</code> com o id da
              Base_Financeira_Operacao, e a planilha precisa estar compartilhada como &quot;qualquer
              pessoa com o link&quot;. Sem isso não há o que diagnosticar aqui. O passo a passo,
              incluindo a parte da escrita, está em{" "}
              <code className="font-mono text-xs">docs/PUBLICAR-APPS-SCRIPT.md</code>.
            </p>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <Card titulo={`Eventos de webhook (${eventos.length})`}>
          {eventos.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th>Gateway</Th>
                  <Th>Transação</Th>
                  <Th>Detalhe</Th>
                  <Th num>Valor</Th>
                  <Th num>Taxa</Th>
                  <Th>Status</Th>
                  <Th num>Recebido</Th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      <Badge tom={TOM_EVENTO[e.tipo]}>{e.tipo}</Badge>
                    </Td>
                    <Td className="capitalize text-texto-2">{e.gateway}</Td>
                    <Td className="font-mono text-xs text-texto-2">{e.transacaoRef}</Td>
                    <Td className="max-w-[320px] truncate text-texto-2">{e.detalhe}</Td>
                    <Td num>{fmtBRLExato(e.valor)}</Td>
                    <Td num className="text-texto-2">{e.taxa ? fmtBRLExato(e.taxa) : "—"}</Td>
                    <Td>
                      <Badge tom={TOM_STATUS[e.status]}>{e.status}</Badge>
                    </Td>
                    <Td num className="text-xs text-texto-2">{fmtDateTime(e.recebidoEm)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhum evento recebido ainda — configure o webhook do gateway.</Vazio>
          )}
          {demo && (
            <p className="mt-2 text-xs text-texto-3">
              Fluxo simulado: em produção, cada venda/reembolso do gateway chega aqui em tempo real via
              /api/webhooks/pagamento e alimenta o financeiro automaticamente.
            </p>
          )}
        </Card>
      </div>
        </div>
      </details>
    </main>
  );
}
