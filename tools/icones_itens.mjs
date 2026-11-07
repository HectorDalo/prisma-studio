// Ícones dos itens do EnglishQuest (mochila, geladeira, armários): para cada item de EnglishQuest/data/items.json com "model",
// renderiza o modelo 3D no estilo de ícone do jogo (tools/godot_limpeza/icone.gd: três quartos, fundo transparente, contorno
// escuro) em EnglishQuest/assets/icons/items/<id>.png e grava ao lado o <id>.json de vocabulário (en, pt, onde se guarda,
// modelo e ícone). Uso: node tools/icones_itens.mjs [--lado 128]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DESTINO_PADRAO } from '../app/lib/exportar.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const jogo = dirname(dirname(process.env.PRISMA_EQ_ASSETS || DESTINO_PADRAO));
const lado = Number(process.argv[process.argv.indexOf('--lado') + 1]) || 128;
const itens = JSON.parse(readFileSync(join(jogo, 'data', 'items.json'), 'utf8')).items;
const vocab = JSON.parse(readFileSync(join(jogo, 'data', 'vocabulary.json'), 'utf8')).words;
const pasta = join(jogo, 'assets', 'icons', 'items');
mkdirSync(pasta, { recursive: true });

const pares = [];
for (const [id, item] of Object.entries(itens)) {
  if (!item.model) continue;
  const glb = join(jogo, item.model.replace('res://', ''));
  if (!existsSync(glb)) { console.log(`${id}: sem modelo (${item.model})`); continue; }
  pares.push(`${glb.replace(/\\/g, '/')}=${join(pasta, id + '.png').replace(/\\/g, '/')}`);
}
const godot = process.env.PRISMA_GODOT_TELA || 'D:\\EnglishQuest\\tools\\Godot_v4.7.2-stable_win64.exe';
const dados = join(RAIZ, 'tmp', 'godot');
mkdirSync(dados, { recursive: true });
const r = spawnSync(godot, ['--rendering-driver', 'd3d12', '--path', join(RAIZ, 'tools', 'godot_limpeza'), '-s', 'res://icone.gd', '--', String(lado), ...pares],
  { env: { ...process.env, APPDATA: dados, LOCALAPPDATA: dados }, encoding: 'utf8', maxBuffer: 1 << 24 });
const linha = (r.stdout + r.stderr).split(/\r?\n/).find((l) => l.startsWith('RELATORIO '));
if (!linha) { console.error('o Godot não terminou:\n' + (r.stdout + r.stderr).slice(-800)); process.exit(1); }
const rel = JSON.parse(linha.slice(10));
for (const [id, item] of Object.entries(itens)) {
  const png = id + '.png';
  if (rel.icones?.[png] !== 'ok') continue;
  const w = vocab[id] || {};
  writeFileSync(join(pasta, id + '.json'), JSON.stringify({
    en: w.en || id, pt: w.pt || '', categoria: 'item', guardar: item.store || 'any', modelo: item.model,
    icone: `res://assets/icons/items/${png}`, gerado_por: 'Prisma Studio (tools/icones_itens.mjs)',
  }, null, 1) + '\n');
}
console.log(JSON.stringify(rel.icones, null, 1));
