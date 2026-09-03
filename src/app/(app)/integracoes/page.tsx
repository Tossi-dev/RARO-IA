// Módulo J — Integrações, Pagamentos & Conciliação (Blueprint v3 §4-J).
// "É o que tira o app do modo demonstração": status real de cada conexão,
// eventos de webhook, conciliação gateway × vendas e mapa de produtos.

import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, type Tom } from "@/components/ui";
import type { Composicao } from "@/lib/composicao";
import { getDB, modoDados, supabaseConfigurado } from "@/lib/data";
import { fmtBRLExato, fmtDateTime, fmtNum } from "@/lib/format";
import { agendaConfigurada, calendarConfigurado } from "@/lib/integracoes/calendar";
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

export default async function Integracoes() {
  const uatSintetico = await contaUatSinteticaAtual();
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
      conectado: Boolean(process.env.WEBHOOK_SECRET),
      detalhe: process.env.WEBHOOK_SECRET
        ? "Endpoint /api/webhooks/pagamento validando assinatura."
        : "Não existe gateway de infoproduto neste negócio: o dono recebe só por Pix. A confirmação automática precisa vir de API de banco, PSP ou agregador de Open Finance — caminho ainda não decidido.",
      passo:
        "Escolher por onde o Pix é confirmado: API de banco (Inter/Sicoob/BB — mais barato, exige conta PJ), PSP (aceita PF, taxa maior) ou Open Finance (lê PF, consentimento vence). Depois definir WEBHOOK_SECRET e apontar o webhook para /api/webhooks/pagamento.",
    },
    {
      id: "agenda-leitura",
      nome: "Agenda do Google (leitura)",
      categoria: "agenda",
      conectado: agendaConfigurada(),
      detalhe: agendaConfigurada()
        ? "A tela /agenda lê os compromissos direto do calendário, em dia, semana e mês."
        : "A tela /agenda existe, mas está sem calendário para ler.",
      passo:
        "Google Agenda → três pontinhos do calendário → Configurações e compartilhamento → Integrar agenda → copiar o Endereço secreto no formato iCal e gravar em RARO_AGENDA_ICS_URL. Não exige projeto no Google Cloud nem tela de autorização — e é SÓ LEITURA.",
    },
    {
      id: "calendar",
      nome: "Google Calendar (criar reunião)",
      categoria: "agenda",
      conectado: calendarConfigurado(),
      // Esta linha fala do caminho por VARIÁVEL DE AMBIENTE
      // (GOOGLE_REFRESH_TOKEN, em `integracoes/calendar.ts`) — a conta fixa do
      // negócio, que cria reunião sem ninguém logar. Ela não fala do caminho
      // do cookie (`google-agenda.ts` + `google-agenda-escrita.ts`), que desde
      // a Tarefa 15 escreve o evento das sessões. A frase antiga ("ainda não
      // escreve no Google — só leitura está ligada") era verdadeira sobre ESTE
      // caminho, mas aparecia colada na linha da agenda do Google e se lia
      // como "o sistema não escreve na sua agenda", o que virou falso.
      detalhe: calendarConfigurado()
        ? "Reuniões criadas direto na agenda conectada (conta fixa do negócio, por variável de ambiente)."
        : "Este caminho — a conta fixa do negócio, por GOOGLE_REFRESH_TOKEN — ainda não cria reunião. A agenda conectada pelo login do Google (tela /agenda) é outra conexão, e essa já escreve o evento das sessões sincronizadas.",
      passo: "Definir GOOGLE_CLIENT_ID/SECRET + refresh token do calendário do Jefson.",
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
    <>
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
          composicao={`${ativas} de ${conexoes.length} integrações mapeadas estão conectadas. De pé: ${nomesAtivas.join(", ") || "nenhuma"}. Ainda desligadas: ${nomesPendentes.join(", ") || "nenhuma"}.${nomesPelaMetade.length ? ` Conectadas pela metade (contam como de pé, mas ainda têm pendência): ${nomesPelaMetade.join(", ")}.` : ""} O status não vem do banco: cada linha é a checagem de presença da variável de ambiente correspondente, feita a cada carregamento da página.`}
          origem="Checagem de variáveis de ambiente em tempo de requisição: supabaseConfigurado(), sheetsConfigurado(), WEBHOOK_SECRET, calendarConfigurado(), sttConfigurado(), iaConfigurada(), metaConfigurada() e tiktokConfigurado() · lista fixa de 8 integrações do Módulo J"
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
      {sheetsConfigurado() ? (
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
    </>
  );
}
