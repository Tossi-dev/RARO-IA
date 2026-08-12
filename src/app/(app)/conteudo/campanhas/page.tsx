import Link from "next/link";
import { GerarTextoIA } from "@/components/ia-client";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, Select, Stat, Tabela, Td, Th, TextArea, Vazio } from "@/components/ui";
import { criarCampanha } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { CAMPANHA_TIPO_LABEL } from "@/lib/domain";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Campanhas() {
  const db = getDB();
  const [campanhas, conteudos] = await Promise.all([db.listCampanhas(), db.listConteudos()]);
  const nomeConteudo = new Map(conteudos.map((c) => [c.id, c.titulo] as const));

  const hoje = new Date().toISOString().slice(0, 10);

  const pagas = campanhas.filter((c) => c.tipo === "pago");
  const organicas = campanhas.filter((c) => c.tipo === "organico");
  const investimento = pagas.reduce((s, c) => s + c.orcamento, 0);

  // "Ativa" = sem data de término OU com término ainda no futuro. Os dois casos
  // são mutuamente exclusivos, então a soma fecha exatamente com o contador.
  const semPrazo = campanhas.filter((c) => !c.fim).length;
  const prazoEmAberto = campanhas.filter((c) => c.fim && c.fim >= hoje).length;
  const ativas = semPrazo + prazoEmAberto;

  // Memória de cálculo do investimento: o mesmo somatório de cima, quebrado por
  // canal. Toda campanha paga cai em exatamente um canal → a soma fecha no centavo.
  const CANAL_ROTULO: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    multi: "Multi-canal",
  };
  const porCanal = new Map<string, number>();
  for (const c of pagas) {
    const rotulo = `Orçamento no ${CANAL_ROTULO[c.canal] ?? c.canal}`;
    porCanal.set(rotulo, (porCanal.get(rotulo) ?? 0) + c.orcamento);
  }
  const partesInvestimento = [...porCanal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, valor]) => ({ rotulo, valor }));

  // Prompt-semente do botão "Gerar com IA": parte de uma campanha REAL do
  // cadastro (nome + objetivo) em vez de inventar produto, preço e público —
  // sem campanha paga cadastrada ainda, o prompt pede pro dono descrever antes.
  const campanhaRef = pagas[0] ?? campanhas[0] ?? null;
  const promptCopy = campanhaRef
    ? `Escreva a copy de um anúncio (tráfego pago) para a campanha "${campanhaRef.nome}" (objetivo: ${campanhaRef.objetivo}): headline, corpo curto (dor → mecanismo → prova → oferta) e CTA.`
    : "Escreva a copy de um anúncio (tráfego pago): headline, corpo curto (dor → mecanismo → prova → oferta) e CTA. Descreva o produto, o preço e o público-alvo antes de gerar.";

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/conteudo" className="hover:text-primaria-2">← Conteúdo & Redes</Link>
      </p>
      <PageHeader titulo="Campanhas" sub="Tráfego pago e orgânico amarrados aos conteúdos que performam" />

      <div className="grid grid-cols-3 gap-3">
        {/* ativas = campanhas sem data de término + campanhas com término futuro */}
        <Stat
          label="Campanhas ativas"
          valor={String(ativas)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={ativas}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Sem data de término definida", valor: semPrazo },
              { rotulo: `Com término marcado depois de ${fmtDate(hoje)}`, valor: prazoEmAberto },
            ],
            nota: "Campanha sem data de fim entra como ativa por padrão — o app não sabe se ela foi realmente pausada na plataforma de anúncios. Contagem de cadastro, não de veiculação real.",
          }}
          origem={`listCampanhas() → campo de data de término comparado com hoje (${fmtDate(hoje)}) · todas as campanhas cadastradas, pagas e orgânicas`}
        />
        {/* investimento = soma do orçamento das campanhas de tipo "pago" */}
        <Stat
          label="Investimento (pago)"
          valor={fmtBRL(investimento)}
          deltaPct={null}
          hint=""
          formato="moeda"
          valorNumerico={investimento}
          composicao={
            partesInvestimento.length >= 2
              ? {
                  formula: "soma",
                  partes: partesInvestimento,
                  nota: "É o ORÇAMENTO cadastrado na campanha, não o valor efetivamente gasto na plataforma de anúncios nem a despesa que caiu no financeiro. Campanha orgânica fica fora por definição. Sem retorno atrelado aqui: esta tela não sabe quantos leads ou vendas cada campanha gerou, então não há custo por lead nem custo por aquisição a calcular.",
                }
              : `Orçamento cadastrado em ${fmtNum(pagas.length)} campanha(s) de tráfego pago. É orçamento planejado, não gasto realizado na plataforma de anúncios — e sem leads ou vendas atrelados à campanha não há custo por aquisição a derivar daqui.`
          }
          origem={`listCampanhas() → soma do campo orçamento das ${fmtNum(pagas.length)} campanha(s) com tipo "tráfego pago" · sem recorte de período`}
        />
        {/* total = pagas + orgânicas (o tipo só admite estes dois valores) */}
        <Stat
          label="Total de campanhas"
          valor={String(campanhas.length)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={campanhas.length}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Tráfego pago", valor: pagas.length },
              { rotulo: "Orgânico", valor: organicas.length },
            ],
            nota: "Base histórica inteira: conta campanha encerrada junto com campanha no ar, sem recorte de período.",
          }}
          origem="listCampanhas() → contagem de todas as campanhas cadastradas, agrupadas pelo tipo (pago/orgânico)"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PainelForm titulo="Nova campanha">
            <form action={criarCampanha} className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome" className="sm:col-span-2">
                <Input name="nome" required placeholder="Ex.: Captação Protocolo — Agosto" />
              </Campo>
              <Campo label="Tipo">
                <Select name="tipo" defaultValue="pago">
                  <option value="pago">Tráfego pago</option>
                  <option value="organico">Orgânico</option>
                </Select>
              </Campo>
              <Campo label="Canal">
                <Select name="canal" defaultValue="instagram">
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="facebook">Facebook</option>
                  <option value="multi">Multi-canal</option>
                </Select>
              </Campo>
              <Campo label="Orçamento (R$)">
                <Input name="orcamento" type="number" step="0.01" min="0" defaultValue={0} />
              </Campo>
              <Campo label="Conteúdo vinculado (criativo)">
                <Select name="conteudoId" defaultValue="">
                  <option value="">— nenhum —</option>
                  {conteudos.slice(0, 20).map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo.slice(0, 60)}</option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Início">
                <Input name="inicio" type="date" defaultValue={hoje} required />
              </Campo>
              <Campo label="Fim (opcional)">
                <Input name="fim" type="date" />
              </Campo>
              <Campo label="Objetivo" className="sm:col-span-2">
                <TextArea name="objetivo" placeholder="Ex.: 100 vendas do protocolo · lista de espera da T2…" />
              </Campo>
              <div className="sm:col-span-2">
                <Botao>Criar campanha</Botao>
              </div>
            </form>
          </PainelForm>

          <Card titulo={`Campanhas (${campanhas.length})`}>
            {campanhas.length ? (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Campanha</Th>
                    <Th>Tipo</Th>
                    <Th>Canal</Th>
                    <Th>Criativo</Th>
                    <Th num>Orçamento</Th>
                    <Th num>Início</Th>
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((c) => (
                    <tr key={c.id}>
                      <Td>
                        <span className="font-medium">{c.nome}</span>
                        {c.objetivo ? <p className="text-xs text-texto-2">{c.objetivo}</p> : null}
                      </Td>
                      <Td>
                        <Badge tom={c.tipo === "pago" ? "ouro" : "verde"}>{CAMPANHA_TIPO_LABEL[c.tipo]}</Badge>
                      </Td>
                      <Td className="capitalize text-texto-2">{c.canal}</Td>
                      <Td className="text-texto-2">
                        {c.conteudoId ? (
                          <Link className="text-primaria-2 hover:underline" href={`/conteudo/${c.conteudoId}`}>
                            {(nomeConteudo.get(c.conteudoId) ?? "ver").slice(0, 28)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td num>{c.orcamento ? fmtBRL(c.orcamento) : "—"}</Td>
                      <Td num>{fmtDate(c.inicio)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            ) : (
              <Vazio>Nenhuma campanha ainda.</Vazio>
            )}
          </Card>
        </div>

        <Card titulo="Copy de anúncio com IA">
          <p className="mb-3 text-sm text-texto-2">
            Gera headline + corpo + CTA para o próximo criativo, no tom da MentorOS.
          </p>
          <GerarTextoIA prompt={promptCopy} rotulo="Gerar copy de campanha" />
        </Card>
      </div>
    </>
  );
}
