export type Parcela = {
  competencia: string;
  vencimento: string;
  valor: number;
  valorCentavos: number;
};

type EntradaRecorrencia = {
  inicio: string;
  periodicidade: string;
  quantidade: number;
  valor: number;
  diaVencimento: number;
};

const QUANTIDADE_MAXIMA = 1200;

export function parcelasDe(entrada: EntradaRecorrencia): Parcela[] {
  const inicio = dataCivil(entrada.inicio);
  const valorCentavos = centavosDe(entrada.valor);

  if (
    !inicio ||
    entrada.periodicidade !== "mensal" ||
    !Number.isSafeInteger(entrada.quantidade) ||
    entrada.quantidade <= 0 ||
    entrada.quantidade > QUANTIDADE_MAXIMA ||
    inicio.ano + Math.floor((inicio.mes + entrada.quantidade - 2) / 12) > 9999 ||
    !Number.isInteger(entrada.diaVencimento) ||
    entrada.diaVencimento < 1 ||
    entrada.diaVencimento > 31 ||
    valorCentavos === null
  ) {
    return [];
  }

  return Array.from({ length: entrada.quantidade }, (_, indice) => {
    const totalMeses = inicio.mes - 1 + indice;
    const ano = inicio.ano + Math.floor(totalMeses / 12);
    const mes = (totalMeses % 12) + 1;
    const dia = Math.min(entrada.diaVencimento, diasNoMes(ano, mes));

    return {
      competencia: `${ano}-${doisDigitos(mes)}-01`,
      vencimento: `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`,
      valor: valorCentavos / 100,
      valorCentavos,
    };
  });
}

function dataCivil(texto: string): { ano: number; mes: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;

  return { ano, mes };
}

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function centavosDe(valor: number): number | null {
  if (!Number.isFinite(valor) || valor < 0) return null;

  const bruto = valor * 100;
  const centavos = Math.round(bruto);
  const tolerancia = Number.EPSILON * Math.max(1, Math.abs(bruto)) * 4;
  if (!Number.isSafeInteger(centavos) || Math.abs(bruto - centavos) > tolerancia) return null;

  return centavos;
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}
