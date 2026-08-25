import { lerDadosMarketing } from "@/lib/marketing/dados";
import { MarketingVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Marketing({ searchParams }: { searchParams: { erro?: string } }) {
  const dados = await lerDadosMarketing();
  return <MarketingVisao dados={dados} erro={typeof searchParams.erro === "string" ? searchParams.erro : ""} />;
}
