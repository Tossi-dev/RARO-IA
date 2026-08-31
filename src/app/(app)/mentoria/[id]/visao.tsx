// A parte PURA de apresentação da ficha do mentorado — recebe a `Ficha`
// (contrato de `src/lib/mentoria/dados.ts`), o `HistoricoDaFicha`
// (`dados-historico.ts`, que já traz os fatos ordenados e o score de saúde) e
// um `erro` opcional (já traduzido, vindo de `?erro=`), e só desenha.
// `page.tsx` cuida da busca (`lerFicha`/`lerHistorico`) e da leitura de
// `params`/`searchParams`; nenhuma consulta aqui — mesma disciplina de
// `../portal/visao.tsx`.
//
// NÃO usa `notFound()` — mesma razão do `page.tsx` original: `lerFicha`
// distingue "não existe" (`conectado: true`, `mentorado: null`) de "não
// consegui ler" (`conectado: false`), e a tela precisa deixar essa
// diferença visível.
//
// ESTA É A FICHA DO TIME, E ELA MOSTRA O QUE É DO TIME. A aba "Histórico"
// desenha os fatos como `lerHistorico` os devolveu, INCLUSIVE os `interno`
// (nota de CRM, cobrança, temperatura do lead). O portal é a outra tela, e é
// lá que `projetarParaPortal` (historico.ts) corta — trocar as duas por
// engano em qualquer direção é o defeito mais caro possível aqui: ou o time
// perde metade da história, ou o cliente ganha a metade que não é dele.

import Link from "next/link";
import { Tabs } from "@/components/tabs";
import { Timeline } from "@/components/timeline";
import { Badge, Botao, Campo, Card, Input, PageHeader, ProgressBar, Select, TextArea, Vazio, cx, type Tom } from "@/components/ui";
import type { ListaDocumentos } from "@/lib/documentos/dados";
import { agendarSessao, darBaixaNaSessao } from "@/lib/mentoria/acoes";
import { gravarScoreSemanal } from "@/lib/mentoria/acoes-score";
import { analisarSessao } from "@/lib/ia/acoes-analise";
import {
  liberarNoPortalDaFicha,
  sincronizarSessaoDaFicha,
  transcreverSessaoDaFicha,
  vincularAudioDaFicha,
} from "@/lib/mentoria/acoes-ficha";
import type { Ficha } from "@/lib/mentoria/dados";
import type { HistoricoDaFicha } from "@/lib/mentoria/dados-historico";
import type { FatoHistorico, TipoFato } from "@/lib/mentoria/historico";
import { NIVEL_SAUDE_MENTORADO_LABEL, type NivelSaudeMentorado, type SaudeMentorado } from "@/lib/mentoria/saude-mentorado";
import type { Sessao, StatusMentorado, StatusSessao } from "@/lib/mentoria/tipos";
import { STATUS_BAIXA_VALORES } from "@/lib/mentoria/validacao";
import type { Atividade, AtividadeTipo } from "@/lib/types";
import {
  AVISO_LIBERAR_EM_TURMA,
  AVISO_LIBERAR_GRAVACAO,
  AVISO_LIBERAR_TRANSCRICAO,
  dataBr,
  dataHoraBr,
  estadoDaAgendaDaSessao,
  variacaoScore,
} from "../textos";
import { DocumentosDoMentorado } from "./documentos";
import { ConteudosLiberados } from "./liberados";
import { Grafo } from "./grafo";
import { MapaAtendimento } from "./mapa-atendimento";
import { PlanoAcao } from "./plano-acao";
import { RoteiroSessao } from "./roteiro-sessao";

const LABEL_STATUS_MENTORADO: Record<StatusMentorado, string> = {
  lead: "Lead",
  ativo: "Ativo",
  pausado: "Pausado",
  alumni: "Alumni",
};

const TOM_STATUS_MENTORADO: Record<StatusMentorado, Tom> = {
  lead: "cinza",
  ativo: "verde",
  pausado: "ouro",
  alumni: "azul",
};

const LABEL_STATUS_SESSAO: Record<StatusSessao, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  faltou: "Faltou",
  cancelada: "Cancelada",
};

const TOM_STATUS_SESSAO: Record<StatusSessao, Tom> = {
  agendada: "azul",
  realizada: "verde",
  faltou: "vermelho",
  cancelada: "cinza",
};

/** Tom da pílula de variação do score — sobe é bom, desce é ruim, empate é neutro. */
const TOM_VARIACAO: Record<"▲" | "▼" | "▬", Tom> = {
  "▲": "verde",
  "▼": "vermelho",
  "▬": "cinza",
};

// Rótulo dos três status que `darBaixaNaSessao` aceita (STATUS_BAIXA_VALORES,
// única fonte da verdade em `validacao.ts` — o `<select>` da baixa nunca
// pode oferecer uma opção que a Server Action recusaria). Reaproveita o
// mesmo texto de LABEL_STATUS_SESSAO, sem repetir a tradução à mão.
const LABEL_STATUS_BAIXA: Record<(typeof STATUS_BAIXA_VALORES)[number], string> = {
  realizada: LABEL_STATUS_SESSAO.realizada,
  faltou: LABEL_STATUS_SESSAO.faltou,
  cancelada: LABEL_STATUS_SESSAO.cancelada,
};

// ============================================================
// Card "Saúde do mentorado"
// ============================================================

const COR_NIVEL_SAUDE: Record<NivelSaudeMentorado, string> = {
  critico: "text-negativo",
  atencao: "text-aviso",
  saudavel: "text-positivo",
  excelente: "text-ouro",
};

/** Os fatores que não pontuaram, nomeados — é o texto da parcialidade. */
function nomesSemBase(saude: SaudeMentorado): string {
  return saude.fatores
    .filter((fator) => !fator.temBase)
    .map((fator) => fator.nome)
    .join(", ");
}

/**
 * O score de saúde, os fatores e — sempre — o que ficou de fora.
 *
 * As três coisas que este card NÃO faz, e por quê:
 *
 * 1) Não desenha `0` nem barra quando `score` é `null`. `saude-mentorado.ts`
 *    devolve `null` justamente para obrigar cada tela a decidir o que dizer
 *    sem base, em vez de deixar a ausência de dado virar nota baixa — e a
 *    tela que desenha zero transforma "não sei" em "vai mal", com cor
 *    semântica e tudo. Aqui a ausência é dita com todas as letras.
 * 2) Não esconde a parcialidade. Score renormalizado sobre 55 pontos é uma
 *    afirmação diferente de score sobre 100, e a diferença tem que estar na
 *    tela: o denominador considerado aparece, e os fatores de fora aparecem
 *    NOMEADOS. Um "71" solto pareceria completo.
 * 3) Não recalcula nada. O número vem inteiro de `lerHistorico`, que o pega
 *    de `saudeDoMentorado` — a única conta de saúde do sistema. Qualquer
 *    aritmética aqui seria a segunda conta entrando pela porta dos fundos.
 * 4) Não transforma falha de leitura em afirmação sobre a pessoa. "Não deu
 *    para ler" e "não há o que medir" chegam aqui parecidos (nos dois casos a
 *    saúde vem sem base) e saem diferentes na tela — ver `semLeituraCompleta`
 *    abaixo. Sem essa separação, um `permission denied` viraria "nenhuma
 *    sessão passada" na ficha de quem está em dia.
 */
function CardSaudeMentorado({ historico }: { historico: HistoricoDaFicha }) {
  const { saude } = historico;
  const total = saude.fatores.length;
  const comBase = saude.fatores.filter((fator) => fator.temBase).length;

  // Leitura incompleta + saúde sem base é o par que `lerHistorico` produz
  // quando UMA das quatro consultas da conta falha (ver "A CONTA DA SAÚDE SÓ
  // RODA SOBRE LEITURA COMPLETA", em `dados-historico.ts`): a saúde vem da
  // conta de sempre chamada com LISTAS VAZIAS, e lista vazia lá dentro quer
  // dizer "não houve". Sem esta distinção, um `permission denied` da RLS
  // chega ao mentor como "nenhuma sessão passada com presença registrada" e
  // "sem matrícula" — afirmação categórica sobre a vida de alguém que pode
  // estar em dia, deduzida de um vazio que ninguém verificou. Aqui a tela
  // para de deduzir: diz que não leu tudo, e não diz mais nada.
  const semLeituraCompleta = historico.parcial && saude.semBase;

  // Histórico que não pôde ser lido não tem score para mostrar — e o motivo
  // ("não deu para ler") não é o mesmo que "não há dado", então a frase é
  // outra. Confundir os dois faria a tela culpar o mentorado por uma falha
  // de leitura.
  if (!historico.conectado) {
    return (
      <Card titulo="Saúde do mentorado">
        <p className="text-sm text-texto-2">{historico.motivo}</p>
      </Card>
    );
  }

  return (
    <Card
      titulo="Saúde do mentorado"
      acao={
        <span className="text-[11px] text-texto-3">
          {semLeituraCompleta
            ? "leitura incompleta"
            : saude.semBase
              ? `nenhum dos ${total} fatores com base`
              : `${comBase} de ${total} fatores com base · peso considerado ${saude.maxComBase}`}
        </span>
      }
    >
      {/* Regra 4 de `dados-historico.ts` aplicada à aba que ABRE: o aviso de
          parcialidade que já existia vivia só dentro de `AbaHistorico`, e
          `Tabs` desenha aquele painel `hidden` — ou seja, ninguém lia. */}
      {historico.parcial ? (
        <p className="mb-4 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm text-aviso">
          Parte da leitura falhou agora: o que falta abaixo pode ser leitura que não veio, e não
          ausência na vida do mentorado. Atualize a página em instantes.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="rounded-xl border border-borda-sutil bg-poco p-4 text-center">
          {saude.score === null || saude.nivel === null ? (
            <>
              <p
                className="font-display text-2xl font-semibold text-texto-3"
                aria-label="Score de saúde do mentorado"
              >
                {semLeituraCompleta ? "não calculado" : "sem base"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-texto-3">
                {semLeituraCompleta ? "leitura incompleta" : "nada a pontuar"}
              </p>
              <p className="mt-3 text-left text-[11px] leading-relaxed text-texto-3">
                {semLeituraCompleta
                  ? "A conta da saúde não roda sobre leitura incompleta: o score não está baixo, ele não foi calculado. Daqui não dá para saber se falta andamento registrado ou se faltou leitura."
                  : `Nenhum dos ${total} fatores tem dado suficiente para pontuar. Sem sessão passada, tarefa vencida, matrícula ou score registrado, qualquer nota seria inventada — registre o andamento e o score aparece.`}
              </p>
            </>
          ) : (
            <>
              <p
                className={cx(
                  "font-display text-5xl font-semibold tabular-nums",
                  COR_NIVEL_SAUDE[saude.nivel]
                )}
                aria-label="Score de saúde do mentorado"
              >
                {saude.score}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-texto-3">
                {NIVEL_SAUDE_MENTORADO_LABEL[saude.nivel]}
              </p>
              <div className="mt-3">
                <ProgressBar pct={saude.score} tom={saude.score >= 80 ? "ouro" : "violeta"} />
              </div>
              {saude.parcial ? (
                <p className="mt-3 text-left text-[11px] leading-relaxed text-aviso">
                  Score parcial: calculado só sobre {comBase} de {total} fatores, num total de{" "}
                  {saude.maxComBase} pontos possíveis. Ficaram de fora, por não haver o que medir:{" "}
                  {nomesSemBase(saude)}.
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Todos os fatores, com base ou sem — o `detalhe` de cada um é a
            frase que `saude-mentorado.ts` já escreveu explicando a conta (ou
            a falta dela). A tela não reescreve nenhuma.

            MENOS quando a leitura veio pela metade: aí cada `detalhe` é uma
            frase escrita sobre lista vazia ("nenhuma sessão passada com
            presença registrada"), e listar as cinco seria trocar um "não
            consegui ler" por cinco afirmações sobre a pessoa. */}
        {semLeituraCompleta ? (
          <p className="self-start text-xs leading-relaxed text-texto-3">
            Os fatores não são detalhados enquanto a leitura estiver incompleta: a frase de cada um
            descreve o que foi lido, e o que não foi lido viraria afirmação sobre o mentorado.
          </p>
        ) : (
          <ul className="space-y-1">
            {saude.fatores.map((fator) => (
              <li key={fator.chave} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-texto-2">
                  <span className={cx("font-medium", fator.temBase ? "text-texto" : "text-texto-3")}>
                    {fator.nome}
                  </span>{" "}
                  — {fator.detalhe}
                </span>
                <span className="shrink-0 tabular-nums text-texto-3">
                  {fator.pontos === null ? `sem base · peso ${fator.max}` : `${fator.pontos} de ${fator.max} pts`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Aba "Histórico"
// ============================================================

/**
 * De que TIPO de atividade cada fato do histórico se parece, para reusar a
 * `Timeline` que a ficha do CRM já usa (`src/components/timeline.tsx`, que
 * fala `Atividade`).
 *
 * `Record<TipoFato, …>` de propósito: tipo novo em `TIPOS_FATO` sem entrada
 * aqui NÃO COMPILA — o mesmo cinto de `VISIBILIDADE_POR_TIPO` em
 * `historico.ts`, pelo mesmo motivo (o erro aparece antes do review, não na
 * tela).
 *
 * "sistema" é o destino de tudo que não é literalmente um encontro, uma
 * tarefa, uma nota ou uma mensagem — e não é preguiça: o rótulo da `Timeline`
 * é uma AFIRMAÇÃO sobre o que aconteceu. Chamar uma cobrança de "Compra"
 * diria que alguém pagou; chamar um fato de `atividade` de "Contato" ou
 * "Ligação" escolheria um canal que ninguém registrou (o tipo original da
 * atividade não atravessa `FatoHistorico`). "Sistema" diz só o que se sabe:
 * é um registro do sistema. O QUE aconteceu já está no título que
 * `historico.ts` escreveu ("Cobrança vencida — R$ 500,00", "Marco: …").
 */
const TIPO_ATIVIDADE_DO_FATO: Record<TipoFato, AtividadeTipo> = {
  marco: "sistema",
  sessao: "evento",
  tarefa: "tarefa",
  conteudo: "sistema",
  documento_portal: "sistema",
  documento_interno: "sistema",
  cobranca: "sistema",
  score: "sistema",
  temperatura: "sistema",
  nota: "nota",
  atividade: "sistema",
  interacao: "whatsapp",
};

/**
 * Os fatos, no formato que a `Timeline` desenha.
 *
 * NADA é filtrado e nada é higienizado aqui: esta é a ficha do TIME, e é a
 * tela onde o fato interno PRECISA aparecer (a nota do CRM, a cobrança
 * vencida, a temperatura do lead). `projetarParaPortal` é o portão da OUTRA
 * tela — usar essa projeção aqui esvaziaria justamente a metade que o
 * histórico 360° existe para juntar. Quem garante que este conjunto só chega
 * a quem pode vê-lo é a RLS, mais o `papeis.ts` da rota — nunca este arquivo.
 *
 * `alunoId` vai vazio porque a `Timeline` não o usa (é campo de `Atividade`,
 * o formato que ela fala); inventar um id aqui seria dado falso viajando sem
 * necessidade. A chave usa o índice porque a lista é estática dentro de um
 * render e dois fatos podem ser idênticos em tudo (dois "Mensagem recebida"
 * no mesmo segundo) — o índice é o único desempate honesto.
 */
function atividadesDoHistorico(fatos: readonly FatoHistorico[]): Atividade[] {
  return fatos.map((fato, indice) => ({
    id: `${indice}-${fato.tipo}`,
    alunoId: "",
    tipo: TIPO_ATIVIDADE_DO_FATO[fato.tipo],
    titulo: fato.titulo,
    detalhe: fato.detalhe,
    data: fato.quando,
  }));
}

function AbaHistorico({ historico }: { historico: HistoricoDaFicha }) {
  // Sem conexão não existe "nenhuma atividade registrada": isso seria uma
  // afirmação sobre a vida da pessoa a partir de uma falha de leitura. O que
  // a tela sabe é o motivo, e é o motivo que ela mostra.
  if (!historico.conectado) {
    return (
      <Card titulo="Histórico">
        <p className="text-sm text-texto-2">{historico.motivo}</p>
      </Card>
    );
  }

  return (
    <Card titulo={`Histórico (${historico.fatos.length})`}>
      {/* Regra 4 de `dados-historico.ts`: histórico incompleto é entregue,
          mas nunca em silêncio — sem este aviso, o buraco de uma leitura que
          falhou viraria "ela não fez nada em maio". */}
      {historico.parcial ? (
        <p className="mb-3 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm text-aviso">
          Parte do histórico não pôde ser lida agora, e o que está abaixo pode estar incompleto. Atualize a
          página em instantes.
        </p>
      ) : null}
      <Timeline atividades={atividadesDoHistorico(historico.fatos)} />
    </Card>
  );
}

/**
 * O bloco de agenda e transcrição de UMA sessão, dentro do histórico da ficha.
 *
 * TRÊS DECISÕES QUE ESTE BLOCO TOMA, E POR QUÊ
 * --------------------------------------------
 * 1) **A transcrição não é impressa aqui.** O bloco diz SE existe e QUANDO foi
 *    feita; o texto em si é longo e é a conversa inteira do cliente. Imprimir
 *    por padrão coloca a fala dele em qualquer tela que alguém deixe aberta —
 *    e o teste de vazamento do portal já provou que transcrição impressa é o
 *    tipo de coisa que passa despercebida.
 * 2) **O botão de sincronizar não some quando o Google está desligado**: ele
 *    vira um link de download do `.ics`. Função que some é função que o dono
 *    conclui que não existe, e ele fica esperando por um recurso que já está
 *    ali em outra forma.
 * 3) **Os interruptores são dois formulários, não um checkbox.** Sem JavaScript
 *    no meio, cada clique é um POST explícito com o valor de destino já
 *    calculado — e o rótulo do botão diz o que VAI acontecer, não o estado
 *    atual. Um switch que muda sozinho ao passar o dedo é a interface errada
 *    para uma ação cujo erro publica a conversa de um cliente.
 */
function AgendaETranscricaoDaSessao({
  sessao,
  mentoradoId,
  agendaConectada,
}: {
  sessao: Sessao;
  mentoradoId: string;
  agendaConectada: boolean;
}) {
  const agenda = estadoDaAgendaDaSessao(sessao, agendaConectada);
  const sincronizada = sessao.eventoGoogleId.trim() !== "";
  const tomAgenda: Tom = agenda.degradado ? "cinza" : sincronizada ? "verde" : "ouro";
  // Sessão de turma: `turmaId` preenchido é o que a define (0006 garante o XOR
  // com `matriculaId`). É a mesma pergunta que `eventoDaSessao` faz para não
  // convidar ninguém — o que é coletivo carrega gente que não foi consultada.
  const emTurma = sessao.turmaId !== null;

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-borda-sutil bg-poco px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-texto-2">Agenda</span>
        <Badge tom={tomAgenda}>{agenda.rotulo}</Badge>
        {agenda.degradado ? (
          // Link, e não botão de formulário: `.ics` é arquivo, e baixar arquivo
          // é GET. A rota do outro lado é read-only de propósito — ver o
          // cabeçalho de `api/agenda/sessao/[sessaoId]/route.ts`.
          <a
            href={`/api/agenda/sessao/${sessao.id}`}
            className="trans rounded-full border border-borda px-3 py-1.5 text-xs text-texto-2 hover:border-borda-forte hover:bg-eleva hover:text-texto"
          >
            Baixar convite (.ics)
          </a>
        ) : (
          <form action={sincronizarSessaoDaFicha}>
            <input type="hidden" name="mentoradoId" value={mentoradoId} />
            <input type="hidden" name="sessaoId" value={sessao.id} />
            <Botao tipo="fantasma">{sincronizada ? "Atualizar na agenda" : "Sincronizar com a agenda"}</Botao>
          </form>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-texto-2">Transcrição</span>
          {/* O ESTADO da transcrição, nunca o texto dela. */}
          <span className="text-xs text-texto-2">
            {sessao.transcritaEm
              ? `gerada em ${dataHoraBr(sessao.transcritaEm) || "data não informada"}`
              : "ainda não transcrita"}
          </span>
        </div>
        <form action={transcreverSessaoDaFicha} className="space-y-2">
          <input type="hidden" name="mentoradoId" value={mentoradoId} />
          <input type="hidden" name="sessaoId" value={sessao.id} />
          <Campo label="Transcrição manual">
            <TextArea name="texto" rows={5} placeholder="Cole ou digite a transcrição desta sessão." />
          </Campo>
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Visibilidade">
              <Select name="visibilidade" defaultValue="privada_profissional">
                <option value="privada_profissional">Somente equipe</option>
                <option value="compartilhavel">Compartilhável no portal</option>
              </Select>
            </Campo>
            <Botao tipo="fantasma">Salvar transcrição manual</Botao>
          </div>
        </form>
        <form action={vincularAudioDaFicha} encType="multipart/form-data" className="space-y-2 border-t border-borda-sutil pt-2">
          <input type="hidden" name="mentoradoId" value={mentoradoId} />
          <input type="hidden" name="sessaoId" value={sessao.id} />
          <Campo label="Áudio da sessão autorizado">
            <Input type="file" name="arquivo" accept="audio/*,video/mp4,video/webm,video/quicktime" />
          </Campo>
          <p className="text-xs text-texto-2">
            O profissional confirma que houve consentimento explícito para esta sessão. O áudio fica privado e vinculado à sessão antes de qualquer transcrição.
          </p>
          <label className="flex items-start gap-2 text-xs text-texto-2">
            <input type="checkbox" name="confirmarConsentimento" value="1" required />
            Confirmo o consentimento explícito do cliente para enviar este áudio à transcrição automática.
          </label>
          <Botao tipo="fantasma">Vincular áudio privado</Botao>
        </form>
      </div>

      <div className="space-y-2 border-t border-borda-sutil pt-2">
        <span className="text-xs font-medium text-texto-2">O que o mentorado vê no portal</span>

        <div>
          <form action={liberarNoPortalDaFicha}>
            <input type="hidden" name="mentoradoId" value={mentoradoId} />
            <input type="hidden" name="sessaoId" value={sessao.id} />
            <input type="hidden" name="campo" value="gravacao" />
            {/* O valor de DESTINO, calculado aqui: o botão diz o que vai
                acontecer, e o POST carrega exatamente isso. */}
            <input type="hidden" name="valor" value={sessao.gravacaoLiberada ? "0" : "1"} />
            <Botao tipo="fantasma">
              {sessao.gravacaoLiberada ? "Ocultar gravação do portal" : "Liberar gravação no portal"}
            </Botao>
          </form>
          <p className="mt-1 text-xs text-texto-2">{AVISO_LIBERAR_GRAVACAO}</p>
        </div>

        <div>
          <form action={liberarNoPortalDaFicha}>
            <input type="hidden" name="mentoradoId" value={mentoradoId} />
            <input type="hidden" name="sessaoId" value={sessao.id} />
            <input type="hidden" name="campo" value="transcricao" />
            <input type="hidden" name="valor" value={sessao.transcricaoLiberada ? "0" : "1"} />
            <Botao tipo="fantasma">
              {sessao.transcricaoLiberada ? "Ocultar transcrição do portal" : "Liberar transcrição no portal"}
            </Botao>
          </form>
          <p className="mt-1 text-xs text-texto-2">{AVISO_LIBERAR_TRANSCRICAO}</p>
          {emTurma ? (
            <p className="mt-1 text-xs font-medium text-ouro">{AVISO_LIBERAR_EM_TURMA}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FichaVisao({
  ficha,
  historico,
  documentos,
  erro,
  agendaConectada = false,
}: {
  ficha: Ficha;
  historico: HistoricoDaFicha;
  /**
   * Há uma conta do Google ligada neste navegador? Resolvido pela página
   * (`googleConectado()` lê cookie, e cookie é assunto de borda) e passado
   * pronto para cá, mantendo `FichaVisao` uma função sync e testável.
   *
   * Padrão `false` — fail-closed no sentido honesto: sem saber, a tela diz
   * "agenda não conectada" e oferece o `.ics`, que funciona sempre. O inverso
   * ofereceria um botão de sincronizar que não tem como funcionar.
   */
  agendaConectada?: boolean;
  /**
   * Os arquivos deste mentorado, já lidos por `lerDocumentosDoMentorado`.
   *
   * Obrigatório, e não opcional: a lista carrega `conectado`/`motivo`, ou
   * seja, ela sabe dizer sozinha que a leitura falhou. Uma prop opcional
   * criaria um terceiro estado — o bloco inteiro sumindo da ficha sem que
   * ninguém tivesse decidido isso, e sem nada escrito na tela explicando a
   * ausência.
   */
  documentos: ListaDocumentos;
  erro?: string;
}) {
  // Estado 1: sem Supabase configurado, ou a leitura falhou — mesma frase
  // humana da carteira, mesmo `motivo` pronto de `lerFicha`.
  if (!ficha.conectado) {
    return (
      <>
        <p className="mb-2 text-xs text-texto-2">
          <Link href="/mentoria" className="hover:text-primaria-2">
            ← Mentoria
          </Link>
        </p>
        <Card>
          <p className="text-sm text-texto-2">{ficha.motivo}</p>
        </Card>
      </>
    );
  }

  // Estado 2: conectou, mas este id não existe (ou não é mais deste
  // workspace). Regra 7 de `dados.ts` — nunca vira `notFound()`.
  if (!ficha.mentorado) {
    return (
      <>
        <p className="mb-2 text-xs text-texto-2">
          <Link href="/mentoria" className="hover:text-primaria-2">
            ← Mentoria
          </Link>
        </p>
        <Card>
          <Vazio>
            Não encontramos este mentorado. Ele pode ter sido removido, ou o link está errado —{" "}
            <Link href="/mentoria" className="text-primaria-2 hover:underline">
              volte para a carteira
            </Link>
            .
          </Vazio>
        </Card>
      </>
    );
  }

  const { mentorado } = ficha;
  const variacao = variacaoScore(ficha.scores);
  const tarefasAbertas = ficha.tarefas.filter((t) => !t.concluida);

  // As duas abas: o que a ficha sempre mostrou (agora com a saúde no topo)
  // e a linha do tempo unificada. `Tabs` recebe conteúdo já renderizado,
  // então as duas nascem juntas — a de trás não fica esperando um clique
  // para ir ao banco.
  const visaoGeral = (
    <>
      <CardSaudeMentorado historico={historico} />

      <div className="mt-4 space-y-4">
        <MapaAtendimento atendimento={ficha.atendimento} />
        <RoteiroSessao atendimento={ficha.atendimento} />
        <PlanoAcao atendimento={ficha.atendimento} />
        <Grafo atendimento={ficha.atendimento} />
      </div>

      <Card titulo="Ações de evolução" className="mt-4">
        <p className="text-sm text-texto-2">Quem dispara é uma pessoa. O score é calculado com os dados existentes; a análise fica registrada com o nome de quem clicou.</p>
        <form action={gravarScoreSemanal} className="mt-3">
          <input type="hidden" name="mentoradoId" value={mentorado.id} />
          <Botao tipo="fantasma">Calcular score desta semana</Botao>
        </form>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card titulo="Contato">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-texto-2">Telefone</dt>
              <dd>{mentorado.telefone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-texto-2">E-mail</dt>
              <dd className="truncate">{mentorado.email || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card titulo="Matrículas" className="lg:col-span-2">
          {ficha.matriculas.length ? (
            <ul className="space-y-4">
              {ficha.matriculas.map(({ matricula, programa, progresso }) => {
                const excedente =
                  progresso.excedeu && progresso.previstas !== null
                    ? progresso.realizadas - progresso.previstas
                    : 0;
                return (
                  <li key={matricula.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{programa?.nome ?? "Programa não encontrado"}</span>
                      <span className="text-xs text-texto-2">{progresso.rotulo}</span>
                    </div>
                    {excedente > 0 ? (
                      <p className="mt-0.5 text-xs text-texto-2">{excedente} sessões além do pacote</p>
                    ) : null}
                    {progresso.percentual !== null ? (
                      <div className="mt-1.5">
                        <ProgressBar pct={progresso.percentual} />
                      </div>
                    ) : null}
                    {/* Só matrícula ATIVA agenda sessão nova — trancada,
                        cancelada ou concluída não recebe compromisso novo. */}
                    {matricula.status === "ativa" ? (
                      <details className="mt-2 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
                        {/* `list-none` some com o triângulo nativo do
                            `<details>` (▶ no Chrome/Firefox) e
                            `[&::-webkit-details-marker]:hidden` faz o mesmo no
                            Safari/WebKit, que ignora `list-none` aqui — sem os
                            dois, o "+" escrito no texto virava um SEGUNDO
                            marcador ao lado do nativo ("▶ + Agendar sessão"),
                            e ▶ nem está no conjunto de glifos que esta tela
                            permite (▲ ▼ ▬). */}
                        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
                          + Agendar sessão
                        </summary>
                        <form action={agendarSessao} className="mt-3 grid gap-3 sm:grid-cols-3">
                          <input type="hidden" name="mentoradoId" value={mentorado.id} />
                          <input type="hidden" name="matriculaId" value={matricula.id} />
                          <Campo label="Data e hora" className="sm:col-span-2">
                            <Input type="datetime-local" name="quando" required />
                          </Campo>
                          <Campo label="Duração (min)">
                            <Input type="number" name="duracaoMin" min={5} max={600} step={5} defaultValue={60} required />
                          </Campo>
                          <Campo label="Número da sessão (opcional)">
                            <Input type="number" name="numero" min={1} step={1} placeholder="ex.: 8" />
                          </Campo>
                          <div className="flex items-end sm:col-span-2">
                            <Botao className="w-full sm:w-auto">Agendar</Botao>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio>Nenhuma matrícula registrada para este mentorado.</Vazio>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card titulo={`Histórico de sessões (${ficha.sessoes.length})`}>
            {ficha.sessoes.length ? (
              <ul className="space-y-3">
                {ficha.sessoes.map((sessao) => (
                  <li key={sessao.id} className="rounded-lg border border-borda bg-painel p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {sessao.numero !== null ? `Sessão ${sessao.numero}` : "Sessão"} · {dataHoraBr(sessao.quando) || "data não informada"}
                      </span>
                      <Badge tom={TOM_STATUS_SESSAO[sessao.status]}>{LABEL_STATUS_SESSAO[sessao.status]}</Badge>
                    </div>
                    {sessao.resumo ? <p className="mt-1.5 text-sm text-texto-2">{sessao.resumo}</p> : null}
                    {sessao.linkGravacao ? (
                      <a
                        href={sessao.linkGravacao}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs text-primaria-2 hover:underline"
                      >
                        Ver gravação
                      </a>
                    ) : null}
                    <AgendaETranscricaoDaSessao
                      sessao={sessao}
                      mentoradoId={mentorado.id}
                      agendaConectada={agendaConectada}
                    />
                    <div className="mt-3 border-t border-borda-sutil pt-3">
                      <p className="text-xs text-texto-2">Quem dispara é uma pessoa; a análise fica registrada com o nome de quem clicou.</p>
                      {sessao.transcricao.trim() ? (
                        <form action={analisarSessao} className="mt-2">
                          <input type="hidden" name="mentoradoId" value={mentorado.id} />
                          <input type="hidden" name="sessaoId" value={sessao.id} />
                          <input type="hidden" name="nome" value={mentorado.nome} />
                          <input type="hidden" name="resumo" value={sessao.resumo} />
                          <Botao tipo="fantasma">Analisar esta sessão com IA</Botao>
                        </form>
                      ) : (
                        <button type="button" disabled className="mt-2 cursor-not-allowed rounded-full border border-borda px-4 py-2 text-sm text-texto-3">
                          Analisar esta sessão com IA
                        </button>
                      )}
                      {!sessao.transcricao.trim() ? <p className="mt-1 text-xs text-texto-3">Disponível quando houver transcrição.</p> : null}
                    </div>
                    {/* Dar baixa só existe para quem ainda está "agendada" —
                        sair de agendada é o único movimento desta ação (ver
                        `validacao.ts`: o status de baixa nunca aceita voltar
                        para "agendada", isso seria remarcar). */}
                    {sessao.status === "agendada" ? (
                      <details className="mt-2 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
                        {/* mesmo motivo do "+ Agendar sessão" acima: sem estas
                            duas classes o marcador nativo do `<details>`
                            aparece do lado do "+" escrito à mão. */}
                        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
                          + Dar baixa
                        </summary>
                        <form action={darBaixaNaSessao} className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="mentoradoId" value={mentorado.id} />
                          <input type="hidden" name="sessaoId" value={sessao.id} />
                          <Campo label="Status">
                            <Select name="status" defaultValue="realizada" required>
                              {STATUS_BAIXA_VALORES.map((status) => (
                                <option key={status} value={status}>
                                  {LABEL_STATUS_BAIXA[status]}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo label="Link da gravação (opcional)">
                            <Input type="url" name="linkGravacao" placeholder="https://…" />
                          </Campo>
                          <Campo label="Resumo (opcional)" className="sm:col-span-2">
                            <TextArea name="resumo" placeholder="O que foi conversado, combinado…" />
                          </Campo>
                          <div className="sm:col-span-2">
                            <Botao>Registrar</Botao>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhuma sessão registrada ainda.</Vazio>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card titulo="Evolução do score">
            {variacao ? (
              <p className="flex items-baseline gap-2">
                <Badge tom={TOM_VARIACAO[variacao.glifo]}>{variacao.texto}</Badge>
                <span className="text-xs text-texto-2">entre a primeira e a última semana registrada</span>
              </p>
            ) : (
              // Zero ou um ponto: uma medição não é uma série (ver
              // `variacaoScore` em textos.ts) — nada de tendência inventada.
              <Vazio>Ainda não há histórico suficiente para mostrar uma variação.</Vazio>
            )}
          </Card>

          <Card titulo={`Tarefas em aberto (${tarefasAbertas.length})`}>
            {tarefasAbertas.length ? (
              <ul className="space-y-1.5 text-sm">
                {tarefasAbertas.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2">
                    <span>{t.titulo}</span>
                    {/* `tarefa_mentoria.prazo` é `date` (0006:198), sem hora
                        nem fuso — `dataBr`, não `dataHoraBr`, é quem lê isso
                        sem passar por `new Date()` (ver o comentário de
                        `dataBr` em textos.ts: MÉDIO 2). */}
                    <span className="shrink-0 text-xs text-texto-2">{t.prazo ? dataBr(t.prazo) || t.prazo : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhuma tarefa em aberto.</Vazio>
            )}
          </Card>

          <Card titulo={`Marcos conquistados (${ficha.marcos.length})`}>
            {ficha.marcos.length ? (
              <ul className="space-y-1.5 text-sm">
                {ficha.marcos.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.titulo}</span>
                    {m.descricao ? <p className="text-xs text-texto-2">{m.descricao}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhum marco conquistado ainda.</Vazio>
            )}
          </Card>
        </div>
      </div>

      {/* Os arquivos ficam na aba que ABRE, e não numa terceira aba: anexar
          contrato e anamnese é parte do trabalho corrente da ficha, e a
          `Tabs` desenha o painel de trás `hidden` — bloco escondido é bloco
          que ninguém lembra que existe. Ver `./documentos.tsx`. */}
      <div className="mt-4">
        <ConteudosLiberados mentoradoId={mentorado.id} conteudos={ficha.conteudos} />
      </div>

      <div className="mt-4">
        <DocumentosDoMentorado mentoradoId={mentorado.id} lista={documentos} />
      </div>
    </>
  );

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/mentoria" className="hover:text-primaria-2">
          ← Mentoria
        </Link>
      </p>

      <PageHeader titulo={mentorado.nome}>
        <Badge tom={TOM_STATUS_MENTORADO[mentorado.status]}>{LABEL_STATUS_MENTORADO[mentorado.status]}</Badge>
      </PageHeader>

      {/* Erro de `agendarSessao`/`darBaixaNaSessao` (validação ou banco) volta
          aqui, em `?erro=` — mensagem já humana, sem detalhe técnico (ver
          `acoes.ts`). Mesmo estilo visual do banner de erro de `/agenda`. */}
      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      <Tabs
        abas={[
          { id: "visao", rotulo: "Visão geral", conteudo: visaoGeral },
          {
            id: "historico",
            rotulo: "Histórico",
            badge: historico.fatos.length,
            conteudo: <AbaHistorico historico={historico} />,
          },
        ]}
      />
    </>
  );
}
