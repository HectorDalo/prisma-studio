// Tradução português -> inglês dos prompts, feita no próprio computador (tools/traduzir.py, Qwen2.5-1.5B-Instruct).
// O processo só fica ligado enquanto precisa: depois de alguns segundos sem pedidos ele é desligado para devolver a memória (RAM)
// ao motor de imagens.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const OCIOSO_MS = 20000;

const PALAVRAS_PT = new Set(['de', 'do', 'da', 'dos', 'das', 'um', 'uma', 'uns', 'umas', 'com', 'sem', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'que', 'para', 'por',
  'pelo', 'pela', 'e', 'ou', 'muito', 'mulher', 'homem', 'menina', 'menino', 'cachorro', 'gato', 'casa', 'fundo', 'uma', 'seu', 'sua', 'ele', 'ela', 'estilo', 'noite', 'dia',
  'cidade', 'praia', 'floresta', 'céu', 'luz', 'cor', 'vermelho', 'azul', 'verde', 'branco', 'preto', 'olhando', 'correndo', 'sentado', 'sentada', 'andando', 'dançando']);
const PALAVRAS_EN = new Set(['the', 'a', 'an', 'of', 'with', 'in', 'on', 'at', 'and', 'to', 'for', 'is', 'are', 'wearing', 'standing', 'sitting', 'walking', 'running', 'photo',
  'portrait', 'light', 'style', 'background', 'view', 'her', 'his', 'its', 'from', 'over', 'under', 'night', 'day', 'city', 'beach', 'forest', 'sky', 'red', 'blue', 'green']);

// O texto parece estar em português? (Marcas de acento ou palavras comuns do português.)
export function pareceportugues(texto) {
  const t = String(texto || '').toLowerCase();
  if (!t.trim()) return false;
  const palavras = t.match(/[a-zà-ÿ]+/g) || [];
  let pt = 0; let en = 0;
  for (const p of palavras) { if (PALAVRAS_PT.has(p)) pt++; if (PALAVRAS_EN.has(p)) en++; }
  const acentos = (t.match(/[àáâãçéêíóôõúü]/g) || []).length;
  return acentos > 0 ? pt + acentos >= en : pt > en;
}

export class Tradutor {
  constructor({ raiz }) {
    this.python = join(raiz, 'engine', 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
    this.script = join(raiz, 'tools', 'traduzir.py');
    this.modelo = join(raiz, 'modelos_extra', 'qwen2.5-1.5b-instruct');
    this.proc = null;
    this.pronto = null;                // promessa: o processo carregou o modelo
    this.pendentes = new Map();
    this.proximoId = 1;
    this.timer = null;
  }

  disponivel() { return existsSync(this.python) && existsSync(this.script) && existsSync(join(this.modelo, 'model.safetensors')); }

  ligar() {
    if (this.proc) return this.pronto;
    this.pronto = new Promise((resolve, reject) => {
      const proc = spawn(this.python, ['-s', this.script, this.modelo], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      this.proc = proc;
      createInterface({ input: proc.stdout }).on('line', (linha) => {
        let m; try { m = JSON.parse(linha); } catch { return; }
        if (m.pronto) return resolve();
        const p = this.pendentes.get(m.id);
        if (p) { this.pendentes.delete(m.id); m.erro ? p.reject(new Error(m.erro)) : p.resolve(m.traducoes); }
      });
      proc.on('exit', () => {
        this.proc = null; this.pronto = null;
        for (const p of this.pendentes.values()) p.reject(new Error('O tradutor foi desligado.'));
        this.pendentes.clear();
        reject(new Error('O tradutor fechou antes de ficar pronto.'));
      });
      proc.on('error', reject);
    });
    this.pronto.catch(() => {});
    return this.pronto;
  }

  async traduzir(textos) {
    if (!this.disponivel()) throw new Error('O modelo de tradução não está instalado.');
    clearTimeout(this.timer);
    await this.ligar();
    const id = this.proximoId++;
    const resposta = new Promise((resolve, reject) => this.pendentes.set(id, { resolve, reject }));
    this.proc.stdin.write(JSON.stringify({ id, textos }) + '\n');
    try {
      return await resposta;
    } finally {
      if (!this.pendentes.size) this.timer = setTimeout(() => this.desligar(), OCIOSO_MS);
    }
  }

  desligar() {
    clearTimeout(this.timer);
    if (this.proc) { try { this.proc.kill(); } catch { /* já saiu */ } }
  }
}
