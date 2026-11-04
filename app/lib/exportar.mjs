// Exporta um modelo 3D da galeria para a pasta de assets do EnglishQuest: <nome>.glb + <nome>.json (vocabulário).
// Nunca sobrescreve outro modelo: se o nome já existe e veio de outro item da galeria, ganha _2, _3...
// Exportar de novo o MESMO item atualiza os arquivos dele.
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { nomeArquivo, vocabExportado } from './estilo3d.mjs';

export const DESTINO_PADRAO = 'D:\\EnglishQuest\\EnglishQuest\\assets\\prisma';

export class Exportador {
  constructor({ destino = process.env.PRISMA_EQ_ASSETS || DESTINO_PADRAO } = {}) {
    this.destino = destino;
  }

  // O jogo precisa existir (project.godot dois níveis acima de assets/prisma); não cria pastas soltas no disco.
  disponivel() { return existsSync(join(dirname(dirname(this.destino)), 'project.godot')) || !!process.env.PRISMA_EQ_ASSETS; }

  exportar(item, caminhoGlb) {
    if (item?.tipo !== '3d') throw new Error('Só modelos 3D podem ser exportados para o jogo.');
    if (!this.disponivel()) throw new Error('Não achei o projeto do EnglishQuest para ' + this.destino);
    mkdirSync(this.destino, { recursive: true });
    const base = nomeArquivo(item.params?.vocab?.en || 'objeto');
    let nome = base;
    for (let n = 2; ; n++) {
      const json = join(this.destino, nome + '.json');
      if (!existsSync(json) && !existsSync(join(this.destino, nome + '.glb'))) break;
      try { if (JSON.parse(readFileSync(json, 'utf8')).prisma_id === item.id) break; } catch { /* json torto: não é nosso */ }
      nome = `${base}_${n}`;
    }
    const glb = join(this.destino, nome + '.glb');
    const json = join(this.destino, nome + '.json');
    copyFileSync(caminhoGlb, glb);
    writeFileSync(json, JSON.stringify(vocabExportado(item, nome + '.glb'), null, 1) + '\n');
    return { nome, glb, json };
  }
}
