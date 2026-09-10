/**
 * Catálogo declarativo da experiência de conexão. Não consulta ambiente,
 * banco ou fornecedor: ele só impede que a interface prometa um atalho que
 * ainda não existe ou peça um segredo ao cliente pelo navegador.
 */

export const IDS_CONEXAO_ASSISTIDA = [
  "supabase",
  "planilha",
  "gateway",
  "agenda-leitura",
  "calendar",
  "stt",
  "ia",
  "meta",
  "tiktok",
] as const;

export type IdConexaoAssistida = (typeof IDS_CONEXAO_ASSISTIDA)[number];

export type ModoConexaoAssistida =
  | "oauth"
  | "cofre_por_organizacao"
  | "configuracao_da_plataforma"
  | "decisao_de_fornecedor";

export type EstadoConexaoAssistida = "disponivel_quando_preparada" | "em_preparacao" | "decisao_pendente";

export type ConexaoAssistida = {
  id: IdConexaoAssistida;
  nome: string;
  modo: ModoConexaoAssistida;
  estado: EstadoConexaoAssistida;
  clientePodeIniciar: boolean;
  acessa: string;
  antesDeConectar: string;
  proximoPasso: string;
};

export const INTEGRACOES_ASSISTIDAS: readonly ConexaoAssistida[] = [
  {
    id: "supabase",
    nome: "Base segura do MentorOS",
    modo: "configuracao_da_plataforma",
    estado: "disponivel_quando_preparada",
    clientePodeIniciar: false,
    acessa: "Dados da própria organização no MentorOS.",
    antesDeConectar: "A base é preparada uma vez pela plataforma; o cliente não precisa fornecer chave.",
    proximoPasso: "Usar o MentorOS normalmente depois que a organização for criada.",
  },
  {
    id: "planilha",
    nome: "Planilha do Google",
    modo: "oauth",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Apenas a planilha que a organização escolher.",
    antesDeConectar: "O fluxo OAuth por organização ainda precisa substituir a configuração global atual.",
    proximoPasso: "Não cole link secreto ou chave na tela; aguarde o conector por organização.",
  },
  {
    id: "gateway",
    nome: "Confirmação automática de Pix",
    modo: "decisao_de_fornecedor",
    estado: "decisao_pendente",
    clientePodeIniciar: false,
    acessa: "Cobranças e confirmações do banco, PSP ou agregador escolhido.",
    antesDeConectar: "O fornecedor financeiro e o contrato de sandbox precisam ser definidos primeiro.",
    proximoPasso: "Não ative pagamentos reais até existir conciliação, idempotência e teste sandbox aprovados.",
  },
  {
    id: "agenda-leitura",
    nome: "Agenda do Google por iCal",
    modo: "configuracao_da_plataforma",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Compromissos do calendário escolhido, somente para leitura.",
    antesDeConectar: "O endereço iCal é um segredo de leitura e não será pedido nesta interface.",
    proximoPasso: "Prefira a conexão OAuth do Google Calendar quando ela estiver disponível para sua organização.",
  },
  {
    id: "calendar",
    nome: "Google Calendar",
    modo: "oauth",
    estado: "disponivel_quando_preparada",
    clientePodeIniciar: true,
    acessa: "Agenda escolhida para ler e criar eventos de sessão.",
    antesDeConectar: "Confira a conta Google e autorize somente as permissões exibidas pela tela oficial.",
    proximoPasso: "Conectar pelo Google e voltar ao MentorOS para verificar a agenda.",
  },
  {
    id: "stt",
    nome: "Transcrição de áudio",
    modo: "cofre_por_organizacao",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Áudios enviados após consentimento explícito da pessoa atendida.",
    antesDeConectar: "O MentorOS precisa de um cofre de credenciais por organização ou de um plano de uso gerenciado.",
    proximoPasso: "Não cole chave de API no navegador; escolha o modelo de cobrança e armazenamento seguro primeiro.",
  },
  {
    id: "ia",
    nome: "Resumo e apoio por IA",
    modo: "cofre_por_organizacao",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Texto autorizado da sessão para o objetivo escolhido pelo profissional.",
    antesDeConectar: "O MentorOS precisa de um cofre de credenciais por organização ou de um plano de uso gerenciado.",
    proximoPasso: "Manter análise automática desligada até a configuração segura e o consentimento serem confirmados.",
  },
  {
    id: "meta",
    nome: "Instagram e Facebook",
    modo: "oauth",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Métricas das contas comerciais que o cliente autorizar.",
    antesDeConectar: "O aplicativo Meta da plataforma precisa passar pela revisão aplicável antes do autoatendimento.",
    proximoPasso: "Preparar o conector OAuth e testar com uma conta comercial sandbox.",
  },
  {
    id: "tiktok",
    nome: "TikTok",
    modo: "oauth",
    estado: "em_preparacao",
    clientePodeIniciar: false,
    acessa: "Métricas da conta comercial que o cliente autorizar.",
    antesDeConectar: "O aplicativo TikTok da plataforma e suas permissões precisam ser aprovados pelo fornecedor.",
    proximoPasso: "Preparar o conector OAuth e testar com uma conta sandbox do TikTok for Developers.",
  },
];

export function conexaoAssistidaPorId(id: string): ConexaoAssistida | null {
  return INTEGRACOES_ASSISTIDAS.find((conexao) => conexao.id === id) ?? null;
}

/** Um início só existe quando o app tem uma rota segura implementada. */
export function inicioAssistido(id: string): { tipo: "oauth"; href: string } | null {
  if (id !== "calendar") return null;
  return { tipo: "oauth", href: "/api/agenda/google/entrar" };
}

/** A página consulta este limite sem expor a configuração que o sustenta. */
export function gatewayConfigurado(): boolean {
  return Boolean(process.env.WEBHOOK_SECRET);
}

/**
 * O iCal é uma alternativa legada de leitura. Quando o Calendar foi ligado
 * por OAuth, ele não deve virar uma segunda "conexão" nem bloquear o próximo
 * item útil do catálogo.
 */
export function proximaConexaoAssistidaPendente(
  concluidas: readonly string[],
): ConexaoAssistida | null {
  const concluidasSet = new Set(concluidas);
  if (concluidasSet.has("calendar")) concluidasSet.add("agenda-leitura");
  return INTEGRACOES_ASSISTIDAS.find((conexao) => !concluidasSet.has(conexao.id)) ?? null;
}
