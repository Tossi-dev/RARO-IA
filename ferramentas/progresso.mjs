// Gera a pagina de acompanhamento da Fase 2.
//
// POR QUE UMA PAGINA E NAO UMA MENSAGEM
// --------------------------------------
// Mensagem no chat some quando a conversa rola. E enquanto os agentes rodam
// eu fico parado esperando -- nao ha ninguem para digitar "ainda estou aqui".
// Esta pagina resolve os dois: ela vive num arquivo na maquina do dono, se
// recarrega sozinha a cada 60 segundos, e mostra o estado real da ultima vez
// que eu reescrevi o arquivo. Sem servidor, sem dependencia, sem instalar
// nada: e um file:// aberto no Chrome.
//
// USO: node ferramentas/progresso.mjs <ultimaFeita> <testes> <rodandoDe> <rodandoAte>
//   node ferramentas/progresso.mjs 9 1983 10 21
//
// TRES ESTADOS, NAO DOIS. A primeira versao desta pagina tinha so "feita" e
// "aberta", e eu marquei como feitas as 12 tarefas do lote que ainda estava
// RODANDO -- porque era mais facil passar um numero so. Deu no que sempre da:
// a tela afirmou como pronto o que nao estava. Tarefa em execucao agora tem
// estado proprio, em dourado, e nao entra na conta de concluidas nem na barra.

import { writeFileSync } from "node:fs";

const TAREFAS = [
  [1, 1, "Migracao: escada Prospect -> Alumni"],
  [1, 2, "Modulo puro: jornada do cliente"],
  [1, 3, "Tela: kanban na escada nova"],
  [1, 4, "Migracao: tabela documento"],
  [1, 5, "Modulo puro: validacao de arquivo"],
  [1, 6, "Leitura: documentos"],
  [1, 7, "Escrita: anexar e arquivar documento"],
  [1, 8, "Modulo puro: score de saude do mentorado"],
  [1, 9, "Modulo puro: historico 360 unificado"],
  [2, 10, "Leitura: historico da ficha"],
  [2, 11, "Tela: ficha com historico e saude"],
  [2, 12, "Tela: documentos na ficha"],
  [2, 13, "Migracao: colunas de agenda e liberacao"],
  [2, 14, "Modulo puro: evento de calendario"],
  [2, 15, "Integracao: escrita na agenda do Google"],
  [2, 16, "Escrita: amarrar sessao e evento"],
  [2, 17, "Escrita: transcrever a sessao"],
  [2, 18, "Tela: botoes de agenda e transcricao"],
  [2, 19, "Leitura: portal com linha do tempo"],
  [2, 20, "Tela: timeline, gravacao e transcricao"],
  [2, 21, "Escrita: liberar conteudo"],
  [3, 22, "Migracao: trilha e trilha_aula"],
  [3, 23, "Migracao: progresso e certificado"],
  [3, 24, "Modulo puro: liberacao gradual"],
  [3, 25, "Modulo puro: progresso e direito ao certificado"],
  [3, 26, "Modulo puro: codigo do certificado"],
  [3, 27, "Leitura: trilhas"],
  [3, 28, "Escrita: trilhas e progresso"],
  [3, 29, "Registrar rotas nos tres catalogos"],
  [3, 30, "Tela: gestao de trilhas"],
  [3, 31, "Tela: trilha no portal e certificado"],
  [4, 32, "Migracao: post, destinatario e comentario"],
  [4, 33, "Modulo puro: quem ve o que"],
  [4, 34, "Leitura: feed"],
  [4, 35, "Escrita: publicar, comentar, marcar lido"],
  [4, 36, "Rota e tela do feed"],
  [5, 37, "Migracao: modelo e progresso de onboarding"],
  [5, 38, "Modulo puro: roteiro de onboarding"],
  [5, 39, "Leitura e escrita do onboarding"],
  [5, 40, "Rota e tela do onboarding"],
  [6, 41, "Migracao: funil_etapa e oportunidade"],
  [6, 42, "Migracao: scripts, propostas e leitura por token"],
  [6, 43, "Modulo puro: conversao"],
  [6, 44, "Modulo puro: token de proposta"],
  [6, 45, "Leitura: pipeline"],
  [6, 46, "Escrita: oportunidades e propostas"],
  [6, 47, "Rota e tela do pipeline"],
  [6, 48, "Tela: proposta publica rastreavel"],
  [6, 49, "Tela: dashboard de conversao"],
  [7, 50, "Migracao: cobranca"],
  [7, 51, "Migracao: contrato"],
  [7, 52, "Modulo puro: recorrencia"],
  [7, 53, "Modulo puro: regua de inadimplencia"],
  [7, 54, "Modulo puro: MRR, ARR e LTV"],
  [7, 55, "Leitura: cobrancas e contratos"],
  [7, 56, "Escrita: gerar, baixar e anexar"],
  [7, 57, "Telas: cobrancas, contratos e recorrencia"],
  [8, 58, "Migracao: patrimonio, investimento e renda"],
  [8, 59, "Modulo puro: patrimonio liquido"],
  [8, 60, "Leitura, escrita e tela das financas pessoais"],
  [9, 61, "Migracao: analise_sessao e alerta_risco"],
  [9, 62, "Modulo puro: prompt e leitura da resposta"],
  [9, 63, "Modulo puro: alertas de risco"],
  [9, 64, "Escrita: score semanal e analise sob demanda"],
  [9, 65, "O gatilho automatico, escrito e desligado"],
  [9, 66, "Tela: painel de risco"],
  [10, 67, "Migracao: analise_call"],
  [10, 68, "Modulo puro: leitura da analise de call"],
  [10, 69, "Escrita e tela da IA de vendas"],
  [11, 70, "Migracao: captura, link e clique"],
  [11, 71, "Modulo puro: UTM e codigo de link"],
  [11, 72, "Rotas publicas: captura e redirecionamento"],
  [11, 73, "Rota, leitura e tela de marketing"],
  [12, 74, "Auditoria de RLS contra Postgres de verdade"],
  [12, 75, "Inventario DEPOIS: a prova de aceite"],
];

const NOME_BLOCO = {
  1: "Fundacao transversal",
  2: "CRM, Sessoes e Portal",
  3: "Plataforma de Conteudo",
  4: "Feed e comunicacao",
  5: "Motor de onboarding",
  6: "Pipeline comercial",
  7: "Financeiro do negocio",
  8: "Financas pessoais",
  9: "IA de evolucao",
  10: "IA de vendas",
  11: "Marketing e captacao",
  12: "Auditoria e prova de aceite",
};

// LOTES JA CRONOMETRADOS. Cada linha e medicao, nao estimativa: quantas
// tarefas o lote tinha e quantos minutos ele levou de ponta a ponta,
// incluindo revisao e correcao. A previsao la embaixo sai DAQUI -- por isso
// ela melhora sozinha a cada lote que fecha, em vez de repetir um chute
// feito no comeco, quando ninguem sabia de nada.
const HISTORICO = [
  { lote: "Bloco 1 (tarefas 1 a 9)", tarefas: 9, minutos: 253 },
];

const feitas = Number(process.argv[2] ?? 0);
const testes = Number(process.argv[3] ?? 0);
const rodandoDe = Number(process.argv[4] ?? 0);
const rodandoAte = Number(process.argv[5] ?? 0);

// O horario e escrito no fuso de BRASILIA, nao em UTC. O dono le esta pagina
// para saber "quando foi a ultima vez que isto mudou", e a resposta so serve
// se estiver no relogio que ele tem na parede. UTC obrigava ele a fazer a
// conta de cabeca -- e fazer conta para ler um painel de acompanhamento e
// exatamente o tipo de atrito que faz alguem parar de olhar o painel.
const agora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date()).replace(",", "");

const geradoEmMs = Date.now();
// A previsao e uma FAIXA, nunca um horario exato. As tarefas nao sao iguais
// -- migracao fecha em 15 minutos, tela com teste de render passa de uma
// hora -- e fingir precisao de minuto num numero que varia tanto seria o
// mesmo tipo de mentira que a gente tirou do resto do sistema. A faixa e de
// -25% a +45%: assimetrica de proposito, porque atraso e mais comum que
// adiantamento (container que reverte, revisao que acha defeito grande).
const tarefasMedidas = HISTORICO.reduce((s, h) => s + h.tarefas, 0);
const minutosMedidos = HISTORICO.reduce((s, h) => s + h.minutos, 0);
const ritmo = tarefasMedidas > 0 ? minutosMedidos / tarefasMedidas : null;

function horaBr(d) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d).replace(",", " as");
}

const emAndamento = (n) => rodandoDe > 0 && n >= rodandoDe && n <= rodandoAte;
const pct = Math.round((feitas / TAREFAS.length) * 100);

const blocos = [...new Set(TAREFAS.map((t) => t[0]))].map((b) => {
  const doBloco = TAREFAS.filter((t) => t[0] === b);
  const prontas = doBloco.filter((t) => t[1] <= feitas).length;
  const andando = doBloco.filter((t) => emAndamento(t[1])).length;
  return { b, doBloco, prontas, andando, total: doBloco.length };
});

const linhas = blocos
  .map(({ b, doBloco, prontas, andando, total }) => {
    const estadoBloco = prontas === total ? "pronto" : prontas > 0 || andando > 0 ? "andando" : "espera";
    const itens = doBloco
      .map(([, n, titulo]) => {
        const feita = n <= feitas;
        const agora_ = !feita && emAndamento(n);
        const classe = feita ? "feita" : agora_ ? "andando" : "aberta";
        const glifo = feita ? "&#9650;" : agora_ ? "&#9654;" : "&#9644;";
        return `<li class="${classe}"><span class="g">${glifo}</span><span class="n">${n}</span>${titulo}</li>`;
      })
      .join("\n");
    // "N de M" conta so o que TERMINOU. O que esta rodando aparece a parte,
    // porque tarefa em execucao nao e tarefa entregue.
    const contagem = andando > 0 ? `${prontas} de ${total} &middot; ${andando} rodando` : `${prontas} de ${total}`;
    return `<section class="bloco ${estadoBloco}">
  <h2><span class="nb">${b}</span> ${NOME_BLOCO[b]} <em>${contagem}</em></h2>
  <ul>${itens}</ul>
</section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<!-- o recarregamento e feito pelo JS abaixo, para o contador nao mentir -->
<title>MentorOS - Fase 2</title>
<style>
  :root{
    --fundo:#0a0f1e; --poco:#0d1b3e; --linha:#1e2a4a;
    --azul:#3b82f6; --azul2:#2563eb; --verde:#10b981; --dourado:#f59e0b;
    --texto:#f1f5f9; --texto2:#94a3b8; --texto3:#64748b;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:28px;background:var(--fundo);color:var(--texto);
       font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px}
  header{max-width:900px;margin:0 auto 22px}
  h1{margin:0 0 4px;font-size:22px;font-weight:600}
  .sub{color:var(--texto2);font-size:13px}
  .barra{height:8px;background:var(--poco);border-radius:99px;overflow:hidden;margin:16px 0 8px}
  .barra i{display:block;height:100%;background:linear-gradient(90deg,var(--azul2),var(--azul));width:${pct}%}
  .numeros{display:flex;gap:26px;flex-wrap:wrap;margin-top:14px}
  .numeros div{background:var(--poco);border:1px solid var(--linha);border-radius:12px;padding:10px 16px}
  .numeros b{display:block;font-size:20px;font-weight:600}
  .numeros span{color:var(--texto3);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  main{max-width:900px;margin:0 auto;display:grid;gap:12px}
  .bloco{background:var(--poco);border:1px solid var(--linha);border-radius:14px;padding:14px 18px}
  .bloco.pronto{opacity:.55}
  .bloco.andando{border-color:var(--azul)}
  h2{margin:0 0 8px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px}
  h2 em{margin-left:auto;font-style:normal;color:var(--texto3);font-size:12px;font-weight:400}
  .nb{background:var(--azul2);color:#fff;width:22px;height:22px;border-radius:7px;
      display:inline-flex;align-items:center;justify-content:center;font-size:11px}
  .bloco.pronto .nb{background:var(--verde)}
  .bloco.espera .nb{background:var(--linha);color:var(--texto3)}
  ul{list-style:none;margin:0;padding:0}
  li{padding:3px 0;color:var(--texto2);display:flex;gap:9px;align-items:baseline;font-size:13px}
  li.feita{color:var(--texto3)}
  li.feita .g{color:var(--verde)}
  li.aberta .g{color:var(--linha)}
  li.andando{color:var(--texto)}
  li.andando .g{color:var(--dourado)}
  .g{width:12px}
  .n{color:var(--texto3);width:22px;text-align:right;font-variant-numeric:tabular-nums}
  .previsao{max-width:900px;margin:0 auto 12px;background:var(--poco);border:1px solid var(--linha);
            border-left:3px solid var(--dourado);border-radius:14px;padding:14px 18px}
  .previsao.pronta{border-left-color:var(--verde)}
  .previsao h2{margin:0 0 10px}
  .previsao h2 em{font-style:normal;color:var(--texto3);font-size:11px;font-weight:400;text-transform:uppercase;letter-spacing:.06em}
  .faixa{display:flex;gap:26px;flex-wrap:wrap;margin-bottom:10px}
  .faixa b{display:block;font-size:18px;font-weight:600;color:var(--texto)}
  .faixa span{color:var(--texto3);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .rodape-prev{color:var(--texto3);font-size:11px;line-height:1.6;margin:8px 0 0}
  footer{max-width:900px;margin:18px auto 0;color:var(--texto3);font-size:12px;line-height:1.6}
  .aovivo{display:flex;align-items:center;gap:8px;color:var(--texto3);font-size:12px;margin-top:12px;flex-wrap:wrap}
  #idade{color:var(--texto3)}
  #idade:before{content:"-";margin:0 8px}
  .pulso{width:8px;height:8px;border-radius:99px;background:var(--verde);animation:bate 2s ease-in-out infinite}
  @keyframes bate{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
  #aviso{position:fixed;left:50%;transform:translateX(-50%) translateY(-140%);top:16px;z-index:9;
         background:var(--verde);color:#04231a;font-weight:600;font-size:13px;
         padding:10px 18px;border-radius:99px;box-shadow:0 10px 30px rgba(0,0,0,.45);
         transition:transform .45s cubic-bezier(.2,.8,.2,1)}
  #aviso.aparece{transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<header>
  <h1>MentorOS &mdash; Fase 2</h1>
  <div class="sub">Os 12 modulos da apresentacao, quebrados em 75 tarefas. Cada uma passa por implementacao, revisao adversarial e correcao.</div>
  <div class="barra"><i></i></div>
  <div class="numeros">
    <div><b>${feitas} de ${TAREFAS.length}</b><span>tarefas</span></div>
    <div><b>${pct}%</b><span>concluido</span></div>
    <div><b>${testes.toLocaleString("pt-BR")}</b><span>testes passando</span></div>
    <div><b id="verificacao">--:--</b><span>ultima verificacao (Brasilia)</span></div>
    <div><b>${agora}</b><span>ultima MUDANCA nos dados</span></div>
  </div>
  <div class="aovivo"><span class="pulso"></span><span>Verificando de novo em <strong id="conta">60</strong>s</span><span id="idade"></span></div>
  ${rodandoDe > 0 ? `<p class="sub" style="margin-top:14px">Rodando agora: <strong style="color:var(--dourado)">tarefas ${rodandoDe} a ${rodandoAte}</strong> &mdash; ainda nao entram na conta acima.</p>` : ""}
</header>
${(() => {
  const restantes = TAREFAS.length - feitas;
  if (ritmo === null) {
    return `<section class="previsao"><h2>Previsao de termino</h2>
      <p class="sub">Ainda nao ha lote cronometrado. Assim que o primeiro fechar, a previsao aparece aqui — medida, nao chutada.</p></section>`;
  }
  if (restantes <= 0) {
    return `<section class="previsao pronta"><h2>Previsao de termino</h2>
      <p class="sub">Todas as ${TAREFAS.length} tarefas terminaram.</p></section>`;
  }
  const horasCheias = (restantes * ritmo) / 60;
  const cedo = new Date(geradoEmMs + horasCheias * 0.75 * 3600000);
  const tarde = new Date(geradoEmMs + horasCheias * 1.45 * 3600000);
  return `<section class="previsao">
    <h2>Previsao de termino <em>estimativa, nao promessa</em></h2>
    <div class="faixa">
      <div><b>${horasCheias.toFixed(0)}h</b><span>de trabalho restante</span></div>
      <div><b>${restantes}</b><span>tarefas na fila</span></div>
      <div><b>${ritmo.toFixed(0)} min</b><span>por tarefa (medido)</span></div>
    </div>
    <p class="sub">Se o ritmo se mantiver, entre <strong style="color:var(--dourado)">${horaBr(cedo)}</strong>
    e <strong style="color:var(--dourado)">${horaBr(tarde)}</strong>.</p>
    <p class="rodape-prev">O ritmo vem de ${tarefasMedidas} ${tarefasMedidas === 1 ? "tarefa ja cronometrada" : "tarefas ja cronometradas"}
    (${HISTORICO.map((h) => h.lote).join("; ")}), nao de estimativa. A faixa e larga porque as tarefas nao sao iguais:
    migracao fecha em 15 minutos, tela com teste de render passa de uma hora.</p>
  </section>`;
})()}
<main>
${linhas}
</main>
<footer>
  Esta pagina se recarrega sozinha a cada 60 segundos. Ela mostra o estado da ultima vez que o arquivo foi reescrito &mdash;
  o que acontece toda vez que um lote de tarefas fecha. Entre um lote e outro os agentes estao rodando e nada muda aqui.
</footer>
<div id="aviso"></div>
<script>
// COMO ESTA PAGINA SABE QUE MUDOU, SEM SERVIDOR E SEM STORAGE
// ------------------------------------------------------------
// O estado da geracao anterior viaja no HASH da URL, que sobrevive ao
// location.reload(). Ao carregar, o hash ainda carrega os numeros da versao
// ANTERIOR; se eles diferem dos numeros embutidos nesta pagina, o arquivo foi
// reescrito e o aviso aparece. Depois a pagina grava os proprios numeros no
// hash, para a proxima comparacao.
//
// Por que nao sessionStorage: em file:// a origem e "null" e o comportamento
// de storage varia entre navegadores. O hash e so texto na barra de
// enderecos -- funciona em qualquer lugar, sem permissao nenhuma.
//
// O aviso NUNCA aparece sem mudanca de verdade: se os numeros forem iguais,
// nada e mostrado. Painel que pisca "atualizado" sem ter atualizado ensina a
// pessoa a ignorar o piscar.
(function () {
  var AGORA = ${JSON.stringify(`${feitas}|${testes}|${agora}`)};
  var anterior = decodeURIComponent(location.hash.replace(/^#/, ""));

  if (anterior && anterior !== AGORA) {
    var a = anterior.split("|"), b = AGORA.split("|");
    var dTarefas = Number(b[0]) - Number(a[0]);
    var dTestes = Number(b[1]) - Number(a[1]);
    var partes = [];
    if (dTarefas > 0) partes.push(dTarefas + (dTarefas === 1 ? " tarefa concluida" : " tarefas concluidas"));
    if (dTestes > 0) partes.push("+" + dTestes.toLocaleString("pt-BR") + " testes");
    var el = document.getElementById("aviso");
    el.textContent = partes.length ? "Atualizado: " + partes.join(", ") : "Atualizado agora";
    el.classList.add("aparece");
    setTimeout(function () { el.classList.remove("aparece"); }, 9000);
  }

  history.replaceState(null, "", location.pathname + "#" + encodeURIComponent(AGORA));

  // POR QUE NAO location.reload() E SIM UM ENDERECO NOVO A CADA VEZ
  // ---------------------------------------------------------------
  // Em file:// o Chrome serve o arquivo do cache com frequencia, e reload()
  // podia devolver a MESMA copia antiga mesmo depois de eu ter reescrito o
  // arquivo no disco. O contador andaria, a pagina "recarregaria", e os
  // numeros ficariam velhos sem ninguem saber -- o pior dos mundos: parece
  // vivo e esta mentindo. Um parametro diferente a cada volta obriga o
  // navegador a ler o disco de novo.
  var GERADO_MS = ${geradoEmMs};
  var restam = 60;
  var campo = document.getElementById("conta");
  var idade = document.getElementById("idade");

  // DOIS RELOGIOS DIFERENTES, E ESSE ERA O MAL-ENTENDIDO
  // -----------------------------------------------------
  // "Ultima verificacao" e a hora em que ESTA pagina foi carregada -- ela
  // anda a cada minuto e e a prova de que o ciclo esta vivo. "Ultima
  // mudanca" e a hora em que os NUMEROS mudaram pela ultima vez, e fica
  // parada de proposito por horas. O rotulo antigo dizia so "ultima
  // atualizacao" para as duas coisas, entao a tela parecia travada quando na
  // verdade estava certa: ela verificava e nao havia o que mudar.
  document.getElementById("verificacao").textContent = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date());

  function escreverIdade() {
    var min = Math.floor((Date.now() - GERADO_MS) / 60000);
    if (min < 1) { idade.textContent = "os numeros acima acabaram de mudar"; return; }
    if (min < 60) { idade.textContent = "sem novidade ha " + min + " min"; return; }
    var h = Math.floor(min / 60);
    idade.textContent = "sem novidade ha " + h + "h" + String(min % 60).padStart(2, "0");
  }
  escreverIdade();

  setInterval(function () {
    restam -= 1;
    if (restam <= 0) {
      location.replace(location.pathname + "?v=" + Date.now() + location.hash);
      return;
    }
    campo.textContent = restam;
    if (restam % 30 === 0) escreverIdade();
  }, 1000);
})();
</script>
</body>
</html>`;

writeFileSync(new URL("../progresso.html", import.meta.url), html, "utf8");
console.log(`progresso.html gerado: ${feitas}/${TAREFAS.length} feitas, ${rodandoDe > 0 ? `${rodandoDe}-${rodandoAte} rodando, ` : ""}${testes} testes, ${agora}`);
