"use client";

// Assistente de importação de extrato — quatro passos visíveis, sempre nesta
// ordem: RECEBER → CONFERIR → DECIDIR → GRAVAR. A regra dura da tela inteira
// é que a Server Action (`gravar`) só é chamada no passo 4, depois de o dono
// ver cada linha e cada categoria sugerida. Extrato mal importado corrompe o
// caixa de um jeito que só aparece no fechamento do mês — por isso não existe
// atalho aqui, nem "importar tudo direto".

import { AlertTriangle, CheckCircle2, FileText, Upload } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { SecaoVisual } from "@/components/explicador";
import { lerExtrato, type LeituraExtrato, type LinhaExtrato, type OrigemExtrato } from "@/lib/extrato/extrato";
import { fmtBRLExato, fmtDate } from "@/lib/format";
import type { ResultadoImportacao } from "@/lib/data/provider";
import type { CategoriaCaixa } from "@/lib/types";
import { Badge, Botao, Card, Select, Tabela, Td, TextArea, Th, Vazio, cx } from "./ui";

export interface ContaParaImportar {
  id: string;
  nome: string;
}

// O resultado exibido é o MESMO contrato do provider (`DataProvider.importarExtrato`
// em src/lib/data/provider.ts) — sem tradução de nomes de campo no meio do
// caminho, para a tela nunca divergir do que a gravação de verdade devolve.
export type ResultadoGravar = ResultadoImportacao;

// `categoria` já chega pronta em `LinhaExtrato` (sugestão de `sugerirCategoria`,
// calculada em `lerExtrato` — ver src/lib/extrato/extrato.ts): a tela só
// acrescenta o estado de conferência (incluir/jaImportada) e deixa o dono
// sobrescrever a sugestão via `alterarCategoria`, nunca recalcula sozinha.
interface LinhaEditavel extends LinhaExtrato {
  incluir: boolean;
  jaImportada: boolean;
}

function linhaEditavel(l: LinhaExtrato, digitaisConhecidas: Set<string>): LinhaEditavel {
  const jaImportada = digitaisConhecidas.has(l.impressaoDigital);
  return {
    ...l,
    incluir: !jaImportada,
    jaImportada,
  };
}

export function ExtratoImportar({
  contas,
  digitaisConhecidas,
  categoriasEntrada,
  categoriasSaida,
  rotuloCategoria,
  gravar,
  criarConta,
  rotuloTipoConta,
}: {
  contas: ContaParaImportar[];
  digitaisConhecidas: string[];
  categoriasEntrada: CategoriaCaixa[];
  categoriasSaida: CategoriaCaixa[];
  rotuloCategoria: Record<CategoriaCaixa, string>;
  // Tipado igual à Server Action oficial `importarExtratoBancario`
  // (src/lib/actions.ts): ela recebe `dados: unknown` porque valida com Zod
  // na borda, então aceitar o objeto tipado abaixo é seguro em qualquer
  // direção — sem FormData no meio, que só existia para a trilha
  // improvisada que este componente deixou de usar.
  gravar: (dados: {
    contaId: string;
    origem: OrigemExtrato;
    linhas: LinhaExtrato[];
  }) => Promise<ResultadoGravar>;
  /** Cadastra a conta sem sair da tela e devolve ela pronta — ver
   *  `criarContaEDevolver` em src/lib/actions.ts. */
  criarConta: (formData: FormData) => Promise<ContaParaImportar>;
  /** Rótulo de cada tipo de conta na língua do dono (@/lib/domain). */
  rotuloTipoConta: Record<string, string>;
}) {
  const digitaisSet = useMemo(() => new Set(digitaisConhecidas), [digitaisConhecidas]);

  const [leitura, setLeitura] = useState<LeituraExtrato | null>(null);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [naoEntendidas, setNaoEntendidas] = useState<string[]>([]);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [resultado, setResultado] = useState<ResultadoGravar | null>(null);
  const [pendente, iniciar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // A lista de contas vive no ESTADO, e não só na prop, porque a pessoa pode
  // cadastrar uma conta no meio da conferência. Se dependesse da prop, seria
  // preciso recarregar a página para a conta nova aparecer — e recarregar
  // aqui joga fora o extrato já lido e cada linha que o dono acabou de
  // conferir. A prop continua sendo a verdade inicial; o estado é ela mais o
  // que foi criado nesta sessão de tela.
  const [listaContas, setListaContas] = useState<ContaParaImportar[]>(contas);
  const [cadastrando, setCadastrando] = useState(false);
  const [erroConta, setErroConta] = useState<string | null>(null);
  const [salvandoConta, salvarConta] = useTransition();

  function aoCriarConta(formData: FormData) {
    setErroConta(null);
    salvarConta(async () => {
      try {
        const nova = await criarConta(formData);
        setListaContas((prev) => [...prev, nova]);
        setContaId(nova.id);
        setCadastrando(false);
      } catch (e) {
        setErroConta(
          e instanceof Error ? e.message : "Não consegui cadastrar a conta. Tente de novo."
        );
      }
    });
  }

  function processar(conteudo: string) {
    if (conteudo.trim() === "") {
      setErroLeitura("O arquivo/texto está vazio — não há o que ler.");
      return;
    }
    setErroLeitura(null);
    setResultado(null);
    const r = lerExtrato(conteudo);
    setLeitura(r);
    setLinhas(r.linhas.map((l) => linhaEditavel(l, digitaisSet)));
    setNaoEntendidas(r.naoEntendidas);
  }

  function aoSoltarArquivo(arquivo: File) {
    const leitor = new FileReader();
    leitor.onload = () => processar(String(leitor.result ?? ""));
    leitor.onerror = () => setErroLeitura("Não consegui ler esse arquivo.");
    leitor.readAsText(arquivo, "utf-8");
  }

  const novas = linhas.filter((l) => !l.jaImportada).length;
  const duplicadas = linhas.length - novas;
  const incluidas = linhas.filter((l) => l.incluir);
  const podeDecidir = linhas.length > 0;
  const podeGravar = podeDecidir && contaId !== "" && incluidas.length > 0;

  function alterarCategoria(digital: string, categoria: CategoriaCaixa) {
    setLinhas((prev) => prev.map((l) => (l.impressaoDigital === digital ? { ...l, categoria } : l)));
  }

  function alterarIncluir(digital: string, incluir: boolean) {
    setLinhas((prev) => prev.map((l) => (l.impressaoDigital === digital ? { ...l, incluir } : l)));
  }

  function descartarNaoEntendida(idx: number) {
    setNaoEntendidas((prev) => prev.filter((_, i) => i !== idx));
  }

  // Resposta conclusiva do quadro (padrão SecaoVisual): muda com o que já
  // aconteceu na tela, não é um texto fixo — é o resumo do que foi lido.
  const resposta = resultado
    ? `${resultado.gravadas} linha(s) gravada(s) no caixa${
        resultado.ignoradas > 0
          ? ` · ${resultado.ignoradas} ignorada(s) por já ter sido importada(s) antes`
          : ""
      }.`
    : leitura
      ? `${linhas.length} linha(s) lida(s) do extrato${
          leitura.periodo
            ? ` (${fmtDate(leitura.periodo.inicio)} a ${fmtDate(leitura.periodo.fim)})`
            : ""
        } — ${novas} nova(s) e ${duplicadas} já importada(s) antes${
          naoEntendidas.length > 0 ? `, ${naoEntendidas.length} não entendida(s)` : ""
        }. Nada foi gravado ainda.`
      : "Solte um extrato (OFX ou CSV) ou cole o texto abaixo — a leitura mostra cada linha antes de qualquer coisa ir para o caixa.";
  const tomResposta = resultado ? "bom" : naoEntendidas.length > 0 ? "atencao" : "neutro";

  function aoGravar() {
    // `leitura` sempre existe aqui: `podeGravar` (guarda no onSubmit abaixo)
    // exige `podeDecidir`, que por sua vez exige `linhas.length > 0` — e
    // linhas só existe depois de `processar` preencher `leitura`.
    if (!leitura) return;
    iniciar(async () => {
      const r = await gravar({ contaId, origem: leitura.origem, linhas: incluidas });
      setResultado(r);
    });
  }

  return (
    <SecaoVisual
      pergunta="O que entrou e saiu da conta, sem digitar nada?"
      resposta={resposta}
      tom={tomResposta}
    >
      <div className="space-y-4">
        {/* Passo 1 — RECEBER */}
        <Card titulo="1 · Receber">
          <p className="mb-3 text-xs text-texto-2">
            No app ou site do seu banco, procure em <strong>Extrato → Exportar</strong> (ou{" "}
            <strong>Extrato → Baixar</strong>) e escolha o arquivo em OFX ou CSV — ou, se for mais
            rápido, copie o extrato na tela do banco e cole o texto abaixo.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const arquivo = e.dataTransfer.files?.[0];
              if (arquivo) aoSoltarArquivo(arquivo);
            }}
            className={cx(
              "trans flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              arrastando ? "border-primaria-2 bg-primaria/5" : "border-borda"
            )}
          >
            <Upload size={20} aria-hidden className="text-texto-3" />
            <p className="text-sm text-texto-2">Arraste o arquivo OFX ou CSV aqui</p>
            <p className="text-xs text-texto-3">ou</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                inputRef.current?.click();
              }}
            >
              <Botao tipo="fantasma" className="!py-1.5">
                Escolher arquivo
              </Botao>
            </form>
            <input
              ref={inputRef}
              type="file"
              accept=".ofx,.csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) aoSoltarArquivo(arquivo);
                e.target.value = "";
              }}
            />
          </div>

          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              processar(textoColado);
            }}
          >
            <p className="mb-1 text-xs font-medium text-texto-2">Ou cole o texto do extrato:</p>
            <TextArea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              placeholder="05/01/2026  Pix recebido João Silva          1.234,56"
              className="min-h-[80px] text-xs"
            />
            <div className="mt-2">
              <Botao tipo="fantasma" className="!py-1.5">
                Ler texto colado
              </Botao>
            </div>
          </form>

          {erroLeitura ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-negativo">
              <AlertTriangle size={13} aria-hidden />
              {erroLeitura}
            </p>
          ) : null}
        </Card>

        {/* Passo 2 — CONFERIR */}
        {leitura ? (
          <Card
            titulo="2 · Conferir"
            acao={
              <span className="flex items-center gap-1.5 text-xs text-texto-2">
                <FileText size={13} aria-hidden />
                {leitura.origem === "ofx" ? "OFX" : leitura.origem === "csv" ? "CSV" : "Texto colado"}
                {leitura.periodo
                  ? ` · ${fmtDate(leitura.periodo.inicio)} a ${fmtDate(leitura.periodo.fim)}`
                  : ""}
              </span>
            }
          >
            {linhas.length === 0 ? (
              <Vazio>Nenhuma linha reconhecida neste arquivo/texto.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Incluir</Th>
                    <Th>Data</Th>
                    <Th>Descrição</Th>
                    <Th num>Valor</Th>
                    <Th>Categoria sugerida</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.impressaoDigital} className={l.jaImportada ? "opacity-60" : undefined}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={(e) => alterarIncluir(l.impressaoDigital, e.target.checked)}
                          aria-label={`Incluir linha de ${l.descricao}`}
                        />
                      </Td>
                      <Td>{fmtDate(l.data)}</Td>
                      <Td className="max-w-xs">
                        <span className="truncate" title={l.descricao}>
                          {l.descricao}
                        </span>
                        {l.jaImportada ? (
                          <span className="ml-2">
                            <Badge tom="cinza">já importada</Badge>
                          </span>
                        ) : null}
                      </Td>
                      <Td num className={l.tipo === "entrada" ? "text-positivo" : "text-negativo"}>
                        {l.tipo === "entrada" ? "+" : "−"} {fmtBRLExato(Math.abs(l.valor))}
                      </Td>
                      <Td>
                        <Select
                          value={l.categoria}
                          onChange={(e) =>
                            alterarCategoria(l.impressaoDigital, e.target.value as CategoriaCaixa)
                          }
                          className="!py-1.5 text-xs"
                        >
                          {(l.tipo === "entrada" ? categoriasEntrada : categoriasSaida).map((c) => (
                            <option key={c} value={c}>
                              {rotuloCategoria[c]}
                            </option>
                          ))}
                        </Select>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}

            {naoEntendidas.length > 0 ? (
              <div className="mt-4 rounded-xl border border-aviso/40 bg-aviso/10 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-aviso">
                  <AlertTriangle size={13} aria-hidden />
                  {naoEntendidas.length} linha(s) que a leitura não entendeu — ficam de fora da
                  importação
                </p>
                <ul className="space-y-1">
                  {naoEntendidas.map((linha, i) => (
                    <li
                      key={`${i}-${linha}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-poco px-2 py-1 font-mono text-[11px] text-texto-2"
                    >
                      <span className="truncate">{linha}</span>
                      <button
                        type="button"
                        onClick={() => descartarNaoEntendida(i)}
                        className="trans shrink-0 text-texto-3 transition-colors hover:text-texto"
                      >
                        ignorar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        {/* Passo 3 — DECIDIR */}
        {podeDecidir ? (
          <Card titulo="3 · Decidir">
            <div className="grid gap-4 sm:grid-cols-[240px_1fr] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-texto-2">Conta de destino</span>
                <Select value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {listaContas.length === 0 ? (
                    <option value="">Nenhuma conta cadastrada</option>
                  ) : null}
                  {listaContas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tom="verde">{novas} linha(s) nova(s)</Badge>
                {duplicadas > 0 ? <Badge tom="cinza">{duplicadas} já importada(s) antes</Badge> : null}
                {incluidas.length !== novas ? (
                  <Badge tom="azul">{incluidas.length} marcada(s) para gravar</Badge>
                ) : null}
                {/* Com conta cadastrada, o cadastro vira um botão discreto —
                    quem já tem conta não precisa de um formulário na frente. */}
                {listaContas.length > 0 && !cadastrando ? (
                  <button
                    type="button"
                    onClick={() => setCadastrando(true)}
                    className="toque trans rounded-full border border-borda-sutil px-3 py-1 text-xs text-texto-2 transition-colors hover:border-borda hover:text-texto"
                  >
                    + Nova conta
                  </button>
                ) : null}
              </div>
            </div>

            {/* Sem nenhuma conta, o formulário nasce ABERTO. O beco sem saída
                anterior — "cadastre uma conta antes de importar", em vermelho,
                sem dizer onde — obrigava a pessoa a sair da tela e perder o
                extrato que ela acabou de conferir. */}
            {listaContas.length === 0 || cadastrando ? (
              <form
                // `onSubmit` + preventDefault, e NÃO `action={fn}`: passar uma
                // função de CLIENTE para o atributo `action` só funciona a
                // partir do React 19. Nesta versão o React ignora a função e o
                // navegador faz o envio nativo — a página tenta um POST em
                // /extrato, recarrega, e o extrato conferido some da tela. O
                // formulário de gravar, logo abaixo, já usava este mesmo
                // padrão pelo mesmo motivo.
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!salvandoConta) aoCriarConta(new FormData(e.currentTarget));
                }}
                className="mt-4 rounded-2xl border border-borda-sutil bg-painel-2 p-4"
              >
                <p className="mb-1 text-[13px] font-medium">
                  {listaContas.length === 0
                    ? "Em qual conta esse dinheiro entrou e saiu?"
                    : "Cadastrar outra conta"}
                </p>
                <p className="mb-3 text-xs text-texto-2">
                  Cadastre aqui mesmo. O extrato que você já conferiu continua na tela.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-texto-2">
                      Nome da conta
                    </span>
                    <input
                      name="nome"
                      required
                      minLength={2}
                      maxLength={120}
                      autoFocus
                      placeholder="Nubank PJ, Itaú, carteira..."
                      className="toque w-full rounded-lg border border-borda-sutil bg-poco px-3 py-2 text-sm text-texto placeholder:text-texto-4 focus:border-primaria-2 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-texto-2">Tipo</span>
                    <Select name="tipo" defaultValue="corrente">
                      {Object.entries(rotuloTipoConta).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>
                          {rotulo}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-texto-2">
                      Saldo de hoje (opcional)
                    </span>
                    <input
                      name="saldoInicial"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="toque w-full rounded-lg border border-borda-sutil bg-poco px-3 py-2 text-sm text-texto placeholder:text-texto-4 focus:border-primaria-2 focus:outline-none"
                    />
                    <span className="mt-1 block text-[11px] leading-snug text-texto-3">
                      É de onde o fluxo de caixa parte. Em branco vira zero, e dá para ajustar
                      depois.
                    </span>
                  </label>
                </div>
                {/* `braco` existe no cadastro completo (tela Começar) e é
                    opcional: agrupamento é escolha do dono, não obrigação.
                    Aqui vai vazio de propósito — pedir isso no meio de uma
                    importação seria uma pergunta a mais sem ganho nenhum. */}
                <input type="hidden" name="braco" value="" />
                <div className="mt-3 flex items-center gap-2">
                  <Botao className={cx(salvandoConta && "pointer-events-none opacity-50")}>
                    {salvandoConta ? "Cadastrando…" : "Cadastrar conta"}
                  </Botao>
                  {listaContas.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCadastrando(false);
                        setErroConta(null);
                      }}
                      className="toque trans rounded-full px-3 py-2 text-xs text-texto-2 transition-colors hover:text-texto"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
                {erroConta ? <p className="mt-2 text-xs text-negativo">{erroConta}</p> : null}
              </form>
            ) : null}
          </Card>
        ) : null}

        {/* Passo 4 — GRAVAR */}
        {podeDecidir ? (
          <Card titulo="4 · Gravar">
            <p className="mb-3 text-xs text-texto-2">
              Só agora o extrato é gravado no caixa — {incluidas.length} linha(s) escolhida(s) no
              passo anterior, com a categoria que você conferiu.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (podeGravar && !pendente) aoGravar();
              }}
            >
              <Botao className={cx(!podeGravar && "pointer-events-none opacity-50")}>
                {pendente ? "Gravando…" : `Gravar ${incluidas.length} linha(s) no caixa`}
              </Botao>
            </form>
            {resultado ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-positivo">
                <CheckCircle2 size={13} aria-hidden />
                {resultado.gravadas} linha(s) gravada(s) no caixa
                {resultado.ignoradas > 0
                  ? ` · ${resultado.ignoradas} ignorada(s) por já ter sido importada(s) antes`
                  : ""}
                .
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </SecaoVisual>
  );
}
