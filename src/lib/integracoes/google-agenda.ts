// Login com o Google para ler a agenda ("Entrar com o Google").
//
// POR QUE ESTE CAMINHO EXISTE AO LADO DO iCAL
// -------------------------------------------
// O endereço secreto em iCal (ver ./ics.ts) resolve leitura sem autorização,
// mas exige que alguém entre nas configurações do calendário e copie uma URL.
// Aqui o dono clica em um botão, escolhe a conta e pronto. Os dois caminhos
// convivem: se houver login do Google, ele manda; senão vale o iCal.
//
// O QUE ESTE ARQUIVO GUARDA, E ONDE
// ---------------------------------
// O `refresh_token` fica num COOKIE httpOnly + secure + sameSite=lax. Isso
// significa: o JavaScript da página NUNCA lê esse valor (httpOnly), ele só
// trafega em HTTPS (secure) e não é enviado em requisição de outro site
// (sameSite). É o mesmo mecanismo de uma sessão de login.
//
// O que NÃO é feito, de propósito: o token não vai para o Supabase, para a
// planilha nem para variável de ambiente. Ele pertence a quem clicou em
// "Entrar", e sair da conta é apagar o cookie — sem admin, sem suporte.
//
// PERMISSÃO PEDIDA: `calendar.readonly`. Só isso. O app não consegue criar,
// mover nem apagar evento nenhum, mesmo que alguém queira.

import { cookies } from "next/headers";
import type { EventoAgenda } from "./ics";

export const COOKIE_GOOGLE = "raro_google_agenda";
export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.readonly";

/** As credenciais do app (uma vez, por quem publica) estão configuradas? */
export function googleAppConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Este navegador já autorizou uma conta Google? */
export function googleConectado(): boolean {
  return Boolean(cookies().get(COOKIE_GOOGLE)?.value);
}

/**
 * O endereço de retorno do OAuth.
 *
 * Precisa bater EXATAMENTE com o que está cadastrado no Google Cloud, inclusive
 * o https e a ausência de barra no fim. Em produção vem de
 * `NEXT_PUBLIC_SITE_URL` ou da URL que a própria Vercel injeta; em
 * desenvolvimento cai no localhost.
 */
export function urlDeRetorno(origem?: string): string {
  const base =
    origem ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/agenda/google/retorno`;
}

/** A URL da tela de consentimento do Google. */
export function urlDeConsentimento(estado: string, origem?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: urlDeRetorno(origem),
    response_type: "code",
    scope: ESCOPO_AGENDA,
    // offline + consent: sem os dois o Google devolve refresh_token só na
    // PRIMEIRA autorização daquela conta, e reconectar depois falha em
    // silêncio — o clássico "funcionou uma vez e nunca mais".
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Troca o `code` da volta pelo par de tokens. */
export async function trocarCodigoPorTokens(
  code: string,
  origem?: string
): Promise<{ ok: boolean; refreshToken?: string; erro?: string }> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: urlDeRetorno(origem),
      grant_type: "authorization_code",
    }),
  });
  const dados = (await r.json()) as RespostaToken;
  if (!r.ok || !dados.refresh_token) {
    // A descrição do Google entra porque é acionável ("redirect_uri_mismatch"
    // diz exatamente o que corrigir). O client_secret nunca aparece aqui.
    return {
      ok: false,
      erro: dados.error_description || dados.error || `HTTP ${r.status}`,
    };
  }
  return { ok: true, refreshToken: dados.refresh_token };
}

async function accessTokenDoCookie(): Promise<string | null> {
  const refresh = cookies().get(COOKIE_GOOGLE)?.value;
  if (!refresh || !googleAppConfigurado()) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const d = (await r.json()) as RespostaToken;
  return d.access_token ?? null;
}

interface EventoGoogle {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/**
 * Lê os eventos da agenda principal na janela pedida.
 *
 * `singleEvents=true` faz o PRÓPRIO Google desdobrar as repetições — é a
 * vantagem prática deste caminho sobre o iCal, onde a expansão das regras
 * (RRULE) é nossa e cobre um subconjunto. Aqui "toda primeira segunda do mês"
 * vem certo sem esforço.
 */
export async function lerAgendaGoogle(
  de: Date,
  ate: Date
): Promise<{ ok: boolean; erro: string | null; eventos: EventoAgenda[] }> {
  const token = await accessTokenDoCookie();
  if (!token) {
    return {
      ok: false,
      erro: "A conexão com o Google expirou ou foi revogada. Entre de novo.",
      eventos: [],
    };
  }

  const p = new URLSearchParams({
    timeMin: de.toISOString(),
    timeMax: ate.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
    showDeleted: "false",
  });

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!r.ok) {
    return { ok: false, erro: `O Google recusou a leitura (HTTP ${r.status}).`, eventos: [] };
  }

  const dados = (await r.json()) as { items?: EventoGoogle[] };
  const eventos: EventoAgenda[] = (dados.items ?? []).map((e) => {
    // `date` (sem hora) = evento de dia inteiro. `dateTime` já vem com o
    // deslocamento do fuso embutido, então `new Date` acerta o instante.
    const diaInteiro = Boolean(e.start?.date);
    const inicio = new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00-03:00`);
    const fim = new Date(
      e.end?.dateTime ?? `${e.end?.date ?? e.start?.date}T00:00:00-03:00`
    );
    return {
      uid: e.id ?? "",
      titulo: (e.summary ?? "").trim() || "(sem título)",
      inicio,
      fim: fim > inicio ? fim : new Date(inicio.getTime() + 3600_000),
      diaInteiro,
      local: (e.location ?? "").trim(),
      descricao: (e.description ?? "").replace(/<[^>]+>/g, "").trim(),
      repetido: Boolean(e.recurringEventId),
      cancelado: e.status === "cancelled",
    };
  });

  return { ok: true, erro: null, eventos };
}
