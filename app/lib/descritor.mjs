// Descrição do objeto com o qwen2.5:7b do Ollama portátil da Elara Voz (D:\Claude\elara-voz). Tudo local.
// O modelo é descarregado da placa logo depois de responder (keep_alive: 0), para sobrar memória para o FLUX e o TRELLIS.2.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SISTEMA_DESCRITOR, normalizarDescricao, SISTEMA_FACHADA, normalizarFachada } from './estilo3d.mjs';

const ELARA = process.env.PRISMA_ELARA || 'D:\\Claude\\elara-voz';

export class Descritor {
  constructor({ url = process.env.PRISMA_OLLAMA_URL || 'http://127.0.0.1:11434', modelo = 'qwen2.5:7b' } = {}) {
    this.url = url;
    this.modelo = modelo;
    this.exe = join(ELARA, 'ollama', 'ollama.exe');
    this.pastaModelos = join(ELARA, 'modelos', 'ollama');
  }

  async noAr() {
    try { return (await fetch(this.url + '/api/tags', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
  }

  disponivel() { return existsSync(this.exe) && existsSync(this.pastaModelos); }

  // Liga o Ollama da Elara se ele ainda não estiver no ar (mesmas variáveis que a Elara usa: modelos no D:).
  async ligar() {
    if (await this.noAr()) return;
    if (!existsSync(this.exe)) throw new Error('Não achei o Ollama da Elara em ' + this.exe);
    const p = spawn(this.exe, ['serve'], { env: { ...process.env, OLLAMA_MODELS: this.pastaModelos }, stdio: 'ignore', windowsHide: true, detached: true });
    p.unref();
    for (let i = 0; i < 30; i++) {
      if (await this.noAr()) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('O Ollama não ligou.');
  }

  // `descarregar: false` deixa o qwen na placa para o próximo pedido (usado no lote, que descarrega no último).
  async descrever(pedido, { descarregar = true } = {}) {
    await this.ligar();
    const r = await fetch(this.url + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.modelo, system: SISTEMA_DESCRITOR, prompt: pedido, format: 'json', stream: false, keep_alive: descarregar ? 0 : '2m', options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(300000),
    });
    if (!r.ok) throw new Error('O qwen não respondeu (' + r.status + ').');
    const corpo = await r.json();
    if (descarregar) await this.descarregar();
    return normalizarDescricao(corpo.response, pedido);
  }

  // Plano da fachada (materiais, cores, tamanho, detalhes da calçada) para o modo "Criar fachada".
  async planejarFachada(tipo, marca) {
    await this.ligar();
    const r = await fetch(this.url + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.modelo, system: SISTEMA_FACHADA, prompt: `Tipo de loja: ${tipo}\nMarca: ${marca}`, format: 'json', stream: false, keep_alive: 0, options: { temperature: 0.5 } }),
      signal: AbortSignal.timeout(300000),
    });
    if (!r.ok) throw new Error('O qwen não respondeu (' + r.status + ').');
    const corpo = await r.json();
    await this.descarregar();
    return normalizarFachada(corpo.response, tipo, marca);
  }

  // Garante que o modelo saiu da placa (a Elara recarrega sozinha quando precisar).
  async descarregar() {
    try {
      await fetch(this.url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.modelo, keep_alive: 0 }), signal: AbortSignal.timeout(20000) });
    } catch { /* já saiu */ }
  }
}
