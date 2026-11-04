// Limpeza dos modelos 3D pelo Godot sem tela (tools/godot_limpeza/limpar.gd): escala real, base no chão, centro em x/z.
// O Godot usado é o do EnglishQuest (fora do Git). Os dados internos dele vão para o D: (APPDATA apontado para tmp/godot).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Limpeza {
  constructor({ raiz }) {
    this.raiz = raiz;
    this.godot = process.env.PRISMA_GODOT || 'D:\\EnglishQuest\\tools\\Godot_v4.7.2-stable_win64_console.exe';
    this.projeto = join(raiz, 'tools', 'godot_limpeza');
    this.dados = join(raiz, 'tmp', 'godot');
  }

  disponivel() { return existsSync(this.godot) && existsSync(join(this.projeto, 'project.godot')); }

  // Devolve o relatório medido no arquivo salvo: { faces, tamanho_m:[x,y,z], base_y, centro_xz, bytes, cor_por_vertice }.
  // O Godot grava logs e cache de shaders em %APPDATA%\Godot: aqui isso sempre vai para o D: (tmp/godot), nunca para o C:.
  ambiente() { return { ...process.env, APPDATA: this.dados, LOCALAPPDATA: this.dados }; }

  // Roda um script do projeto tools/godot_limpeza e devolve o RELATORIO.
  rodar(script, args, limiteMs = 120000) {
    if (!this.disponivel()) return Promise.reject(new Error('Não achei o Godot em ' + this.godot));
    mkdirSync(this.dados, { recursive: true });
    return new Promise((resolve, reject) => {
      const p = spawn(this.godot, ['--headless', '--path', this.projeto, '-s', 'res://' + script, '--', ...args.map(String)], {
        env: this.ambiente(), windowsHide: true,
      });
      let s = '';
      p.stdout.on('data', (d) => { s += d; });
      p.stderr.on('data', (d) => { s += d; });
      const limite = setTimeout(() => p.kill(), limiteMs);
      p.on('error', (e) => { clearTimeout(limite); reject(e); });
      p.on('close', () => {
        clearTimeout(limite);
        const linha = s.split(/\r?\n/).find((l) => l.startsWith('RELATORIO '));
        if (!linha) return reject(new Error(`${script} falhou: ` + s.slice(-400)));
        const r = JSON.parse(linha.slice(10));
        r.erro ? reject(new Error(`${script}: ${r.erro}`)) : resolve(r);
      });
    });
  }

  // Textura sem emenda, etapa 1: imagem deslocada meia volta + máscara da cruz (o FLUX repinta a cruz depois).
  prepararLadrilho(entrada, deslocada, mascara, lado = 1024) { return this.rodar('ladrilho.gd', ['preparar', entrada, deslocada, mascara, lado]); }
  medirEmenda(imagem) { return this.rodar('ladrilho.gd', ['medir', imagem]); }

  // `medidas`: { largura, altura, profundidade } em metros (com correção por eixo de até `correcao`) ou um número (só o maior lado).
  limpar(entrada, saida, medidas, correcao = 1.25) {
    const alvo = typeof medidas === 'number' ? [medidas] : [medidas.largura, medidas.altura, medidas.profundidade, correcao];
    return this.rodar('limpar.gd', [entrada, saida, ...alvo]);
  }
}
