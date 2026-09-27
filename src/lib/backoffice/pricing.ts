export type OrcamentoBrindeInput = {
  custoProduto: number;
  gravacaoUnitaria: number;
  quantidade: number;
  frete: number;
};

export type OrcamentoBrindeResultado = {
  precoUnitario: number;
  precoFinal: number;
  precoUnitarioFinal: number;
};

function reaisParaCentavos(valorEmReais: number): number {
  return Math.round(valorEmReais * 100);
}

function centavosParaReais(valorEmCentavos: number): number {
  return valorEmCentavos / 100;
}

function validarValorMonetario(valor: number, campo: string): void {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`${campo} deve ser um valor monetário não negativo.`);
  }
}

function validarQuantidade(quantidade: number): void {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error("quantidade deve ser um número inteiro maior que zero.");
  }
}

export function calcularPrecoBrinde(
  input: OrcamentoBrindeInput,
): OrcamentoBrindeResultado {
  validarValorMonetario(input.custoProduto, "custoProduto");
  validarValorMonetario(input.gravacaoUnitaria, "gravacaoUnitaria");
  validarValorMonetario(input.frete, "frete");
  validarQuantidade(input.quantidade);

  const custoProdutoCentavos = reaisParaCentavos(input.custoProduto);
  const gravacaoUnitariaCentavos = reaisParaCentavos(input.gravacaoUnitaria);
  const freteCentavos = reaisParaCentavos(input.frete);

  const precoUnitarioCentavos = (custoProdutoCentavos + gravacaoUnitariaCentavos) * 2;
  const precoFinalCentavos = precoUnitarioCentavos * input.quantidade + freteCentavos;
  const precoUnitarioFinalCentavos = Math.round(precoFinalCentavos / input.quantidade);

  return {
    precoUnitario: centavosParaReais(precoUnitarioCentavos),
    precoFinal: centavosParaReais(precoFinalCentavos),
    precoUnitarioFinal: centavosParaReais(precoUnitarioFinalCentavos),
  };
}
