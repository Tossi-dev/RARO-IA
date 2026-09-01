import { Botao, Card, PageHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { alternarVisibilidadeContrato } from "@/lib/financeiro/acoes-cobranca";
import { fmtBRL } from "@/lib/format";
import { lerContratos } from "@/lib/financeiro/dados-cobranca";

export const dynamic = "force-dynamic";

export default async function Contratos() {
  const dados = await lerContratos();
  return <><PageHeader titulo="Contratos" sub="Quais contratos estão registrados e em que situação" /><Card>{!dados.conectado ? <p className="text-sm text-texto-2">{dados.motivo}</p> : dados.contratos.length === 0 ? <Vazio>Nenhum contrato registrado.</Vazio> : <Tabela><thead><tr><Th>Status</Th><Th>Assinado em</Th><Th>Portal</Th><Th num>Valor</Th></tr></thead><tbody>{dados.contratos.map((contrato) => <tr key={contrato.id}><Td>{contrato.status || "Sem status"}</Td><Td>{contrato.assinadoEm || "Não informado"}</Td><Td><form action={alternarVisibilidadeContrato}><input type="hidden" name="contratoId" value={contrato.id} /><input type="hidden" name="visivel" value={contrato.visivelPortal ? "nao" : "on"} /><Botao tipo="fantasma">{contrato.visivelPortal ? "Ocultar do portal" : "Liberar no portal"}</Botao></form></Td><Td num>{fmtBRL(contrato.valorTotal)}</Td></tr>)}</tbody></Tabela>}</Card></>;
}
