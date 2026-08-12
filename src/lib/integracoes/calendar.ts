// Google Calendar (reuniões) — REST puro atrás de env, sem SDK.
// Sem credenciais → modo demo: o app usa só a tabela `reunioes` (fonte local),
// e "criar no Google" vira no-op explícito.
//
// Credenciais (ver .env.example): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN (OAuth da conta do negócio), GOOGLE_CALENDAR_ID.

import { analisarICS, type AgendaLida } from "./ics";

/**
 * LEITURA da agenda — caminho separado, e de propósito.
 *
 * Escrever evento exige OAuth (as três variáveis acima). LER só exige o
 * "endereço secreto em formato iCal" que o próprio Google Agenda gera:
 * Configurações do calendário → "Endereço secreto no formato iCal". É uma URL
 * privada que devolve o .ics por GET simples — sem projeto no Google Cloud,
 * sem tela de consentimento, sem refresh token.
 *
 * A URL é equivalente a uma senha de leitura: quem a tem lê a agenda inteira.
 * Por isso ela é variável de SERVIDOR (nunca NEXT_PUBLIC_), nunca é impressa
 * em tela nem em mensagem de erro, e nunca entra numa nota do vault.
 */
export function agendaConfigurada(): boolean {
  return Boolean(process.env.RARO_AGENDA_ICS_URL);
}

export interface AgendaResultado {
  ok: boolean;
  /** Motivo, em português, quando não deu. Nunca contém a URL. */
  erro: string | null;
  dados: AgendaLida | null;
}

/**
 * Baixa e lê a agenda na janela pedida.
 *
 * Cache de 5 minutos: a agenda muda devagar e a tela é aberta muitas vezes ao
 * dia. Sem isso, cada troca de "semana" para "mês" baixaria o arquivo inteiro
 * de novo.
 */
export async function lerAgenda(de: Date, ate: Date): Promise<AgendaResultado> {
  const url = process.env.RARO_AGENDA_ICS_URL;
  if (!url) {
    return {
      ok: false,
      erro: "Agenda não conectada: falta a variável RARO_AGENDA_ICS_URL.",
      dados: null,
    };
  }

  try {
    const r = await fetch(url, { next: { revalidate: 300 } });
    if (!r.ok) {
      // O status entra; a URL, não. Mensagem de erro é lugar clássico de
      // vazamento de segredo.
      return {
        ok: false,
        erro: `O Google recusou o endereço da agenda (HTTP ${r.status}). Gere um novo endereço secreto em iCal e troque a variável.`,
        dados: null,
      };
    }
    const texto = await r.text();
    if (!texto.includes("BEGIN:VCALENDAR")) {
      return {
        ok: false,
        erro: "O endereço respondeu, mas o conteúdo não é um calendário iCal. Confira se a URL termina em .ics.",
        dados: null,
      };
    }
    return { ok: true, erro: null, dados: analisarICS(texto, de, ate) };
  } catch {
    return {
      ok: false,
      erro: "Não foi possível alcançar o endereço da agenda. Pode ser rede ou o endereço ter sido revogado.",
      dados: null,
    };
  }
}

export interface EventoCriado {
  googleEventId: string;
  link: string;
  provider: "google" | "demo";
}

export function calendarConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as { access_token: string };
  return data.access_token;
}

/** Cria o evento no Google Calendar (quando configurado). */
export async function criarEventoGoogle(ev: {
  titulo: string;
  inicio: string; // ISO datetime
  fim: string | null;
  descricao?: string;
}): Promise<EventoCriado> {
  if (!calendarConfigurado()) {
    return { googleEventId: "", link: "", provider: "demo" };
  }
  const token = await accessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  const fim = ev.fim ?? new Date(new Date(ev.inicio).getTime() + 60 * 60000).toISOString();
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: ev.titulo,
        description: ev.descricao ?? "Criado pela plataforma MentorOS",
        start: { dateTime: ev.inicio, timeZone: "America/Sao_Paulo" },
        end: { dateTime: fim, timeZone: "America/Sao_Paulo" },
      }),
    }
  );
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as { id?: string; htmlLink?: string };
  return { googleEventId: data.id ?? "", link: data.htmlLink ?? "", provider: "google" };
}
