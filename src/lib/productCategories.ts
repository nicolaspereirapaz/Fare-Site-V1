/**
 * Classificação de produtos do catálogo de brindes.
 *
 * O fornecedor não envia categoria/subcategoria (o campo vem vazio ou com marcações comerciais
 * como "PONTA DE ESTOQUE"). A categoria é deduzida em três passos, do sinal mais forte ao mais fraco:
 *   1. tipo do produto: o substantivo que abre o nome ("BOLSA TÉRMICA", "PORTA JOIAS"), ignorando
 *      modificadores como "KIT", "MINI", "CONJUNTO" e "PACOTE";
 *   2. termos em qualquer posição do nome;
 *   3. termos na descrição.
 * Arquivo sem imports para poder ser executado isoladamente em scripts de auditoria.
 */

export const PRODUCT_CATEGORIES = [
  "Canetas e Lápis",
  "Cadernos e Agendas",
  "Escritório",
  "Mochilas",
  "Bolsas e Sacolas",
  "Bolsas Térmicas e Marmitas",
  "Necessaires e Estojos",
  "Garrafas e Squeezes",
  "Canecas, Copos e Taças",
  "Casa e Cozinha",
  "Churrasco, Vinho e Queijo",
  "Beleza e Bem-estar",
  "Tecnologia",
  "Viagem e Lazer",
  "Vestuário e Acessórios",
  "Chaveiros",
  "Ferramentas",
  "Infantil e Diversão",
  "Esporte e Fitness",
  "Kits Executivos",
  "Embalagens para Presente",
  "Pet",
  "Outros",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

type Rule = [ProductCategory, RegExp];

export function normalizeCategoryText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9,.+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marcações comerciais que o fornecedor às vezes coloca no lugar da categoria. */
const NON_CATEGORY_LABELS = /^(ponta de estoque|lancamento|lancamentos|promocao|outlet|novidade|novidades)$/;

/**
 * Passo 0 — combinações que contradizem o substantivo inicial
 * ("CHAVEIRO KIT MANICURE" é beleza; "FRISBEE PARA PET" é pet).
 */
const PRIORITY_RULES: Rule[] = [
  ["Pet", /\b(para|p) pets?\b|\bpet s\b|\bcoleira\b|\btransporte de animais\b/],
  ["Esporte e Fitness", /\b(pickleball|frescobol|kit raquetes?|raquetes? (de|para|p) (tenis|praia|beach|ping)|corda de pular|munhequeiras?|golfe|yoga|academia|fitness|halter|elastico (de )?exercicio|toalha (esportiva|fitness))\b/],
  ["Bolsas Térmicas e Marmitas", /\b(bolsa|sacola|mochila|lancheira|necessaire)\b.*\btermic[ao]\b/],
  ["Beleza e Bem-estar", /\b(kit )?manicure\b|\bmaquiagem\b|\bhigienizador\b|\bcosmeticos\b|^porta joias?\b/],
  ["Tecnologia", /\b(cordao|suporte|porta|ventosa|capa|bastao)( (de|para|p))? (celular|selfie)\b|\bprova d ?agua\b|\bpilhas?\b|\bestojo (plastico )?(p|para) pen\b|\bprotetor (p|para) (camera|webcam)\b|\bcarregador\b|\binducao\b/],
  ["Canetas e Lápis", /\bestojo (c|com) (caneta|lapiseira)|\bcarga (park|caneta|de caneta)|\bcarga tinta\b|\bcanetas marcadoras\b/],
  ["Embalagens para Presente", /^(embalagem|embalagens|saquinho|saco de veludo|veludo|tubo de acrilico|caixa (para |p )?presente|case (redondo |p |para )|estojo (p|para) kits|lata)/],
];

/** Itens internos do fornecedor que não devem aparecer no site (catálogo impresso, testes). */
export function isInternalSupplierItem(name: string): boolean {
  const normalized = normalizeCategoryText(name);
  return /\bproduto (para )?teste\b|\bteste de variacao\b|\bcatalogo \d{4}\b|\bxbz\b/.test(normalized);
}

/**
 * Passo 1 — tipo do produto. Testado contra o início do nome já sem modificadores.
 * A ordem importa: combinações específicas vêm antes do substantivo genérico.
 */
const TYPE_RULES: Rule[] = [
  // Combinações que mudam o sentido do substantivo principal
  ["Pet", /^(bebedouro|comedouro|bolsa (para|p) transporte de animais|coleira|brinquedo pet)/],
  ["Bolsas Térmicas e Marmitas", /^(bolsa|sacola|mochila|lancheira|necessaire) termica|^(marmita|lancheira|cooler|pote termico)/],
  ["Garrafas e Squeezes", /^(capa|porta) (para |p )?garrafa|^garrafa|^squeeze|^cantil|^galao|^coqueteleira|^frasco (plastico|multiuso|termico)/],
  ["Canecas, Copos e Taças", /^(caneca|copo|xicara|taca|tulipa|caneco)|^porta copos? (termico|inox)/],
  ["Churrasco, Vinho e Queijo", /^(churrasco|churrasqueira|queijo|vinho|petisqueira|saca rolhas?|abridor|tabua|porta (vinho|whisky|garrafa de vinho)|estojo (p|para) vinho|decanter|balde de gelo)/],
  ["Viagem e Lazer", /^(bolsa|mochila|necessaire|kit) (de |para |p )?viagem|^mala|^guarda chuva|^porta passaporte|^tag identificador|^identificador de (mala|bagagem)|^almofada de viagem|^travesseiro|^capa de chuva|^kit chuva|^leque|^frisbee|^esteira|^cadeira|^bola|^boia|^cata vento/],
  ["Mochilas", /^(mochila|sacochila)/],
  ["Necessaires e Estojos", /^(necessaire|frasqueira|estojo(?! escolar))/],
  ["Bolsas e Sacolas", /^(bolsa|sacola|pochete|pasta (para |p )?(notebook|tablet)|pasta executiva|shoulder bag|saco|sacolinha|tote bag|ecobag|embalagem|saquinho)/],
  ["Canetas e Lápis", /^(caneta|canetas|canetinha|canetinhas|lapis|lapiseira|marca texto|marcador|giz|pincel atomico|refil)/],
  ["Cadernos e Agendas", /^(caderno|caderneta|agenda|bloco|planner|calendario|folhinha|livro|diario|post it|marca pagina)/],
  ["Escritório", /^(pasta|estojo escolar|regua|calculadora|clipe|porta (caneta|canetas|cracha|cartao|documento|objetos|clips|lapis)|desk pad|mouse pad|lousa|organizador de mesa|porta retrato|base para calendario|grampeador|apontador|borracha|prancheta|risque rabisque|lupa|carimbo|cordao|cracha|ampulheta|quadro|globo)/],
  ["Chaveiros", /^(chaveiro|plaquinha|porta chaves)/],
  ["Ferramentas", /^(ferramenta|ferramentas|canivete|trena|lanterna|multiferramenta|alicate|chave de fenda|fita metrica|nivel|estilete|faca multiuso)/],
  ["Tecnologia", /^(fone|headphone|headset|caixa de som|som|pen drive|pendrive|power bank|carregador|base (de |para )?carregamento|base carregador|cabo|adaptador|mouse|teclado|hub|smartwatch|relogio inteligente|relogio digital|relogio despertador|microfone|webcam|dock|suporte (para |p |retratil|magnetico|veicular|articulado|articulavel|dobravel|plastico|celular)|carcaca|memoria|tag chaveiro rastreador|rastreador|pop socket|anel (para |p )?celular|ring light|iluminador|luminaria|ventilador|climatizador|umidificador|aspirador|caixinha de som|controle|tablet|celular|drone|papel termico|cx papel termico)/],
  ["Beleza e Bem-estar", /^(espelho|escova|pente|porta (joias?|comprimidos?|batom)|massageador|difusor|home spray|aromatizador|vela|frasco|lixa|aparador|cortador de unha|manicure|maquiagem|pincel|esponja|toalha|roupao|touca|mascara|protetor|termometro|balanca|kit (manicure|maquiagem|cuidados|banho|beleza|spa|higiene|pincel)|nécessaire)/],
  ["Casa e Cozinha", /^(chaleira|cafeteira|bule|jarra|bandeja|tigela|pote|potes|porta copos?|jogo americano|avental|luva|almofada|descanso|papel de parede|adesivo|adesivos|enfeite|decoracao|cortina|tapete|relogio de parede|dispenser|moedor|triturador|processador|misturador|ralador|talher|talheres|faca|facas|jogo de facas|colher|espatula|pegador|escorredor|lixeira|lixeirinha|lixocar|balde|organizador|caixa organizadora|cesto|vaso|cacto|ima|imas|kit (de )?(cozinha|utensilios|talheres|prendedores|cafe|pizza|jardinagem|costura|canudos?)|cafe|pizza|jardinagem|costura|canudos?|porta (pratos|papel toalha|guardanapo|temperos?)|prendedor|elasticos?|mangueira|varal|fita adesiva|porta tempero|saleiro)/],
  ["Vestuário e Acessórios", /^(camiseta|camisa|bone|chapeu|viseira|oculos|carteira|pulseira|bracelete|colar|brinco|anel|meia|cachecol|gorro|luvas|sombrinha|bracadeira|cinto|jaqueta|colete|abrigo|kit (cuidado|cuidados) (p|para|com) sapatos|kit masculino|porta tenis|porta (oculos|relogios?))/],
  ["Infantil e Diversão", /^(squishy|quishy|brinquedo|carrinho|carro|caminhao|trator|guindaste|moto|helicoptero|aviao|fusca|dinossauro|pelucia|ursinho|bicho|boneco|gorila|capivara|pato|pintinho|cachorro|crocodilo|cavalo|jogo|domino|xadrez|dama|baralho|cartas|poker|cards|quebra cabeca|cubo|dado|spinner|pop it|slime|massinha|bolinha|coracao antiestresse|miniatura|lancador|espada|arma|skate|pipa|ioio|mini game|pisca|varinha|fruta|sereia|pulseiras infantis|kit (para )?pulseiras)/],
  ["Kits Executivos", /^(kit executivo|kit ecologico|kit (caneta|canetas)|conjunto (caneta|canetas|executivo)|kit para anotacoes|kit escritorio|kit presente|kit (c|com) \d)/],
];

/** Modificadores que antecedem o tipo real ("MINI VENTILADOR", "KIT CHURRASCO 4 PEÇAS"). */
const MODIFIER_PREFIX = /^(mini|super|maxi|kit|kits|conjunto|jogo de|jogo|pacote (c|com) \d+|pacote de|pacote|par de|combo|box|cx|caixinha)\s+/;

/** Passo 2 — termos em qualquer posição do nome (sinal mais fraco que o tipo). */
const NAME_RULES: Rule[] = [
  ["Bolsas Térmicas e Marmitas", /\btermic[ao]s? (\d|com|c |de|em)|\bmarmita\b|\blancheira\b|\bcooler\b/],
  ["Churrasco, Vinho e Queijo", /\b(churrasco|vinho|queijo|petisco|saca rolha|whisky|cerveja|drink)\b/],
  ["Tecnologia", /\b(usb|bluetooth|wireless|recarregavel|led|power bank|carregador|inducao|\d+gb|\d+\.?\d*mah)\b/],
  ["Beleza e Bem-estar", /\b(manicure|maquiagem|beleza|spa|aromatico|essencial|joias|comprimido|batom|unha|cabelo|facial|corporal)\b/],
  ["Canetas e Lápis", /\b(caneta|canetas|lapis|marca texto)\b/],
  ["Cadernos e Agendas", /\b(caderno|caderneta|agenda|anotacoes|anot\.?|planner|bloco)\b/],
  ["Ferramentas", /\b(ferramentas?|chave philips|alicate|fenda)\b/],
  ["Viagem e Lazer", /\b(viagem|praia|passaporte|camping|piquenique)\b/],
  ["Infantil e Diversão", /\b(infantil|brinquedo|crianca|divertid[ao]|anti ?stress)\b/],
  ["Casa e Cozinha", /\b(cozinha|mesa posta|decorativ[ao]|parede|banheiro)\b/],
  ["Mochilas", /\bmochila\b/],
  ["Bolsas e Sacolas", /\b(bolsa|sacola|tote)\b/],
  ["Garrafas e Squeezes", /\b(garrafa|squeeze|hidratacao)\b/],
  ["Canecas, Copos e Taças", /\b(caneca|copo|xicara|taca)\b/],
  ["Pet", /\bpets?\b|\banimais\b|\bcachorro\b|\bgato\b/],
];

/** Passo 3 — descrição. Só é usada quando nome e tipo não decidem. */
const DESCRIPTION_RULES: Rule[] = [
  ["Pet", /\b(seu pet|pets|animal de estimacao|caes e gatos|cachorro)\b/],
  ["Bolsas Térmicas e Marmitas", /\b(conserva a temperatura|revestimento termico|interior termico|forro termico|manter (os )?alimentos)\b/],
  ["Tecnologia", /\b(bluetooth|bateria|usb|recarregavel|carregamento|entrada tipo c|smartphone|conexao sem fio|led)\b/],
  ["Beleza e Bem-estar", /\b(maquiagem|pele|cabelos?|unhas|manicure|relaxamento|bem estar|aromas?|fragrancia|cosmeticos|joias|acessorios pessoais|cuidados pessoais)\b/],
  ["Churrasco, Vinho e Queijo", /\b(churrasco|vinhos?|queijos?|petiscos|aperitivos|drinks?)\b/],
  ["Casa e Cozinha", /\b(cozinha|alimentos|refeicoes|decoracao|ambientes?|mesa|casa|lar)\b/],
  ["Infantil e Diversão", /\b(criancas|infantil|diversao|brincar|brincadeira|jogar|antiestresse|anti stress)\b/],
  ["Viagem e Lazer", /\b(viagens?|viajar|praia|passeios?|ao ar livre|atividades externas)\b/],
  ["Escritório", /\b(escritorio|mesa de trabalho|documentos|organizar papeis)\b/],
  ["Cadernos e Agendas", /\b(folhas pautadas|anotacoes|miolo|paginas)\b/],
  ["Canetas e Lápis", /\b(escrita|tinta azul|tinta preta|carga)\b/],
];

function firstMatch(rules: Rule[], text: string): ProductCategory | null {
  for (const [category, pattern] of rules) if (pattern.test(text)) return category;
  return null;
}

/** Classifica um produto usando nome, descrição e (quando válida) a categoria do fornecedor. */
export function classifyProduct(name: string, description = "", suppliedCategory = ""): ProductCategory | string {
  const supplied = suppliedCategory.trim();
  if (supplied && !NON_CATEGORY_LABELS.test(normalizeCategoryText(supplied))) return supplied;

  const normalizedName = normalizeCategoryText(name);

  // 0. Combinações prioritárias.
  const priority = firstMatch(PRIORITY_RULES, normalizedName);
  if (priority) return priority;

  // 1a. Tipo com o nome inteiro (captura "kit churrasco", "kit executivo", "bolsa térmica").
  const fullType = firstMatch(TYPE_RULES, normalizedName);
  if (fullType) return fullType;

  // 1b. Tipo sem os modificadores ("mini ventilador" → "ventilador").
  let stripped = normalizedName;
  for (let guard = 0; guard < 3 && MODIFIER_PREFIX.test(stripped); guard += 1) {
    stripped = stripped.replace(MODIFIER_PREFIX, "").replace(/^\d+\s*(pecas?|pcs|p[cç]s|un|unidades)?\s*/, "");
  }
  if (stripped !== normalizedName) {
    const strippedType = firstMatch(TYPE_RULES, stripped);
    if (strippedType) return strippedType;
  }

  // 2. Termos no nome inteiro.
  const byName = firstMatch(NAME_RULES, normalizedName);
  if (byName) return byName;

  // 3. Descrição.
  const byDescription = firstMatch(DESCRIPTION_RULES, normalizeCategoryText(description));
  if (byDescription) return byDescription;

  return "Outros";
}
