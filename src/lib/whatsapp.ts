// Link direto de WhatsApp (wa.me) — sem API, abre a conversa no app/web.

export function normalizarTelefone(telefone: string): string {
  let d = (telefone || "").replace(/\D/g, "");
  if (!d) return "";
  // remove zeros à esquerda de DDD digitado como 011
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // acrescenta DDI do Brasil quando vier só DDD+número (10 ou 11 dígitos)
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

export function linkWhatsApp(telefone: string, mensagem?: string): string {
  const num = normalizarTelefone(telefone);
  if (!num) return "";
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${num}${texto}`;
}

export function mensagemReativacao(nomeAluno: string): string {
  const primeiro = (nomeAluno || "").split(" ")[0];
  return `Oi ${primeiro}, tudo bem? Aqui é da equipe Raro. Sentimos sua falta por aqui — posso te contar as novidades do protocolo?`;
}
