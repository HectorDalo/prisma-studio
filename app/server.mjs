// Servidor local do Prisma Studio: entrega a interface e fala com o motor (ComfyUI). Só escuta em 127.0.0.1.
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './lib/engine.mjs';
import { Galeria } from './lib/gallery.mjs';
import * as wf from './lib/workflows.mjs';
import { Tradutor, pareceportugues } from './lib/tradutor.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.PRISMA_RAIZ || dirname(AQUI);            // D:\Claude\prisma
const PORTA = Number(process.env.PRISMA_PORTA || 8765);
const PUBLICO = join(AQUI, 'public');

const engine = new Engine({ raiz: RAIZ });
const galeria = new Galeria(join(RAIZ, 'galeria'));
const tradutor = new Tradutor({ raiz: RAIZ });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json' };

// ---------- fila de trabalhos (um por vez: a placa só dá conta de um) ----------
const trabalhos = new Map();
const fila = [];
let rodando = false;

function criarTrabalho(tipo, descricao, executar) {
  const id = galeria.novoId();
  const t = { id, tipo, descricao, estado: 'na fila', etapa: null, progresso: 0, passo: 0, total: 0, itens: [], erro: null, criadoEm: Date.now(), executar };
  trabalhos.set(id, t);
  fila.push(t);
  rodarFila();
  return t;
}

async function rodarFila() {
  if (rodando) return;
  rodando = true;
  while (fila.length) {
    const t = fila.shift();
    if (t.cancelado) { t.estado = 'cancelado'; continue; }
    t.estado = 'executando';
    try {
      await t.executar(t);
      t.estado = t.cancelado ? 'cancelado' : 'pronto';
      t.progresso = 1;
    } catch (e) {
      t.estado = 'erro';
      t.erro = String(e.message || e);
    }
  }
  rodando = false;
}

function publico(t) {
  const { executar, ...resto } = t;
  return resto;
}

// ---------- validação dos pedidos ----------
const num = (v, min, max, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
const multiplo = (v, m, min, max, padrao) => Math.round(num(v, min, max, padrao) / m) * m;
const semente = (v) => (v === null || v === undefined || v === '' ? Math.floor(Math.random() * 2 ** 31) : Math.floor(num(v, 0, 2 ** 31, 1)));
const texto = (v, max = 2000) => String(v ?? '').slice(0, max).trim();

// Traduz o prompt do português para o inglês (os modelos entendem melhor), se for o caso. Devolve uma promessa já iniciada.
function prepararTexto(prompt, negativo, automatico) {
  const original = { prompt, negativo, traduzido: false };
  if (!automatico || !tradutor.disponivel() || !pareceportugues(prompt)) return Promise.resolve(original);
  const lista = negativo && pareceportugues(negativo) ? [prompt, negativo] : [prompt];
  return tradutor.traduzir(lista)
    .then((r) => ({ prompt: r[0] || prompt, negativo: lista.length > 1 ? (r[1] || negativo) : negativo, traduzido: true, promptOriginal: prompt }))
    .catch(() => original);   // sem tradução, segue com o texto como foi escrito
}

async function guardar(t, info, tipo, params, ext = null) {
  const buffer = await engine.baixar(info);
  const extensao = ext || (info.filename.split('.').pop() || 'png').toLowerCase();
  const item = galeria.salvar({ buffer, ext: extensao, tipo, params });
  t.itens.push(item);
  return item;
}

// Prepara uma imagem de origem (da galeria ou enviada) e devolve o nome dentro do motor.
async function prepararOrigem(origem) {
  let caminho = null;
  if (origem?.galeriaId) caminho = galeria.caminho(origem.galeriaId);
  else if (origem?.entradaId) caminho = galeria.entrada(origem.entradaId);
  if (!caminho || !existsSync(caminho)) throw new Error('Imagem de origem não encontrada.');
  const nome = 'prisma_' + galeria.novoId() + '.' + caminho.split('.').pop();
  return engine.enviarImagem(readFileSync(caminho), nome);
}

// ---------- rotas ----------
const rotas = [];
const rota = (metodo, padrao, fn) => rotas.push({ metodo, re: new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

const json = (res, dados, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(dados)); };
const lerCorpo = (req, limite = 60 * 1024 * 1024) => new Promise((resolve, reject) => {
  const partes = []; let tam = 0;
  req.on('data', (c) => { tam += c.length; if (tam > limite) { reject(new Error('arquivo grande demais')); req.destroy(); } else partes.push(c); });
  req.on('end', () => resolve(Buffer.concat(partes)));
  req.on('error', reject);
});
const lerJson = async (req) => { const b = await lerCorpo(req, 2 * 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

let ultimoPing = Date.now();
let recebeuPing = false;

rota('GET', '/api/status', async (req, res) => {
  const motor = await engine.estado();
  const modelos = {};
  for (const m of [...Object.values(wf.MODELOS_IMAGEM), ...Object.values(wf.MODELOS_VIDEO)]) modelos[m.id] = m.arquivos.every((a) => engine.temModelo(a));
  modelos.fundo = engine.temModelo('background_removal/birefnet.safetensors');
  modelos.ampliar = engine.temModelo('upscale_models/RealESRGAN_x4plus.pth');
  modelos.traducao = tradutor.disponivel();
  json(res, { motor, modelos, fila: fila.length + (rodando ? 1 : 0) });
});

rota('POST', '/api/traduzir', async (req, res) => {
  const b = await lerJson(req);
  const textos = (Array.isArray(b.textos) ? b.textos : []).map((t) => texto(t)).filter(Boolean).slice(0, 4);
  if (!textos.length) return json(res, { erro: 'Nada para traduzir.' }, 400);
  if (!tradutor.disponivel()) return json(res, { erro: 'O modelo de tradução não está instalado.' }, 503);
  try { json(res, { traducoes: await tradutor.traduzir(textos) }); } catch (e) { json(res, { erro: e.message }, 500); }
});

rota('GET', '/api/modelos', async (req, res) => json(res, { imagem: wf.MODELOS_IMAGEM, video: wf.MODELOS_VIDEO }));

rota('POST', '/api/motor/iniciar', async (req, res) => {
  engine.iniciar().catch(() => {});
  json(res, { ok: true });
});

rota('POST', '/api/ping', async (req, res) => { ultimoPing = Date.now(); recebeuPing = true; json(res, { ok: true }); });

rota('POST', '/api/sair', async (req, res) => { json(res, { ok: true }); setTimeout(encerrar, 200); });

rota('POST', '/api/gerar', async (req, res) => {
  const b = await lerJson(req);
  const modelo = wf.MODELOS_IMAGEM[b.modelo];
  if (!modelo) return json(res, { erro: 'Modelo desconhecido.' }, 400);
  const prompt = texto(b.prompt);
  if (!prompt) return json(res, { erro: 'Escreva o que você quer ver.' }, 400);
  const quantidade = Math.floor(num(b.quantidade, 1, 4, 1));
  const base = semente(b.semente);
  const params = {
    modelo: modelo.id, prompt, negativo: modelo.negativo ? texto(b.negativo, 800) : '',
    largura: multiplo(b.largura, 64, 512, 1536, 1024), altura: multiplo(b.altura, 64, 512, 1536, 1024),
    passos: Math.floor(num(b.passos, 1, 60, modelo.passos)), cfg: num(b.cfg, 1, 20, modelo.cfg),
  };
  const criados = [];
  const textos = prepararTexto(prompt, params.negativo, b.traduzir !== false);
  for (let i = 0; i < quantidade; i++) {
    const t = criarTrabalho('imagem', prompt.slice(0, 80), async (job) => {
      job.etapa = 'Traduzindo o texto…';
      const tr = await textos;
      job.etapa = null;
      const p = { ...params, prompt: tr.prompt, negativo: tr.negativo, semente: base + i };
      if (tr.traduzido) p.promptOriginal = tr.promptOriginal;
      const prefixo = 'prisma_' + job.id;
      const grafo = modelo.id === 'flux' ? wf.flux({ ...p, prefixo }) : wf.sdxl({ ...p, prefixo });
      const saidas = await engine.executar(grafo, ({ passo, total }) => { job.passo = passo; job.total = total; job.progresso = total ? passo / total : 0; });
      for (const s of saidas) await guardar(job, s, 'imagem', p);
    });
    criados.push(t.id);
  }
  json(res, { trabalhos: criados });
});

rota('POST', '/api/video', async (req, res) => {
  const b = await lerJson(req);
  const modelo = wf.MODELOS_VIDEO[b.modelo];
  if (!modelo) return json(res, { erro: 'Modelo desconhecido.' }, 400);
  const prompt = texto(b.prompt);
  if (!prompt) return json(res, { erro: 'Descreva a cena e o movimento.' }, 400);
  const deImagem = !!(b.origem && (b.origem.galeriaId || b.origem.entradaId));
  if (deImagem && modelo.id !== 'ltx') return json(res, { erro: 'Imagem para vídeo só funciona com o LTX-Video.' }, 400);
  const ltx = modelo.id === 'ltx';
  const params = {
    modelo: modelo.id, prompt, negativo: texto(b.negativo, 800),
    largura: multiplo(b.largura, 32, 256, ltx ? 768 : 832, ltx ? 704 : 624),
    altura: multiplo(b.altura, 32, 256, ltx ? 544 : 480, ltx ? 480 : 368),
    quadros: 1 + 8 * Math.round((Math.floor(num(b.quadros, 9, ltx ? 97 : 65, ltx ? 49 : 33)) - 1) / 8),
    passos: Math.floor(num(b.passos, 1, 40, ltx ? 8 : 20)), semente: semente(b.semente), deImagem,
  };
  const textos = prepararTexto(prompt, params.negativo, b.traduzir !== false);
  const t = criarTrabalho('video', prompt.slice(0, 80), async (job) => {
    job.etapa = 'Traduzindo o texto…';
    const tr = await textos;
    job.etapa = null;
    params.prompt = tr.prompt; params.negativo = tr.negativo;
    if (tr.traduzido) params.promptOriginal = tr.promptOriginal;
    const prefixo = 'prisma_' + job.id;
    let grafo;
    if (deImagem) grafo = wf.ltxImagem({ ...params, imagem: await prepararOrigem(b.origem), prefixo });
    else grafo = ltx ? wf.ltxTexto({ ...params, prefixo }) : wf.wanTexto({ ...params, prefixo });
    const saidas = await engine.executar(grafo, ({ passo, total }) => { job.passo = passo; job.total = total; job.progresso = total ? passo / total : 0; });
    for (const s of saidas) await guardar(job, s, 'video', params, 'mp4');
  });
  json(res, { trabalhos: [t.id] });
});

rota('POST', '/api/entrada', async (req, res) => {
  const corpo = await lerCorpo(req);
  const tipo = String(req.headers['content-type'] || '');
  const ext = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : 'jpg';
  if (!/^image\//.test(tipo)) return json(res, { erro: 'Envie um arquivo de imagem.' }, 400);
  if (corpo.length < 100) return json(res, { erro: 'Arquivo vazio.' }, 400);
  const e = galeria.salvarEntrada(corpo, ext);
  json(res, { entradaId: e.id });
});

rota('POST', '/api/fundo', async (req, res) => {
  const b = await lerJson(req);
  const t = criarTrabalho('fundo', 'Remover fundo', async (job) => {
    const imagem = await prepararOrigem(b.origem);
    const saidas = await engine.executar(wf.removerFundo({ imagem, prefixo: 'prisma_' + job.id }));
    for (const s of saidas) await guardar(job, s, 'fundo', { origem: b.origem }, 'png');
  });
  json(res, { trabalhos: [t.id] });
});

rota('POST', '/api/ampliar', async (req, res) => {
  const b = await lerJson(req);
  const fator = Number(b.fator) === 2 ? 2 : 4;
  const t = criarTrabalho('ampliada', `Ampliar ${fator}×`, async (job) => {
    const imagem = await prepararOrigem(b.origem);
    const saidas = await engine.executar(wf.ampliar({ imagem, fator, prefixo: 'prisma_' + job.id }));
    for (const s of saidas) await guardar(job, s, 'ampliada', { origem: b.origem, fator }, 'png');
  });
  json(res, { trabalhos: [t.id] });
});

rota('GET', '/api/trabalhos/:id', async (req, res, p) => {
  const t = trabalhos.get(p.id);
  if (!t) return json(res, { erro: 'Trabalho não encontrado.' }, 404);
  json(res, publico(t));
});

rota('POST', '/api/trabalhos/:id/cancelar', async (req, res, p) => {
  const t = trabalhos.get(p.id);
  if (!t) return json(res, { erro: 'Trabalho não encontrado.' }, 404);
  t.cancelado = true;
  if (t.estado === 'executando') await engine.interromper();
  json(res, { ok: true });
});

rota('GET', '/api/galeria', async (req, res) => json(res, { itens: galeria.listar() }));

rota('GET', '/api/galeria/:id/arquivo', async (req, res, p) => {
  const caminho = galeria.caminho(p.id);
  if (!caminho || !existsSync(caminho)) return json(res, { erro: 'Arquivo não encontrado.' }, 404);
  const tam = statSync(caminho).size;
  const tipo = TIPOS[extname(caminho)] || 'application/octet-stream';
  const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (faixa && tipo === 'video/mp4') {            // vídeo precisa de faixas para tocar e avançar
    const ini = faixa[1] ? Number(faixa[1]) : 0;
    const fim = faixa[2] ? Number(faixa[2]) : tam - 1;
    res.writeHead(206, { 'Content-Type': tipo, 'Content-Range': `bytes ${ini}-${fim}/${tam}`, 'Accept-Ranges': 'bytes', 'Content-Length': fim - ini + 1 });
    return createReadStream(caminho, { start: ini, end: fim }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tam, 'Accept-Ranges': 'bytes', 'Cache-Control': 'max-age=3600' });
  createReadStream(caminho).pipe(res);
});

rota('PATCH', '/api/galeria/:id', async (req, res, p) => {
  const b = await lerJson(req);
  const item = galeria.favoritar(p.id, b.favorita);
  item ? json(res, item) : json(res, { erro: 'Item não encontrado.' }, 404);
});

rota('DELETE', '/api/galeria/:id', async (req, res, p) => json(res, { ok: galeria.excluir(p.id) }));

// ---------- servidor ----------
const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    // só aceita pedidos feitos para o próprio endereço local (barra páginas de fora que tentem falar com o app)
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); return res.end('proibido'); }
    if (url.pathname.startsWith('/api/')) {
      for (const r of rotas) {
        const m = r.re.exec(url.pathname);
        if (m && r.metodo === req.method) return await r.fn(req, res, m.groups || {});
      }
      return json(res, { erro: 'Rota não encontrada.' }, 404);
    }
    let arquivo = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const caminho = join(PUBLICO, arquivo);
    if (!caminho.startsWith(PUBLICO) || !existsSync(caminho) || statSync(caminho).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(caminho).pipe(res);
  } catch (e) {
    json(res, { erro: String(e.message || e) }, 500);
  }
});

function encerrar() {
  tradutor.desligar();
  engine.parar();
  servidor.close();
  setTimeout(() => process.exit(0), 300);
}

// Se a janela do app for fechada, ninguém mais manda sinal de vida: desliga o motor e libera a placa de vídeo.
setInterval(() => { if (recebeuPing && Date.now() - ultimoPing > 25000) encerrar(); }, 5000);
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('exit', () => { tradutor.desligar(); engine.parar(); });

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Prisma Studio em http://127.0.0.1:${PORTA}`);
  engine.iniciar().catch((e) => console.error('motor:', e.message));
});
