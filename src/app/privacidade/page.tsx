// Política de privacidade pública — precisa abrir sem login (o portão em
// `src/lib/acesso.ts` já lista `/privacidade` em ROTAS_LIVRES). Por isso
// esta tela fica FORA do grupo `(app)`: aquele layout busca dado da
// planilha/banco para montar menu e KPI, e a política tem que abrir mesmo
// quando a planilha está fora do ar ou a pessoa nunca fez login.
//
// POR QUE O TEXTO NÃO É JURIDIQUÊS COPIADO
// -------------------------------------------
// Quem lê isto é aluno, responsável ou afiliado — pessoa comum, não
// advogado. Uma política que ninguém entende não cumpre a LGPD de verdade,
// só finge cumprir. O texto abaixo descreve o que o sistema REALMENTE faz —
// lido em `src/lib/types.ts`, `src/lib/sheets/abas.ts` e
// `src/lib/integracoes/*` antes de escrever — e não o que uma política
// genérica de internet diria.
//
import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Política de Privacidade — MentorOS",
  robots: { index: true, follow: true },
};

// Data de UMA atualização de verdade, escrita à mão. NUNCA `new Date()`
// aqui: uma política cuja data muda sozinha a cada visita é uma mentira
// jurídica — ela precisa dizer quando o TEXTO mudou de verdade, e só quem
// edita o texto sabe quando isso aconteceu.
const DATA_ULTIMA_ATUALIZACAO = "29 de setembro de 2026";

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Marca />
        </div>

        <header className="mt-6">
          <h1 className="font-display text-[26px] font-fino leading-tight tracking-tight text-texto">
            Política de Privacidade
          </h1>
          <p className="mt-1.5 text-sm text-texto-3">
            Última atualização: {DATA_ULTIMA_ATUALIZACAO}
          </p>
        </header>

        <article className="mt-8 space-y-8">
          <Secao titulo="Quem somos">
            <P>
              Esta política é de <strong className="text-texto">Guilherme Oliveira Lima Tossi</strong>,
              responsável pela operação do MentorOS como pessoa física ("nós"). Ela vale para o
              sistema MentorOS que você está usando — seja como aluno, responsável/afiliado ou
              integrante do time.
            </P>
          </Secao>

          <Secao titulo="O que este sistema faz, em uma frase">
            <P>
              O MentorOS é uma ferramenta de apoio para profissionais e pessoas acompanhadas em
              jornadas de mentoria: ele organiza clientes, sessões, metas, tarefas, conteúdos e
              informações operacionais necessárias ao acompanhamento.
            </P>
          </Secao>

          <Secao titulo="Quais dados tratamos">
            <P>
              Tratamos os dados abaixo porque eles são o que o dia a dia da mentoria produz — não
              coletamos nada além do necessário para vender, ensinar, cobrar e atender.
            </P>
            <ListaDados />
          </Secao>

          <Secao titulo="Onde esses dados ficam guardados">
            <P>
              Os dados operacionais do MentorOS são armazenados no
              <strong className="text-texto"> Supabase</strong>, uma plataforma baseada em
              Postgres. Em workspaces que ainda usam uma planilha de operação, dados podem também
              ser lidos de uma <strong className="text-texto">planilha Google</strong> configurada
              pelo responsável do workspace.
            </P>
            <P>
              O aplicativo em si (as telas que você está vendo) roda hospedado na{" "}
              <strong className="text-texto">Vercel</strong>, uma infraestrutura de nuvem que
              serve o site — ela processa a exibição das páginas, mas não é dona do dado nem o
              usa para nada além de entregar a tela pedida.
            </P>
            <P>
              <strong className="text-texto">Não vendemos dado nenhum, para ninguém.</strong> Não
              compartilhamos nome, telefone, e-mail ou histórico de pagamento com terceiros para
              fins de publicidade ou qualquer finalidade fora do que está descrito nesta política.
            </P>
          </Secao>

          <Secao titulo="Quem mais tem acesso a esses dados">
            <P>
              Além da equipe da mentoria, alguns serviços externos processam parte do dado — só
              quando a integração está ativa, e só o dado estritamente necessário para a função
              de cada um:
            </P>
            <ul className="mt-3 space-y-3">
              <ItemIntegracao titulo="Agenda do Google (Google Calendar)">
                Usada para ler os horários de reunião já marcados na agenda da empresa, e para
                sincronizar as sessões de mentoria que o próprio mentor manda agendar. O acesso
                pedido cobre leitura e escrita de eventos (escopo técnico{" "}
                <code className="font-mono text-xs">calendar.readonly</code> +{" "}
                <code className="font-mono text-xs">calendar.events</code>): além de enxergar a
                agenda, o sistema pode criar, atualizar e cancelar o evento de uma sessão — só
                dela, só quando o mentor pede a sincronização. Nenhum outro evento da agenda é
                tocado: o sistema marca os eventos que ele mesmo cria e confere essa marca antes
                de alterar ou cancelar qualquer coisa; evento sem a marca é recusado.
              </ItemIntegracao>
              <ItemIntegracao titulo="Gateway de pagamento">
                Quando uma cobrança é processada por um gateway (por exemplo Hotmart, Kiwify ou
                outro), ele avisa o sistema por um webhook (uma notificação automática) sobre
                vendas, estornos e disputas. O gateway já detém o dado de pagamento por conta
                própria — o sistema apenas recebe a confirmação do que aconteceu.
              </ItemIntegracao>
              <ItemIntegracao titulo="Inteligência artificial (Anthropic), quando ativada">
                Recursos de resumo de reunião e geração de texto usam a API da Anthropic.{" "}
                <strong className="text-texto">
                  O texto enviado para gerar esse resultado sai da infraestrutura da empresa e é
                  processado pelos servidores da Anthropic
                </strong>{" "}
                antes de a resposta voltar para a tela. Enquanto essa integração não está
                configurada, o sistema mostra textos de exemplo e nada é enviado para fora.
              </ItemIntegracao>
              <ItemIntegracao titulo="Transcrição de áudio (Groq), quando ativada">
                Se um áudio de reunião for enviado para virar texto, ele é processado pelos
                servidores da Groq — mesma lógica da IA acima: só acontece quando a integração
                está configurada, e o áudio enviado sai da infraestrutura da empresa até a
                transcrição voltar pronta.
              </ItemIntegracao>
            </ul>
          </Secao>

          <Secao titulo="Por que podemos tratar esses dados (base legal)">
            <P>
              Tratamos os dados de aluno, matrícula e pagamento porque eles são necessários para{" "}
              <strong className="text-texto">executar o contrato</strong> entre você e a
              mentoria — vender, dar acesso ao produto, cobrar e prestar suporte não funcionam
              sem esse mínimo de informação. Os dados de gestão interna (como comissão de
              responsável/afiliado e histórico de atividade) são tratados com base no{" "}
              <strong className="text-texto">legítimo interesse</strong> da empresa em administrar
              o próprio negócio, sempre de forma proporcional e sem prejudicar os direitos de
              quem é dono do dado.
            </P>
          </Secao>

          <Secao titulo="Por quanto tempo guardamos o dado">
            <P>
              Guardamos os dados enquanto a relação com você durar (matrícula ativa, contrato em
              vigor) e pelo tempo adicional exigido por obrigação legal — por exemplo, documento
              fiscal e financeiro que a lei brasileira exige manter por um período mínimo mesmo
              depois do fim do contrato. Passado esse prazo, o dado é apagado ou anonimizado.
            </P>
          </Secao>

          <Secao titulo="Seus direitos como titular do dado">
            <P>A Lei Geral de Proteção de Dados (LGPD) garante que você pode, a qualquer momento:</P>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-texto-2">
              <li>confirmar se tratamos algum dado seu, e pedir acesso a ele;</li>
              <li>pedir a correção de dado incompleto, desatualizado ou incorreto;</li>
              <li>
                pedir a exclusão do seu dado, respeitadas as obrigações legais de guarda descritas
                acima;
              </li>
              <li>pedir a portabilidade do seu dado para outro serviço;</li>
              <li>saber com quem compartilhamos seu dado, e revogar consentimento quando aplicável.</li>
            </ul>
            <P className="mt-3">
              Para exercer qualquer um desses direitos, entre em contato pelo e-mail{" "}
              <a className="underline underline-offset-2 hover:text-texto" href="mailto:guilhermetossi2@gmail.com">
                guilhermetossi2@gmail.com
              </a>. Vamos responder dentro do prazo previsto em lei.
            </P>
          </Secao>

          <Secao titulo="Encarregado de proteção de dados (DPO)">
            <P>
              Para dúvidas sobre privacidade ou sobre esta política, fale diretamente com
              Guilherme Oliveira Lima Tossi pelo e-mail{" "}
              <a className="underline underline-offset-2 hover:text-texto" href="mailto:guilhermetossi2@gmail.com">
                guilhermetossi2@gmail.com
              </a>.
            </P>
          </Secao>

          <Secao titulo="Mudanças nesta política">
            <P>
              Se esta política mudar, atualizamos a data no topo da página. Mudanças relevantes
              serão comunicadas pelos canais habituais de contato com você.
            </P>
          </Secao>
        </article>

        <footer className="mt-10 border-t border-borda-sutil pt-6 text-xs text-texto-3">
          <Link href="/" className="trans toque underline underline-offset-2 hover:text-texto-2">
            Voltar para o início
          </Link>
          <span className="px-2" aria-hidden="true">·</span>
          <Link href="/termos" className="trans toque underline underline-offset-2 hover:text-texto-2">
            Termos de Uso
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[17px] font-normal tracking-tight text-texto">{titulo}</h2>
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm leading-relaxed text-texto-2 ${className ?? ""}`}>{children}</p>;
}

function ItemIntegracao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-borda-sutil bg-superficie-1 p-3.5">
      <p className="text-sm font-medium text-texto">{titulo}</p>
      <p className="mt-1 text-sm leading-relaxed text-texto-2">{children}</p>
    </li>
  );
}

/** Os dados de fato tratados pelo sistema — lidos de `src/lib/types.ts` e
 *  `src/lib/sheets/abas.ts`, não inventados. Cada bloco corresponde a uma
 *  entidade real do produto (Aluno, Matricula, Reuniao, Atividade, Afiliado). */
function ListaDados() {
  const grupos = [
    {
      titulo: "Dado de aluno",
      itens: ["nome", "telefone", "e-mail", "origem (canal pelo qual chegou até a mentoria)"],
    },
    {
      titulo: "Dado de matrícula e pagamento",
      itens: [
        "produto comprado e valor",
        "forma de pagamento (Pix, cartão, débito...)",
        "status do pagamento (pago, pendente, reembolsado)",
        "parcelas e data de recebimento",
      ],
    },
    {
      titulo: "Dado de reunião",
      itens: ["título, horário e com quem foi marcada", "link de acesso", "resumo/transcrição, quando gerado"],
    },
    {
      titulo: "Dado de atividade",
      itens: ["histórico de contato, nota e tarefa ligados ao aluno ao longo da jornada"],
    },
    {
      titulo: "Dado de responsável/afiliado",
      itens: ["nome, WhatsApp, chave Pix e comissão de quem vende ou atende pela empresa"],
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {grupos.map((g) => (
        <div key={g.titulo} className="rounded-xl border border-borda-sutil bg-superficie-1 p-3.5">
          <p className="text-sm font-medium text-texto">{g.titulo}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-texto-2">
            {g.itens.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
