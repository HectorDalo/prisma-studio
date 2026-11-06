// Conjuntos de calçada por tipo de loja: o que fica na calçada e na vitrine de cada tipo, para a loja ter cara do que é
// (mesas e ombrelones SÓ no café e nos restaurantes). O jogo monta as peças (EnglishQuest/scripts/sidewalk_set.gd); o Prisma
// decide qual conjunto cada loja usa e grava a tabela em EnglishQuest/data/calcadas.json (tools/calcadas.mjs).

export const CONJUNTOS = {
  cafe: { nome: 'Café', mesas: true, pecas: ['tables', 'chalkboard', 'plants'] },
  restaurant: { nome: 'Restaurante', mesas: true, pecas: ['tables', 'menu_board', 'plants'] },
  pizzeria: { nome: 'Pizzaria', mesas: true, pecas: ['tables', 'menu_board', 'oven_window'] },
  ice_cream: { nome: 'Sorveteria', mesas: false, pecas: ['bench', 'giant_cone', 'flavor_board'] },
  clothing: { nome: 'Loja de roupas', mesas: false, pecas: ['mannequins', 'clothes_rack'] },
  market: { nome: 'Mercadinho', mesas: false, pecas: ['fruit_stand'] },
  office: { nome: 'Escritório (Job Center)', mesas: false, pecas: ['notice_board', 'office_bench'] },
  pharmacy: { nome: 'Farmácia', mesas: false, pecas: ['posters', 'sandwich_board'] },
};

// Peças que só fazem sentido onde se come sentado.
export const PECAS_DE_MESA = ['tables'];

// Tipo da loja (em inglês, como o Prisma planeja: "pharmacy", "ramen restaurant", "bakery"...) -> conjunto.
export function conjuntoPara(tipoEn) {
  const t = String(tipoEn ?? '').toLowerCase();
  if (/pharmac|drugstore|chemist/.test(t)) return 'pharmacy';
  if (/pizz/.test(t)) return 'pizzeria';
  if (/ice ?cream|gelat|frozen yogurt/.test(t)) return 'ice_cream';
  if (/cloth|fashion|boutique|apparel|shoe/.test(t)) return 'clothing';
  if (/market|grocer|produce|fruit/.test(t)) return 'market';
  if (/office|bank|job|post|clinic|agency/.test(t)) return 'office';
  if (/caf[eé]|coffee|bakery|tea/.test(t)) return 'cafe';
  if (/restaurant|bistro|diner|ramen|curry|taco|grill|kitchen|food|eatery|sushi|noodle|bar\b/.test(t)) return 'restaurant';
  return 'office';
}

// O que o jogo lê: { conjuntos: { tipo: { nome, mesas, pecas } } }.
export function tabelaParaJogo() {
  return { _comment: 'Gerado pelo Prisma Studio (app/lib/calcadas.mjs, node tools/calcadas.mjs). Mesas e ombrelones só no café e nos restaurantes; cada tipo de loja tem a sua calçada e a sua vitrine (scripts/sidewalk_set.gd monta as peças).', conjuntos: CONJUNTOS };
}
