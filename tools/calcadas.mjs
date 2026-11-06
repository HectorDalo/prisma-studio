// Grava no jogo a tabela de conjuntos de calçada (EnglishQuest/data/calcadas.json) e diz qual conjunto cada loja do Prisma
// exportada usa (o campo "calcada" do .json da loja, pelo tipo em inglês). Uso: node tools/calcadas.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tabelaParaJogo, conjuntoPara } from '../app/lib/calcadas.mjs';
import { DESTINO_PADRAO } from '../app/lib/exportar.mjs';

const assets = process.env.PRISMA_EQ_ASSETS || DESTINO_PADRAO;
const jogo = dirname(dirname(assets));
if (!existsSync(join(jogo, 'project.godot'))) {
  console.error('Não achei o projeto do jogo em ' + jogo);
  process.exit(1);
}
writeFileSync(join(jogo, 'data', 'calcadas.json'), JSON.stringify(tabelaParaJogo(), null, '\t') + '\n');
console.log('conjuntos de calçada -> ' + join(jogo, 'data', 'calcadas.json'));
for (const f of readdirSync(assets).filter((n) => n.endsWith('.json'))) {
  const p = join(assets, f);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (j.categoria !== 'building' && !j.fachada) continue;
  const calcada = conjuntoPara(j.tipo_en || j.en);
  if (j.calcada !== calcada) {
    j.calcada = calcada;
    writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
  }
  console.log(`${f}: ${j.tipo_en || j.en} -> ${calcada}`);
}
