// Regras do "Criar 3D": o estilo travado do EnglishQuest, o peso (faces) por tamanho e a limpeza da descrição que o qwen devolve.
// Tudo aqui é puro (sem rede nem disco), para ser testado em tools/teste_3d.mjs.
import { medidaPadrao, tabelaParaPrompt } from './medidas.mjs';

// Estilo fixo, colado no fim de todo prompt de imagem. Combina com os assets atuais do jogo (Quaternius/KayKit, CC0):
// low poly, formas simples e arredondadas, cores chapadas e foscas, sem texto nem marcas. O usuário não edita isto.
export const ESTILO_EQ = [
  'stylized low poly 3D game asset, cozy cartoon style',
  'simple chunky rounded shapes, slightly simplified proportions',
  'smooth flat matte colors, soft pastel palette, no fine texture detail, no noise',
  'no text, no letters, no logos, no brand',
  'single isolated object, whole object visible, nothing cut off',
  'three-quarter front view, slightly from above, centered',
  'plain light gray studio background, soft even lighting, no cast shadow',
].join(', ');

// Peso por tamanho: o maior lado real decide. Veículos são sempre "grande".
export const TAMANHOS = {
  pequeno: { faces: 3000, textura: 512, ate: 0.5, rotulo: 'pequeno' },
  medio: { faces: 10000, textura: 1024, ate: 1.5, rotulo: 'médio' },
  grande: { faces: 30000, textura: 1024, ate: Infinity, rotulo: 'grande' },
};

export const CATEGORIAS = ['furniture', 'vehicle', 'animal', 'food', 'drink', 'plant', 'clothing', 'tool', 'electronics', 'decoration', 'building', 'object'];

export function maiorLado(m) {
  return Math.max(m.largura || 0, m.profundidade || 0, m.altura || 0);
}

export function classeTamanho(medidas, categoria) {
  if (categoria === 'vehicle') return 'grande';
  const lado = maiorLado(medidas);
  if (lado <= TAMANHOS.pequeno.ate) return 'pequeno';
  if (lado <= TAMANHOS.medio.ate) return 'medio';
  return 'grande';
}

// Pedido ao qwen2.5:7b: devolve só JSON. As medidas são em metros, do objeto real.
export const SISTEMA_DESCRITOR = `You help create 3D props for a video game set in a small American town.
The user describes ONE object, usually in Portuguese. Answer ONLY with a JSON object, no comments, with these keys:
"nome_en": short common English name, lowercase, 1 to 3 words, only the noun (no color, breed, pose or size), the word a learner of English should learn (e.g. "cafe table", "motorcycle", "dog"),
"nome_pt": the same short noun in Brazilian Portuguese, lowercase, 1 to 3 words (e.g. "mesa de café", "moto", "cachorro"),
"categoria": one of ${CATEGORIAS.join(', ')},
"medidas_m": {"largura": number, "profundidade": number, "altura": number} — the REAL size of a typical real one, in meters (width left-right, depth front-back, height),
"descricao_en": one English sentence describing how it looks (shape, parts, materials, colors), with realistic proportions, no background, no style words.
The English name must be the correct everyday word. Careful with these: "coleira" = "collar" (a "guia" is a "leash"); "pote de ração" = "dog food bowl";
"mesa de café" (a small table in a café or bistro) = "cafe table", NOT "coffee table" ("coffee table" is a "mesa de centro" in a living room);
"xícara" = "cup"; "caneca" = "mug"; "placa de cavalete" = "a-frame sign"; "poste" = "street light"; "lixeira" = "trash can".
Use realistic sizes. ALWAYS follow this table of standard sizes (width x depth x height, meters) when the object is in it:
${tabelaParaPrompt()}; a small shop front facade 8 x 1.5 x 4.5; a house 9 x 8 x 6.`;

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const textoLimpo = (v, max) => String(v ?? '').replace(/[\r\n\t"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Confere e corrige a resposta do qwen (que pode vir torta). Nunca lança: o que faltar vira um valor seguro.
// `fonte`: 'qwen' (sugestão) ou 'revisao' (você conferiu na tela de revisão: as medidas valem como estão).
// Se o nome em inglês está na tabela de medidas padrão, a tabela vence o qwen (mas não a sua revisão).
export function normalizarDescricao(bruto, pedido, fonte = 'qwen') {
  let d = bruto;
  if (typeof d === 'string') {   // pega só o objeto JSON e troca quebras de linha soltas (JSON inválido) por espaço
    try { d = JSON.parse(d.slice(d.indexOf('{'), d.lastIndexOf('}') + 1).replace(/[\u0000-\u001f]+/g, ' ')); } catch { d = {}; }
  }
  if (!d || typeof d !== 'object') d = {};
  const m = d.medidas_m || d.medidas || {};
  const num = (v, padrao) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? limitar(n, 0.01, 30) : padrao; };
  let medidas = { largura: num(m.largura ?? m.width, 0.5), profundidade: num(m.profundidade ?? m.depth, 0.5), altura: num(m.altura ?? m.height, 0.5) };
  const categoria = CATEGORIAS.includes(String(d.categoria).toLowerCase()) ? String(d.categoria).toLowerCase() : 'object';
  const nomePt = textoLimpo(d.nome_pt, 60).toLowerCase() || textoLimpo(pedido, 60).toLowerCase();
  const nomeEn = textoLimpo(String(d.nome_en ?? '').replace(/_/g, ' '), 60).toLowerCase() || 'object';
  const descricao = textoLimpo(d.descricao_en, 400) || nomeEn;
  const padrao = medidaPadrao(nomeEn);
  let origem = fonte === 'revisao' ? 'revisao' : 'qwen';
  if (padrao && fonte !== 'revisao') { medidas = padrao.medidas_m; origem = 'tabela'; }
  const tamanho = classeTamanho(medidas, categoria);
  return { nome_en: nomeEn, nome_pt: nomePt, categoria, medidas_m: medidas, descricao_en: descricao, tamanho, faces: TAMANHOS[tamanho].faces, textura: TAMANHOS[tamanho].textura,
    origem_medidas: origem, ...(padrao ? { tabela: { nome: padrao.nome, medidas_m: padrao.medidas_m, nota: padrao.nota } } : {}) };
}

const cm = (m) => (m >= 1 ? `${+m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

// Prompt final da imagem: descrição + proporções reais + estilo travado.
export function promptImagem(desc) {
  const { largura, profundidade, altura } = desc.medidas_m;
  return `${desc.descricao_en.replace(/[.\s]+$/, '')}. ${proporcao(desc.medidas_m)}, about ${cm(altura)} tall, ${cm(largura)} wide and ${cm(profundidade)} deep. ${ESTILO_EQ}.`;
}

// O FLUX ignora números, mas obedece palavras: diz a proporção (alto, baixo, comprido) em inglês.
export function proporcao({ largura, profundidade, altura }) {
  const planta = Math.max(largura, profundidade);
  if (altura > planta * 1.6) return 'Tall and slender, much taller than it is wide';
  if (altura > planta * 0.85) return 'About as tall as it is wide, not low';
  if (altura > planta * 0.45) return 'Wider than it is tall';
  return 'Long and low, much wider than it is tall';
}

// Correção por eixo na limpeza: depois da escala uniforme, cada eixo vai na direção da medida real, no máximo ±25%
// (conserta a mesa que o FLUX desenhou baixa sem esticar o modelo). Eixos do Godot: x = largura, y = altura, z = profundidade.
// Animais não são esticados (formas orgânicas ficam estranhas) e veículos só um pouco. Quando a medida é confiável
// (veio da tabela padrão ou você conferiu na revisão), móveis e objetos podem ser corrigidos até 50%: é o que
// conserta a mesa que o FLUX desenha baixa (a medida estava certa, o desenho é que não).
export const CORRECAO_MAX = 1.25;
export const CORRECAO_CONFIAVEL = 1.5;
export function correcaoPara(categoria, origem = 'qwen') {
  if (categoria === 'animal') return 1.0;
  if (categoria === 'vehicle') return 1.1;
  return origem === 'tabela' || origem === 'revisao' ? CORRECAO_CONFIAVEL : CORRECAO_MAX;
}

// Geração em lote: "loja de pets: cachorro, gato, aquário, ração, coleira" -> contexto + itens (vírgula, ponto e vírgula ou linha).
export const LOTE_MAX = 20;
export function lerLote(texto) {
  let t = String(texto ?? '').trim();
  let contexto = '';
  const dois = t.indexOf(':');
  if (dois > 0 && dois < 60 && !/[,;\n]/.test(t.slice(0, dois))) { contexto = t.slice(0, dois).trim(); t = t.slice(dois + 1); }
  const vistos = new Set();
  const itens = [];
  for (const parte of t.split(/[,;\n]+/)) {
    const item = parte.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
    if (!item || vistos.has(item.toLowerCase())) continue;
    vistos.add(item.toLowerCase());
    itens.push(item.slice(0, 120));
  }
  return { contexto: contexto.slice(0, 80), itens: itens.slice(0, LOTE_MAX), cortados: Math.max(0, itens.length - LOTE_MAX) };
}

// O pedido que vai ao qwen para cada item do lote: o contexto ajuda a acertar o tipo (ração de loja de pets, não de fazenda).
export function pedidoDoLote(item, contexto) {
  return contexto ? `${item} (objeto para o cenário: ${contexto})` : item;
}

// O .json que vai ao lado do .glb no EnglishQuest (recurso de tradução dos objetos no jogo).
export function vocabExportado(item, arquivoGlb) {
  const p = item.params || {};
  const v = p.vocab || {};
  return {
    en: v.en, pt: v.pt, categoria: v.categoria, medidas_m: v.medidas_m, tamanho_m: p.tamanho_m,
    faces: p.faces, cor: p.cor === 'vertices' ? 'vertices' : 'textura', arquivo: arquivoGlb,
    prisma_id: item.id, criado_em: item.criadoEm, pedido: p.pedido, ...(p.lote ? { cenario: p.lote } : {}),
    gerado_com: 'Prisma Studio, local: qwen2.5:7b (Apache-2.0), FLUX.1 schnell (Apache-2.0), BiRefNet (MIT), TRELLIS.2 (MIT), DINOv3 (DINOv3 License)',
    licenca: 'modelo gerado localmente; as licenças dos modelos de IA usados permitem uso comercial',
  };
}

// Texturas: só repinta a emenda quando ela aparece. A razão é a emenda dividida pela diferença normal entre vizinhos
// (1 = invisível). Em superfícies lisas (reboco) o FLUX inventa rachaduras na cruz, então abaixo de 1,5 fica a original.
export const EMENDA_LIMITE = 1.5;
export const precisaCostura = (razao) => !(razao < EMENDA_LIMITE);

// ---------- Criar fachada (método B: loja montada por peças no Godot, com texturas e letreiro do FLUX) ----------
export const SISTEMA_FACHADA = `You design the street front of ONE small shop for a cozy low poly video game set in a small American town.
The user gives the kind of shop (usually in Portuguese) and the invented brand name. Answer ONLY with a JSON object with these keys:
"tipo_en": the kind of shop in English, 1 to 3 words, lowercase (e.g. "cafe", "pet shop", "bakery"),
"tipo_pt": the same in Brazilian Portuguese, lowercase (e.g. "café", "loja de pets", "padaria"),
"largura_m": front width in meters, between 6 and 10,
"altura_m": height in meters, between 4 and 6,
"parede": material of the front wall, a short English texture description (e.g. "red brick wall with light gray mortar", "light blue painted wooden clapboard siding"),
"lateral": material of the side walls, plain and smooth (e.g. "smooth cream painted stucco plaster wall"),
"madeira": material of the trim and the panel under the windows (e.g. "dark green painted vertical wooden planks"),
"piso": the floor inside (e.g. "warm honey colored wooden floor boards seen from above", "black and white checkered floor tiles"),
"toldo": two hex colors for the striped awning, chosen for THIS shop and brand (a pet shop, a bakery and a bookstore must not share colors),
"letreiro_fundo": the sign background color in English words,
"letreiro_texto": the sign letters color in English words, with strong contrast to the background,
"detalhes": up to 3 small objects that THIS kind of shop would really put on the sidewalk in front of it, in Brazilian Portuguese (a pet shop: a water bowl for dogs, a bench; a bakery: a bread display, a small table; a flower shop: buckets of flowers).
Every shop must look different: choose materials and colors that fit the kind of shop and the brand. Do not default to green.`;

const HEX = /^#[0-9a-f]{6}$/i;

export function marcaLimpa(m) {
  return String(m ?? '').replace(/["\\<>{}\[\]\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28);
}

export function normalizarFachada(bruto, tipo, marca) {
  let d = bruto;
  if (typeof d === 'string') { try { d = JSON.parse(d.slice(d.indexOf('{'), d.lastIndexOf('}') + 1).replace(/[\u0000-\u001f]+/g, ' ')); } catch { d = {}; } }
  if (!d || typeof d !== 'object') d = {};
  const num = (v, min, max, padrao) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? limitar(n, min, max) : padrao; };
  const material = (v, padrao) => textoLimpo(v, 160) || padrao;
  const toldo = Array.isArray(d.toldo) && d.toldo.length >= 2 && HEX.test(d.toldo[0]) && HEX.test(d.toldo[1]) ? [d.toldo[0], d.toldo[1]] : ['#2f6e4f', '#f3efe2'];
  const detalhes = (Array.isArray(d.detalhes) ? d.detalhes : []).map((x) => textoLimpo(x, 60)).filter(Boolean).slice(0, 3);
  return {
    tipo_en: textoLimpo(d.tipo_en, 40).toLowerCase() || 'shop', tipo_pt: textoLimpo(d.tipo_pt, 40).toLowerCase() || textoLimpo(tipo, 40).toLowerCase(),
    marca: marcaLimpa(marca), largura_m: +num(d.largura_m, 6, 10, 8).toFixed(1), altura_m: +num(d.altura_m, 4, 6, 4.4).toFixed(1),
    parede: material(d.parede, 'red brick wall with light gray mortar'), lateral: material(d.lateral, 'smooth cream painted stucco plaster wall'),
    madeira: material(d.madeira, 'dark green painted vertical wooden planks'), piso: material(d.piso, 'warm honey colored wooden floor boards seen from above'),
    toldo, letreiro_fundo: textoLimpo(d.letreiro_fundo, 30) || 'dark green', letreiro_texto: textoLimpo(d.letreiro_texto, 30) || 'cream', detalhes,
  };
}

// Letreiro: o FLUX escreve a marca (a fonte e as cores vêm do plano). Fundo liso escuro em volta: a montagem recorta a placa.
export function promptLetreiro(plano) {
  return `a long wooden shop sign board with the brand name "${plano.marca}" written as big elegant ${plano.letreiro_texto} serif letters, spelled exactly "${plano.marca}", `
    + `on a ${plano.letreiro_fundo} background, thin gold border, sign of a ${plano.tipo_en}, flat front view, the sign fills the whole image edge to edge, plain dark background around it, no wall, stylized game asset`;
}

// Config que o Godot (tools/godot_limpeza/fachada_b.gd) usa para montar a loja.
export function configFachada(plano, texturas, letreiro) {
  return { largura: plano.largura_m, altura: plano.altura_m, texturas, letreiro, toldo: plano.toldo };
}

// Nome de arquivo seguro para exportar ao jogo (ex.: "cafe table" -> "cafe_table").
export function nomeArquivo(nomeEn) {
  return String(nomeEn).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'objeto';
}
