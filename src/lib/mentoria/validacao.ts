// Regras de validação da B2.4 (agendar sessão / dar baixa) — módulo PURO:
// nada de Next, nada de banco, nada de `Date.now()`. As mesmas duas razões
// de sempre para isolar isto de `acoes.ts` (ver `progresso.ts`/`tipos.ts`):
// 1) é aqui que mora o teste de verdade — regra pura testa em milissegundos,
//    sem dublê de Supabase; 2) a Server Action fica fina, só orquestra.
//
// Duas regras merecem nota à parte porque não são só "campo obrigatório":
//
// `validarVinculo` espelha a CHECK `sessao_vinculo_unico` do Postgres
// (supabase/migrations/0006_mentoros_mentoria.sql): uma sessão pertence a
// UMA matrícula (atendimento 1:1) OU a UMA turma (aula em grupo), nunca as
// duas, nunca nenhuma. A checagem é REPETIDA aqui, do lado de fora do
// banco, porque a mensagem que o Postgres devolve quando a CHECK falha —
// algo como `new row for relation "sessao" violates check constraint
// "sessao_vinculo_unico"` — não serve para nenhum ser humano ler na tela.
// Falhar cedo, em português, com os dois lados nomeados, é o que poupa a
// pessoa de decifrar SQL para saber o que fez de errado.
//
// `linkGravacaoValido` existe porque `sessao.linkGravacao` vira, sem mais
// nenhum filtro, um `<a href>` clicável na ficha do mentorado (ver
// `src/app/(app)/mentoria/[id]/page.tsx`). Um valor como
// `javascript:alert(1)` colado nesse campo de texto — pelo próprio mentor,
// sem nenhuma má intenção, só copiando/colando de outro lugar — executaria
// no navegador de quem clicasse. Aceitar só `http://`/`https://` fecha essa
// porta sem precisar de nenhuma lista de domínios permitidos.

import { z } from "zod";

// ============================================================
// validarVinculo — regra pura, testada isoladamente E usada dentro de
// `AgendarSchema` (via `superRefine` abaixo).
// ============================================================

export function validarVinculo(entrada: {
  matriculaId?: string;
  turmaId?: string;
}): { ok: true } | { ok: false; erro: string } {
  const temMatricula = Boolean(entrada.matriculaId);
  const temTurma = Boolean(entrada.turmaId);

  if (temMatricula && temTurma) {
    return {
      ok: false,
      erro: "Escolha matrícula ou turma para esta sessão — nunca as duas ao mesmo tempo.",
    };
  }
  if (!temMatricula && !temTurma) {
    return {
      ok: false,
      erro: "Escolha a matrícula ou a turma desta sessão.",
    };
  }
  return { ok: true };
}

// ============================================================
// linkGravacaoValido — regra pura, testada isoladamente E usada dentro de
// `BaixaSchema` (via `refine` abaixo).
// ============================================================

export function linkGravacaoValido(valor: string): boolean {
  const v = valor.trim();
  // Vazio é válido: a gravação é opcional (nem toda sessão gera link — a
  // pessoa pode estar dando baixa antes de o link existir).
  if (v === "") return true;

  // `new URL` sem segundo argumento (base) já rejeita sozinho um valor
  // "solto" sem esquema (ex.: "video.com/abc") e um protocol-relative
  // ("//evil.com/x") — os dois lançam por falta de base para resolver
  // contra. O que ainda precisa ser checado à mão é O ESQUEMA: `new URL`
  // aceita `javascript:`, `data:` e `ftp:` sem reclamar, porque todos são
  // URLs sintaticamente válidas — só não são links que este sistema quer
  // abrir num `<a href>` clicado por outra pessoa.
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ============================================================
// Peças pequenas reaproveitadas pelos dois schemas.
// ============================================================

/** ISO parseável — mesma checagem defensiva de `quandoValido` em `progresso.ts`. */
const zQuando = z
  .string()
  .trim()
  .refine((v) => v !== "" && Number.isFinite(Date.parse(v)), "Informe uma data e hora válidas.");

/**
 * Id opcional vindo de um `<select>`/hidden de formulário: "" (nada
 * escolhido) vira `undefined`, nunca string vazia — é o que deixa
 * `validarVinculo` (`Boolean(entrada.matriculaId)`) funcionar sem precisar
 * conhecer a convenção de formulário HTML.
 */
const zIdOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const zDuracaoMin = z.coerce
  .number({ invalid_type_error: "Informe a duração em minutos." })
  .int("Duração precisa ser um número inteiro de minutos.")
  .min(5, "Duração mínima é 5 minutos.")
  .max(600, "Duração máxima é 600 minutos (10 horas).");

/**
 * "" (campo em branco) vira `null` ANTES de chegar em `z.coerce.number()`:
 * sem essa troca, `Number("")` coage para `0`, que passaria a checagem de
 * "opcional" mas falharia a de `min(1)` com uma mensagem que confundiria
 * quem não preencheu nada.
 */
const zNumeroOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z.coerce
      .number({ invalid_type_error: "Número da sessão inválido." })
      .int("Número da sessão precisa ser um número inteiro.")
      .min(1, "Número da sessão precisa ser 1 ou mais.")
      .nullable()
  );

// ============================================================
// AgendarSchema
// ============================================================

export const AgendarSchema = z
  .object({
    matriculaId: zIdOpcional,
    turmaId: zIdOpcional,
    quando: zQuando,
    duracaoMin: zDuracaoMin,
    numero: zNumeroOpcional,
  })
  .superRefine((valor, ctx) => {
    const vinculo = validarVinculo(valor);
    if (!vinculo.ok) {
      // `path` aponta para `matriculaId` só para o erro ter ONDE morar num
      // formulário de campo único; a mensagem já nomeia os dois lados.
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: vinculo.erro, path: ["matriculaId"] });
    }
  });

export type EntradaAgendar = z.infer<typeof AgendarSchema>;

// ============================================================
// BaixaSchema
// ============================================================

// Deliberadamente SEM "agendada": dar baixa é o ato de SAIR de "agendada"
// para um desfecho (aconteceu, faltou, foi cancelada). Voltar uma sessão
// para "agendada" é remarcar — uma ação diferente, que este sistema ainda
// não tem — então o enum de baixa não pode aceitar o valor de origem como
// se fosse também um destino válido.
// Exportado (não só interno ao schema): a tela de baixa (`page.tsx`)
// reaproveita esta lista para montar o `<select>` de status — assim as
// opções mostradas na tela e as aceitas pela validação NUNCA divergem.
export const STATUS_BAIXA_VALORES = ["realizada", "faltou", "cancelada"] as const;

export type StatusBaixa = (typeof STATUS_BAIXA_VALORES)[number];

export const BaixaSchema = z.object({
  sessaoId: z.string().trim().min(1, "Sessão inválida."),
  status: z.enum(STATUS_BAIXA_VALORES, {
    errorMap: () => ({
      message: 'Status inválido para dar baixa — use "realizada", "faltou" ou "cancelada".',
    }),
  }),
  linkGravacao: z
    .string()
    .trim()
    .max(500, "Link da gravação muito longo (máximo 500 caracteres).")
    .refine(linkGravacaoValido, "Link da gravação precisa começar com http:// ou https://.")
    .default(""),
  resumo: z.string().trim().max(5000, "Resumo muito longo (máximo 5000 caracteres).").default(""),
});

export type EntradaBaixa = z.infer<typeof BaixaSchema>;
