// A parte PURA de apresentação da página pública de certificado. Recebe o
// resultado já resolvido por `verificarCertificado` e só desenha.
//
// PARA QUEM ESTA TELA É ESCRITA
// -----------------------------
// Para alguém de FORA: um contratante conferindo o currículo de um
// candidato, um cliente do aluno, uma banca. Essa pessoa não conhece o
// MentorOS, não vai criar conta e provavelmente chegou por um link ou
// digitando um código de um papel. Ela precisa de uma resposta em uma
// olhada — vale, ou não vale — e nada além disso.
//
// AS TRÊS COISAS QUE ESTA TELA NÃO FAZ
// -------------------------------------
// 1. NÃO descreve o formato do código. "O código tem 12 caracteres" ou "só
//    letras maiúsculas e números" entregaria de graça, a quem está tentando
//    adivinhar, metade do trabalho. E a resposta é a MESMA para código mal
//    formado e para código inexistente, pelo mesmo motivo (ver o cabeçalho
//    de `dados-certificado.ts`).
// 2. NÃO diz quantos certificados existem, nem sugere procurar outro.
// 3. NÃO mostra e-mail nem telefone de ninguém — e não poderia, porque a
//    função do banco (0021) nem devolve esses campos. As duas portas fechadas
//    juntas: a tela não os desenha, e a leitura não os traz.
//
// Feita para `Ctrl+P`: é uma página HTML com uma regra de impressão, não um
// PDF gerado por serviço. Custo zero, e não há arquivo para vazar depois.

import { dataPorExtensoBr } from "./textos";
import type { CertificadoPublico } from "@/lib/conteudo/dados-certificado";

/** A mesma frase para "não existe" e para "código mal formado". */
const NAO_ENCONTRADO =
  "Não encontramos nenhum certificado com esse código. Confira se ele foi copiado por inteiro, " +
  "exatamente como aparece no documento.";

export function CertificadoVisao({ resultado }: { resultado: CertificadoPublico }) {
  const data = dataPorExtensoBr(resultado.emitidoEm);

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="mx-auto w-full max-w-xl">
        {!resultado.conectado ? (
          <section className="superficie rounded-2xl border border-borda-sutil p-6">
            <h1 className="font-display text-xl font-fino">Verificação de certificado</h1>
            <p className="mt-3 text-sm text-texto-2">{resultado.motivo}</p>
          </section>
        ) : !resultado.encontrado ? (
          <section className="superficie rounded-2xl border border-borda-sutil p-6">
            <h1 className="font-display text-xl font-fino">Certificado não encontrado</h1>
            <p className="mt-3 text-sm text-texto-2">{NAO_ENCONTRADO}</p>
          </section>
        ) : (
          <section className="superficie rounded-2xl border border-borda-sutil p-8 text-center">
            <p className="text-xs uppercase tracking-widest text-texto-3">Certificado verificado</p>

            <h1 className="mt-5 font-display text-2xl font-fino leading-tight">{resultado.aluno}</h1>
            <p className="mt-3 text-sm text-texto-2">concluiu a trilha</p>
            <p className="mt-1 text-lg font-medium">{resultado.trilha}</p>

            {data ? <p className="mt-5 text-sm text-texto-2">Emitido em {data}</p> : null}

            <p className="mt-6 border-t border-borda-sutil pt-4 text-xs text-texto-3">
              Código de verificação
              <span className="mt-1 block font-mono text-sm tracking-widest text-texto">
                {resultado.codigo}
              </span>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
