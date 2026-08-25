import { lerDadosPessoais } from "@/lib/pessoal/dados";
import { PessoalVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Pessoal() {
  return <PessoalVisao dados={await lerDadosPessoais()} />;
}
