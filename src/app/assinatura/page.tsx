import { redirect } from "next/navigation";
import { Botao, Card } from "@/components/ui";
import { estadoDaAssinaturaAtual } from "@/lib/saas/consultas";
import { resumoDoPrazo, ROTULO_STATUS_SAAS, statusEfetivoSaas } from "@/lib/saas/apresentacao";
import { criarSupabaseServer } from "@/lib/supabase/server";
import { sair } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function AssinaturaPage() {
  const { data } = await criarSupabaseServer().auth.getUser();
  if (!data.user) redirect("/login");
  const assinatura = await estadoDaAssinaturaAtual();
  const status = statusEfetivoSaas(assinatura.status, assinatura.terminaEm);
  const bloqueado = status === "bloqueado" || status === "cancelado";

  return <main className="relative flex min-h-screen items-center justify-center px-5 py-12"><div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_30rem_at_15%_15%,rgb(var(--primaria)/0.2),transparent_70%)]" /><Card className="w-full max-w-xl !p-6 sm:!p-8"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primaria-2">MentorOS</p><h1 className="mt-4 font-display text-4xl font-fino tracking-[-.05em] text-texto">{bloqueado ? "Continue de onde parou." : "Seu plano MentorOS"}</h1><p className="mt-4 text-base leading-relaxed text-texto-2">{resumoDoPrazo(status, assinatura.terminaEm)}</p>{status ? <p className="mt-5 inline-flex rounded-full border border-borda bg-poco px-3 py-1 text-sm text-texto-2">{ROTULO_STATUS_SAAS[status]}</p> : null}<div className="mt-7 rounded-2xl border border-borda-sutil bg-poco p-4 text-sm leading-relaxed text-texto-2"><strong className="text-texto">Plano mensal único.</strong> O valor e o checkout serão exibidos quando a configuração comercial estiver concluída. Nenhum dado do seu espaço será apagado enquanto isso.</div><div className="mt-6 flex flex-wrap gap-3"><form action={sair}><Botao tipo="fantasma">Sair da conta</Botao></form></div></Card></main>;
}
