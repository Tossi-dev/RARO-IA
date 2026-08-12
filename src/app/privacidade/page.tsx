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
// POR QUE HÁ MARCADORES `[PREENCHER: ...]`
// -------------------------------------------
// Razão social, CNPJ, endereço e e-mail do encarregado são dado da EMPRESA
// do dono, não do código. Inventar um valor aqui seria pior do que deixar
// em branco: um CNPJ fictício parece real até alguém conferir, e essa
// política vai ser lida por gente de fora. Um marcador gritante é honesto;
// um dado inventado é uma mentira que passa despercebida.

import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Política de Privacidade — MentorOS",
  // Mesma razão do robots do layout raiz: página institucional, não precisa
  // de resultado de busca — e como ainda tem campo a preencher (ver aviso no
  // topo), indexar agora publicaria uma versão incompleta.
  robots: { index: false, follow: false },
};

// Data de UMA atualização de verdade, escrita à mão. NUNCA `new Date()`
// aqui: uma política cuja data muda sozinha a cada visita é uma mentira
// jurídica — ela precisa dizer quando o TEXTO mudou de verdade, e só quem
// edita o texto sabe quando isso aconteceu.
const DATA_ULTIMA_ATUALIZACAO = "9 de agosto de 2026";

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Marca />
        </div>

        <AvisoRascunho />

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
              Esta política é da <Preencher>razão social</Preencher>, inscrita no CNPJ{" "}
              <Preencher>CNPJ</Preencher>, com sede em <Preencher>endereço completo</Preencher>{" "}
              ("nós"). Ela vale para o sistema MentorOS que você está usando — seja como aluno,
              responsável/afiliado ou integrante do time.
            </P>
          </Secao>

          <Secao titulo="O que este sistema faz, em uma frase">
            <P>
              O MentorOS é o painel de gestão interno da mentoria: ele organiza quem são os alunos,
              o que cada um comprou, quem paga o quê, as reuniões marcadas e o andamento
              financeiro do negócio. Ele não é uma rede social nem um produto voltado ao público —
              é uma ferramenta de uso da própria empresa.
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
              A base principal do sistema é uma <strong className="text-texto">planilha do
              Google (Google Sheets)</strong>, de propriedade da própria empresa — não é um
              serviço de terceiro contratado só para isso, é o arquivo de trabalho do negócio.
              Quando o banco de dados <strong className="text-texto">Supabase</strong> (que roda
              sobre Postgres) estiver ativado, parte dos dados passa a ficar armazenada lá também,
              como evolução do mesmo sistema — não como um destino novo e separado.
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
                Usada para ler os horários de reunião já marcados na agenda da empresa. O acesso
                pedido é <strong className="text-texto">só de leitura</strong> (escopo técnico{" "}
                <code className="font-mono text-xs">calendar.readonly</code>) — o sistema enxerga
                a agenda, mas não cria, edita nem apaga nada nela.
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
              <Preencher>e-mail do encarregado (DPO)</Preencher>. Vamos responder dentro do prazo
              previsto em lei.
            </P>
          </Secao>

          <Secao titulo="Encarregado de proteção de dados (DPO)">
            <P>
              O encarregado responsável por essa política, e por quem você pode falar sobre
              qualquer dúvida de privacidade, é <Preencher>nome do encarregado</Preencher>,
              contato <Preencher>e-mail do encarregado (DPO)</Preencher>.
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
        </footer>
      </div>
    </main>
  );
}

/**
 * Aviso fixo, no topo, avisando que a política ainda tem campo a preencher.
 *
 * NÃO some sozinho quando os marcadores forem preenchidos — de propósito.
 * Detectar "todo marcador foi trocado" em runtime, dentro de um Server
 * Component estático, seria mais código e mais lugar de bug só para
 * automatizar uma decisão de duas linhas: quando o dono preencher razão
 * social, CNPJ, endereço e e-mail do encarregado (procure `[PREENCHER:` no
 * texto ou em `<Preencher>` neste arquivo), é remover este bloco à mão antes
 * de divulgar a página.
 */
function AvisoRascunho() {
  return (
    <div className="rounded-2xl border border-aviso/40 bg-aviso/10 p-4">
      <p className="text-sm font-medium text-aviso">Rascunho — ainda não divulgar este link</p>
      <p className="mt-1.5 text-sm leading-relaxed text-texto-2">
        Esta política ainda tem campos marcados como{" "}
        <code className="font-mono text-xs text-negativo">[PREENCHER: ...]</code> — razão social,
        CNPJ, endereço e e-mail do encarregado. Preencha todos antes de divulgar esta página para
        aluno, responsável ou qualquer pessoa de fora da equipe. Depois de preencher, remova este
        aviso manualmente (ele não some sozinho).
      </p>
    </div>
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

/** Marca visível de campo que só o dono do sistema pode preencher — nunca dado inventado. */
function Preencher({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-negativo/15 px-1.5 py-0.5 font-mono text-[13px] font-medium text-negativo">
      [PREENCHER: {children}]
    </span>
  );
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
