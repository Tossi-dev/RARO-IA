// A parte PURA de apresentação do EDITOR de uma trilha — recebe a trilha e as
// aulas já resolvidas e só desenha. `page.tsx` cuida da busca.
//
// TRÊS ESTADOS, E A DIFERENÇA ENTRE DOIS DELES IMPORTA
// -----------------------------------------------------
// "não consegui ler" e "essa trilha não existe" são coisas diferentes, e a
// tela diz qual das duas é — o mesmo motivo pelo qual /mentoria/[id] não usa
// `notFound()`: o 404 genérico apagaria os dois casos no mesmo lugar, e quem
// está com o banco fora do ar acharia que apagou a própria trilha.
//
// O QUE ESTA TELA NÃO DECIDE
// --------------------------
// Se um endereço pode virar `<iframe>`. Quem decide é `urlDeEmbedYoutube`
// (`src/lib/conteudo/video.ts`), e a razão inteira está no cabeçalho de lá:
// um iframe carrega a página de um terceiro DENTRO da nossa. Aqui só se
// pergunta "veio endereço?" e se desenha o que a função devolveu.
//
// A ordem das aulas também não se decide aqui: `ordenarAulas`
// (`dados-trilha.ts`) é a mesma função que a leitura usa. Duas respostas para
// "qual é a ordem?" divergem no primeiro conserto feito só de um lado.

import Link from "next/link";
import { Botao, Campo, Card, Input, PageHeader, Select, TextArea, Vazio } from "@/components/ui";
import { salvarAulaDaGestao } from "@/lib/conteudo/acoes-gestao-trilha";
import { ordenarAulas, type Trilha, type TrilhaAula } from "@/lib/conteudo/dados-trilha";
import { urlDeEmbedYoutube } from "@/lib/conteudo/video";

/**
 * Os dias de liberação viram frase.
 *
 * Um "7" solto na tela não diz 7 do quê, nem contado a partir de quando — e a
 * resposta ("do início da matrícula DAQUELE mentorado", não da criação da
 * trilha) é justamente a parte que se erra ao cadastrar.
 */
function frasePrazo(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return "Abre junto com a trilha";
  if (dias === 1) return "Abre 1 dia depois do início";
  return `Abre ${dias} dias depois do início`;
}

/** O aviso do campo de vídeo. Literal, e com a consequência escrita — ver o
 *  comentário em `CampoVideo`. */
const AVISO_NAO_LISTADO =
  "O vídeo precisa estar como não listado no YouTube. Não listado não é privado: " +
  "Quem tiver o link assiste, mesmo sem estar matriculado. O endereço vale o próprio " +
  "conteúdo — trate o link como se fosse a aula.";

/**
 * O campo de endereço do vídeo, com o aviso ao lado.
 *
 * POR QUE O AVISO É LITERAL E NÃO UM "saiba mais"
 * -----------------------------------------------
 * O mentor está prestes a subir para o YouTube uma aula que os clientes dele
 * pagaram para ver. O YouTube chama a opção de "não listado", e a palavra
 * sugere privacidade que ela não tem: o vídeo não aparece em busca nem no
 * canal, mas QUALQUER pessoa com o endereço assiste — sem conta, sem
 * matrícula, para sempre. Quem descobre isso depois descobre com o conteúdo
 * já circulando. A frase inteira fica aqui, na hora de colar o link.
 */
function CampoVideo({ valor }: { valor?: string }) {
  return (
    <Campo label="Endereço do vídeo no YouTube">
      <Input
        type="url"
        name="urlVideo"
        defaultValue={valor}
        placeholder="https://www.youtube.com/watch?v=..."
      />
      <span className="mt-1.5 block text-xs text-texto-2">{AVISO_NAO_LISTADO}</span>
    </Campo>
  );
}

/** Os campos comuns ao formulário de criar e ao de editar uma aula. Um só
 *  lugar: dois formulários com listas de campos diferentes é como nasce um
 *  campo que só dá para preencher na criação. */
function CamposDaAula({ trilhaId, aula }: { trilhaId: string; aula?: TrilhaAula }) {
  return (
    <>
      <input type="hidden" name="trilhaId" value={trilhaId} />
      {aula ? <input type="hidden" name="id" value={aula.id} /> : null}
      <Campo label="Título">
        <Input name="titulo" maxLength={200} required defaultValue={aula?.titulo} />
      </Campo>
      <Campo label="Tipo">
        <Select name="tipo" defaultValue={aula?.tipo ?? "video"}>
          <option value="video">Vídeo</option>
          <option value="texto">Texto</option>
        </Select>
      </Campo>
      <Campo label="Ordem">
        <Input type="number" name="ordem" min={0} step={1} defaultValue={aula?.ordem ?? 0} />
      </Campo>
      <Campo label="Duração (minutos)">
        <Input type="number" name="duracaoMin" min={0} step={1} defaultValue={aula?.duracaoMin ?? 0} />
      </Campo>
      <Campo label="Abre quantos dias depois do início da matrícula">
        <Input type="number" name="liberaEmDias" min={0} step={1} defaultValue={aula?.liberaEmDias ?? 0} />
      </Campo>
      <div className="sm:col-span-2">
        <CampoVideo valor={aula?.urlVideo} />
      </div>
      <div className="sm:col-span-2">
        <Campo label="Texto da aula (opcional)">
          <TextArea name="texto" defaultValue={aula?.texto} rows={4} />
        </Campo>
      </div>
    </>
  );
}

function Aula({ aula }: { aula: TrilhaAula }) {
  const embed = urlDeEmbedYoutube(aula.urlVideo);
  const temEndereco = aula.urlVideo.trim() !== "";

  return (
    <li className="border-b border-borda-sutil pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          <span className="mr-2 text-texto-3">{aula.ordem}</span>
          {aula.titulo}
        </span>
        <span className="text-xs text-texto-3">
          {frasePrazo(aula.liberaEmDias)}
          {aula.duracaoMin > 0 ? ` · ${aula.duracaoMin} min` : ""}
        </span>
      </div>

      {embed ? (
        <div className="mt-2.5 aspect-video max-w-md overflow-hidden rounded-xl border border-borda-sutil">
          <iframe
            src={embed}
            title={aula.titulo}
            loading="lazy"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : temEndereco ? (
        // O endereço recusado APARECE, e aparece dito. Sumir com ele
        // esconderia de quem opera um link que o mentorado talvez esteja
        // recebendo — e o campo continuaria gravado no banco, invisível.
        <p className="mt-2 text-xs text-texto-2">
          Não reconheci como vídeo do YouTube, então não dá para mostrar aqui dentro:{" "}
          <span className="break-all text-texto-3">{aula.urlVideo}</span>
        </p>
      ) : null}

      <details className="mt-2.5 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
          + Editar esta aula
        </summary>
        <form action={salvarAulaDaGestao} className="mt-3 grid gap-3 sm:grid-cols-2">
          <CamposDaAula trilhaId={aula.trilhaId} aula={aula} />
          <div className="sm:col-span-2">
            <Botao>Salvar aula</Botao>
          </div>
        </form>
      </details>
    </li>
  );
}

export function TrilhaVisao({
  conectado,
  motivo,
  trilha,
  aulas,
  erro = "",
}: {
  conectado: boolean;
  motivo: string;
  trilha: Trilha | null;
  aulas: readonly TrilhaAula[];
  erro?: string;
}) {
  const emOrdem = ordenarAulas(aulas);

  return (
    <>
      <PageHeader titulo={trilha?.nome || "Trilha"} sub={trilha?.descricao || undefined}>
        <Link href="/trilhas" className="text-sm text-primaria-2 hover:underline">
          Voltar para as trilhas
        </Link>
      </PageHeader>

      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{motivo}</p>
        </Card>
      ) : !trilha ? (
        <Card>
          {/* Nenhum número aqui: "não encontrei esta trilha entre as 4 suas"
              contaria, a quem chegou pelo endereço, quantas existem. */}
          <p className="text-sm text-texto-2">
            Não encontrei esta trilha. Ela pode ter sido removida, ou o endereço pode estar
            incompleto — volte para a lista e abra pelo nome.
          </p>
        </Card>
      ) : (
        <>
          <Card titulo={`Aulas (${emOrdem.length})`}>
            {emOrdem.length === 0 ? (
              <Vazio>
                Nenhuma aula nesta trilha ainda. A primeira aula pode abrir junto com a matrícula
                (zero dia) — as seguintes abrem quantos dias depois você disser.
              </Vazio>
            ) : (
              <ul className="space-y-4">
                {emOrdem.map((aula) => (
                  <Aula key={aula.id} aula={aula} />
                ))}
              </ul>
            )}
          </Card>

          <details className="mt-4 rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
            <summary className="trans list-none cursor-pointer text-sm font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
              + Nova aula
            </summary>
            <form action={salvarAulaDaGestao} className="mt-3 grid gap-3 sm:grid-cols-2">
              <CamposDaAula trilhaId={trilha.id} />
              <div className="sm:col-span-2">
                <Botao>Acrescentar aula</Botao>
              </div>
            </form>
          </details>
        </>
      )}
    </>
  );
}
