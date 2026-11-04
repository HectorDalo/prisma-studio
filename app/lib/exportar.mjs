// Exporta um modelo 3D da galeria para a pasta de assets do EnglishQuest: <nome>.glb + <nome>.json (vocabulário).
// Nunca sobrescreve outro modelo: se o nome já existe e veio de outro item da galeria, ganha _2, _3...
// Exportar de novo o MESMO item atualiza os arquivos dele, mas antes copia os antigos para backups/exportar/<data-hora>/.
// O EnglishQuest de verdade fica em D:\EnglishQuest (projeto Godot em D:\EnglishQuest\EnglishQuest; D:\Claude\EnglishQuest
// só tem um CLAUDE.md antigo).
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nomeArquivo, vocabExportado } from './estilo3d.mjs';

export const DESTINO_PADRAO = 'D:\\EnglishQuest\\EnglishQuest\\assets\\prisma';
const RAIZ_PRISMA = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const carimbo = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export class Exportador {
  constructor({ destino = process.env.PRISMA_EQ_ASSETS || DESTINO_PADRAO, backups = process.env.PRISMA_BACKUPS || join(RAIZ_PRISMA, 'backups', 'exportar') } = {}) {
    this.destino = destino;
    this.backups = backups;
  }

  // O jogo precisa existir (project.godot dois níveis acima de assets/prisma); não cria pastas soltas no disco.
  disponivel() { return existsSync(join(dirname(dirname(this.destino)), 'project.godot')) || !!process.env.PRISMA_EQ_ASSETS; }

  exportar(item, caminhoGlb) {
    if (item?.tipo !== '3d') throw new Error('Só modelos 3D podem ser exportados para o jogo.');
    if (!this.disponivel()) throw new Error('Não achei o projeto do EnglishQuest para ' + this.destino);
    mkdirSync(this.destino, { recursive: true });
    // fachada: o arquivo leva o nome da marca (greenleaf_pharmacy); o .json continua ensinando a palavra (pharmacy)
    const base = nomeArquivo(item.params?.fachada?.marca || item.params?.vocab?.en || 'objeto');
    let nome = base;
    for (let n = 2; ; n++) {
      const json = join(this.destino, nome + '.json');
      if (!existsSync(json) && !existsSync(join(this.destino, nome + '.glb'))) break;
      try { if (JSON.parse(readFileSync(json, 'utf8')).prisma_id === item.id) break; } catch { /* json torto: não é nosso */ }
      nome = `${base}_${n}`;
    }
    const glb = join(this.destino, nome + '.glb');
    const json = join(this.destino, nome + '.json');
    // backup do que vai ser trocado (só existe quando é o mesmo item exportado de novo)
    const antigos = [glb, json].filter((f) => existsSync(f));
    let backup = null;
    if (antigos.length) {
      backup = join(this.backups, carimbo());
      mkdirSync(backup, { recursive: true });
      for (const f of antigos) copyFileSync(f, join(backup, f.split(/[\\/]/).pop()));
      writeFileSync(join(backup, 'LEIA.txt'), `Cópia feita pelo Prisma antes de exportar de novo "${nome}" para ${this.destino}.\nPara voltar, copie estes arquivos de volta para lá.\n`);
    }
    copyFileSync(caminhoGlb, glb);
    writeFileSync(json, JSON.stringify(vocabExportado(item, nome + '.glb'), null, 1) + '\n');
    return { nome, glb, json, backup };
  }
}
