// Tabela de medidas padrão (metros) por tipo de objeto: largura (esquerda-direita) x profundidade (frente-trás) x altura.
// O qwen recebe esta tabela no pedido e, quando o nome em inglês bate com um item, a TABELA VENCE a sugestão dele.
// Para editar: um item por linha; "nomes" são os nomes em inglês que contam (o mais comprido que aparecer no nome ganha).
// "nota" vai para a tela de revisão (ex.: altura do assento).

export const MEDIDAS_PADRAO = [
  // móveis
  { nomes: ['cafe table', 'bistro table', 'small round table', 'round table'], m: [0.7, 0.7, 0.75], nota: 'tampo a 0,75 m' },
  { nomes: ['table', 'dining table', 'kitchen table'], m: [1.6, 0.9, 0.75], nota: 'tampo a 0,75 m' },
  { nomes: ['coffee table'], m: [1.1, 0.6, 0.45], nota: 'mesa de centro, baixa' },
  { nomes: ['desk', 'office desk', 'computer desk'], m: [1.4, 0.7, 0.75], nota: 'tampo a 0,75 m' },
  { nomes: ['chair', 'dining chair', 'wooden chair', 'cafe chair'], m: [0.45, 0.5, 0.9], nota: 'assento a 0,45 m' },
  { nomes: ['stool'], m: [0.4, 0.4, 0.45], nota: 'assento a 0,45 m' },
  { nomes: ['bar stool'], m: [0.4, 0.4, 0.75], nota: 'assento a 0,75 m' },
  { nomes: ['armchair'], m: [0.85, 0.85, 0.9], nota: 'assento a 0,42 m' },
  { nomes: ['sofa', 'couch'], m: [2.0, 0.9, 0.85], nota: 'assento a 0,42 m' },
  { nomes: ['bench', 'park bench', 'wooden bench'], m: [1.6, 0.6, 0.85], nota: 'assento a 0,45 m' },
  { nomes: ['bed', 'double bed'], m: [1.4, 2.0, 0.6], nota: 'colchão a 0,55 m' },
  { nomes: ['single bed'], m: [0.9, 2.0, 0.6], nota: 'colchão a 0,55 m' },
  { nomes: ['bookshelf', 'bookcase'], m: [0.9, 0.35, 1.9] },
  { nomes: ['wardrobe', 'closet'], m: [1.2, 0.6, 2.0] },
  { nomes: ['counter', 'kitchen counter', 'shop counter'], m: [2.0, 0.6, 0.9], nota: 'bancada a 0,90 m' },
  { nomes: ['refrigerator', 'fridge'], m: [0.7, 0.7, 1.8] },
  { nomes: ['stove', 'oven'], m: [0.6, 0.6, 0.9] },
  { nomes: ['floor lamp', 'lamp'], m: [0.4, 0.4, 1.6] },
  { nomes: ['table lamp', 'desk lamp'], m: [0.25, 0.25, 0.5] },
  // casa e rua
  { nomes: ['door', 'front door'], m: [0.9, 0.05, 2.1], nota: 'porta: 2,10 m de altura' },
  { nomes: ['window'], m: [1.2, 0.1, 1.2] },
  { nomes: ['street light', 'lamp post', 'street lamp'], m: [0.3, 0.3, 4.5] },
  { nomes: ['trash can', 'garbage can', 'bin'], m: [0.5, 0.5, 0.9] },
  { nomes: ['mailbox'], m: [0.45, 0.45, 1.1] },
  { nomes: ['fire hydrant'], m: [0.35, 0.35, 0.8] },
  { nomes: ['traffic cone'], m: [0.35, 0.35, 0.7] },
  { nomes: ['a-frame sign', 'sandwich board', 'chalkboard sign', 'sidewalk sign'], m: [0.6, 0.5, 1.0] },
  { nomes: ['planter', 'flower pot', 'plant pot', 'large pot'], m: [0.5, 0.5, 0.6] },
  { nomes: ['potted plant'], m: [0.4, 0.4, 0.9] },
  { nomes: ['patio umbrella', 'umbrella'], m: [2.5, 2.5, 2.4] },
  { nomes: ['shopping cart'], m: [0.55, 0.95, 1.0] },
  // veículos
  { nomes: ['car'], m: [1.8, 4.5, 1.5] },
  { nomes: ['motorcycle', 'motorbike', 'scooter'], m: [0.8, 2.1, 1.15] },
  { nomes: ['bicycle', 'bike'], m: [0.6, 1.75, 1.05] },
  { nomes: ['bus'], m: [2.55, 12.0, 3.2] },
  // animais e pets
  { nomes: ['dog'], m: [0.3, 0.9, 0.6], nota: 'cachorro médio: 0,55 m no ombro' },
  { nomes: ['cat'], m: [0.2, 0.5, 0.3] },
  { nomes: ['dog bowl', 'dog food bowl', 'pet bowl', 'food bowl', 'water bowl'], m: [0.2, 0.2, 0.08] },
  { nomes: ['dog collar', 'collar'], m: [0.15, 0.15, 0.04], nota: 'coleira deitada no chão' },
  { nomes: ['leash', 'dog leash'], m: [0.3, 0.3, 0.05], nota: 'guia enrolada' },
  { nomes: ['aquarium', 'fish tank'], m: [0.6, 0.3, 0.4] },
  { nomes: ['pet bed', 'dog bed'], m: [0.7, 0.55, 0.2] },
  // cozinha, comida e coisas pequenas
  { nomes: ['coffee mug', 'mug', 'cup', 'coffee cup'], m: [0.08, 0.12, 0.1], nota: 'com a asa' },
  { nomes: ['plate'], m: [0.26, 0.26, 0.03] },
  { nomes: ['bottle', 'water bottle'], m: [0.07, 0.07, 0.25] },
  { nomes: ['backpack'], m: [0.32, 0.2, 0.45] },
  { nomes: ['book'], m: [0.15, 0.23, 0.03] },
  { nomes: ['laptop'], m: [0.33, 0.23, 0.02], nota: 'fechado' },
  { nomes: ['computer monitor', 'monitor'], m: [0.55, 0.2, 0.45] },
  { nomes: ['television', 'tv'], m: [1.2, 0.08, 0.7] },
];

const palavras = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();

// Procura o item da tabela pelo nome em inglês: o nome da tabela tem que aparecer inteiro (palavras inteiras) no nome;
// entre vários, ganha o mais comprido ("dog food bowl" ganha de "dog"; "table lamp" ganha de "table").
export function medidaPadrao(nomeEn) {
  const alvo = ` ${palavras(nomeEn)} `;
  let melhor = null;
  for (const item of MEDIDAS_PADRAO) {
    for (const n of item.nomes) {
      if (alvo.includes(` ${n} `) && (!melhor || n.length > melhor.nome.length)) melhor = { nome: n, item };
    }
  }
  if (!melhor) return null;
  const [largura, profundidade, altura] = melhor.item.m;
  return { nome: melhor.nome, medidas_m: { largura, profundidade, altura }, nota: melhor.item.nota || '' };
}

// Texto da tabela para o pedido ao qwen (curto: só o primeiro nome de cada item).
export function tabelaParaPrompt() {
  return MEDIDAS_PADRAO.map((i) => `${i.nomes[0]} ${i.m.join(' x ')}`).join('; ');
}
