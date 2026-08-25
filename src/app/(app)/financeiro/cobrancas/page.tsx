import { lerIndicadoresRecorrencia } from "@/lib/financeiro/dados-cobranca";
import { CobrancasVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Cobrancas() {
  return <CobrancasVisao dados={await lerIndicadoresRecorrencia(new Date().toISOString())} />;
}
