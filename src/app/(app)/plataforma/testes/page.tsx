import { redirect } from "next/navigation";
import { Badge, Card, PageHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { listarTestesDaPlataforma, plataformaEhAdmin } from "@/lib/saas/consultas";
import { ROTULO_STATUS_SAAS, statusEfetivoSaas } from "@/lib/saas/apresentacao";

export const dynamic = "force-dynamic";

export default async function TestesDaPlataformaPage() {
  if (!(await plataformaEhAdmin())) redirect("/sem-acesso");
  const testes = await listarTestesDaPlataforma();
  return <><PageHeader titulo="Testes e assinaturas" sub="Visão comercial interna da plataforma. Nenhuma ação desta tela envia mensagens." /><Card><Tabela><thead><tr><Th>Espaço</Th><Th>Dono</Th><Th>WhatsApp</Th><Th>Início</Th><Th>Vencimento</Th><Th>Situação</Th></tr></thead><tbody>{testes.map((teste) => { const status = statusEfetivoSaas(teste.status, teste.termina_em); return <tr key={teste.workspace_id}><Td className="font-medium">{teste.workspace_nome}</Td><Td><span className="block">{teste.dono_nome}</span><span className="text-xs text-texto-3">{teste.dono_email}</span></Td><Td>{teste.dono_whatsapp}</Td><Td>{new Intl.DateTimeFormat("pt-BR").format(new Date(teste.iniciado_em))}</Td><Td>{new Intl.DateTimeFormat("pt-BR").format(new Date(teste.termina_em))}</Td><Td>{status && <Badge tom={status === "ativo" ? "verde" : status === "teste" ? "azul" : "ouro"}>{ROTULO_STATUS_SAAS[status]}</Badge>}</Td></tr>; })}</tbody></Tabela>{testes.length === 0 && <Vazio>Nenhum teste SaaS disponível para este administrador.</Vazio>}</Card></>;
}
