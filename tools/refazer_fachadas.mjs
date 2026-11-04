// Remonta as fachadas já exportadas para o EnglishQuest com o montador atual (tools/godot_limpeza/fachada_b.gd) e exporta de
// novo (com backup do que estava no jogo). Não chama FLUX nem TRELLIS.2: usa as mesmas texturas da galeria.
// node tools/refazer_fachadas.mjs [id=#cor_detalhe ...]   (ex.: mw2746iyb577f2=#2f6e4f muda a cor dos detalhes dessa loja)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Galeria } from '../app/lib/gallery.mjs';
import { Limpeza } from '../app/lib/limpeza.mjs';
import { Exportador } from '../app/lib/exportar.mjs';
import { configFachada } from '../app/lib/estilo3d.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const galeria = new Galeria(join(RAIZ, 'galeria'));
const limpeza = new Limpeza({ raiz: RAIZ });
const exportador = new Exportador();
const cores = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')).filter(([, c]) => /^#[0-9a-f]{6}$/i.test(c ?? '')));

const ids = readdirSync(exportador.destino).filter((f) => f.endsWith('.json'))
  .map((f) => { try { return JSON.parse(readFileSync(join(exportador.destino, f), 'utf8')).prisma_id; } catch { return null; } })
  .filter((id) => id && galeria.obter(id)?.params?.modelo === 'fachada');

const pasta = join(RAIZ, 'tmp', '3d');
mkdirSync(pasta, { recursive: true });
for (const id of ids) {
  const item = galeria.obter(id);
  const pr = item.params;
  const fachada = cores[id] ? { ...pr.fachada, cor_detalhe: cores[id] } : pr.fachada;
  const i = pr.letreiro_escolhido || 0;
  const texturas = Object.fromEntries(Object.entries(pr.texturas || {}).map(([slot, t]) => [slot, galeria.caminho(t)]).filter(([, c]) => c));
  const cfg = join(pasta, id + '_refazer.json');
  const saida = join(pasta, id + '_refazer.glb');
  writeFileSync(cfg, JSON.stringify(configFachada(fachada, texturas, galeria.caminho(pr.letreiros[i]), i % 3)));
  const r = await limpeza.rodar('fachada_exportar.gd', [cfg, saida]);
  const novo = galeria.atualizar(id, readFileSync(saida), { fachada, faces: r.faces, bytes: r.bytes, tamanho_m: r.tamanho_m, colisoes: r.colisoes });
  const ex = exportador.exportar(novo, galeria.caminho(id));
  for (const f of [cfg, saida]) { try { unlinkSync(f); } catch { /* já foi */ } }
  console.log(`${fachada.marca}: ${r.faces} faces, ${(r.bytes / 1024 / 1024).toFixed(1)} MB, paredes barradas: ${JSON.stringify(r.paredes_barradas)} -> ${ex.glb}${ex.backup ? ' (backup em ' + ex.backup + ')' : ''}`);
}
