// Galeria: cada resultado vira um arquivo (png ou mp4) com um .json ao lado (como foi feito, para refazer depois).
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const ID_VALIDO = /^[a-z0-9]{6,24}$/;

export class Galeria {
  constructor(pasta) {
    this.pasta = pasta;
    this.entradas = join(pasta, 'entradas');
    mkdirSync(this.pasta, { recursive: true });
    mkdirSync(this.entradas, { recursive: true });
  }

  novoId() { return Date.now().toString(36) + randomBytes(3).toString('hex'); }

  idValido(id) { return ID_VALIDO.test(String(id)); }

  salvar({ buffer, ext, tipo, params }) {
    const id = this.novoId();
    const arquivo = `${id}.${ext}`;
    writeFileSync(join(this.pasta, arquivo), buffer);
    const item = { id, tipo, arquivo, criadoEm: new Date().toISOString(), params: params || {}, favorita: false };
    writeFileSync(join(this.pasta, `${id}.json`), JSON.stringify(item, null, 1));
    return item;
  }

  // Imagem enviada pelo usuário (para remover fundo, ampliar ou animar): não aparece na galeria.
  salvarEntrada(buffer, ext) {
    const id = this.novoId();
    const arquivo = join(this.entradas, `${id}.${ext}`);
    writeFileSync(arquivo, buffer);
    return { id, caminho: arquivo, ext };
  }

  entrada(id) {
    if (!this.idValido(id)) return null;
    const arquivo = readdirSync(this.entradas).find((f) => f.startsWith(id + '.'));
    return arquivo ? join(this.entradas, arquivo) : null;
  }

  obter(id) {
    if (!this.idValido(id)) return null;
    const json = join(this.pasta, `${id}.json`);
    return existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null;
  }

  caminho(id) {
    const item = this.obter(id);
    return item ? join(this.pasta, item.arquivo) : null;
  }

  listar() {
    return readdirSync(this.pasta)
      .filter((f) => f.endsWith('.json'))
      .map((f) => { try { return JSON.parse(readFileSync(join(this.pasta, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  }

  favoritar(id, valor) {
    const item = this.obter(id);
    if (!item) return null;
    item.favorita = !!valor;
    writeFileSync(join(this.pasta, `${id}.json`), JSON.stringify(item, null, 1));
    return item;
  }

  // Troca o arquivo de um item (ex.: fachada remontada com outro letreiro) e junta campos novos aos params.
  atualizar(id, buffer, params = {}) {
    const item = this.obter(id);
    if (!item) return null;
    writeFileSync(join(this.pasta, item.arquivo), buffer);
    item.params = { ...item.params, ...params };
    item.atualizadoEm = new Date().toISOString();
    writeFileSync(join(this.pasta, `${id}.json`), JSON.stringify(item, null, 1));
    return item;
  }

  excluir(id) {
    const item = this.obter(id);
    if (!item) return false;
    for (const f of [join(this.pasta, item.arquivo), join(this.pasta, `${id}.json`)]) { try { unlinkSync(f); } catch { /* já apagado */ } }
    return true;
  }
}
