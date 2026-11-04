// Controle do motor (ComfyUI): liga e desliga o processo, envia fluxos, acompanha o progresso e busca os resultados.
import { spawn } from 'node:child_process';
import { openSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const HOST = 'http://127.0.0.1:8188';
const WS = 'ws://127.0.0.1:8188/ws';

export class Engine {
  constructor({ raiz }) {
    this.raiz = raiz;                                   // D:\Claude\prisma
    this.pasta = join(raiz, 'engine', 'ComfyUI_windows_portable');
    this.modelos = join(this.pasta, 'ComfyUI', 'models');
    this.logs = join(raiz, 'logs');
    this.clientId = randomUUID();
    this.processo = null;
    this.iniciando = false;
    this.ws = null;
    this.ouvintes = new Map();                          // prompt_id -> função(mensagem)
  }

  async noAr() {
    try {
      const r = await fetch(HOST + '/system_stats', { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch { return false; }
  }

  async estado() {
    const noAr = await this.noAr();
    let vram = null;
    if (noAr) {
      try {
        const s = await (await fetch(HOST + '/system_stats', { signal: AbortSignal.timeout(2000) })).json();
        const d = s.devices?.[0];
        if (d) vram = { nome: d.name.replace(/^cuda:\d+\s*/, '').replace(/\s*:\s*cudaMallocAsync/, ''), livreGB: +(d.vram_free / 1e9).toFixed(1), totalGB: +(d.vram_total / 1e9).toFixed(1),
          motorGiB: +((d.torch_vram_total || 0) / 2 ** 30).toFixed(1) };   // o que o próprio ComfyUI reservou
      } catch { /* sem VRAM agora */ }
    }
    return { noAr, iniciando: this.iniciando, vram };
  }

  temModelo(relativo) {
    return existsSync(join(this.modelos, ...relativo.split('/')));
  }

  // Liga o motor se ainda não estiver rodando (espera até ficar pronto).
  async iniciar() {
    if (await this.noAr()) { this.conectarWs(); return; }
    if (this.iniciando) { await this.esperarPronto(); return; }
    this.iniciando = true;
    try {
      mkdirSync(this.logs, { recursive: true });
      const log = openSync(join(this.logs, 'motor.log'), 'a');
      this.processo = spawn(
        join(this.pasta, 'python_embeded', 'python.exe'),
        ['-s', join('ComfyUI', 'main.py'), '--windows-standalone-build', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch'],
        { cwd: this.pasta, stdio: ['ignore', log, log], windowsHide: true },
      );
      this.processo.on('exit', () => { this.processo = null; this.ws = null; });
      await this.esperarPronto();
    } finally {
      this.iniciando = false;
    }
  }

  async esperarPronto(limiteSeg = 180) {
    const fim = Date.now() + limiteSeg * 1000;
    while (Date.now() < fim) {
      if (await this.noAr()) { this.conectarWs(); return; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('O motor demorou demais para ligar. Veja logs/motor.log.');
  }

  parar() {
    try { this.ws?.close(); } catch { /* já fechado */ }
    if (this.processo) { try { this.processo.kill(); } catch { /* já encerrado */ } this.processo = null; }
  }

  conectarWs() {
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket(`${WS}?clientId=${this.clientId}`);
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const pid = m.data?.prompt_id;
      if (pid && this.ouvintes.has(pid)) this.ouvintes.get(pid)(m);
    });
    ws.addEventListener('close', () => { if (this.ws === ws) this.ws = null; });
    this.ws = ws;
  }

  async enviarImagem(buffer, nome) {
    const form = new FormData();
    form.append('image', new Blob([buffer]), nome);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const r = await fetch(HOST + '/upload/image', { method: 'POST', body: form });
    if (!r.ok) throw new Error('Não consegui enviar a imagem ao motor (' + r.status + ').');
    return (await r.json()).name;
  }

  // Executa um fluxo e devolve os arquivos de saída. `aoProgredir({passo, total})` é chamado durante a amostragem.
  async executar(workflow, aoProgredir = () => {}) {
    await this.iniciar();
    this.conectarWs();
    const resp = await fetch(HOST + '/prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
    });
    const corpo = await resp.json();
    if (!resp.ok || corpo.node_errors && Object.keys(corpo.node_errors).length) {
      const detalhe = JSON.stringify(corpo.node_errors || corpo.error || corpo).slice(0, 400);
      throw new Error('O motor recusou o pedido: ' + detalhe);
    }
    const pid = corpo.prompt_id;
    const terminou = new Promise((resolve, reject) => {
      this.ouvintes.set(pid, (m) => {
        if (m.type === 'progress') aoProgredir({ passo: m.data.value, total: m.data.max });
        else if (m.type === 'execution_error') reject(new Error(m.data.exception_message || 'erro na execução'));
        else if (m.type === 'executing' && m.data.node === null) resolve();
      });
      // plano B se o websocket falhar: confere o histórico de tempos em tempos
      const vigia = setInterval(async () => {
        try {
          const h = await (await fetch(`${HOST}/history/${pid}`)).json();
          if (h[pid]?.status?.completed) { clearInterval(vigia); resolve(); }
          if (h[pid]?.status?.status_str === 'error') { clearInterval(vigia); reject(new Error('erro na execução do motor')); }
        } catch { /* tenta de novo */ }
      }, 3000);
      terminou_vigia.set(pid, vigia);
    });
    try {
      await terminou;
    } finally {
      this.ouvintes.delete(pid);
      clearInterval(terminou_vigia.get(pid)); terminou_vigia.delete(pid);
    }
    const hist = (await (await fetch(`${HOST}/history/${pid}`)).json())[pid];
    const arquivos = [];
    for (const no of Object.values(hist?.outputs || {})) {
      for (const chave of ['images', 'videos', 'gifs', '3d']) arquivos.push(...(no[chave] || []));
    }
    return arquivos;
  }

  async baixar(info) {
    const qs = new URLSearchParams({ filename: info.filename, subfolder: info.subfolder || '', type: info.type || 'output' });
    const r = await fetch(`${HOST}/view?${qs}`);
    if (!r.ok) throw new Error('Não consegui buscar o resultado no motor.');
    return Buffer.from(await r.arrayBuffer());
  }

  // Tira os modelos da placa e da RAM (entre o FLUX e o TRELLIS.2 a memória de 8 GB / 16 GB fica apertada).
  async liberar() {
    try { await fetch(HOST + '/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* motor fora */ }
  }

  async interromper() {
    try { await fetch(HOST + '/interrupt', { method: 'POST' }); } catch { /* motor fora */ }
  }
}

const terminou_vigia = new Map();
