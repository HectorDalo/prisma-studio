// Servidor local do Prisma Studio: entrega a interface e fala com o motor (ComfyUI). Só escuta em 127.0.0.1.
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './lib/engine.mjs';
import { Galeria } from './lib/gallery.mjs';
import * as wf from './lib/workflows.mjs';
import { Tradutor, pareceportugues } from './lib/tradutor.mjs';
import { Online, MODELOS_ONLINE } from './lib/online.mjs';
import { Descritor } from './lib/descritor.mjs';
import { Limpeza } from './lib/limpeza.mjs';
import { promptImagem, ESTILO_EQ, TAMANHOS, correcaoPara, lerLote, pedidoDoLote, precisaCostura, normalizarDescricao, LOTE_MAX, normalizarFachada, marcaLimpa, promptLetreiro, configFachada } from './lib/estilo3d.mjs';
import { Exportador } from './lib/exportar.mjs';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { deveEncerrar } from './lib/vigia.mjs';
import { estadoRecursos, descarregarOllama, fecharElara } from './lib/recursos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.PRISMA_RAIZ || dirname(AQUI);            // D:\Claude\prisma
const PORTA = Number(process.env.PRISMA_PORTA || 8765);
const PUBLICO = join(AQUI, 'public');

const engine = new Engine({ raiz: RAIZ });
const galeria = new Galeria(join(RAIZ, 'galeria'));
const tradutor = new Tradutor({ raiz: RAIZ });
const online = new Online({ raiz: RAIZ });
const descritor = new Descritor();
const limpeza = new Limpeza({ raiz: RAIZ });
const exportador = new Exportador();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json', '.glb': 'model/gltf-binary' };

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
  modelos['3d'] = wf.MODELO_3D.arquivos.every((a) => engine.temModelo(a)) && wf.MODELOS_IMAGEM.flux.arquivos.every((a) => engine.temModelo(a))
    && descritor.disponivel() && limpeza.disponivel();
  for (const m of Object.values(MODELOS_ONLINE)) modelos[m.id] = online.temChave();
  json(res, { motor, modelos, online: { chave: online.temChave() }, fila: fila.length + (rodando ? 1 : 0) });
});

rota('POST', '/api/traduzir', async (req, res) => {
  const b = await lerJson(req);
  const textos = (Array.isArray(b.textos) ? b.textos : []).map((t) => texto(t)).filter(Boolean).slice(0, 4);
  if (!textos.length) return json(res, { erro: 'Nada para traduzir.' }, 400);
  if (!tradutor.disponivel()) return json(res, { erro: 'O modelo de tradução não está instalado.' }, 503);
  try { json(res, { traducoes: await tradutor.traduzir(textos) }); } catch (e) { json(res, { erro: e.message }, 500); }
});

rota('GET', '/api/modelos', async (req, res) => json(res, { imagem: { ...wf.MODELOS_IMAGEM, ...MODELOS_ONLINE }, video: wf.MODELOS_VIDEO }));

// Chave da IA online (fal.ai): só é gravada aqui, no computador; o navegador nunca recebe a chave de volta.
rota('POST', '/api/online/chave', async (req, res) => {
  const b = await lerJson(req);
  try { online.salvarChave(b.chave); json(res, { ok: true }); } catch (e) { json(res, { erro: e.message }, 400); }
});
rota('DELETE', '/api/online/chave', async (req, res) => { online.removerChave(); json(res, { ok: true }); });

rota('POST', '/api/motor/iniciar', async (req, res) => {
  engine.iniciar().catch(() => {});
  json(res, { ok: true });
});

rota('POST', '/api/ping', async (req, res) => { ultimoPing = Date.now(); recebeuPing = true; json(res, { ok: true }); });

rota('POST', '/api/sair', async (req, res) => { json(res, { ok: true }); setTimeout(encerrar, 200); });

rota('POST', '/api/gerar', async (req, res) => {
  const b = await lerJson(req);
  const modelo = wf.MODELOS_IMAGEM[b.modelo] || MODELOS_ONLINE[b.modelo];
  if (!modelo) return json(res, { erro: 'Modelo desconhecido.' }, 400);
  if (modelo.online && !online.temChave()) return json(res, { erro: 'Cadastre a chave da fal.ai na aba Online.' }, 400);
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
      if (modelo.online) {
        const r = await online.gerarImagem(modelo, p, (e) => { job.etapa = e; }, () => job.cancelado);
        job.etapa = null;
        const item = galeria.salvar({ buffer: r.buffer, ext: r.ext, tipo: 'imagem', params: { ...p, online: true } });
        job.itens.push(item);
        return;
      }
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

// ---------- Criar 3D: qwen (descrição e medidas) -> FLUX (imagem no estilo travado) -> BiRefNet + TRELLIS.2 -> limpeza no Godot -> .glb
rota('GET', '/api/3d/estilo', async (req, res) => json(res, { estilo: ESTILO_EQ, tamanhos: TAMANHOS }));

// `revisado`: nome, medidas e descrição que você conferiu na tela de revisão (aí o qwen não é chamado de novo).
function criar3d({ pedido, cor, semente: base, lote = '', revisado = null }) {
  return criarTrabalho('3d', (revisado?.nome_en ? `${revisado.nome_en} (${pedido})` : pedido).slice(0, 80), async (job) => {
    job.etapa = 'Escrevendo a descrição e as medidas (qwen)…';
    const desc = revisado ? normalizarDescricao(revisado, pedido, 'revisao') : await descritor.descrever(pedidoDoLote(pedido, lote));
    if (job.cancelado) return;
    const prompt = promptImagem(desc);
    job.etapa = 'Desenhando a imagem (FLUX)…';
    const prefixo = 'prisma_' + job.id;
    const imgs = await engine.executar(wf.flux({ prompt, largura: 1024, altura: 1024, passos: 4, semente: base, prefixo }),
      ({ passo, total }) => { job.passo = passo; job.total = total; job.progresso = total ? (passo / total) * 0.1 : 0; });
    const imagem = await guardar(job, imgs[0], 'imagem', { modelo: 'flux', prompt, promptOriginal: pedido, semente: base, para3d: true }, 'png');
    if (job.cancelado) return;
    await engine.liberar();
    const nomeMotor = await engine.enviarImagem(readFileSync(galeria.caminho(imagem.id)), prefixo + '.png');
    let etapa3d = 0;
    const ETAPAS = ['estrutura', 'forma', 'detalhes', 'cor'];
    job.etapa = 'Criando o modelo 3D (TRELLIS.2): estrutura…';
    const saidas = await engine.executar(wf.trellis3d({ imagem: nomeMotor, faces: desc.faces, textura: desc.textura, cor, semente: base, prefixo }), ({ passo, total }) => {
      if (passo === 1 && job.passo > 1) etapa3d = Math.min(3, etapa3d + 1);   // cada amostragem recomeça a contagem
      job.passo = passo; job.total = total;
      job.etapa = `Criando o modelo 3D (TRELLIS.2): ${ETAPAS[etapa3d]}…`;
      job.progresso = 0.1 + 0.85 * ((etapa3d + (total ? passo / total : 0)) / 4);
    });
    await engine.liberar();
    if (job.cancelado) return;
    const glb = saidas.find((s) => /\.glb$/i.test(s.filename));
    if (!glb) throw new Error('O TRELLIS.2 não devolveu o modelo.');
    job.etapa = 'Limpando: escala real e base no chão (Godot)…';
    const pasta = join(RAIZ, 'tmp', '3d');
    mkdirSync(pasta, { recursive: true });
    const cru = join(pasta, job.id + '_cru.glb'); const pronto = join(pasta, job.id + '.glb');
    writeFileSync(cru, await engine.baixar(glb));
    const m = desc.medidas_m;
    const relatorio = await limpeza.limpar(cru, pronto, m, correcaoPara(desc.categoria, desc.origem_medidas));
    const item = galeria.salvar({ buffer: readFileSync(pronto), ext: 'glb', tipo: '3d', params: {
      modelo: 'trellis2', pedido, prompt, semente: base, cor, previa: imagem.id, ...(lote ? { lote } : {}),
      vocab: { en: desc.nome_en, pt: desc.nome_pt, categoria: desc.categoria, medidas_m: m }, origem_medidas: desc.origem_medidas,
      tamanho: desc.tamanho, faces: relatorio.faces, tamanho_m: relatorio.tamanho_m, bytes: relatorio.bytes, estilo: 'englishquest',
    } });
    job.itens.push(item);
    for (const f of [cru, pronto]) { try { unlinkSync(f); } catch { /* já foi */ } }
    job.etapa = null;
  });
}

// Quem ocupa a placa e a RAM antes de gerar 3D (Elara, Ollama, outros) e o botão de liberar.
rota('GET', '/api/recursos', async (req, res) => {
  const m = await engine.estado();
  const motorGB = m.vram?.motorGiB || 0;   // mesma unidade do nvidia-smi (GiB)
  json(res, await estadoRecursos({ motorGB, ocupado: rodando || fila.length > 0 }));
});

rota('POST', '/api/recursos/liberar', async (req, res) => {
  const b = await lerJson(req);
  if (rodando || fila.length) return json(res, { erro: 'Espere a fila terminar: o próprio Prisma usa o Ollama entre as etapas.' }, 409);
  await descarregarOllama();
  const fechados = b.elara === true ? await fecharElara() : 0;
  json(res, { ok: true, elaraFechada: fechados });
});

// Tela de revisão: o qwen sugere nome em inglês, em português e medidas (a tabela padrão vence quando o nome bate);
// você corrige e só então o modelo vai para a fila. Leva uns 10 a 30 s (o qwen carrega na placa e sai logo depois).
rota('POST', '/api/3d/descrever', async (req, res) => {
  const b = await lerJson(req);
  const pedido = texto(b.pedido, 300);
  if (!pedido) return json(res, { erro: 'Descreva o objeto.' }, 400);
  try { json(res, { pedido, desc: await descritor.descrever(pedido) }); } catch (e) { json(res, { erro: e.message }, 503); }
});

rota('POST', '/api/3d/lote/descrever', async (req, res) => {
  const b = await lerJson(req);
  const { contexto, itens, cortados } = lerLote(texto(b.lista, 3000));
  if (!itens.length) return json(res, { erro: 'Escreva a lista de objetos, separados por vírgula.' }, 400);
  try {
    const lista = [];   // um de cada vez, com o qwen na placa até o último (descarrega no fim)
    for (const [i, item] of itens.entries()) lista.push({ pedido: item, desc: await descritor.descrever(pedidoDoLote(item, contexto), { descarregar: i === itens.length - 1 }) });
    json(res, { contexto, itens: lista, cortados });
  } catch (e) { await descritor.descarregar(); json(res, { erro: e.message }, 503); }
});

const revisao = (r) => (r && typeof r === 'object' ? {
  nome_en: texto(r.nome_en, 60), nome_pt: texto(r.nome_pt, 60), categoria: texto(r.categoria, 20), descricao_en: texto(r.descricao_en, 400),
  medidas_m: { largura: r.medidas_m?.largura, profundidade: r.medidas_m?.profundidade, altura: r.medidas_m?.altura },
} : null);

rota('POST', '/api/3d', async (req, res) => {
  const b = await lerJson(req);
  const pedido = texto(b.pedido, 300);
  if (!pedido) return json(res, { erro: 'Descreva o objeto.' }, 400);
  const cor = b.cor === 'vertices' ? 'vertices' : 'textura';
  const r = revisao(b.revisado);
  if (r && (!r.nome_en || !r.nome_pt)) return json(res, { erro: 'Preencha o nome em inglês e em português.' }, 400);
  const t = criar3d({ pedido, cor, semente: semente(b.semente), revisado: r });
  json(res, { trabalhos: [t.id] });
});

// Lote: "loja de pets: cachorro, gato, aquário" vira um trabalho por objeto, todos na mesma fila.
rota('POST', '/api/3d/lote', async (req, res) => {
  const b = await lerJson(req);
  const cor = b.cor === 'vertices' ? 'vertices' : 'textura';
  const base = semente(b.semente);
  // já revisados na tela (lista de {pedido, revisado}) ou só o texto da lista (o qwen descreve cada um na fila)
  if (Array.isArray(b.itens)) {
    const itens = b.itens.slice(0, LOTE_MAX).map((x) => ({ pedido: texto(x.pedido, 120), revisado: revisao(x.revisado) })).filter((x) => x.pedido);
    if (!itens.length) return json(res, { erro: 'A lista está vazia.' }, 400);
    if (itens.some((x) => !x.revisado?.nome_en || !x.revisado?.nome_pt)) return json(res, { erro: 'Preencha o nome em inglês e em português de todos.' }, 400);
    const contexto = texto(b.contexto, 80);
    const trabalhos = itens.map((x, i) => criar3d({ pedido: x.pedido, cor, semente: base + i * 7, lote: contexto, revisado: x.revisado }).id);
    return json(res, { trabalhos, contexto, itens: itens.map((x) => x.pedido), cortados: 0 });
  }
  const { contexto, itens, cortados } = lerLote(texto(b.lista, 3000));
  if (!itens.length) return json(res, { erro: 'Escreva a lista de objetos, separados por vírgula.' }, 400);
  const trabalhos = itens.map((item, i) => criar3d({ pedido: item, cor, semente: base + i * 7, lote: contexto }).id);
  json(res, { trabalhos, contexto, itens, cortados });
});

// Textura sem emenda (tijolo, reboco, madeira, piso) para montar fachadas por peças: FLUX -> desloca meia volta (Godot) ->
// o FLUX repinta só a emenda (cruz no meio) -> mede a emenda que sobrou.
const SUFIXO_TEXTURA = 'seamless tileable texture, stylized hand painted game texture, flat front orthographic view, even flat lighting, no shadows, no perspective, no objects, pattern fills the whole frame edge to edge';
function criarTextura({ prompt, semente: base }) {
  return criarTrabalho('textura', prompt.slice(0, 80), async (job) => {
    job.itens.push(await texturaSemEmenda(job, prompt, base, 'prisma_' + job.id));
    job.etapa = null;
  });
}

async function texturaSemEmenda(job, prompt, base, prefixo) {
  const completo = `${prompt.replace(/[.,\s]+$/, '')}, ${SUFIXO_TEXTURA}`;
  job.etapa = `Desenhando a textura (FLUX): ${prompt.slice(0, 40)}…`;
  const [bruta] = await engine.executar(wf.flux({ prompt: completo, largura: 1024, altura: 1024, passos: 4, semente: base, prefixo }));
  const pasta = join(RAIZ, 'tmp', 'texturas'); mkdirSync(pasta, { recursive: true });
  const arq = (n) => join(pasta, `${prefixo}_${n}.png`);
  writeFileSync(arq('bruta'), await engine.baixar(bruta));
  const antes = await limpeza.medirEmenda(arq('bruta'));
  let costurada = false;
  if (precisaCostura(antes.emenda_relativa)) {          // a emenda aparece: o FLUX repinta só a cruz do meio
    job.etapa = 'Tirando a emenda…';
    await limpeza.prepararLadrilho(arq('bruta'), arq('deslocada'), arq('mascara'), 1024);
    const img = await engine.enviarImagem(readFileSync(arq('deslocada')), prefixo + '_d.png');
    const masc = await engine.enviarImagem(readFileSync(arq('mascara')), prefixo + '_m.png');
    const [pronta] = await engine.executar(wf.fluxCostura({ imagem: img, mascara: masc, prompt: completo, semente: base + 1, prefixo }));
    writeFileSync(arq('pronta'), await engine.baixar(pronta));
    costurada = true;
  } else {
    writeFileSync(arq('pronta'), readFileSync(arq('bruta')));   // já repete sem salto (reboco liso): repintar só estragaria
  }
  const depois = await limpeza.medirEmenda(arq('pronta'));
  const item = galeria.salvar({ buffer: readFileSync(arq('pronta')), ext: 'png', tipo: 'textura', params: {
    modelo: 'flux', prompt: completo, promptOriginal: prompt, semente: base, semEmenda: true, costurada,
    emenda_relativa_antes: antes.emenda_relativa, emenda_relativa: depois.emenda_relativa } });
  for (const n of ['bruta', 'deslocada', 'mascara', 'pronta']) { try { unlinkSync(arq(n)); } catch { /* já foi */ } }
  return item;
}

// Criar fachada (método B): o qwen planeja materiais e cores pelo tipo de loja e pela marca, o FLUX faz 4 texturas sem
// emenda e o letreiro com a marca, e o Godot monta a loja por peças (porta de verdade, colisão) num .glb leve.
// `revisado`: o plano que você conferiu na tela de revisão (nome da loja em inglês/português, tamanho, materiais).
function criarFachada({ tipo, marca, detalhes, cor, semente: base, revisado = null }) {
  return criarTrabalho('3d', `Fachada: ${marca} (${tipo})`.slice(0, 80), async (job) => {
    job.etapa = 'Planejando materiais e cores (qwen)…';
    const plano = revisado ? normalizarFachada(revisado, tipo, marca) : await descritor.planejarFachada(tipo, marca);
    const prefixo = 'prisma_' + job.id;
    const texturas = {};
    const texturasIds = {};
    const slots = [['tijolo', plano.parede], ['reboco', plano.lateral], ['madeira', plano.madeira], ['piso', plano.piso]];
    for (const [i, [slot, prompt]] of slots.entries()) {
      if (job.cancelado) return;
      const item = await texturaSemEmenda(job, prompt, base + i * 11, `${prefixo}_${slot}`);
      job.itens.push(item);
      texturas[slot] = galeria.caminho(item.id);
      texturasIds[slot] = item.id;
      job.progresso = (i + 1) / 6;
    }
    // 3 variações do letreiro (o FLUX às vezes erra uma letra): a loja sai com a 1ª e você troca no visualizador
    const promptSign = promptLetreiro(plano);
    const letreiros = [];
    for (let v = 0; v < LETREIROS; v++) {
      if (job.cancelado) return;
      job.etapa = `Escrevendo o letreiro (FLUX), variação ${v + 1} de ${LETREIROS}…`;
      const [sinal] = await engine.executar(wf.flux({ prompt: promptSign, largura: 1344, altura: 768, passos: 4, semente: base + 99 + v, prefixo: `${prefixo}_l${v}` }));
      letreiros.push((await guardar(job, sinal, 'imagem', { modelo: 'flux', prompt: promptSign, semente: base + 99 + v, para3d: true, letreiro: v + 1 }, 'png')).id);
    }
    await engine.liberar();
    job.etapa = 'Montando a loja por peças (Godot)…';
    const r = await montarFachada(job.id, plano, texturas, galeria.caminho(letreiros[0]));
    const item = galeria.salvar({ buffer: r.buffer, ext: 'glb', tipo: '3d', params: {
      modelo: 'fachada', pedido: `${tipo}: ${marca}`, fachada: plano, previa: letreiros[0], letreiros, letreiro_escolhido: 0, texturas: texturasIds, semente: base,
      vocab: { en: plano.tipo_en, pt: plano.tipo_pt, categoria: 'building', medidas_m: { largura: r.tamanho_m[0], profundidade: r.tamanho_m[2], altura: r.tamanho_m[1] } },
      origem_medidas: revisado ? 'revisao' : 'qwen',
      tamanho: 'fachada', faces: r.faces, tamanho_m: r.tamanho_m, bytes: r.bytes, colisoes: r.colisoes, cor: 'textura', estilo: 'englishquest',
    } });
    job.itens.push(item);
    job.etapa = null;
    // detalhes da calçada (TRELLIS.2): entram na fila depois, um modelo por objeto, com a loja como cenário
    if (detalhes) for (const [i, d] of plano.detalhes.entries()) criar3d({ pedido: d, cor, semente: base + 200 + i, lote: `${plano.tipo_pt} ${plano.marca}` });
  });
}

const LETREIROS = 3;

// Monta a loja no Godot (fachada_exportar.gd) e devolve o .glb e as medidas.
async function montarFachada(id, plano, texturas, letreiro) {
  const pasta = join(RAIZ, 'tmp', '3d'); mkdirSync(pasta, { recursive: true });
  const cfg = join(pasta, id + '_fachada.json'); const saida = join(pasta, id + '_fachada.glb');
  writeFileSync(cfg, JSON.stringify(configFachada(plano, texturas, letreiro)));
  try {
    const r = await limpeza.rodar('fachada_exportar.gd', [cfg, saida]);
    return { ...r, buffer: readFileSync(saida) };
  } finally { for (const f of [cfg, saida]) { try { unlinkSync(f); } catch { /* já foi */ } } }
}

// Tela de revisão da fachada: o qwen sugere o plano (nomes, tamanho, materiais, cores, detalhes) e você corrige antes.
rota('POST', '/api/fachada/planejar', async (req, res) => {
  const b = await lerJson(req);
  const tipo = texto(b.tipo, 60);
  const marca = marcaLimpa(b.marca);
  if (!tipo || !marca) return json(res, { erro: 'Escreva o tipo de loja e o nome da marca.' }, 400);
  try { json(res, { plano: await descritor.planejarFachada(tipo, marca) }); } catch (e) { json(res, { erro: e.message }, 503); }
});

rota('POST', '/api/fachada', async (req, res) => {
  const b = await lerJson(req);
  const tipo = texto(b.tipo, 60);
  const marca = marcaLimpa(b.marca);
  if (!tipo || !marca) return json(res, { erro: 'Escreva o tipo de loja e o nome da marca.' }, 400);
  const revisado = b.plano && typeof b.plano === 'object' ? b.plano : null;
  if (revisado && (!texto(revisado.tipo_en, 40) || !texto(revisado.tipo_pt, 40))) return json(res, { erro: 'Preencha o nome da loja em inglês e em português.' }, 400);
  const t = criarFachada({ tipo, marca, detalhes: b.detalhes !== false, cor: b.cor === 'vertices' ? 'vertices' : 'textura', semente: semente(b.semente), revisado });
  json(res, { trabalhos: [t.id] });
});

// Trocar o letreiro de uma fachada pronta por outra das 3 variações: só remonta no Godot (segundos), sem FLUX nem TRELLIS.2.
rota('POST', '/api/galeria/:id/letreiro', async (req, res, p) => {
  const item = galeria.obter(p.id);
  const b = await lerJson(req);
  const pr = item?.params || {};
  const i = Math.floor(Number(b.indice));
  if (!item || pr.modelo !== 'fachada' || !Array.isArray(pr.letreiros)) return json(res, { erro: 'Esta não é uma fachada com variações de letreiro.' }, 400);
  if (!(i >= 0 && i < pr.letreiros.length)) return json(res, { erro: 'Variação inválida.' }, 400);
  const texturas = Object.fromEntries(Object.entries(pr.texturas || {}).map(([slot, id]) => [slot, galeria.caminho(id)]).filter(([, c]) => c));
  try {
    const r = await montarFachada(item.id + '_l' + i, pr.fachada, texturas, galeria.caminho(pr.letreiros[i]));
    json(res, galeria.atualizar(item.id, r.buffer, { letreiro_escolhido: i, previa: pr.letreiros[i], faces: r.faces, bytes: r.bytes, tamanho_m: r.tamanho_m }));
  } catch (e) { json(res, { erro: e.message }, 500); }
});

rota('POST', '/api/textura', async (req, res) => {
  const b = await lerJson(req);
  const prompt = texto(b.prompt, 600);
  if (!prompt) return json(res, { erro: 'Descreva a textura.' }, 400);
  json(res, { trabalhos: [criarTextura({ prompt, semente: semente(b.semente) }).id] });
});

rota('POST', '/api/galeria/:id/exportar', async (req, res, p) => {
  const item = galeria.obter(p.id);
  if (!item) return json(res, { erro: 'Item não encontrado.' }, 404);
  try { json(res, exportador.exportar(item, galeria.caminho(p.id))); } catch (e) { json(res, { erro: e.message }, 400); }
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

// Se a janela do app for fechada, ninguém mais manda sinal de vida: desliga o motor e libera a placa de vídeo (regras em lib/vigia.mjs).
setInterval(() => { if (deveEncerrar({ recebeuPing, ultimoPing, ocupado: rodando || fila.length > 0 })) encerrar(); }, 5000);
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('exit', () => { tradutor.desligar(); engine.parar(); });

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Prisma Studio em http://127.0.0.1:${PORTA}`);
  engine.iniciar().catch((e) => console.error('motor:', e.message));
});
