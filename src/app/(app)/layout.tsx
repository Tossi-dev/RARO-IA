import { AvisosDock } from "@/components/avisos-dock";
import { BarraAbas } from "@/components/barra-abas";
import type { ItemPalette } from "@/components/command-palette";
import { CommandPalette } from "@/components/command-palette";
import { ROTAS_FIN } from "@/components/fin-rotas";
import { MenuMobile } from "@/components/menu-mobile";
import { FaixaSimulacao } from "@/components/simulacao";
import { Topbar, type ProdutoFonte } from "@/components/topbar";
import { sair } from "@/lib/actions";
import { montarAvisos } from "@/lib/avisos";
import { getDB, modoDadosEfetivo, supabaseConfigurado, type ModoDados } from "@/lib/data";
import { simulacaoLigada } from "@/lib/data/simulacao";
import { getFiltroGlobal } from "@/lib/filtros-server";
import { getDensidade } from "@/lib/densidade-server";
import { getTema } from "@/lib/tema-server";
import { criarSupabaseServer } from "@/lib/supabase/server";

/**
 * O aviso de fonte de dados. "Sem Supabase" deixou de significar "demonstração":
 * com a planilha ligada o app mostra o dado REAL do dono e continuar se
 * anunciando como demonstração seria mentira. Cada modo diz de onde vem o número.
 *
 * O modo `vazio` é o caso mais importante de declarar: é a única situação em que
 * a tela em branco não é um bug de carregamento, e quem estiver olhando precisa
 * ler isso antes de concluir que "o sistema perdeu os dados".
 */
function avisoDaFonte(modo: ModoDados, usuario: string, simulacao: boolean): string {
  if (simulacao) return "Modo simulação ligado · números fictícios";
  if (modo === "demo") return "Ambiente de demonstração · dados fictícios";
  if (modo === "planilha") return "Base no Google Sheets do dono · Base_Financeira_Operacao";
  if (modo === "vazio") return "Sem base conectada · nenhum dado real disponível";
  return usuario || "Banco de dados Supabase";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // `modoDadosEfetivo()` e não `modoDados()`: com a simulação ligada, o que a
  // tela está mostrando é dado fictício, e a barra tem que dizer isso.
  const simulacao = simulacaoLigada();
  const modo = modoDadosEfetivo();
  const tema = getTema();
  const densidade = getDensidade();
  // A sessão só existe onde existe Supabase Auth. Nos modos planilha, demo e
  // vazio não há projeto Supabase, e chamar o cliente aqui derrubaria o layout
  // inteiro ("supabaseUrl is required") — por isso a guarda é
  // supabaseConfigurado(), e não uma negação de modo.
  const temAuth = supabaseConfigurado();
  let usuario = "";
  if (temAuth) {
    const s = criarSupabaseServer();
    const { data } = await s.auth.getUser();
    usuario = data.user?.email ?? "—";
  }
  const filtro = getFiltroGlobal();
  const db = getDB();
  const [avisos, alunos, lancamentos, conteudos, produtos] = await Promise.all([
    montarAvisos(),
    db.listAlunos(),
    db.listLancamentos(),
    db.listConteudos(),
    db.listProdutos(),
  ]);
  // A lente global da topbar/gaveta é fonte de renda, não agrupamento: "Todos"
  // mais uma pílula por produto ATIVO cadastrado — produto inativo não é uma
  // fonte de renda em operação, não faz sentido filtrar por ele.
  const produtosAtivos: ProdutoFonte[] = produtos
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, nome: p.nome }));

  // Itens da command palette (⌘K): navegação + ações + entidades
  const itensPalette: ItemPalette[] = [
    {
      grupo: "Navegação",
      rotulo: "Início",
      href: "/",
      extra: "A tela com todos os aplicativos do sistema",
    },
    { grupo: "Navegação", rotulo: "Dashboard", href: "/painel" },
    {
      grupo: "Navegação",
      rotulo: "Tour pelos resultados",
      href: "/tour",
      extra: "Uma pergunta por tela — do quanto entrou até o que fazer hoje",
    },
    {
      grupo: "Navegação",
      rotulo: "Começar",
      href: "/comecar",
      extra: "Cadastro base: produto, responsável, conta e meta",
    },
    {
      grupo: "Navegação",
      rotulo: "Agenda",
      href: "/agenda",
      extra: "Reuniões em dia, semana e mês",
    },
    // Telas do módulo Financeiro (P1) vêm do módulo NEUTRO fin-rotas, com a
    // pergunta de negócio como texto secundário do ⌘K.
    ...ROTAS_FIN.map((r) => ({
      grupo: "Financeiro",
      rotulo: r.rotulo === "Resultado" ? "Financeiro · Resultado" : `Financeiro · ${r.rotulo}`,
      href: r.href,
      extra: r.pergunta,
    })),
    { grupo: "Navegação", rotulo: "Central de Clientes (CRM)", href: "/crm" },
    { grupo: "Navegação", rotulo: "Lançamentos", href: "/lancamentos" },
    { grupo: "Navegação", rotulo: "Conteúdo & Redes", href: "/conteudo" },
    { grupo: "Navegação", rotulo: "Ranking de conteúdos", href: "/conteudo/ranking" },
    { grupo: "Navegação", rotulo: "Campanhas", href: "/conteudo/campanhas" },
    { grupo: "Navegação", rotulo: "Integrações", href: "/integracoes" },
    { grupo: "Ações", rotulo: "Registrar venda / despesa", href: "/financeiro" },
    { grupo: "Ações", rotulo: "Adicionar cliente", href: "/crm" },
    { grupo: "Ações", rotulo: "Criar lançamento", href: "/lancamentos" },
    { grupo: "Ações", rotulo: "Criar campanha", href: "/conteudo/campanhas" },
    ...alunos.slice(0, 60).map((a) => ({
      grupo: "Clientes",
      rotulo: a.nome,
      href: `/crm/${a.id}`,
      extra: a.email,
    })),
    ...lancamentos.map((l) => ({
      grupo: "Lançamentos",
      rotulo: l.nome,
      href: `/lancamentos/${l.id}`,
    })),
    ...conteudos.slice(0, 40).map((c) => ({
      grupo: "Conteúdos",
      rotulo: c.titulo,
      href: `/conteudo/${c.id}`,
      extra: c.plataforma,
    })),
  ];

  return (
    <div className="min-h-screen">
      {/* Dois borrões enormes e difusos nos cantos de cima, atrás de tudo. É o
          que impede o fundo escuro de parecer chapado — sem isto o app fica
          com cara de fundo preto e card cinza. Não intercepta clique. */}
      <div className="aurora" aria-hidden />
      <AvisosDock dados={avisos} />
      <CommandPalette itens={itensPalette} />
      {/* A confissão vem ANTES de qualquer número da página, e ocupa espaço de
          propósito: aviso que some sozinho não estava lá na hora da decisão. */}
      {simulacao && <FaixaSimulacao />}
      {/* A sidebar de 248px saiu da tela a pedido do cliente ("a maioria das
          aplicações já virou aplicativo, o resto pode tirar — tirar o elemento
          visual, a funcionalidade mantém"). Ela não foi apagada do projeto:
          <SidebarNav /> continua sendo a navegação completa da gaveta do
          celular (src/components/menu-mobile.tsx). No desktop, o mesmo caminho
          existe por três portas — a tela inicial em "/", a marca da topbar que
          leva até ela, e o ⌘K, que acha qualquer tela pelo nome. */}
      <div className="mx-auto max-w-[1600px]">
        <div className="min-w-0 flex-1">
          <Topbar
            modo={modo}
            usuario={usuario}
            fonte={filtro.fonte}
            produtos={produtosAtivos}
            rangeDias={filtro.rangeDias}
            tema={tema}
            densidade={densidade}
            simulacao={simulacao}
            pendencias={avisos.reunioesHoje.length + avisos.tarefas.length}
            fonteDoDado={avisoDaFonte(modo, usuario, simulacao)}
          >
            {temAuth && (
              <form action={sair}>
                <button className="text-texto-2 transition-colors hover:text-texto">Sair</button>
              </form>
            )}
          </Topbar>
          <MenuMobile
            tema={tema}
            densidade={densidade}
            simulacao={simulacao}
            fonteAtiva={filtro.fonte}
            produtos={produtosAtivos}
            rangeDias={filtro.rangeDias}
            fonte={avisoDaFonte(modo, usuario, simulacao)}
          >
            {temAuth && (
              <form action={sair}>
                <button className="toque py-1 text-texto-3 transition-colors hover:text-texto">
                  Sair da conta
                </button>
              </form>
            )}
          </MenuMobile>
          {/* O padding-bottom extra no celular é espaço reservado para a barra
              de abas fixa (barra-abas.tsx) não tampar o fim do conteúdo — 4,75rem
              cobre a altura da barra com folga, e o `env(safe-area-inset-bottom)`
              soma o home indicator do iPhone por cima disso. No desktop
              (`md:p-7`) não existe barra de abas, então o padding volta ao
              valor de sempre nos quatro lados. */}
          <main className="px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-4 md:p-7">
            {children}
          </main>
          <BarraAbas pendencias={avisos.reunioesHoje.length + avisos.tarefas.length} />
        </div>
      </div>
    </div>
  );
}
