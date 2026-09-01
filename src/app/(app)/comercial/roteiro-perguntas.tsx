"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { roteiroComercialDe } from "@/lib/comercial/roteiro-perguntas";

/** Roteiro local: a pessoa do time confirma o consentimento antes de ver perguntas. */
export function RoteiroPerguntasComercial() {
  const [consentiu, setConsentiu] = useState(false);
  const perguntas = roteiroComercialDe(consentiu);
  return (
    <Card titulo="Roteiro de descoberta">
      <label className="flex items-start gap-2 text-sm text-texto-2">
        <input type="checkbox" checked={consentiu} onChange={(evento) => setConsentiu(evento.target.checked)} />
        Confirmo que a pessoa autorizou registrar informações desta conversa comercial.
      </label>
      {perguntas.length ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-texto">
          {perguntas.map((pergunta) => <li key={pergunta}>{pergunta}</li>)}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-texto-2">As perguntas ficam ocultas até a confirmação. Este roteiro é interno e não envia mensagens.</p>
      )}
    </Card>
  );
}
