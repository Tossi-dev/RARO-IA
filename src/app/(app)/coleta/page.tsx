// Coleta de dados -- a tela que mostra o CAMINHO do dado, nao o dado.
//
// Ela existe porque o painel inteiro depende de uma pergunta que ate agora so
// tinha resposta em conversa: "se a planilha esta zerada, como isso aqui vai
// encher?". A resposta agora e navegavel e verificavel. Cada rota de coleta
// aparece com o caminho completo -- gatilho, aba de destino, telas que acendem
// -- e com o status REAL: o que ja funciona hoje, o que so falta ligar e o que
// ainda depende de decisao.
//
// Regra que rege a tela: nada aqui pode parecer pronto sem estar. Rota que
// depende de credencial mostra a credencial que falta, com nome e tudo.

import Link from "next/link";
import { Badge, Card, PageHeader, Tabela, Td, Th, type Tom } from "@/components/ui";
import { ABAS } from "@/lib/sheets/abas";
import {
  ROTAS_COLETA,
  ROTULO_MODO,
  ROTULO_STATUS,
  TELAS,
  rotasQueAlimentam,
  telasQueUsam,
  type RotaDeColeta,
  type StatusColeta,
} from "@/lib/sheets/coleta";
import { sheetsConfigurado, sheetsEscritaConfigurada, sheetsId } from "@/lib/sheets/config";
import { variaveisDeEscritaFaltando } from "@/lib/sheets/escrever";
import { lerAbas } from "@/lib/sheets/ler";
import { fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

const TOM_STATUS: Record<StatusColeta, Tom> = {
  ativa: "verde",
  pendente: "ouro",
  planejada: "cinza",
};

/** Elo da corrente: cada passo do caminho do dado, da origem ate a tela. */
function Elo({ children, forte = false }: { children: React.ReactNode; forte?: boolean }) {
  return (
    <span
      className={
        forte
          ? "rounded-lg border border-primaria/40 bg-primaria/10 px-2.5 py-1 text-xs font-medium text-primaria-2"
          : "rounded-lg border border-borda bg-poco px-2.5 py-1 text-xs text-texto-2"
      }
    >
      {children}
    </span>
  );
}

function Seta() {
  return (
    <span aria-hidden className="select-none text-texto-4">
      →
    </span>
  );
}

function CartaoRota({ rota, linhasPorAba }: { rota: RotaDeColeta; linhasPorAba: Record<string, number> }) {
  const telas = Array.from(
    new Map(rota.destino.flatMap((a) => telasQueUsam(a)).map((t) => [t.href, t])).values()
  );
  // as abas de destino que ja tem linha -- prova de que a rota andou
  const comLinha = rota.destino.filter((a) => (linhasPorAba[a] ?? 0) > 0);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight">{rota.nome}</h3>
          <p className="mt-0.5 text-xs text-texto-3">{rota.gatilho}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Badge tom={rota.modo === "automatica" ? "violeta" : rota.modo === "semiautomatica" ? "azul" : "cinza"}>
            {ROTULO_MODO[rota.modo]}
          </Badge>
          <Badge tom={TOM_STATUS[rota.status]}>{ROTULO_STATUS[rota.status]}</Badge>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-texto-2">{rota.descricao}</p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-texto-4">Caminho do dado</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Elo forte>{rota.gatilho}</Elo>
          <Seta />
          <Elo>MentorOS</Elo>
          <Seta />
          {rota.destino.slice(0, 6).map((a) => (
            <span key={a} className="inline-flex items-center gap-1">
              <code className="rounded bg-poco px-1.5 py-1 font-mono text-[11px] text-texto-2">{a}</code>
            </span>
          ))}
          {rota.destino.length > 6 ? (
            <span className="text-xs text-texto-3">+{rota.destino.length - 6} abas</span>
          ) : null}
        </div>
      </div>

      {telas.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-texto-4">Telas que acendem</p>
          <div className="flex flex-wrap gap-1.5">
            {telas.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                title={t.pergunta}
                className="rounded-lg border border-borda px-2.5 py-1 text-xs text-texto-2 transition-colors hover:border-borda-forte hover:text-texto"
              >
                {t.rotulo}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {rota.bloqueio ? (
        <p className="mt-3 rounded-lg border border-aviso/30 bg-aviso/5 px-3 py-2 text-xs leading-relaxed text-texto-2">
          <span className="font-medium text-aviso">Falta para ligar:</span> {rota.bloqueio}
        </p>
      ) : (
        <p className="mt-3 text-xs text-texto-3">
          {comLinha.length > 0
            ? `Ja gravou linha em: ${comLinha.join(", ")}.`
            : "Caminho de pe. Nenhuma linha entrou por aqui ainda."}
        </p>
      )}
    </Card>
  );
}

export default async function Coleta() {
  const ligada = sheetsConfigurado();
  const escreve = sheetsEscritaConfigurada();
  const faltandoEscrita = variaveisDeEscritaFaltando();

  // so as abas de entrada -- as derivadas sao formula do dono e nao recebem coleta.
  const abasEntrada = ABAS.filter((a) => a.papel === "entrada");
  const leituras = ligada ? await lerAbas(abasEntrada.map((a) => a.nome)) : null;
  const linhasPorAba: Record<string, number> = {};
  for (const a of abasEntrada) linhasPorAba[a.nome] = leituras?.[a.nome]?.linhas.length ?? 0;

  const totalLinhas = Object.values(linhasPorAba).reduce((s, n) => s + n, 0);
  const ativas = ROTAS_COLETA.filter((r) => r.status === "ativa").length;
  const pendentes = ROTAS_COLETA.filter((r) => r.status === "pendente").length;
  const planejadas = ROTAS_COLETA.filter((r) => r.status === "planejada").length;

  return (
    <div>
      <PageHeader
        titulo="Coleta de dados"
        sub="De onde vem cada numero do painel e por qual caminho ele entra — o que ja funciona, o que so falta ligar e o que ainda depende de decisao."
      />

      {/* Estado da ponte com a planilha. Fatos, nao promessa. */}
      <Card titulo="Ponte com a planilha do dono">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-borda bg-poco p-3">
            <p className="text-[11px] uppercase tracking-wider text-texto-4">Leitura</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-texto">
              <Badge tom={ligada ? "verde" : "vermelho"}>{ligada ? "Ligada" : "Desligada"}</Badge>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-texto-3">
              {ligada
                ? `Lendo ${abasEntrada.length} abas de entrada, com cache de um minuto. Planilha ${sheetsId()?.slice(0, 8)}…`
                : "Falta a variavel RARO_SHEETS_ID."}
            </p>
          </div>
          <div className="rounded-lg border border-borda bg-poco p-3">
            <p className="text-[11px] uppercase tracking-wider text-texto-4">Escrita</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-texto">
              <Badge tom={escreve ? "verde" : "ouro"}>{escreve ? "Ligada" : "Falta ligar"}</Badge>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-texto-3">
              {escreve
                ? "O sistema pode gravar linha nas abas de entrada. As abas de formula do dono (PAINEL, DRE, FLUXO_CAIXA) seguem bloqueadas por codigo."
                : `Falta: ${faltandoEscrita.join(", ")}. Sem isso o sistema le, mas nao escreve — nada se perde, so nao entra sozinho.`}
            </p>
          </div>
          <div className="rounded-lg border border-borda bg-poco p-3">
            <p className="text-[11px] uppercase tracking-wider text-texto-4">Linhas na planilha</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight">
              {fmtNum(totalLinhas)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-texto-3">
              Soma das linhas lidas agora nas {abasEntrada.length} abas de entrada. Este numero e a contagem real
              do arquivo — se ele esta em zero, o painel fica em zero, e e assim que tem que ser.
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-texto-3">
        <Badge tom="verde">{ativas} funcionando</Badge>
        <Badge tom="ouro">{pendentes} falta ligar</Badge>
        <Badge tom="cinza">{planejadas} planejada(s)</Badge>
        <span>— cada cartao abaixo mostra o caminho inteiro, do gatilho ate a tela.</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {ROTAS_COLETA.map((r) => (
          <CartaoRota key={r.id} rota={r} linhasPorAba={linhasPorAba} />
        ))}
      </div>

      {/* Casamento de dados: a mesma verdade lida ao contrario. */}
      <div className="mt-4">
        <Card titulo="Casamento de dados — o que cada aba acende no painel">
          <p className="mb-3 text-xs leading-relaxed text-texto-3">
            Leia de tras para frente: escolha a aba que voce quer preencher primeiro e veja exatamente quais telas
            saem do zero por causa dela. As abas com mais telas na frente sao as que dao mais painel por linha
            digitada.
          </p>
          <Tabela>
            <thead>
              <tr>
                <Th>Aba</Th>
                <Th num>Linhas hoje</Th>
                <Th>Entra por</Th>
                <Th>Acende</Th>
              </tr>
            </thead>
            <tbody>
              {abasEntrada
                .map((a) => ({ aba: a, telas: telasQueUsam(a.nome), rotas: rotasQueAlimentam(a.nome) }))
                .sort((x, y) => y.telas.length - x.telas.length || x.aba.nome.localeCompare(y.aba.nome))
                .map(({ aba, telas, rotas }) => {
                  const auto = rotas.filter((r) => r.modo !== "manual");
                  return (
                    <tr key={aba.nome}>
                      <Td>
                        <code className="font-mono text-xs text-texto">{aba.nome}</code>
                        <p className="mt-0.5 max-w-md text-[11px] leading-snug text-texto-3">{aba.descricao}</p>
                      </Td>
                      <Td num>
                        <span className={linhasPorAba[aba.nome] > 0 ? "text-texto" : "text-texto-4"}>
                          {fmtNum(linhasPorAba[aba.nome] ?? 0)}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {auto.length > 0 ? (
                            auto.map((r) => (
                              <Badge key={r.id} tom={TOM_STATUS[r.status]}>
                                {ROTULO_MODO[r.modo]}
                              </Badge>
                            ))
                          ) : (
                            <Badge tom="cinza">Manual</Badge>
                          )}
                        </div>
                      </Td>
                      <Td>
                        {telas.length === 0 ? (
                          <span className="text-xs text-texto-4">nenhuma tela ainda</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {telas.map((t) => (
                              <Link
                                key={t.href}
                                href={t.href}
                                title={t.pergunta}
                                className="rounded border border-borda px-1.5 py-0.5 text-[11px] text-texto-2 hover:text-texto"
                              >
                                {t.rotulo}
                              </Link>
                            ))}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </Tabela>
        </Card>
      </div>

      {/* O caminho inverso: da tela para as abas de que ela depende. */}
      <div className="mt-4">
        <Card titulo="Cada tela e as abas de que ela depende">
          <Tabela>
            <thead>
              <tr>
                <Th>Tela</Th>
                <Th>Pergunta que responde</Th>
                <Th>Le as abas</Th>
                <Th num>Prontas</Th>
              </tr>
            </thead>
            <tbody>
              {TELAS.map((t) => {
                const prontas = t.le.filter((a) => (linhasPorAba[a] ?? 0) > 0).length;
                return (
                  <tr key={t.href}>
                    <Td>
                      <Link href={t.href} className="text-primaria-2 hover:underline">
                        {t.rotulo}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-texto-2">{t.pergunta}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {t.le.map((a) => (
                          <code
                            key={a}
                            className={
                              (linhasPorAba[a] ?? 0) > 0
                                ? "rounded bg-positivo/10 px-1.5 py-0.5 font-mono text-[10px] text-positivo"
                                : "rounded bg-poco px-1.5 py-0.5 font-mono text-[10px] text-texto-4"
                            }
                          >
                            {a}
                          </code>
                        ))}
                      </div>
                    </Td>
                    <Td num>
                      <span className={prontas === t.le.length ? "text-positivo" : "text-texto-3"}>
                        {prontas}/{t.le.length}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        </Card>
      </div>
    </div>
  );
}
