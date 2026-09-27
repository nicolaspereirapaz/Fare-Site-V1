export type OrcamentoBrindeInput = {
  custoProduto: number;
  gravacaoUnitaria: number;
  quantidade: number;
  freteFornecedor: number;
  freteCliente: number;
};

export type OrcamentoBrindeResultado = {
  precoUnitario: number;
  subtotalProdutos: number;
  precoFinal: number;
  precoUnitarioFinal: number;
  freteCliente: number;
  totalGeral: number;
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
  validarValorMonetario(input.freteFornecedor, "freteFornecedor");
  validarValorMonetario(input.freteCliente, "freteCliente");
  validarQuantidade(input.quantidade);

  const custoProdutoCentavos = reaisParaCentavos(input.custoProduto);
  const gravacaoUnitariaCentavos = reaisParaCentavos(input.gravacaoUnitaria);
  const freteFornecedorCentavos = reaisParaCentavos(input.freteFornecedor);
  const freteClienteCentavos = reaisParaCentavos(input.freteCliente);

  const precoUnitarioCentavos = (custoProdutoCentavos + gravacaoUnitariaCentavos) * 2;
  const subtotalProdutosCentavos = precoUnitarioCentavos * input.quantidade;
  const precoFinalCentavos = subtotalProdutosCentavos + freteFornecedorCentavos;
  const precoUnitarioFinalCentavos = Math.round(precoFinalCentavos / input.quantidade);
  const totalGeralCentavos = precoFinalCentavos + freteClienteCentavos;

  return {
    precoUnitario: centavosParaReais(precoUnitarioCentavos),
    subtotalProdutos: centavosParaReais(subtotalProdutosCentavos),
    precoFinal: centavosParaReais(precoFinalCentavos),
    precoUnitarioFinal: centavosParaReais(precoUnitarioFinalCentavos),
    freteCliente: centavosParaReais(freteClienteCentavos),
    totalGeral: centavosParaReais(totalGeralCentavos),
  };
}
