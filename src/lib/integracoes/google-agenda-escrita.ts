// Escrita na agenda do Google: criar, atualizar e cancelar o evento de uma
// sessão de mentoria — companheiro de escrita de `./google-agenda.ts`
// (leitura). Tarefa 15 do plano.
//
// ENTRADA DESTE MÓDULO
// ---------------------
// As três funções recebem o evento JÁ PRONTO — o mesmo formato que
// `eventoDaSessao` (`src/lib/mentoria/calendario.ts`) produz: título,
// descrição, início/fim em ISO e a lista de convidados. Este arquivo NÃO
// monta texto de evento, não conhece `Sessao` nem `Mentorado`, e não decide
// o que pode ou não aparecer na descrição — essa responsabilidade (o
// VOCABULÁRIO FECHADO da descrição, ver o cabeçalho de `calendario.ts`) fica
// inteira na Tarefa 14. Por isso a interface `EventoParaGoogle` abaixo é uma
// cópia ESTRUTURAL do formato de `EventoDeCalendario`, e não um import dele:
// `mentoria/` já importa de `integracoes/` (camada de baixo); importar de
// volta daqui inverteria a direção de dependência do projeto. TypeScript
// aceita passar um `EventoDeCalendario` onde se espera um `EventoParaGoogle`
// sem conversão nenhuma, porque a forma é idêntica — a duplicação é só de
// declaração de tipo, não de lógica.
//
// TOKEN: reaproveita `accessTokenDoCookie` e `googleAppConfigurado`,
// exportadas de `./google-agenda.ts` (ver o comentário grande ao lado da
// exportação de `accessTokenDoCookie`, lá). As três funções aqui NUNCA leem
// o cookie diretamente nem reimplementam o POST de refresh — é o mesmo
// cookie httpOnly, o mesmo fluxo, um só lugar que pode ter bug de token.
//
// NUNCA LANÇA, DE VERDADE (revisão pós-laudo do revisor independente):
// todas devolvem `{ ok, erro }` em QUALQUER circunstância — rede fora do ar,
// JSON corrompido na resposta do Google (refresh OU escrita), `cookies()`
// lançando (fora de contexto de requisição). A PRIMEIRA versão deste
// arquivo só cobria o `fetch`/`r.json()` da chamada de ESCRITA dentro do
// `try`; a chamada de `accessTokenDoCookie()` (que por sua vez faz outro
// fetch + outro `r.json()`, dentro de `google-agenda.ts`) ficava FORA — uma
// rede caindo bem ali, ou o Google devolvendo um corpo que não é JSON no
// refresh, subia como exceção crua até quem chamou a Server Action. O
// consertos é `comTokenDoGoogle` (abaixo) envolver TUDO — leitura de cookie,
// refresh de token, conferência e chamada de escrita — num único `try`. Uma
// chamada que falha aqui não pode derrubar a Server Action que agendou a
// sessão — a sessão já foi salva no banco antes de qualquer tentativa de
// sincronizar com o Google; a agenda é um espelho, não a fonte da verdade.
//
// UMA EXCEÇÃO À REGRA "NUNCA LANÇA": O BAILOUT DINÂMICO DO NEXT. Este
// módulo é chamado de Server Actions, mas nada IMPEDE um Server Component de
// chamá-lo durante a renderização — e ali `cookies()` lança um
// `DynamicServerError` que não é falha nenhuma: é o Next avisando que a
// página precisa sair do cache estático e renderizar dinamicamente. Engolir
// esse erro faria a página ser cacheada com o resultado errado, em silêncio.
// Por isso ele é RELANÇADO, exatamente como `src/lib/data/simulacao.ts` já
// faz (mesmo `digest`, mesma checagem) — a casa já tem um padrão para isso,
// e ter dois comportamentos diferentes para o mesmo erro seria a próxima
// cicatriz. Todo o resto continua virando `{ ok:false, erro }`.
//
// SEGREDO NUNCA VAZA: nem o access_token nem o refresh_token entram em
// `erro` (mensagem para humano), em log, ou em querystring — o Authorization
// vai sempre no CABEÇALHO da chamada. Este projeto já teve um incidente
// exatamente de segredo em querystring; não repetir. Isso inclui o TEXTO DA
// EXCEÇÃO: `String(erro)` de um fetch pode carregar cabeçalho ou corpo da
// requisição junto — ou seja, `Bearer ya29...` e
// `refresh_token=...&client_secret=...` — e por isso a exceção é descartada
// sem nunca ser lida (o teste "exceção com segredo na mensagem" prova).
//
// SÓ MEXE NO QUE ELE MESMO CRIOU: `criarEventoDaSessao` carimba o evento com
// `extendedProperties.private[CHAVE_ORIGEM_EVENTO]`, e
// `atualizarEventoDaSessao`/`cancelarEventoDaSessao` LEEM o evento antes de
// escrever, recusando qualquer um que não traga o carimbo. Ver o comentário
// de `conferirOrigem` para o custo aceito e o motivo.

import { accessTokenDoCookie, googleAppConfigurado, googleConectado } from "./google-agenda";

/** Mesmo formato de saída de `eventoDaSessao` — ver nota de layering acima. */
export interface EventoParaGoogle {
  titulo: string;
  descricao: string;
  /** ISO 8601 em UTC (ex.: `Date#toISOString()`). */
  inicioIso: string;
  /** ISO 8601 em UTC. */
  fimIso: string;
  convidados: string[];
}

export interface ResultadoEscritaAgenda {
  ok: boolean;
  /** Motivo em português, para humano. Ausente quando `ok`. Nunca é token. */
  erro?: string;
}

export interface ResultadoCriacaoAgenda extends ResultadoEscritaAgenda {
  /** Id do evento no Google — só presente quando `ok`. Guardar para depois
   *  atualizar/cancelar (`atualizarEventoDaSessao`/`cancelarEventoDaSessao`). */
  eventoGoogleId?: string;
}

// Fuso fixo — mesmo valor e mesmo motivo de `FUSO_BRASIL` em
// `mentoria/calendario.ts`: a mentoria é um produto brasileiro.
const FUSO_EVENTO = "America/Sao_Paulo";

/**
 * A marca de origem: a chave em `extendedProperties.private` que diz "este
 * evento nasceu aqui".
 *
 * `private` (e não `shared`) porque a propriedade só precisa existir para o
 * dono do calendário — quem foi convidado não tem nada com isso, e `shared`
 * viajaria para a cópia do evento na agenda de cada convidado.
 *
 * Exportadas porque o teste precisa afirmar o valor exato: uma marca que o
 * `criar` grava e o `atualizar` procura com outro nome viraria "recusa
 * tudo", inclusive o que o próprio sistema criou — e sem asserção de valor
 * isso passaria como se estivesse funcionando.
 */
export const CHAVE_ORIGEM_EVENTO = "mentoros_origem";
export const VALOR_ORIGEM_EVENTO = "sessao-de-mentoria";

// BAIXO 6 do laudo — três causas de "não deu para falar com o Google", três
// mensagens diferentes, porque cada uma tem um responsável e uma correção
// diferentes:
//
//   1. SEM COOKIE — ninguém conectou a conta (ou desconectou). Quem resolve
//      é o dono do produto, clicando em "Entrar com o Google" de novo.
//   2. APP SEM CREDENCIAL — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` não
//      estão configurados no servidor. Quem resolve é QUEM PUBLICA o
//      sistema — nenhum clique de usuário final resolve isso, e a mensagem
//      antiga ("Entre com a conta do Google") mandava a pessoa errada
//      clicar num botão que nunca ia funcionar.
//   3. CONEXÃO EXPIRADA/REVOGADA — cookie presente, app configurado, mas o
//      Google recusa o refresh (token revogado, conta removida, etc.).
//      Resolve reconectando — mesma ação da causa 1, mas o texto deixa
//      claro que HOUVE conexão antes (evita o dono achar que nunca chegou
//      a conectar).
const MOTIVO_SEM_COOKIE =
  "A conexão com o Google não está ativa. Entre com a conta do Google (Integrações → Agenda) para sincronizar este evento.";

const MOTIVO_APP_NAO_CONFIGURADO =
  "O aplicativo ainda não está configurado para falar com o Google: faltam as credenciais do servidor (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET). Quem publica o sistema precisa configurá-las antes de qualquer sincronização de agenda funcionar.";

const MOTIVO_CONEXAO_EXPIRADA =
  "A conexão com o Google expirou ou foi revogada. Entre de novo com a conta do Google para sincronizar este evento.";

// Conta conectada ANTES da Tarefa 15 tem um refresh token que só cobre
// `calendar.readonly` (ver comentário em `google-agenda.ts`). A API do
// Google recusa a escrita com 403 (mais comum, "insufficient permission")
// ou 401 dependendo do caso — dos dois lados o conserto é o mesmo clique
// ("Entrar com o Google" de novo), e é isso que a mensagem diz, em vez de
// mandar o dono investigar um "HTTP 403" genérico que não aponta para nada
// acionável.
const MOTIVO_ESCOPO_INSUFICIENTE =
  "Esta conta foi conectada antes de o app pedir permissão de agenda; entre de novo com o Google para autorizar.";

// MÉDIO 4 do laudo: o Google aceitou a criação (200), mas devolveu um corpo
// sem `id`. Persistir `eventoGoogleId: undefined` deixaria o evento ÓRFÃO —
// `cancelarEventoDaSessao(undefined)` trata "sem id" como "nada a fazer" (é
// o comportamento certo para sessão nunca sincronizada), então um id que
// deveria existir e sumiu vira, silenciosamente, um evento que nunca mais é
// cancelado. Por isso isto é ERRO, não sucesso com dado faltando.
const MOTIVO_ID_AUSENTE =
  "O Google aceitou a chamada, mas não devolveu o identificador do evento; tente sincronizar de novo.";

// MÉDIO 4 da rodada 3 — o evento existe, mas não tem a marca de origem: é
// compromisso de outra pessoa (ou da própria pessoa, criado à mão). Pode ser
// `evento_google_id` errado no banco, id reaproveitado pelo Google depois de
// um apagamento, ou dado de outro ambiente. Em qualquer um dos casos o certo
// é NÃO escrever: sobrescrever título, horário e convidados de um compromisso
// pessoal é estrago que ninguém desfaz, e a política de privacidade promete,
// por escrito, que isso não acontece.
const MOTIVO_EVENTO_ALHEIO =
  "Esse compromisso não foi criado por este sistema; não vou sobrescrever um evento que não é meu. Confira o vínculo da sessão com o evento da agenda.";

// GET devolveu 404/410 no caminho de ATUALIZAR: o evento que a sessão diz ter
// não existe mais (alguém apagou pelo Google). Não recriamos por conta
// própria — recriar seria decidir, no lugar do mentor, que a sessão continua
// valendo e que o convite deve ir de novo para o mentorado. Aqui só se avisa.
const MOTIVO_EVENTO_SUMIU =
  "O evento desta sessão não existe mais na agenda do Google (foi apagado por lá). Sincronize a sessão de novo para criar um evento novo.";

function motivoGenerico(acao: string, status: number): string {
  return `O Google recusou ${acao} (HTTP ${status}). Tente de novo em alguns minutos.`;
}

/** Rede caiu, JSON corrompido, `cookies()` explodiu — qualquer exceção
 *  crua vira este texto humano, específico da ação tentada. O texto da
 *  exceção original nunca é exposto (poderia, em tese, ecoar cabeçalho ou
 *  corpo da requisição em algum runtime). */
function motivoFalhaInesperada(acao: string): string {
  return `Não foi possível concluir a chamada ao Google para ${acao} (falha de conexão ou resposta inesperada). Tente de novo.`;
}

interface EventoGoogleCorpo {
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string }>;
  status?: "cancelled";
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * `EventoParaGoogle` -> corpo JSON da API do Google Calendar.
 *
 * DECISÃO DE FUSO (#4 do plano): o Google exige `timeZone` junto de
 * `dateTime`, senão interpreta a hora no fuso PADRÃO DO CALENDÁRIO (que pode
 * não ser America/Sao_Paulo — é uma propriedade da conta, não deste app).
 * `inicioIso`/`fimIso` já chegam em UTC com "Z" (saída de
 * `eventoDaSessao`/`Date#toISOString`), o que por si só já é um instante sem
 * ambiguidade — mas mandamos `timeZone: "America/Sao_Paulo"` explicitamente
 * mesmo assim, em vez de omitir: um `dateTime` com "Z" e `timeZone` ausente
 * funciona hoje, mas depende de um comportamento não documentado como
 * contrato pela API do Google para o campo instantâneo (o campo existe,
 * segundo a documentação, para ancorar RECORRÊNCIA — que este evento não
 * tem, mas nada garante que sempre será assim). Mandar os dois juntos, com o
 * `dateTime` já absoluto, é redundante e nunca conflitante — e não deixa a
 * interpretação do horário do lado do calendário do destinatário.
 */
function corpoDoEvento(evento: EventoParaGoogle): EventoGoogleCorpo {
  const corpo: EventoGoogleCorpo = {
    summary: evento.titulo,
    description: evento.descricao,
    start: { dateTime: evento.inicioIso, timeZone: FUSO_EVENTO },
    end: { dateTime: evento.fimIso, timeZone: FUSO_EVENTO },
    // A marca vai em TODA escrita, não só na criação: o PATCH de atualização
    // reafirma o carimbo, então um evento que perdeu a propriedade (edição
    // manual pelo Google, importação/exportação) volta a ser reconhecível na
    // próxima sincronização, em vez de virar "alheio" para sempre.
    extendedProperties: { private: { [CHAVE_ORIGEM_EVENTO]: VALOR_ORIGEM_EVENTO } },
  };
  if (evento.convidados.length > 0) {
    corpo.attendees = evento.convidados.map((email) => ({ email }));
  }
  return corpo;
}

type RespostaGoogle =
  | { ok: true; id?: string }
  | { ok: false; erro: string };

const URL_EVENTOS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * O bailout dinâmico do Next sobe; o resto, não.
 *
 * Cópia deliberada do `catch` de `simulacaoLigada` em
 * `src/lib/data/simulacao.ts` — mesmo `digest`, mesma decisão. Em
 * renderização estática, `cookies()` lança um `DynamicServerError` que o
 * PRÓPRIO Next captura para desistir do cache; engolir esse erro faz a
 * página ser cacheada com o resultado errado, sem nenhum sintoma visível.
 * Não é falha a tratar: é sinalização de framework.
 */
function relancarSeForBailoutDoNext(erro: unknown): void {
  const digest = (erro as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("DYNAMIC_SERVER_USAGE")) throw erro;
}

/**
 * Cookie + token + a operação inteira, num único `try`.
 *
 * TUDO que pode lançar mora DENTRO dele (ALTO 1 do laudo): a leitura do
 * cookie (`googleConectado`), o refresh do token (`accessTokenDoCookie` —
 * que internamente faz fetch + `r.json()` em `google-agenda.ts`), e a
 * `operacao` inteira, que é onde ficam a conferência de origem, a montagem
 * do corpo do evento e o fetch de escrita. Montar o corpo aqui dentro é o
 * que faz um `EventoParaGoogle` malformado (sem `convidados`, típico de
 * linha de banco convertida com `as`) virar `{ok:false, erro}` em vez de
 * `TypeError` crua na cara de quem chamou.
 */
async function comTokenDoGoogle(
  acaoParaErro: string,
  operacao: (token: string) => Promise<RespostaGoogle>
): Promise<RespostaGoogle> {
  try {
    if (!googleConectado()) return { ok: false, erro: MOTIVO_SEM_COOKIE };

    const token = await accessTokenDoCookie();
    if (!token) {
      // `accessTokenDoCookie` devolve `null` tanto quando falta credencial
      // do app quanto quando o refresh foi recusado pelo Google — as duas
      // causas exigem mensagem (e responsável) diferentes (BAIXO 6).
      return {
        ok: false,
        erro: googleAppConfigurado() ? MOTIVO_CONEXAO_EXPIRADA : MOTIVO_APP_NAO_CONFIGURADO,
      };
    }

    return await operacao(token);
  } catch (erro) {
    relancarSeForBailoutDoNext(erro);
    // O `erro` NÃO é lido daqui para baixo: `String(erro)` de uma falha de
    // fetch pode trazer cabeçalho/corpo da requisição junto — ou seja, o
    // access token e o refresh token. Motivo genérico é o preço de não
    // vazar segredo em tela.
    return { ok: false, erro: motivoFalhaInesperada(acaoParaErro) };
  }
}

/** Uma chamada de escrita (POST cria, PATCH atualiza/cancela). */
async function escreverNoGoogle(
  metodo: "POST" | "PATCH",
  caminho: string,
  corpo: unknown,
  token: string,
  acaoParaErro: string
): Promise<RespostaGoogle> {
  const r = await fetch(`${URL_EVENTOS}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });

  if (r.status === 401 || r.status === 403) {
    return { ok: false, erro: MOTIVO_ESCOPO_INSUFICIENTE };
  }
  if (!r.ok) {
    return { ok: false, erro: motivoGenerico(acaoParaErro, r.status) };
  }

  const dados = (await r.json()) as { id?: string };
  return { ok: true, id: dados.id };
}

type Conferencia =
  | { situacao: "nosso" }
  | { situacao: "alheio" }
  | { situacao: "sumiu" }
  | { situacao: "falhou"; erro: string };

/**
 * Lê o evento ANTES de escrever nele e diz se ele é nosso.
 *
 * POR QUE ISTO EXISTE, E O QUE CUSTA. A política de privacidade
 * (`src/app/privacidade/page.tsx`) diz, em página pública, que "nenhum outro
 * evento da agenda é tocado". Sem esta conferência aquilo era só uma frase:
 * `atualizar`/`cancelar` mandavam PATCH em QUALQUER id recebido, então um
 * `evento_google_id` errado ou obsoleto no banco sobrescreveria título,
 * descrição, horário e convidados de um compromisso pessoal do mentor — e o
 * texto público continuaria dizendo que isso não pode acontecer.
 *
 * O CUSTO FOI ACEITO CONSCIENTEMENTE: uma chamada HTTP a mais por
 * sincronização (GET antes de cada PATCH), com a latência que vem junto. A
 * troca é essa: ou o código impõe a promessa, ou a promessa vira mentira em
 * texto de tratamento de dados — que é a pior espécie de mentira que um
 * sistema pode contar, porque é lida por quem não tem como conferir. Encolher
 * a frase da política em vez de cumprir a promessa seria mais barato e pior.
 *
 * 404/410 não é erro aqui, é informação: o evento não existe mais. Quem
 * decide o que fazer com isso é cada função pública (para `cancelar` é
 * sucesso; para `atualizar`, não).
 */
async function conferirOrigem(
  id: string,
  token: string,
  acaoParaErro: string
): Promise<Conferencia> {
  const r = await fetch(`${URL_EVENTOS}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // 410 (Gone) é o que o Google devolve para evento já apagado de vez; 404
  // para id que nunca existiu naquele calendário. Para quem chama, os dois
  // significam a mesma coisa: não há evento lá.
  if (r.status === 404 || r.status === 410) return { situacao: "sumiu" };
  if (r.status === 401 || r.status === 403) {
    return { situacao: "falhou", erro: MOTIVO_ESCOPO_INSUFICIENTE };
  }
  if (!r.ok) return { situacao: "falhou", erro: motivoGenerico(acaoParaErro, r.status) };

  const dados = (await r.json()) as {
    extendedProperties?: { private?: Record<string, string> };
  };
  const marca = dados.extendedProperties?.private?.[CHAVE_ORIGEM_EVENTO];
  // Igualdade exata, não "existe a chave": marca com outro valor é evento de
  // outro sistema (ou de outro ambiente), e vale a mesma recusa.
  return marca === VALOR_ORIGEM_EVENTO ? { situacao: "nosso" } : { situacao: "alheio" };
}

/** Cria o evento da sessão na agenda do Google. */
export async function criarEventoDaSessao(
  evento: EventoParaGoogle
): Promise<ResultadoCriacaoAgenda> {
  const acao = "criar o evento";
  const r = await comTokenDoGoogle(acao, (token) =>
    // `corpoDoEvento` é chamado AQUI DENTRO (dentro do `try`) de propósito —
    // ver `comTokenDoGoogle`. É ele quem carimba a marca de origem que a
    // conferência de `atualizar`/`cancelar` vai procurar depois.
    escreverNoGoogle("POST", "", corpoDoEvento(evento), token, acao)
  );
  if (!r.ok) return { ok: false, erro: r.erro };
  // MÉDIO 4 (rodada 2): 200 sem `id` não é sucesso — ver `MOTIVO_ID_AUSENTE`.
  if (!r.id) return { ok: false, erro: MOTIVO_ID_AUSENTE };
  return { ok: true, eventoGoogleId: r.id };
}

/** Atualiza o evento já criado (`eventoGoogleId`) com os dados atuais da sessão. */
export async function atualizarEventoDaSessao(
  eventoGoogleId: string,
  evento: EventoParaGoogle
): Promise<ResultadoEscritaAgenda> {
  const id = (eventoGoogleId || "").trim();
  if (id === "") {
    // Diferente de `cancelarEventoDaSessao`: não há "nada a atualizar" que
    // valha como sucesso — se a sessão nunca foi criada no Google, chamar
    // "atualizar" é o chamador usando a função errada, e dizer isso é mais
    // útil do que fingir que funcionou.
    return { ok: false, erro: "Esta sessão ainda não tem evento no Google para atualizar." };
  }
  const acao = "atualizar o evento";
  const r = await comTokenDoGoogle(acao, async (token) => {
    const conferencia = await conferirOrigem(id, token, acao);
    if (conferencia.situacao === "falhou") return { ok: false, erro: conferencia.erro };
    // Sumiu: não recriamos por conta própria (ver `MOTIVO_EVENTO_SUMIU`).
    if (conferencia.situacao === "sumiu") return { ok: false, erro: MOTIVO_EVENTO_SUMIU };
    if (conferencia.situacao === "alheio") return { ok: false, erro: MOTIVO_EVENTO_ALHEIO };
    return escreverNoGoogle(
      "PATCH",
      `/${encodeURIComponent(id)}`,
      corpoDoEvento(evento),
      token,
      acao
    );
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

/**
 * Cancela o evento da sessão.
 *
 * DECISÃO #5 do plano — `PATCH status: "cancelled"`, nunca `DELETE`: um
 * DELETE remove o evento da agenda de todo mundo que foi convidado, sem
 * aviso nenhum — quem tinha a sessão marcada simplesmente vê o compromisso
 * sumir. `status: cancelled` mantém o evento visível, mas riscado/marcado
 * como cancelado — o convidado sabe que a sessão não vai mais acontecer, em
 * vez de só notar a ausência.
 *
 * Como `atualizar`, confere a marca de origem antes de escrever (ver
 * `conferirOrigem`): cancelar um compromisso pessoal do mentor por causa de
 * um id errado no banco seria tão destrutivo quanto sobrescrevê-lo.
 *
 * `eventoGoogleId` ausente/vazio -> `ok: true` sem chamar a API: sessão que
 * nunca foi sincronizada com o Google não tem o que cancelar lá, e isso não
 * é uma falha — é o estado esperado (sessão cancelada antes de qualquer
 * tentativa de criar o evento, ou Google nunca foi conectado). Tratar como
 * erro obrigaria quem chama a filtrar esse caso toda vez antes de chamar.
 */
export async function cancelarEventoDaSessao(
  eventoGoogleId: string | null | undefined
): Promise<ResultadoEscritaAgenda> {
  const id = (eventoGoogleId ?? "").trim();
  if (id === "") return { ok: true };

  const acao = "cancelar o evento";
  const r = await comTokenDoGoogle(acao, async (token) => {
    const conferencia = await conferirOrigem(id, token, acao);
    if (conferencia.situacao === "falhou") return { ok: false, erro: conferencia.erro };
    // Sumiu: mesma lógica do id vazio — cancelar o que já não existe é o
    // resultado que se queria. Devolver erro aqui obrigaria quem chama a
    // tratar um "problema" que não é problema nenhum.
    if (conferencia.situacao === "sumiu") return { ok: true };
    if (conferencia.situacao === "alheio") return { ok: false, erro: MOTIVO_EVENTO_ALHEIO };
    return escreverNoGoogle(
      "PATCH",
      `/${encodeURIComponent(id)}`,
      { status: "cancelled" },
      token,
      acao
    );
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}
