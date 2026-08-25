import { GraficoBarrasH } from "@/components/charts";
import { Botao, Campo, Card, Input, PageHeader, Vazio } from "@/components/ui";
import { criarLinkRastreado, type DadosMarketing } from "@/lib/marketing/dados";

function mensagemDeErro(erro: string): string {
  if (erro === "destino-invalido") return "O destino precisa ser um endereço http ou https de domínio próprio.";
  if (erro === "sem-conexao") return "Não há conexão com o banco para criar o link agora.";
  if (erro) return "Não foi possível criar o link agora. Tente novamente em instantes.";
  return "";
}

export function MarketingVisao({ dados, erro = "" }: { dados: DadosMarketing; erro?: string }) {
  const mensagem = mensagemDeErro(erro);

  return (
    <>
      <PageHeader titulo="Marketing" sub="Capturas, origem dos contatos e links rastreados" />

      <p className="mb-4 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-texto-2">
        Esta versão não dispara e-mail e não constrói landing page. Ela registra a captura que chegar de uma página já existente e mostra os links rastreados.
      </p>

      {mensagem ? <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">{mensagem}</p> : null}

      {!dados.conectado ? (
        <Card><p className="text-sm text-texto-2">{dados.motivo}</p></Card>
      ) : (
        <>
          {dados.parcial ? <p className="mb-4 text-sm text-texto-2">A leitura de cliques veio incompleta. Os links continuam visíveis, mas as contagens ficam como sem base.</p> : null}

          <Card titulo="Capturas por origem">
            {dados.capturasPorOrigem.length === 0 ? (
              <Vazio>Ainda não há captura para mostrar. Quando alguém preencher um formulário, a origem aparece aqui.</Vazio>
            ) : (
              <GraficoBarrasH formato="num" data={dados.capturasPorOrigem.map((origem) => ({ nome: origem.origem, valor: origem.quantidade }))} />
            )}
          </Card>

          <Card titulo="Gerar link rastreado" className="mt-4">
            <form action={criarLinkRastreado} className="grid gap-3 sm:grid-cols-2">
              <Campo label="Destino no site do negócio">
                <Input name="destino" type="url" required maxLength={500} placeholder="https://raro-ia.vercel.app/oferta" />
              </Campo>
              <Campo label="Campanha (opcional)">
                <Input name="campanha" maxLength={120} placeholder="Ex.: lançamento de setembro" />
              </Campo>
              <div className="sm:col-span-2"><Botao>Gerar link</Botao></div>
            </form>
          </Card>

          <Card titulo="Links rastreados" className="mt-4">
            {dados.links.length === 0 ? (
              <Vazio>Nenhum link rastreado foi criado ainda.</Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-texto-2"><th className="pb-2 pr-3 font-medium">Código</th><th className="pb-2 pr-3 font-medium">Campanha</th><th className="pb-2 pr-3 font-medium">Destino</th><th className="pb-2 font-medium">Cliques</th></tr></thead>
                  <tbody>{dados.links.map((link) => <tr key={link.id} className="border-t border-borda-sutil"><td className="py-2 pr-3 font-mono text-xs">/l/{link.codigo}</td><td className="py-2 pr-3">{link.campanha || "sem campanha"}</td><td className="max-w-64 truncate py-2 pr-3" title={link.destino}>{link.destino}</td><td className="py-2 tabular-nums">{link.cliques === null ? "sem base" : link.cliques}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
