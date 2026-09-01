"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarSupabaseServer } from "../supabase/server";
import { parcelasDe } from "./recorrencia";

const CAMINHO = "/financeiro";
const ERRO = "Não foi possível salvar agora. Tente novamente em instantes.";
const INVALIDA = "Não reconheci os dados da cobrança.";
const UUID_OU_ID = /^[A-Za-z0-9_-]{1,100}$/;
type Cliente = any;

function texto(form: FormData, campo: string): string { return String(form.get(campo) ?? "").trim(); }
function erro(mensagem = ERRO): void { redirect(`${CAMINHO}?erro=${encodeURIComponent(mensagem)}`); }
function idValido(id: string): boolean { return UUID_OU_ID.test(id); }
function dataCivil(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return ano >= 1 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimo;
}
function falhaControle(ex: unknown): boolean {
  const digest = typeof ex === "object" && ex !== null ? (ex as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
function revalidar(): void { revalidatePath(CAMINHO); }
function hojeCivil(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/** Cria as parcelas civis da matrícula; 23505 é a confirmação de idempotência. */
export async function gerarRecorrencia(formData: FormData): Promise<void> {
  const matriculaId = texto(formData, "matriculaId");
  const mentoradoId = texto(formData, "mentoradoId");
  const inicio = texto(formData, "inicio");
  const periodicidade = texto(formData, "periodicidade");
  const quantidade = Number(texto(formData, "quantidade"));
  const valor = Number(texto(formData, "valor"));
  const diaVencimento = Number(texto(formData, "diaVencimento"));
  if (!idValido(matriculaId) || !idValido(mentoradoId)) { erro(INVALIDA); return; }
  const parcelas = parcelasDe({ inicio, periodicidade, quantidade, valor, diaVencimento });
  if (parcelas.length === 0) { erro(INVALIDA); return; }

  const s: Cliente = criarSupabaseServer();
  try {
    for (const parcela of parcelas) {
      const { error: e } = await s.from("cobranca").insert({
        mentorado_id: mentoradoId, matricula_id: matriculaId, competencia: parcela.competencia,
        vencimento: parcela.vencimento, valor: parcela.valor, status: "prevista",
      });
      if (e && e.code !== "23505") { erro(); return; }
    }
  } catch (ex) { if (falhaControle(ex)) throw ex; erro(); return; }
  revalidar();
}

/** Registra baixa manual pela RPC que grava cobrança e movimento atomicamente. */
export async function darBaixaCobranca(formData: FormData): Promise<void> {
  const cobrancaId = texto(formData, "cobrancaId");
  const pagoEm = texto(formData, "pagoEm") || texto(formData, "dataPagamento");
  const forma = texto(formData, "forma");
  if (!idValido(cobrancaId) || !dataCivil(pagoEm) || !["pix", "transferencia", "dinheiro", "outro"].includes(forma)) { erro(INVALIDA); return; }
  if (pagoEm > hojeCivil()) { erro("A data da baixa não pode estar no futuro."); return; }

  const s: Cliente = criarSupabaseServer();
  try {
    const { error: e } = await s.rpc("baixar_cobranca_com_movimento", {
      p_cobranca_id: cobrancaId, p_pago_em: pagoEm, p_forma: forma,
    });
    if (e) { erro(); return; }
  } catch (ex) { if (falhaControle(ex)) throw ex; erro(); return; }
  revalidar();
}

/** Cancela por estado histórico; a tabela não é apagada. */
export async function cancelarCobranca(formData: FormData): Promise<void> {
  const cobrancaId = texto(formData, "cobrancaId");
  if (!idValido(cobrancaId)) { erro(INVALIDA); return; }
  try {
    const { error: e } = await criarSupabaseServer().from("cobranca").update({ status: "cancelada" }).eq("id", cobrancaId);
    if (e) { erro(); return; }
  } catch (ex) { if (falhaControle(ex)) throw ex; erro(); return; }
  revalidar();
}

/** Vincula somente documento já enviado e classificado como contrato. */
export async function registrarContrato(formData: FormData): Promise<void> {
  const mentoradoId = texto(formData, "mentoradoId");
  const documentoId = texto(formData, "documentoId");
  if (!idValido(mentoradoId) || !idValido(documentoId)) { erro(INVALIDA); return; }
  const s: Cliente = criarSupabaseServer();
  try {
    const lido = await s.from("documento").select("categoria, arquivado, caminho_storage").eq("id", documentoId).maybeSingle();
    if (
      lido?.error || !lido?.data || lido.data.categoria !== "contrato" ||
      lido.data.arquivado === true || typeof lido.data.caminho_storage !== "string" || lido.data.caminho_storage.trim() === ""
    ) { erro("O documento escolhido não é um contrato enviado e ativo."); return; }
    const { error: e } = await s.from("contrato").insert({
      mentorado_id: mentoradoId, matricula_id: texto(formData, "matriculaId") || null,
      documento_id: documentoId, assinado_em: texto(formData, "assinadoEm") || null,
      vigencia_inicio: texto(formData, "vigenciaInicio") || null, vigencia_fim: texto(formData, "vigenciaFim") || null,
      valor_total: Number(texto(formData, "valorTotal") || 0), status: texto(formData, "status") || "pendente",
    });
    if (e) { erro(); return; }
  } catch (ex) { if (falhaControle(ex)) throw ex; erro(); return; }
  revalidar();
}

/**
 * Publicação é opt-in: o contrato nasce privado e este é o único caminho da
 * tela financeira que altera a flag. A RLS ainda limita a linha ao workspace
 * da gestão; o formulário nunca escolhe um mentorado nem qualquer dado do
 * contrato.
 */
export async function alternarVisibilidadeContrato(formData: FormData): Promise<void> {
  const contratoId = texto(formData, "contratoId");
  const visivel = texto(formData, "visivel") === "on";
  if (!idValido(contratoId)) { erro(INVALIDA); return; }
  try {
    const { error: e } = await criarSupabaseServer()
      .from("contrato")
      .update({ visivel_portal: visivel })
      .eq("id", contratoId);
    if (e) { erro(); return; }
  } catch (ex) { if (falhaControle(ex)) throw ex; erro(); return; }
  revalidar();
}

// Nomes explícitos mantidos como aliases da linguagem da tela/plano; todos
// atravessam a mesma validação e não criam um segundo caminho de escrita.
export const gerarCobrancasDaMatricula = gerarRecorrencia;
export const darBaixaNaCobranca = darBaixaCobranca;
export const anexarContrato = registrarContrato;
