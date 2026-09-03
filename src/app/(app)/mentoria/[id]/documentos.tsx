// O bloco de ARQUIVOS da ficha do mentorado — a lista do que já foi anexado
// e o formulário que anexa mais um. Componente puro de apresentação, no mesmo
// molde de `./visao.tsx`: recebe a `ListaDocumentos` já resolvida por
// `lerDocumentosDoMentorado` (`src/lib/documentos/dados.ts`) e só desenha;
// nenhuma consulta acontece aqui. As três Server Actions de
// `src/lib/documentos/acoes.ts` entram como `action={...}`, nunca chamadas.
//
// PUBLICAR É O ATO EXPLÍCITO — ESCONDER NUNCA PRECISA SER LEMBRADO
// ---------------------------------------------------------------
// O interruptor "visível no portal" do formulário de anexo nasce DESLIGADO,
// repetindo na tela a escolha que o 0015 já fez na coluna (`default false`) e
// que `interruptorLigado` repete na Server Action. Não é redundância boba: as
// três camadas erram de jeitos diferentes, e a única delas que a pessoa VÊ
// antes de clicar "Anexar" é esta. Contrato em rascunho, proposta com
// desconto não aprovado e anamnese com anotação clínica do mentor moram na
// mesma tabela do PDF da aula — se o interruptor nascesse ligado, publicar
// deixaria de ser decisão e esconder viraria a lembrança que falta.
//
// E O AVISO AO LADO DELE NÃO É ENFEITE. Um interruptor cujo efeito não está
// escrito é um interruptor que alguém liga sem saber o que publicou. A frase
// diz QUEM passa a ver: o mentorado desta ficha e mais ninguém — que é
// exatamente o que a política de select do 0015 permite (`mentorado_id =
// mentorado_atual() and visivel_portal and not arquivado`), nem um mentorado
// vizinho, nem "todo mundo do portal".
//
// O QUE ESTA TELA NÃO IMPRIME
// ---------------------------
// `caminho_storage`. Ele é o endereço interno do objeto no bucket e começa
// pelo `workspace_id` (constraint `documento_caminho_no_workspace`, 0015):
// mostrá-lo entregaria o id do inquilino em cada linha da lista e desenharia
// a organização do Storage para quem só queria abrir um PDF. O que a pessoa
// lê é o TÍTULO, que ela mesma escreveu.
//
// ARQUIVADO SAI DA LISTA, MAS NÃO SOME DA TELA
// --------------------------------------------
// A regra da casa é "status muda, linha fica": `arquivarDocumento` faz
// `update arquivado = true` e nunca apaga. A lista padrão não mostra o
// arquivado (é ruído no dia a dia), mas a tela DIZ quantos existem — sumir em
// silêncio seria apagar aos olhos de quem lê, que é o mesmo efeito prático do
// delete que o banco se recusa a fazer.
//
// O filtro daqui não é a garantia de nada: `lerDocumentosDoMentorado` já
// devolve a lista sem arquivados por padrão, e a RLS é quem impede o
// mentorado de alcançá-los. Ele existe porque este componente desenha a
// lista que RECEBEU — e quem receber uma lista com arquivados (a leitura tem
// `incluirArquivados`) precisa continuar vendo a lista padrão do jeito
// combinado.

import { Badge, Botao, Campo, Card, Input, Select, Tabela, Td, Th, Vazio } from "@/components/ui";
import { alternarVisivelPortal, anexarDocumento, arquivarDocumento } from "@/lib/documentos/acoes";
import type { Documento, ListaDocumentos } from "@/lib/documentos/dados";
import { CATEGORIA_DOCUMENTO_VALORES, LIMITE_BYTES, type CategoriaDocumento } from "@/lib/documentos/validacao";
import { dataHoraBr } from "../textos";

/** Rótulo de cada valor do enum `categoria_documento` (0015). `Record` de
 *  propósito: categoria nova na migração sem tradução aqui NÃO COMPILA. */
const LABEL_CATEGORIA: Record<CategoriaDocumento, string> = {
  contrato: "Contrato",
  anamnese: "Anamnese",
  material: "Material",
  outro: "Outro",
};

/**
 * O tamanho do arquivo em texto — e "tamanho não registrado" quando não há
 * número.
 *
 * `bytes` é `number | null` justamente para que a ausência não vire zero (ver
 * `bytesDe` em `documentos/dados.ts`, e o `check (bytes > 0)` do 0015 que
 * torna zero impossível como tamanho legítimo). Escrever "0 KB" aqui
 * desfaria, na última camada, o cuidado que as duas anteriores tomaram: a
 * pessoa leria um número medido onde ninguém mediu nada.
 */
function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null) return "tamanho não registrado";
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${formatarNumero(kb)} KB`;
  return `${formatarNumero(kb / 1024)} MB`;
}

/** Uma casa decimal, vírgula do pt-BR, e nada de ".0" pendurado no número redondo. */
function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor);
}

/** "1 arquivo arquivado" / "3 arquivos arquivados" — plural escrito, nunca "1 arquivo(s)". */
function fraseDosArquivados(quantidade: number): string {
  return quantidade === 1
    ? "1 arquivo arquivado não está nesta lista."
    : `${quantidade} arquivos arquivados não estão nesta lista.`;
}

/** O limite de 10 MB em texto — o número vem de `validacao.ts`, nunca digitado de novo aqui. */
const LIMITE_EM_MB = `${LIMITE_BYTES / (1024 * 1024)} MB`;

/**
 * O formulário de anexo. Fica escondido dentro de um `<details>` como os
 * outros formulários da ficha ("+ Agendar sessão", "+ Dar baixa"), com as
 * mesmas duas classes que somem com o marcador nativo `▶` — sem elas, o
 * triângulo do navegador aparece ao lado do "+" escrito à mão, e ▶ nem está
 * no conjunto de glifos que estas telas permitem (defeito visual 3).
 */
function FormularioDeAnexo({ mentoradoId }: { mentoradoId: string }) {
  return (
    <details className="mt-4 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
      <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
        + Anexar arquivo
      </summary>
      {/* A Server Action define automaticamente o enctype multipart. Declarar
          esse atributo manualmente faz o React sobrescrevê-lo e emitir aviso. */}
      <form action={anexarDocumento} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="mentoradoId" value={mentoradoId} />

        <Campo label={`Arquivo (até ${LIMITE_EM_MB})`} className="sm:col-span-2">
          <Input type="file" name="arquivo" required />
        </Campo>

        <Campo label="Título (opcional)">
          <Input name="titulo" maxLength={200} placeholder="Em branco, vale o nome do arquivo" />
        </Campo>

        <Campo label="Categoria">
          {/* As opções saem de `CATEGORIA_DOCUMENTO_VALORES`, a mesma lista
              que a Server Action confere: um `<select>` não pode oferecer um
              valor que `anexarDocumento` recusaria. */}
          <Select name="categoria" defaultValue="outro" required>
            {CATEGORIA_DOCUMENTO_VALORES.map((categoria) => (
              <option key={categoria} value={categoria}>
                {LABEL_CATEGORIA[categoria]}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2">
            {/* SEM `defaultChecked`: nasce desligado, como a coluna do 0015.
                Ver o cabeçalho deste arquivo. */}
            <input
              type="checkbox"
              name="visivelPortal"
              value="on"
              className="mt-0.5 h-4 w-4 rounded border-borda bg-poco"
            />
            <span className="text-xs">
              <span className="font-medium text-texto">Visível no portal</span>
              <span className="mt-0.5 block text-texto-2">
                Ligado, o arquivo passa a aparecer no portal do mentorado desta ficha — só dele, mais
                ninguém. Desligado, ele fica visível apenas para a gestão.
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <Botao>Anexar</Botao>
        </div>
      </form>
    </details>
  );
}

/** As duas ações de uma linha: publicar/despublicar e arquivar. */
function AcoesDaLinha({ documento, mentoradoId }: { documento: Documento; mentoradoId: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {/* O valor DESEJADO viaja no formulário (`visivel`), e não um pedido de
          "inverta o que estiver lá": `alternarVisivelPortal` grava o que
          recebe justamente para que dois cliques em duas abas abertas na
          mesma ficha não se cancelem e terminem publicando sem ninguém ter
          pedido. */}
      <form action={alternarVisivelPortal}>
        <input type="hidden" name="mentoradoId" value={mentoradoId} />
        <input type="hidden" name="documentoId" value={documento.id} />
        <input type="hidden" name="visivel" value={documento.visivelPortal ? "nao" : "on"} />
        <Botao tipo="fantasma">{documento.visivelPortal ? "Tirar do portal" : "Publicar no portal"}</Botao>
      </form>

      {/* Arquivar, nunca apagar: `arquivarDocumento` faz `update arquivado =
          true` e o objeto continua no bucket. O botão é "fantasma" e não
          "perigo" porque arquivar não destrói nada — pintar de vermelho uma
          ação reversível ensina a pessoa a temer o que é seguro. */}
      <form action={arquivarDocumento}>
        <input type="hidden" name="mentoradoId" value={mentoradoId} />
        <input type="hidden" name="documentoId" value={documento.id} />
        <Botao tipo="fantasma">Arquivar</Botao>
      </form>
    </div>
  );
}

export function DocumentosDoMentorado({
  mentoradoId,
  lista,
}: {
  mentoradoId: string;
  lista: ListaDocumentos;
}) {
  // Estado 1: não deu para ler. "Não consegui perguntar" e "não há arquivo"
  // são respostas diferentes, e trocar uma pela outra afirmaria ausência a
  // partir de um erro — a mesma distinção que `dados.ts` faz questão de
  // devolver em `conectado`/`motivo`. O formulário some junto: sem leitura,
  // o upload iria para um lugar sobre o qual a tela não sabe nada.
  if (!lista.conectado) {
    return (
      <Card titulo="Documentos">
        <p className="text-sm text-texto-2">{lista.motivo}</p>
      </Card>
    );
  }

  const visiveis = lista.documentos.filter((documento) => !documento.arquivado);
  const arquivados = lista.documentos.length - visiveis.length;

  return (
    <Card titulo={`Documentos (${visiveis.length})`}>
      {visiveis.length ? (
        <Tabela>
          <thead>
            <tr>
              <Th>Arquivo</Th>
              <Th>Categoria</Th>
              <Th>Tamanho</Th>
              <Th>Anexado em</Th>
              <Th>No portal</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((documento) => (
              <tr key={documento.id}>
                {/* O título, e nunca `caminhoStorage` — ver o cabeçalho.
                    Título vazio é possível (a coluna aceita ''), e aí a
                    célula diz isso em vez de ficar em branco: linha sem nome
                    nenhum parece falha de carregamento. */}
                <Td>{documento.titulo || "sem título"}</Td>
                <Td>{LABEL_CATEGORIA[documento.categoria]}</Td>
                <Td>{tamanhoLegivel(documento.bytes)}</Td>
                {/* `criado_em` é `timestamptz` — `dataHoraBr` lê no fuso de São
                    Paulo e devolve "" para data inválida, sem lançar. */}
                <Td>{dataHoraBr(documento.criadoEm) || "data não informada"}</Td>
                <Td>
                  {documento.visivelPortal ? (
                    <Badge tom="cinza">Só a gestão</Badge>
                  ) : (
                    <Badge tom="verde">Publicado</Badge>
                  )}
                </Td>
                <Td>
                  <AcoesDaLinha documento={documento} mentoradoId={mentoradoId} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <Vazio>Nenhum arquivo anexado a este mentorado ainda. Use o formulário abaixo para anexar o primeiro.</Vazio>
      )}

      {/* A contagem só existe quando há o que contar: "0 arquivos arquivados"
          seria um zero desenhado com cara de dado. */}
      {arquivados > 0 ? (
        <p className="mt-3 text-xs text-texto-3">
          {fraseDosArquivados(arquivados)} Arquivar não apaga: a linha e o arquivo continuam guardados.
        </p>
      ) : null}

      <FormularioDeAnexo mentoradoId={mentoradoId} />
    </Card>
  );
}
