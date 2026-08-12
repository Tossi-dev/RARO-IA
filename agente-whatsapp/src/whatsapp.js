// O unico arquivo que toca a biblioteca do WhatsApp.
//
// POR QUE ISOLADO ATE ESTE PONTO
// ------------------------------
// whatsapp-web.js dirige um navegador de verdade rodando o WhatsApp Web. Isso
// significa duas coisas incomodas: (1) e um cliente NAO OFICIAL, que quebra
// quando o WhatsApp Web muda de layout; (2) nada aqui roda em teste, porque
// exigiria um celular pareado. Entao este arquivo e propositalmente burro — ele
// so traduz eventos e chamadas. Toda decisao mora em `nucleo.js`, que roda
// inteiro em teste.
//
// O QUE E INCERTO NESTA BIBLIOTECA, E COMO O CODIGO SE PROTEGE
// ------------------------------------------------------------
// · `message_create` deveria cobrir mensagem recebida E enviada. Como nao da
//   para confirmar aqui, o `message` tambem e escutado, e a fila local descarta
//   a duplicata pela chave. Escutar os dois custa nada; escutar so o errado
//   custa metade da conversa do dono.
// · Mensagem enviada pelo CELULAR (e nao por este programa) deveria chegar como
//   evento de dispositivo pareado. Se nao chegar, a varredura de historico da
//   proxima reconexao pega — e por isso a varredura tambem existe.
// · `getState()` as vezes lanca quando o navegador ainda esta subindo, entao
//   ninguem aqui depende dele: o estado vem dos EVENTOS, que sao confiaveis.

import qrcode from "qrcode-terminal";
import wweb from "whatsapp-web.js";
import { jidDoTelefone } from "./telefone.js";

const { Client, LocalAuth } = wweb;

/** Teto de mensagens lidas por conversa na varredura. Sem teto, uma conversa
 *  antiga de anos trava o navegador embutido e o programa parece pendurado. */
export const TETO_MENSAGENS_POR_CONVERSA = 100;

/** Teto de conversas varridas. Quem tem 2000 conversas abertas não precisa
 *  delas todas no CRM — precisa das que tiveram movimento agora. */
export const TETO_CONVERSAS = 300;

/** Quantas quedas seguidas antes de deixar o launchd reiniciar tudo. Reerguer
 *  o navegador embutido em cima de si mesmo é a parte menos confiável desta
 *  biblioteca; processo novo é sempre estado limpo. */
export const QUEDAS_ANTES_DE_DESISTIR = 5;

/**
 * Achata a mensagem da biblioteca num objeto simples.
 *
 * Serve para o resto do programa nunca segurar um objeto vivo da biblioteca:
 * esses objetos carregam referência ao navegador, e guardá-los numa fila em
 * disco (ou em memória por horas) é vazamento garantido.
 */
function achatar(msg, nomeExibicao, telefoneContraparte) {
  return {
    id: msg?.id,
    _telefoneContraparte: telefoneContraparte ?? "",
    from: msg?.from,
    to: msg?.to,
    fromMe: msg?.fromMe,
    body: msg?.body,
    timestamp: msg?.timestamp,
    type: msg?.type,
    isStatus: msg?.isStatus,
    _nomeExibicao: nomeExibicao ?? "",
  };
}

export function criarWhatsapp({ config, log, aoCapturar, aoConectar }) {
  let pronto = false;
  let qrPendente = false;
  // A STRING do QR, e não só o "precisa de QR". Ela sobe junto com o pulso
  // para o CRM desenhar o código na tela em que o dono já está trabalhando —
  // antes disso, conectar exigia ler um QR de caracteres dentro do Terminal,
  // o que serve para quem programa e trava todo mundo mais.
  let qrAtual = null;
  let jaAnunciouAutenticacao = false;
  let quedas = 0;
  let cliente = null;

  /**
   * O nome que aparece na agenda. Envolvido em try/catch porque é uma ida ao
   * navegador que falha por motivo bobo (contato apagado, conversa arquivada) —
   * e perder a mensagem inteira por causa do NOME seria trocar o essencial pelo
   * decorativo.
   */
  /**
   * A CAÇA AO TELEFONE DENTRO DO OBJETO CRU.
   *
   * POR QUE ISTO EXISTE, DEPOIS DE JÁ EXISTIR `chat.getContact()`
   * ------------------------------------------------------------
   * A biblioteca conversa com o WhatsApp Web injetando código na página. Toda
   * vez que o WhatsApp muda por dentro, esse acesso quebra — e ele está
   * quebrado agora nesta instalação: `getChats()` falha em todas as tentativas,
   * e `getChat()`/`getContact()` falham junto, porque dependem da mesma porta.
   * Foi por isso que o `@lid` continuou sem tradução mesmo depois da correção
   * anterior: a correção estava certa e a porta é que não abre.
   *
   * O objeto da mensagem, porém, chega inteiro — ele não passa por essa porta.
   * E o WhatsApp, mesmo endereçando por `@lid`, carrega o telefone de verdade
   * em ALGUM campo do payload cru. Qual campo, muda com a versão.
   *
   * Então em vez de apostar num nome de campo (que a próxima versão renomeia),
   * varremos o objeto atrás de qualquer coisa com a CARA de um endereço de
   * telefone: dígitos seguidos de `@c.us` ou `@s.whatsapp.net`. É feio de
   * propósito, e é o que sobrevive à próxima mudança deles.
   */
  const RE_JID_TELEFONE = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/;

  function procurarTelefoneNoBruto(msg, meuJid) {
    const vistos = new Set();
    const achados = [];

    function andar(valor, profundidade) {
      if (achados.length > 0 || profundidade > 6 || valor === null || valor === undefined) return;
      if (typeof valor === "string") {
        const m = RE_JID_TELEFONE.exec(valor.trim());
        // O próprio dono não conta: numa mensagem que ele envia, o telefone
        // dele está no payload e casaria primeiro — arquivando a conversa na
        // ficha dele mesmo.
        if (m && valor.trim() !== meuJid) achados.push(m[1]);
        return;
      }
      if (typeof valor !== "object") return;
      if (vistos.has(valor)) return; // o objeto tem ciclos
      vistos.add(valor);
      for (const v of Array.isArray(valor) ? valor : Object.values(valor)) {
        andar(v, profundidade + 1);
      }
    }

    try {
      andar(msg, 0);
    } catch {
      // Objeto estranho não pode derrubar a captura da mensagem.
    }
    return achados[0] ?? "";
  }

  /**
   * Quando nada resolve, contar O QUE existia ajuda mais que repetir "falhou".
   * Mostra só o formato — quantos dígitos e qual sufixo —, nunca o número.
   */
  function formatosDeEndereco(msg) {
    const vistos = new Set();
    const formatos = new Set();
    function andar(valor, profundidade) {
      if (profundidade > 6 || valor === null || valor === undefined) return;
      if (typeof valor === "string") {
        const t = valor.trim();
        const arroba = t.indexOf("@");
        if (arroba > 0 && t.length < 80) formatos.add(`${arroba}d${t.slice(arroba)}`);
        return;
      }
      if (typeof valor !== "object" || vistos.has(valor)) return;
      vistos.add(valor);
      for (const v of Array.isArray(valor) ? valor : Object.values(valor)) andar(v, profundidade + 1);
    }
    try {
      andar(msg, 0);
    } catch {}
    return [...formatos].slice(0, 8).join(" ");
  }

  /**
   * Os NOMES dos campos que carregam algo com cara de número — sem o número.
   *
   * `formatosDeEndereco` diz que existe um `@lid` na mensagem, e isso já foi
   * útil uma vez; agora não basta. Para achar onde o WhatsApp escondeu o
   * telefone de verdade é preciso saber COMO SE CHAMA o campo, porque o nome
   * muda de versão para versão e nenhuma documentação acompanha.
   *
   * O que sai daqui é `nomeDoCampo:12d` — o nome e a QUANTIDADE de dígitos.
   * Nunca os dígitos. Com isso dá para escrever o próximo caminho de busca
   * sem nunca ter visto o telefone de ninguém.
   */
  function camposComNumero(msg) {
    const vistos = new Set();
    const campos = new Set();
    function andar(valor, profundidade) {
      if (profundidade > 6 || valor === null || typeof valor !== "object" || vistos.has(valor)) return;
      vistos.add(valor);
      for (const [chave, v] of Object.entries(valor)) {
        if (typeof v === "string" && v.length < 80) {
          const t = v.trim();
          const antes = t.split("@")[0].replace(/\D/g, "");
          if (antes.length >= 8) {
            const sufixo = t.includes("@") ? t.slice(t.indexOf("@")) : "";
            campos.add(`${chave}:${antes.length}d${sufixo}`);
          }
        } else if (typeof v === "object") {
          andar(v, profundidade + 1);
        }
      }
    }
    try {
      andar(msg, 0);
    } catch {}
    return [...campos].slice(0, 25).join(" ");
  }

  /**
   * O TETO QUE SEPARA TELEFONE DE IDENTIFICADOR INTERNO.
   *
   * O `@lid` do WhatsApp tem a mesma cara de um número internacional:
   * "36533109289004" são catorze dígitos, tão parecidos com telefone que
   * passaram por toda a validação e viraram uma ficha de cliente no CRM do
   * dono — quatro fichas, na verdade, uma por tentativa de gravar. Nenhum país
   * do mundo atribui número discável com mais de treze dígitos contando o DDI,
   * então catorze não é cliente de fora: é identificador interno.
   *
   * Filtrar aqui e não só na hora de gravar tem uma razão prática: enquanto
   * este filtro não existia, `msg.getContact()` "achava" o telefone, o log
   * dizia que tinha achado, e a mensagem sumia mesmo assim — descartada
   * silenciosamente lá na frente. Dois lugares diziam coisas diferentes sobre
   * a mesma mensagem.
   */
  const DIGITOS_MAXIMOS_TELEFONE = 13;
  const DIGITOS_MINIMOS_TELEFONE = 10;

  function pareceTelefone(valor) {
    const bruto = String(valor ?? "").trim();
    if (bruto === "" || bruto.includes("@lid")) return "";
    const d = bruto.split("@")[0].split(":")[0].replace(/\D/g, "").replace(/^0+/, "");
    if (d.length < DIGITOS_MINIMOS_TELEFONE || d.length > DIGITOS_MAXIMOS_TELEFONE) return "";
    return d;
  }

  /**
   * O telefone que o WhatsApp guarda AO LADO do `@lid`.
   *
   * Quando eles trocaram o endereçamento para `@lid`, não jogaram o número
   * fora: passaram a carregar os dois, e o número real aparece em campos com
   * nome terminado em "Pn" (de Phone Number) — `senderPn`, `recipientPn`,
   * `participantPn`, conforme a versão. Como o nome exato muda de versão para
   * versão, a busca é pelo SUFIXO do nome do campo, não pelo nome inteiro.
   *
   * Isto corre antes de qualquer ida ao navegador: é o payload que já está na
   * mão, e não depende da porta injetada na página, que é a parte que vive
   * quebrando.
   */
  function procurarPnNoBruto(msg, meuJid) {
    const meuNumero = pareceTelefone(meuJid);
    const vistos = new Set();
    let achado = "";

    function andar(valor, profundidade) {
      if (achado !== "" || profundidade > 6 || valor === null || typeof valor !== "object") return;
      if (vistos.has(valor)) return;
      vistos.add(valor);
      for (const [chave, v] of Object.entries(valor)) {
        if (achado !== "") return;
        if (typeof v === "string" && /pn$/i.test(chave)) {
          const tel = pareceTelefone(v);
          // O próprio dono não conta: numa mensagem que ele envia, o número
          // dele também está aqui, e casaria primeiro.
          if (tel !== "" && tel !== meuNumero) {
            achado = tel;
            return;
          }
        }
        andar(v, profundidade + 1);
      }
    }

    try {
      andar(msg, 0);
    } catch {}
    return achado;
  }

  /** O telefone de verdade que mora dentro de um objeto Contact da biblioteca. */
  function telefoneDoContato(contato) {
    // Endereçado por `@lid`, o contato inteiro é suspeito: `number`, `id.user`
    // e `id._serialized` carregam todos o mesmo identificador interno, e não
    // adianta trocar de campo. Quem decide é o FORMATO do número.
    const candidatos = [contato?.number, contato?.id?.user, contato?.id?._serialized];
    for (const c of candidatos) {
      const tel = pareceTelefone(c);
      if (tel !== "") return tel;
    }
    return "";
  }

  /**
   * Quem é a outra ponta desta conversa — nome E telefone.
   *
   * POR QUE PRECISA IR AO NAVEGADOR
   * -------------------------------
   * O WhatsApp passou a endereçar conversa por `@lid`, um identificador
   * interno que não é número de telefone. Nesse formato, a mensagem chega sem
   * nada que case com um cliente do CRM, e o sistema a descartava — o dono via
   * "WhatsApp conectado" e nenhuma conversa entrando, sem explicação.
   *
   * `chat.getContact()` é o que traduz o `@lid` de volta para o telefone. Vai
   * pelo CHAT, e não pela mensagem: `msg.getContact()` devolve quem ESCREVEU,
   * e nas mensagens do próprio dono isso é o dono — arquivaria a conversa na
   * ficha dele mesmo.
   */
  async function contraparteDe(msg) {
    // 1) O payload cru, primeiro. Não depende da porta injetada no navegador,
    //    que é justamente a que vive quebrando — e é grátis.
    const meuJid = String(cliente?.info?.wid?._serialized ?? "");
    const doBruto = procurarTelefoneNoBruto(msg, meuJid);
    const nomeDoBruto = String(msg?._data?.notifyName ?? msg?.notifyName ?? "").trim();
    if (doBruto !== "")
      return { nome: nomeDoBruto, telefone: doBruto, via: "payload", diagnostico: "" };

    // 1b) O número que viaja AO LADO do `@lid`, em campo terminado em "Pn".
    const doPn = procurarPnNoBruto(msg, meuJid);
    if (doPn !== "")
      return { nome: nomeDoBruto, telefone: doPn, via: "payload-pn", diagnostico: "" };

    // 2) As portas da biblioteca. São TRÊS caminhos diferentes para a mesma
    //    pergunta, e eles não quebram juntos: `getChats()` está quebrado nesta
    //    versão do WhatsApp Web, o que não significa que `getContact()` esteja.
    //    Tentar um só e desistir foi o que me fez concluir cedo demais que
    //    "a porta está fechada" — havia outras portas.
    const enderecoDaConversa = String(
      (msg?.fromMe === true ? msg?.to : msg?.from) ?? msg?.id?.remote ?? ""
    );

    const caminhos = [
      ["msg.getContact", async () => (msg?.fromMe === true ? null : await msg.getContact())],
      [
        "chat.getContact",
        async () => {
          const chat = await msg.getChat();
          if (chat?.isGroup === true) return null;
          return await chat.getContact();
        },
      ],
      [
        "getContactById",
        async () =>
          enderecoDaConversa !== "" ? await cliente.getContactById(enderecoDaConversa) : null,
      ],
    ];

    // POR QUE ANOTAR O MOTIVO DE CADA FALHA
    // -------------------------------------
    // Três caminhos falhando em silêncio dão a mesma linha de log que um só
    // falhando: "SEM telefone". E aí não dá para saber se a porta nem existe
    // nesta versão da biblioteca, se ela existe e explode, ou se ela responde
    // com um contato que só tem `@lid` dentro. São três consertos diferentes.
    // O que é anotado é o NOME do caminho e o TIPO do problema — nunca o
    // conteúdo do contato, que é dado do cliente.
    const porqueFalhou = [];

    for (const [nomeDoCaminho, tentar] of caminhos) {
      try {
        const contato = await tentar();
        if (!contato) {
          porqueFalhou.push(`${nomeDoCaminho}: sem contato`);
          continue;
        }
        const tel = telefoneDoContato(contato);
        if (tel !== "") {
          return {
            nome: contato?.pushname || contato?.name || contato?.verifiedName || nomeDoBruto,
            telefone: tel,
            via: nomeDoCaminho,
            diagnostico: "",
          };
        }
        porqueFalhou.push(`${nomeDoCaminho}: contato sem número`);
      } catch (erro) {
        // Cada caminho falha por conta própria; o próximo ainda pode responder.
        // Só o nome do erro entra no log: a mensagem da biblioteca costuma
        // trazer pedaço de payload junto, e payload tem telefone dentro.
        porqueFalhou.push(`${nomeDoCaminho}: ${erro?.name ?? "erro"}`);
      }
    }

    return {
      nome: nomeDoBruto,
      telefone: "",
      via: "",
      diagnostico: porqueFalhou.join(" | "),
    };
  }

  /**
   * A linha de diagnóstico que faltava.
   *
   * Sem ela, uma mensagem que chega e é descartada some sem deixar rastro: o
   * dono vê o WhatsApp conectado, manda mensagem, nada aparece no CRM e não há
   * como saber se o evento não disparou, se a mensagem foi descartada, ou se a
   * subida falhou. Três causas diferentes, um único sintoma.
   *
   * O que é registrado é só o TIPO do endereço (`@c.us`, `@lid`, `@g.us`) e a
   * direção. Nunca o número, nunca o texto — log de agente roda desatendido e
   * acaba em print de tela.
   */
  function rastroDoEndereco(msg) {
    // A OUTRA ponta, não o remetente. Na mensagem que o dono envia, `from` é
    // ele mesmo — o log dizia "@c.us" e escondia que o destino era "@lid",
    // apontando para o lugar errado justamente no diagnóstico.
    const cru = String((msg?.fromMe === true ? msg?.to : msg?.from) ?? "");
    const arroba = cru.indexOf("@");
    return arroba === -1 ? "sem-endereco" : cru.slice(arroba);
  }

  // `message_create` e `message` disparam os DOIS para a mesma mensagem
  // recebida — confirmado em teste com WhatsApp de verdade. A fila local já
  // descartava a repetição, mas o trabalho era feito duas vezes e o log
  // aparecia em dobro, fazendo parecer que tudo entrava duplicado.
  let jaMostrouFormatos = false;
  const idsVistos = new Set();
  const TETO_IDS_VISTOS = 500;

  /**
   * A CHAVE DA TRAVA DE REPETIÇÃO — e o bug que ela causou.
   *
   * A primeira versão fazia `String(msg?.id?._serialized ?? msg?.id ?? "")`.
   * Quando `_serialized` não vem, o `String()` de um OBJETO devolve
   * "[object Object]" — a mesma chave para TODA mensagem. Resultado: a
   * primeira mensagem entrava e todas as seguintes eram silenciosamente
   * tratadas como repetição da primeira. Foi exatamente o sintoma observado:
   * "ele viu a primeira e depois parou de escutar".
   *
   * Agora a chave só vale se for TEXTO de verdade. Sem chave confiável,
   * preferimos deixar passar: mensagem repetida o servidor descarta pelo
   * `idExterno`; mensagem engolida aqui não volta nunca.
   */
  function chaveDaMensagem(msg) {
    const id = msg?.id;
    if (typeof id === "string") return id.trim();
    const serial = id?._serialized;
    if (typeof serial === "string" && serial.trim() !== "") return serial.trim();
    const partes = [id?.remote, id?.id, msg?.timestamp]
      .map((p) => (typeof p === "string" || typeof p === "number" ? String(p) : ""))
      .filter((p) => p !== "");
    return partes.length >= 2 ? partes.join("|") : "";
  }

  function jaVisto(msg) {
    const id = chaveDaMensagem(msg);
    // Sem chave confiável, NÃO deduplica. Errar para o lado de deixar passar.
    if (id === "") return false;
    if (idsVistos.has(id)) return true;
    idsVistos.add(id);
    // Set sem teto num processo que roda por semanas é vazamento lento.
    if (idsVistos.size > TETO_IDS_VISTOS) {
      idsVistos.delete(idsVistos.values().next().value);
    }
    return false;
  }

  /** A conversa é do dono com ele mesmo? (o "Recado para mim") */
  function ehConversaComigoMesmo(msg) {
    const meu = String(cliente?.info?.wid?._serialized ?? "");
    if (meu === "") return false;
    const de = String(msg?.from ?? "");
    const para = String(msg?.to ?? "");
    return de === meu && para === meu;
  }

  async function capturarUma(msg) {
    try {
      if (jaVisto(msg)) return;
      const { nome, telefone, via, diagnostico } = await contraparteDe(msg);
      log.info(
        `Mensagem ${msg?.fromMe === true ? "enviada" : "recebida"} (endereço ${rastroDoEndereco(msg)}${
          telefone ? `, telefone achado via ${via}` : ", SEM telefone"
        }).`
      );
      if (telefone === "" && diagnostico) {
        log.aviso(`Caminhos tentados: ${diagnostico}`);
      }
      if (telefone === "" && ehConversaComigoMesmo(msg)) {
        // Anotação pessoal não é cliente. Criar ficha para a conversa do dono
        // com ele mesmo encheria o CRM de um "cliente" que é o próprio dono.
        log.aviso(
          "Essa é a sua conversa com você mesmo — ela não vira cliente. " +
            "Para testar, mande a mensagem de OUTRO celular."
        );
      } else if (telefone === "" && !jaMostrouFormatos) {
        // Uma vez por execução, e só quando falha: sem isto, "não achei o
        // telefone" é um beco sem saída — com isto, dá para ver que formatos
        // de endereço o WhatsApp está mandando hoje. Só o FORMATO viaja
        // (quantidade de dígitos e sufixo), nunca o número.
        jaMostrouFormatos = true;
        log.aviso(`Endereços presentes nesta mensagem: ${formatosDeEndereco(msg) || "nenhum"}`);
        // E os NOMES dos campos, que é o que permite escrever o próximo
        // caminho de busca sem chutar. Continua sem número nenhum: só o nome
        // do campo e quantos dígitos ele tem.
        log.aviso(`Campos com cara de número: ${camposComNumero(msg) || "nenhum"}`);
      }
      await aoCapturar([achatar(msg, msg?.fromMe === true ? "" : nome, telefone)]);
    } catch (erro) {
      // Exceção dentro de listener de evento derruba o listener em silêncio, e
      // o dono continua achando que está capturando. Nada sobe daqui.
      log.erro("Falha ao capturar uma mensagem que chegou.", erro);
    }
  }

  function montarCliente() {
    const c = new Client({
      // LocalAuth guarda a sessão em disco: é o que faz o QR aparecer uma vez
      // só, e não toda manhã quando o dono liga o notebook.
      authStrategy: new LocalAuth({ clientId: "raro", dataPath: config.pastaSessao }),
      puppeteer: {
        headless: true,
        // Estas flags reduzem consumo no Mac do dono, que está usando a
        // máquina para trabalhar enquanto isto roda no fundo.
        args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-first-run"],
      },
    });

    c.on("qr", (qr) => {
      qrPendente = true;
      qrAtual = typeof qr === "string" ? qr : null;
      pronto = false;
      log.aviso("Precisa ler o QR Code no WhatsApp do celular (Aparelhos conectados).");
      try {
        qrcode.generate(qr, { small: true });
      } catch (erro) {
        // Sem terminal (subiu pelo launchd) o desenho falha. O texto cru ainda
        // permite gerar o QR por outro meio, então ele não pode sumir.
        log.aviso("Não consegui desenhar o QR aqui. Rode `./parar.command` e depois abra o Terminal.", erro);
      }
    });

    c.on("authenticated", () => {
      qrPendente = false;
      // O código já foi usado: apagar da memória evita que uma batida atrasada
      // publique no CRM um QR que não vale mais nada.
      qrAtual = null;
      // A biblioteca dispara este evento uma vez por sessão RESTAURADA, e numa
      // conexão nova ele veio cinco vezes seguidas. Cinco linhas iguais no log
      // fazem o dono achar que alguma coisa está em laço — e a única coisa que
      // importa aqui já foi feita na primeira.
      if (!jaAnunciouAutenticacao) {
        jaAnunciouAutenticacao = true;
        log.info("WhatsApp autenticado.");
      }
    });

    c.on("auth_failure", (motivo) => {
      // Sessão inválida costuma exigir QR de novo; dizer isso é mais útil que
      // o texto interno da biblioteca.
      pronto = false;
      qrPendente = true;
      log.erro("A sessão do WhatsApp foi recusada. Vai precisar ler o QR de novo.", motivo);
    });

    c.on("ready", () => {
      pronto = true;
      jaFicouPronto = true;
      jaAnunciouAutenticacao = false;
      qrPendente = false;
      qrAtual = null;
      quedas = 0;
      log.info("WhatsApp conectado e pronto.");
      Promise.resolve(aoConectar?.()).catch((erro) =>
        log.erro("Falha ao sincronizar o histórico depois de conectar.", erro)
      );
    });

    c.on("disconnected", (motivo) => {
      pronto = false;
      quedas += 1;
      log.aviso(`WhatsApp desconectou (${String(motivo ?? "sem motivo")}). Tentativa ${quedas}.`);
      if (quedas >= QUEDAS_ANTES_DE_DESISTIR) {
        // Sair com erro é pedir ao launchd um processo novo. É mais confiável
        // que insistir em reerguer o navegador embutido em cima do estado sujo.
        log.erro("Muitas quedas seguidas. Encerrando para o macOS subir o agente de novo.");
        setTimeout(() => process.exit(1), 1000);
      }
    });

    // Os dois eventos de propósito: ver o comentário do topo do arquivo.
    c.on("message_create", capturarUma);
    c.on("message", capturarUma);

    return c;
  }

  /** Quantas vezes insistir em `getChats()`, e quanto esperar entre elas. As
   *  esperas crescem porque o problema é de CARREGAMENTO: se não deu na
   *  primeira, dar mais tempo é a única coisa que muda o resultado. */
  const ESPERAS_GETCHATS_MS = [1500, 4000, 8000, 15000];

  async function listarConversasComPaciencia() {
    for (let tentativa = 0; tentativa <= ESPERAS_GETCHATS_MS.length; tentativa++) {
      try {
        const lista = await cliente.getChats();
        if (Array.isArray(lista)) return lista;
      } catch {
        // Silêncio de propósito: o erro desta biblioteca aqui é minificado e
        // não ajuda ninguém. O que importa é se, no fim das tentativas, deu ou
        // não deu — e isso quem diz é quem chamou.
      }
      const espera = ESPERAS_GETCHATS_MS[tentativa];
      if (espera === undefined) break;
      log.info(`Lista de conversas ainda carregando. Tento de novo em ${espera / 1000}s.`);
      await new Promise((r) => setTimeout(r, espera));
    }
    return null;
  }

  /**
   * O VIGIA DA SESSÃO.
   *
   * O problema que ele resolve, observado em teste real: o agente fica horas
   * dizendo "conectado", o WhatsApp para de entregar mensagem, e NENHUM evento
   * de desconexão dispara. O dono manda mensagem, nada acontece, e a única
   * saída é ele perceber sozinho e reiniciar na mão — que é exatamente o tipo
   * de coisa que não pode existir num programa que roda desatendido.
   *
   * A biblioteca tem `getState()`, que pergunta ao WhatsApp Web como ele está
   * de verdade. Perguntar de tempos em tempos e reagir é a diferença entre um
   * agente que se recupera sozinho e um que morre em silêncio.
   *
   * Falha de `getState()` NÃO é tratada como queda na primeira vez: ela é
   * conhecidamente instável enquanto o navegador sobe. Só três respostas ruins
   * seguidas contam como sessão morta — uma piscada não derruba nada.
   */
  const FALHAS_ANTES_DE_RECONECTAR = 3;
  let falhasDeEstado = 0;
  let reerguendo = false;

  /**
   * O VIGIA SÓ COMEÇA A VIGIAR DEPOIS QUE A SESSÃO FICOU DE PÉ UMA VEZ.
   *
   * Esta linha é um conserto de um estrago que eu mesmo causei. Na primeira
   * versão o vigia rodava desde o primeiro minuto: durante a SUBIDA, o
   * `getState()` falha por natureza (o navegador ainda está carregando o
   * WhatsApp Web), três falhas seguidas contavam como sessão morta, e ele
   * destruía um cliente que ainda estava nascendo. O resultado foi um agente
   * que autenticava e nunca chegava a "pronto" — pior que o problema original.
   *
   * Regra nova: enquanto não houver um `ready`, o vigia não opina. Só existe
   * queda depois de ter havido conexão.
   */
  let jaFicouPronto = false;
  let momentoDaSubida = Date.now();
  /** Tempo mínimo de paz depois de cada subida, antes de o vigia poder agir. */
  const CARENCIA_APOS_SUBIR_MS = 120_000;

  async function reerguer() {
    if (reerguendo) return;
    reerguendo = true;
    pronto = false;
    log.aviso("Sessão do WhatsApp parou de responder. Reconectando sozinho.");
    try {
      await cliente?.destroy();
    } catch {
      // Destruir um cliente já quebrado falha, e falhar aqui não pode impedir
      // a subida do cliente novo — que é a única coisa que interessa.
    }
    try {
      cliente = montarCliente();
      momentoDaSubida = Date.now();
      await cliente.initialize();
      falhasDeEstado = 0;
    } catch (erro) {
      quedas += 1;
      log.erro("Não consegui reconectar o WhatsApp.", erro);
      if (quedas >= QUEDAS_ANTES_DE_DESISTIR) {
        log.erro("Muitas falhas seguidas. Encerrando para o sistema subir um processo novo.");
        setTimeout(() => process.exit(1), 1000);
      }
    } finally {
      reerguendo = false;
    }
  }

  return {
    // Ganchos de teste. Existem porque a única parte que NÃO dá para testar
    // aqui é a biblioteca; a decisão de onde achar o telefone dá, e é ela que
    // vem quebrando. Prefixo `__` para ninguém confundir com a interface real.
    __capturarParaTeste: (msg) => capturarUma(msg),
    __definirMeuJidParaTeste: (jid) => {
      cliente = { info: { wid: { _serialized: jid } } };
    },

    estaPronto: () => pronto === true,

    /** Pergunta ao WhatsApp Web se a sessão está viva de verdade, e reergue
     *  quando não estiver. Chamado pelo laço do pulso. */
    async vigiar() {
      if (!cliente || reerguendo) return;
      // Nunca esteve pronto: está subindo, e subida demora. Opinar aqui foi o
      // que quebrou a versão anterior.
      if (!jaFicouPronto) {
        log.info("WhatsApp ainda subindo. O vigia só entra depois da primeira conexão.");
        return;
      }
      if (Date.now() - momentoDaSubida < CARENCIA_APOS_SUBIR_MS) return;
      let estado = null;
      try {
        estado = await cliente.getState();
      } catch {
        estado = null;
      }
      if (estado === "CONNECTED") {
        falhasDeEstado = 0;
        // O `ready` pode não ter disparado numa reconexão silenciosa; o estado
        // real manda mais que o evento que não veio.
        pronto = true;
        return;
      }
      falhasDeEstado += 1;
      if (falhasDeEstado >= FALHAS_ANTES_DE_RECONECTAR) {
        falhasDeEstado = 0;
        await reerguer();
      }
    },
    precisaQr: () => qrPendente === true,
    qrAtual: () => qrAtual,

    async iniciar() {
      cliente = montarCliente();
      momentoDaSubida = Date.now();
      await cliente.initialize();
    },

    /**
     * Manda o texto e devolve o id que o WhatsApp deu à mensagem.
     *
     * Lança quando não dá para enviar, e quem chama transforma isso em
     * `ResultadoEnvio` com `enviado: false` — o CRM precisa saber que NÃO saiu,
     * e não pode ficar com uma linha pendurada na fila para sempre.
     */
    async enviarTexto(telefone, texto) {
      if (!pronto || !cliente) throw new Error("A sessão do WhatsApp não está aberta.");

      const jid = jidDoTelefone(telefone);
      if (jid === "") throw new Error("Telefone em formato que não dá para discar.");

      // Conferir se o número existe no WhatsApp antes de mandar. Está dentro de
      // try/catch porque a confirmação é menos confiável que o envio: quando a
      // checagem falhar por conta própria, o certo é tentar mandar assim mesmo.
      try {
        const registrado = await cliente.getNumberId(jid);
        if (registrado === null) throw new Error("Este número não tem WhatsApp.");
      } catch (erro) {
        if (erro instanceof Error && erro.message === "Este número não tem WhatsApp.") throw erro;
      }

      const enviada = await cliente.sendMessage(jid, texto);
      return { idExterno: enviada?.id?._serialized ?? "" };
    },

    /**
     * Varre o que aconteceu enquanto o notebook estava fechado.
     *
     * A biblioteca não sabe buscar "mensagens desde tal data": ela devolve as N
     * últimas de cada conversa. Então o corte por data é feito aqui, depois de
     * ler — e o `limit` existe para a leitura não virar um mergulho em anos de
     * conversa que trava o navegador embutido.
     */
    async varrerHistorico(desdeMs) {
      if (!pronto || !cliente) return { conversas: 0, mensagens: 0 };

      let conversas = 0;
      let mensagens = 0;

      // `getChats()` logo depois do "pronto" falha com frequência, e o motivo
      // não é nosso: o WhatsApp Web dentro do navegador embutido anuncia que
      // está pronto ANTES de a lista interna de conversas terminar de carregar.
      // A biblioteca então esbarra num objeto que ainda não existe e devolve um
      // erro minificado ("r"), que não diz nada a ninguém.
      //
      // A resposta certa é esperar e tentar de novo, não desistir: desistir
      // custa o histórico inteiro da primeira conexão — justamente quando ele é
      // mais valioso, porque é o passado que o CRM ainda não tem.
      const lista = await listarConversasComPaciencia();
      if (lista === null) {
        log.aviso(
          "A lista de conversas não ficou pronta a tempo. O histórico antigo fica para a próxima " +
            "reconexão; as mensagens NOVAS continuam entrando normalmente."
        );
        return { conversas: 0, mensagens: 0 };
      }

      for (const chat of lista.slice(0, TETO_CONVERSAS)) {
        // Grupo é descartado na origem: mensagem de grupo não pertence à ficha
        // de nenhum cliente e só gastaria rede para o servidor jogar fora.
        if (chat?.isGroup === true) continue;

        try {
          const brutas = await chat.fetchMessages({ limit: TETO_MENSAGENS_POR_CONVERSA });
          const recentes = (Array.isArray(brutas) ? brutas : []).filter(
            (m) => Number(m?.timestamp ?? 0) * 1000 >= desdeMs
          );
          if (recentes.length === 0) continue;

          const nome = String(chat?.name ?? "");
          // Uma ida ao navegador por CONVERSA, não por mensagem: o `@lid`
          // precisa ser traduzido igual aqui, e resolver por mensagem faria
          // cem chamadas para descobrir cem vezes o mesmo telefone.
          let telefoneDaConversa = "";
          try {
            telefoneDaConversa = telefoneDoContato(await chat.getContact());
          } catch {
            telefoneDaConversa = "";
          }
          await aoCapturar(
            recentes.map((m) => achatar(m, m?.fromMe === true ? "" : nome, telefoneDaConversa))
          );
          conversas += 1;
          mensagens += recentes.length;
        } catch (erro) {
          // Uma conversa problemática não pode interromper a varredura das
          // outras: seria uma conversa estragando o histórico inteiro.
          log.aviso("Não consegui ler uma das conversas no histórico.", erro);
        }
      }

      return { conversas, mensagens };
    },

    async parar() {
      pronto = false;
      try {
        await cliente?.destroy();
      } catch (erro) {
        // Já estamos saindo: falhar ao fechar o navegador não muda nada além
        // do texto do log.
        log.aviso("O navegador do WhatsApp não fechou direito.", erro);
      }
    },
  };
}
