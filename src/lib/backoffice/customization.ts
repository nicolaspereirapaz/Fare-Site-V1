/**
 * Personalização no orçamento (painel da equipe).
 * Preço ao cliente = (custo do produto + personalização por peça) × 2 + frete do fornecedor rateado.
 *
 * - Laser (interno): R$ 1,00 por peça em canetas e chaveiros; R$ 2,50 nas demais.
 * - DTF Têxtil (Laraella): rolo de 58 cm, 2 mm entre artes, metro linear fracionado (mín. 1 m)
 *   a R$ 29,90 + R$ 16,00 de frete.
 * - DTF UV (FuturaIM): folhas 20×28 ou 28×40 cm, 2 mm entre artes, mín. 1 folha, frete R$ 10,00;
 *   o sistema escolhe sempre a combinação de folhas mais barata.
 * - Spot: preço da própria Spot por faixa de quantidade (só produtos da Spot).
 * - Manual: nome e custo por peça digitados pelo vendedor.
 */

export const ESPACO_ENTRE_ARTES_CM = 0.2;

export const DTF_TEXTIL = { fornecedor: "Laraella DTF", larguraRoloCm: 58, precoMetro: 29.9, frete: 16, minimoMetros: 1 };
export const DTF_UV = { fornecedor: "FuturaIM", frete: 10 };
export const LASER = { fornecedor: "Interno", precoCanetasChaveiros: 1, precoDemais: 2.5 };
export const LASER_CATEGORIAS_BARATAS = ["Canetas e Lápis", "Chaveiros"];
export const FRETE_FORNECEDOR_PRODUTO = 100;

export type Faixa = { minimo: number; preco: number };

/** Tabela da FuturaIM (DTF UV, material padrão, preço por folha conforme a quantidade de folhas). */
export const DTF_UV_FOLHAS: Array<{ nome: string; larguraCm: number; alturaCm: number; faixas: Faixa[] }> = [
  {
    nome: "20×28 cm", larguraCm: 20, alturaCm: 28,
    faixas: [{ minimo: 1, preco: 25.99 }, { minimo: 3, preco: 24.67 }, { minimo: 5, preco: 23.6 }, { minimo: 10, preco: 22.6 }, { minimo: 20, preco: 21.55 }, { minimo: 50, preco: 20.5 }],
  },
  {
    nome: "28×40 cm", larguraCm: 28, alturaCm: 40,
    faixas: [{ minimo: 1, preco: 33.99 }, { minimo: 3, preco: 33 }, { minimo: 5, preco: 31.8 }, { minimo: 10, preco: 30.8 }, { minimo: 20, preco: 29.75 }, { minimo: 50, preco: 28.7 }],
  },
];

const centavos = (valor: number) => Math.round(valor * 100) / 100;

function validarArte(larguraCm: number, alturaCm: number, quantidade: number) {
  if (!(larguraCm > 0) || !(alturaCm > 0)) throw new Error("Informe largura e altura da arte em cm.");
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
}

/** Quantas artes cabem lado a lado num espaço, com 2 mm entre elas. */
function cabem(espaco: number, arte: number) {
  return Math.floor((espaco + ESPACO_ENTRE_ARTES_CM + 1e-9) / (arte + ESPACO_ENTRE_ARTES_CM));
}

export function calcularDtfTextil({ larguraCm, alturaCm, quantidade }: { larguraCm: number; alturaCm: number; quantidade: number }) {
  validarArte(larguraCm, alturaCm, quantidade);
  const opcoes = [
    { largura: larguraCm, altura: alturaCm, girada: false },
    { largura: alturaCm, altura: larguraCm, girada: true },
  ].flatMap(({ largura, altura, girada }) => {
    const porLinha = cabem(DTF_TEXTIL.larguraRoloCm, largura);
    if (porLinha < 1) return [];
    const linhas = Math.ceil(quantidade / porLinha);
    const comprimentoCm = linhas * (altura + ESPACO_ENTRE_ARTES_CM) - ESPACO_ENTRE_ARTES_CM;
    return [{ porLinha, linhas, comprimentoCm, girada }];
  });
  if (!opcoes.length) throw new Error(`A arte não cabe na largura do rolo (${DTF_TEXTIL.larguraRoloCm} cm).`);
  const melhor = opcoes.reduce((a, b) => (b.comprimentoCm < a.comprimentoCm - 1e-9 ? b : a));
  const metros = Math.max(DTF_TEXTIL.minimoMetros, Math.round(melhor.comprimentoCm * 10) / 1000);
  const custoTotal = centavos(centavos(metros * DTF_TEXTIL.precoMetro) + DTF_TEXTIL.frete);
  return {
    porLinha: melhor.porLinha,
    linhas: melhor.linhas,
    girada: melhor.girada,
    metros,
    custoTotal,
    custoUnitario: centavos(custoTotal / quantidade),
    custoPorPeca: custoTotal / quantidade,
    detalhe: `${metros.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m (${melhor.porLinha} por linha, ${melhor.linhas} linhas${melhor.girada ? ", arte girada" : ""}) + frete R$ 16,00`,
  };
}

function artesPorFolha(folha: { larguraCm: number; alturaCm: number }, larguraCm: number, alturaCm: number) {
  return Math.max(
    cabem(folha.larguraCm, larguraCm) * cabem(folha.alturaCm, alturaCm),
    cabem(folha.larguraCm, alturaCm) * cabem(folha.alturaCm, larguraCm),
  );
}

function precoDaFaixa(faixas: Faixa[], quantidade: number) {
  return [...faixas].reverse().find((faixa) => quantidade >= faixa.minimo)?.preco ?? faixas[0].preco;
}

export function calcularDtfUv({ larguraCm, alturaCm, quantidade }: { larguraCm: number; alturaCm: number; quantidade: number }) {
  validarArte(larguraCm, alturaCm, quantidade);
  const [pequena, grande] = DTF_UV_FOLHAS;
  const porPequena = artesPorFolha(pequena, larguraCm, alturaCm);
  const porGrande = artesPorFolha(grande, larguraCm, alturaCm);
  if (!porPequena && !porGrande) throw new Error("A arte não cabe em nenhuma folha (máx. 28×40 cm).");

  const custo = (folha: typeof pequena, n: number) => (n ? Math.round(n * precoDaFaixa(folha.faixas, n) * 100) : 0);
  // Candidatos para uma folha: o necessário e os mínimos das faixas acima dele (às vezes comprar mais sai mais barato).
  const candidatos = (folha: typeof pequena, necessario: number) =>
    [necessario, ...folha.faixas.map((faixa) => faixa.minimo).filter((minimo) => minimo > necessario)];

  let melhor: { pequenas: number; grandes: number; centavos: number } | null = null;
  const limiteGrandes = porGrande ? Math.max(Math.ceil(quantidade / porGrande), grande.faixas.at(-1)!.minimo) : 0;
  for (let grandes = 0; grandes <= limiteGrandes; grandes += 1) {
    const faltam = Math.max(0, quantidade - grandes * porGrande);
    if (faltam > 0 && !porPequena) continue;
    const necessarias = faltam ? Math.ceil(faltam / porPequena) : 0;
    for (const pequenas of faltam ? candidatos(pequena, necessarias) : [0]) {
      const total = custo(pequena, pequenas) + custo(grande, grandes);
      if (pequenas + grandes > 0 && (!melhor || total < melhor.centavos)) melhor = { pequenas, grandes, centavos: total };
    }
  }
  const escolhida = melhor!;
  const folhas = [
    { nome: pequena.nome, quantidade: escolhida.pequenas, precoUnitario: precoDaFaixa(pequena.faixas, escolhida.pequenas) },
    { nome: grande.nome, quantidade: escolhida.grandes, precoUnitario: precoDaFaixa(grande.faixas, escolhida.grandes) },
  ].filter((folha) => folha.quantidade > 0);
  const custoTotal = centavos(escolhida.centavos / 100 + DTF_UV.frete);
  return {
    porFolha: { [pequena.nome]: porPequena, [grande.nome]: porGrande },
    folhas,
    custoTotal,
    custoUnitario: centavos(custoTotal / quantidade),
    custoPorPeca: custoTotal / quantidade,
    detalhe: `${folhas.map((folha) => `${folha.quantidade} folha${folha.quantidade > 1 ? "s" : ""} ${folha.nome}`).join(" + ")} (cabem ${porPequena} na 20×28 e ${porGrande} na 28×40) + frete R$ 10,00`,
  };
}

export function calcularLaser({ categoria, quantidade }: { categoria: string; quantidade: number }) {
  const custoUnitario = LASER_CATEGORIAS_BARATAS.includes(categoria) ? LASER.precoCanetasChaveiros : LASER.precoDemais;
  return { custoUnitario, custoPorPeca: custoUnitario, custoTotal: centavos(custoUnitario * quantidade), detalhe: `R$ ${custoUnitario.toFixed(2).replace(".", ",")} por peça` };
}

export function precoSpotParaQuantidade(opcao: { faixas: Faixa[] }, quantidade: number) {
  return precoDaFaixa(opcao.faixas, quantidade);
}

export type OpcaoSpot = {
  id: string;
  tecnica: string;
  local: string;
  area: string;
  cores: number;
  padrao: boolean;
  faixas: Faixa[];
};

export type Tecnica =
  | { tipo: "nenhuma" }
  | { tipo: "laser" }
  | { tipo: "dtf-textil"; larguraCm: number; alturaCm: number }
  | { tipo: "dtf-uv"; larguraCm: number; alturaCm: number }
  | { tipo: "spot"; opcao: OpcaoSpot }
  | { tipo: "manual"; nome: string; custoUnitario: number };

export const TECNICA_LABELS: Record<Tecnica["tipo"], string> = {
  nenhuma: "Sem personalização",
  laser: "Laser",
  "dtf-textil": "DTF Têxtil",
  "dtf-uv": "DTF UV",
  spot: "Personalização Spot",
  manual: "Outra (manual)",
};

export function calcularPersonalizacao(input: {
  custoProduto: number;
  categoria: string;
  quantidade: number;
  tecnica: Tecnica;
  freteFornecedor?: number;
}) {
  const { custoProduto, categoria, quantidade, tecnica } = input;
  const freteFornecedor = input.freteFornecedor ?? FRETE_FORNECEDOR_PRODUTO;
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  let porPeca = 0;
  let descricao = TECNICA_LABELS[tecnica.tipo];
  let detalhe = "";
  let custoTotal = 0;
  switch (tecnica.tipo) {
    case "laser": {
      const r = calcularLaser({ categoria, quantidade });
      ({ custoPorPeca: porPeca, detalhe, custoTotal } = r);
      break;
    }
    case "dtf-textil": {
      const r = calcularDtfTextil({ ...tecnica, quantidade });
      ({ custoPorPeca: porPeca, detalhe, custoTotal } = r);
      descricao = `DTF Têxtil ${tecnica.larguraCm}×${tecnica.alturaCm} cm`;
      break;
    }
    case "dtf-uv": {
      const r = calcularDtfUv({ ...tecnica, quantidade });
      ({ custoPorPeca: porPeca, detalhe, custoTotal } = r);
      descricao = `DTF UV ${tecnica.larguraCm}×${tecnica.alturaCm} cm`;
      break;
    }
    case "spot": {
      porPeca = precoSpotParaQuantidade(tecnica.opcao, quantidade);
      custoTotal = centavos(porPeca * quantidade);
      descricao = `${tecnica.opcao.tecnica} · ${tecnica.opcao.local}`;
      detalhe = `Spot: R$ ${porPeca.toFixed(2).replace(".", ",")} por peça (área ${tecnica.opcao.area})`;
      break;
    }
    case "manual": {
      if (!tecnica.nome.trim()) throw new Error("Informe o nome da personalização.");
      if (!(tecnica.custoUnitario >= 0)) throw new Error("Informe o custo por peça.");
      porPeca = tecnica.custoUnitario;
      custoTotal = centavos(porPeca * quantidade);
      descricao = tecnica.nome.trim();
      detalhe = `R$ ${porPeca.toFixed(2).replace(".", ",")} por peça (informado)`;
      break;
    }
    default:
      break;
  }

  // Em centavos, sem arredondar a personalização por peça antes da margem.
  const totalCentavos = Math.round((custoProduto + porPeca) * 2 * quantidade * 100) + Math.round(freteFornecedor * 100);
  const precoUnitarioFinal = Math.round(totalCentavos / quantidade) / 100;
  return {
    descricao,
    detalhe,
    custoPersonalizacaoTotal: custoTotal,
    personalizacaoUnitaria: Math.round(porPeca * 10_000) / 10_000,
    precoUnitarioFinal,
    totalCliente: centavos(precoUnitarioFinal * quantidade),
  };
}

export type GravacaoCalculada = {
  tecnica: Tecnica;
  local: string;
  descricao: string;
  detalhe: string;
  /** Custo por peça (sem arredondar para o cálculo; exibido com 2 casas). */
  custoUnitario: number;
  custoTotal: number;
};

/**
 * Item do orçamento com N gravações (cada uma calculada na quantidade do item):
 * preço = (custo do produto + soma das gravações por peça) × 2 + frete do fornecedor rateado.
 */
export function calcularItemOrcamento(input: {
  custoProduto: number;
  categoria: string;
  quantidade: number;
  gravacoes: Array<{ tecnica: Tecnica; local: string }>;
  freteFornecedor?: number;
}) {
  const { custoProduto, categoria, quantidade } = input;
  const freteFornecedor = input.freteFornecedor ?? FRETE_FORNECEDOR_PRODUTO;
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  if (!(custoProduto >= 0)) throw new Error("Custo do produto inválido.");

  const gravacoes: GravacaoCalculada[] = input.gravacoes.map(({ tecnica, local }) => {
    if (tecnica.tipo === "nenhuma") throw new Error("Escolha a técnica da gravação.");
    const r = calcularPersonalizacao({ custoProduto: 0, categoria, quantidade, tecnica, freteFornecedor: 0 });
    return {
      tecnica,
      local: local.trim().slice(0, 80),
      descricao: r.descricao,
      detalhe: r.detalhe,
      custoUnitario: r.personalizacaoUnitaria,
      custoTotal: r.custoPersonalizacaoTotal,
    };
  });
  const gravacoesPorPeca = gravacoes.reduce((soma, gravacao) => soma + gravacao.custoTotal / quantidade, 0);
  const totalCentavos = Math.round((custoProduto + gravacoesPorPeca) * 2 * quantidade * 100) + Math.round(freteFornecedor * 100);
  const precoUnitario = Math.round(totalCentavos / quantidade) / 100;
  return {
    gravacoes,
    gravacoesPorPeca: Math.round(gravacoesPorPeca * 10_000) / 10_000,
    precoUnitario,
    total: centavos(precoUnitario * quantidade),
    custoTotal: centavos(custoProduto * quantidade + gravacoes.reduce((soma, gravacao) => soma + gravacao.custoTotal, 0) + freteFornecedor),
  };
}

