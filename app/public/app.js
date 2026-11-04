// Prisma Studio: interface. Sem bibliotecas; fala só com o servidor local (/api).
const $ = (s, r = document) => r.querySelector(s);

function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
  return dados;
}
const postar = (url, corpo) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });

let avisoTimer = null;
function aviso(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg; el.className = 'aviso' + (erro ? ' erro' : ''); el.hidden = false;
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { el.hidden = true; }, erro ? 7000 : 3500);
}

// ---------------------------------------------------------------- memória das telas
const FORMATOS_IMAGEM = { '1:1': [1024, 1024], '3:4': [896, 1152], '4:3': [1152, 896], '16:9': [1344, 768], '9:16': [768, 1344] };
const FORMATOS_VIDEO = {
  ltx: { paisagem: [704, 480], retrato: [480, 704], quadrado: [576, 576] },
  wan: { paisagem: [640, 384], retrato: [384, 640] },
};
const DURACOES = { ltx: [[25, '1 s'], [49, '2 s'], [73, '3 s'], [97, '4 s']], wan: [[17, '1 s'], [33, '2 s'], [49, '3 s']] };

const guardado = (() => { try { return JSON.parse(localStorage.getItem('prisma-form') || '{}'); } catch { return {}; } })();
const form = {
  criar: { modelo: 'sdxl', prompt: '', negativo: '', formato: '1:1', quantidade: 1, passos: '', cfg: '', semente: '', ...guardado.criar },
  video: { modelo: 'ltx', prompt: '', formato: 'paisagem', quadros: 49, passos: '', semente: '', ...guardado.video },
  '3d': { pedido: '', cor: 'textura', semente: '', ...guardado['3d'] },
};
const salvarForm = () => { try { localStorage.setItem('prisma-form', JSON.stringify(form)); } catch { /* sem armazenamento */ } };

const sessao = { criar: [], video: [], '3d': [], fundo: { origem: null, entrada: null, cor: 'xadrez' }, ampliar: { origem: null, entrada: null, fator: 4 } };
const estado = { vista: 'criar', status: null, catalogo: null, galeria: [] };

// ---------------------------------------------------------------- trabalhos
const ativos = new Set();
let ticando = false;

function acompanhar(entrada, jobId) {
  Object.assign(entrada, { jobId, estado: 'na fila', progresso: 0, passo: 0, total: 0, itens: [], erro: null });
  ativos.add(entrada);
  if (!ticando) tique();
}

async function tique() {
  ticando = true;
  while (ativos.size) {
    for (const e of [...ativos]) {
      try {
        const t = await api('/api/trabalhos/' + e.jobId);
        Object.assign(e, { estado: t.estado, etapa: t.etapa, progresso: t.progresso, passo: t.passo, total: t.total, itens: t.itens, erro: t.erro });
        if (['pronto', 'erro', 'cancelado'].includes(t.estado)) {
          ativos.delete(e);
          e.nos = null;
          if (t.estado === 'erro') aviso(t.erro || 'Algo deu errado.', true);
        }
      } catch { ativos.delete(e); e.estado = 'erro'; e.erro = 'Perdi contato com o app.'; }
    }
    atualizarResultados();
    await new Promise((r) => setTimeout(r, 800));
  }
  ticando = false;
  atualizarResultados();
}

function atualizarResultados() {
  const v = estado.vista;
  if (v === 'criar' || v === 'video' || v === '3d') montarGrade($('#resultados'), sessao[v]);
  else if (v === 'fundo' || v === 'ampliar') montarEdicao();
}

// ---------------------------------------------------------------- peças
const ROTULOS = { imagem: 'Imagem', video: 'Vídeo', fundo: 'Sem fundo', ampliada: 'Ampliada', '3d': '3D', textura: 'Textura' };

function cartaoEspera(e) {
  const texto = e.estado === 'erro' ? (e.erro || 'Erro') : e.estado === 'cancelado' ? 'Cancelado'
    : e.estado === 'na fila' ? 'Na fila…' : e.etapa ? e.etapa : e.total ? `Gerando… passo ${e.passo} de ${e.total}` : 'Preparando…';
  const barra = h('i'); barra.style.width = Math.round((e.progresso || 0) * 100) + '%';
  return h('div', { class: 'item espera' + (['erro', 'cancelado'].includes(e.estado) ? ' erro' : '') },
    h('div', {}, texto),
    ['na fila', 'executando'].includes(e.estado) ? h('div', { class: 'barra' }, barra) : null,
    ['na fila', 'executando'].includes(e.estado)
      ? h('button', { class: 'secundario', on: { click: () => postar(`/api/trabalhos/${e.jobId}/cancelar`).catch(() => {}) } }, 'Cancelar') : null,
    e.estado === 'erro' || e.estado === 'cancelado' ? h('button', { class: 'secundario', on: { click: () => { for (const lista of [sessao.criar, sessao.video, sessao['3d']]) { const i = lista.indexOf(e); if (i >= 0) lista.splice(i, 1); } atualizarResultados(); } } }, 'Remover') : null,
  );
}

function midia(item) {
  const url = `/api/galeria/${item.id}/arquivo`;
  if (item.tipo === '3d') {          // na grade, a imagem que deu origem ao modelo (leve); o 3D abre no visualizador
    const v = item.params?.vocab;
    return h('div', { class: 'capa3d' }, item.params?.previa ? h('img', { src: `/api/galeria/${item.params.previa}/arquivo`, loading: 'lazy', alt: v?.en || '3D' }) : null,
      v ? h('span', { class: 'nome3d' }, v.en, h('small', {}, v.pt)) : null);
  }
  return item.tipo === 'video'
    ? h('video', { src: url, muted: true, loop: true, autoplay: true, playsInline: true })
    : h('img', { src: url, loading: 'lazy', alt: item.params?.prompt || ROTULOS[item.tipo] });
}

function cartaoItem(item, aoMudar) {
  const coracao = h('button', { class: 'coracao' + (item.favorita ? ' on' : ''), title: 'Favoritar', on: { click: async (ev) => {
    ev.stopPropagation();
    const novo = await api('/api/galeria/' + item.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorita: !item.favorita }) });
    item.favorita = novo.favorita; coracao.classList.toggle('on', item.favorita); aoMudar?.();
  } } }, '♥');
  const no = h('div', { class: 'item' + (item.tipo === 'fundo' ? ' xadrez' : ''), on: { click: () => abrirLuz(item, aoMudar) } },
    midia(item), h('span', { class: 'selo' }, ROTULOS[item.tipo] || item.tipo), coracao);
  return no;
}

function montarGrade(alvo, entradas) {
  if (!alvo) return;
  alvo.replaceChildren();
  if (!entradas.length) { alvo.append(h('div', { class: 'vazio' }, 'Os resultados aparecem aqui. Escreva o que você quer ver e clique em gerar.')); return; }
  const grade = h('div', { class: 'grade' });
  for (const e of entradas) {
    if (e.estado === 'pronto') { if (!e.nos) e.nos = e.itens.map((i) => cartaoItem(i)); grade.append(...e.nos); }
    else grade.append(cartaoEspera(e));
  }
  alvo.append(grade);
}

// ---------------------------------------------------------------- visualizador
function abrirLuz(item, aoMudar) {
  const luz = $('#luz');
  const fechar = () => { luz.hidden = true; luz.replaceChildren(); document.removeEventListener('keydown', teclas); aoMudar?.(); };
  const teclas = (ev) => { if (ev.key === 'Escape') fechar(); };
  document.addEventListener('keydown', teclas);
  const p = item.params || {};
  const linhas = [];
  const par = (k, v) => { if (v !== undefined && v !== '' && v !== null) linhas.push(h('dt', {}, k), h('dd', {}, String(v))); };
  par('Tipo', ROTULOS[item.tipo]); par('Modelo', p.modelo); par('Tamanho', p.largura ? `${p.largura}×${p.altura}` : null);
  par('Passos', p.passos); par('Guia (cfg)', p.cfg); par('Semente', p.semente); par('Quadros', p.quadros); par('Fator', p.fator ? p.fator + '×' : null);
  if (item.tipo === '3d') {
    const v = p.vocab || {};
    const m = v.medidas_m;
    par('Inglês', v.en); par('Português', v.pt); par('Categoria', v.categoria);
    par('Medidas reais', m ? `${m.largura} × ${m.profundidade} × ${m.altura} m (L × P × A)` : null);
    par('Peso', p.tamanho ? `${p.tamanho} · ${Number(p.faces).toLocaleString('pt-BR')} faces` : null);
    par('Arquivo', p.bytes ? `${(p.bytes / 1024 / 1024).toFixed(1)} MB` : null);
    par('Cor', p.cor === 'vertices' ? 'por vértice' : 'textura');
    par('Cenário', p.lote);
    par('Medidas', { tabela: 'tabela padrão', revisao: 'conferidas por você', qwen: 'sugeridas pelo qwen' }[p.origem_medidas]);
  }
  par('Criada em', new Date(item.criadoEm).toLocaleString('pt-BR'));
  // o arquivo pode ter sido trocado (fachada com outro letreiro): a versão no endereço evita o cache antigo
  const url = `/api/galeria/${item.id}/arquivo${item.atualizadoEm ? '?v=' + encodeURIComponent(item.atualizadoEm) : ''}`;
  const acao = (rotulo, fn, extra = '') => h('button', { class: 'secundario ' + extra, on: { click: fn } }, rotulo);
  const ehImagem = item.tipo !== 'video' && item.tipo !== '3d';
  const botoes = [
    h('a', { class: 'secundario', href: url, download: `prisma-${item.id}.${item.arquivo.split('.').pop()}`, style: 'text-decoration:none;text-align:center' }, 'Baixar'),
    acao(item.favorita ? '♥ Favorita' : '♡ Favoritar', async (ev) => {
      const novo = await api('/api/galeria/' + item.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorita: !item.favorita }) });
      item.favorita = novo.favorita; ev.target.textContent = item.favorita ? '♥ Favorita' : '♡ Favoritar';
    }),
  ];
  if (item.tipo === '3d') {
    botoes.unshift(acao('Exportar para o EnglishQuest', async (ev) => {
      const b = ev.target; b.disabled = true;
      try { const r = await postar(`/api/galeria/${item.id}/exportar`); aviso(`Exportado: assets/prisma/${r.nome}.glb e ${r.nome}.json`); b.textContent = '✓ Exportado'; }
      catch (e) { aviso(e.message, true); b.disabled = false; }
    }, 'destaque'));
  }
  if (['imagem', 'video', '3d'].includes(item.tipo) && !p.para3d) botoes.push(acao('Usar de novo', () => { reutilizar(item); fechar(); }));
  if (ehImagem) {
    botoes.push(acao('Remover fundo', () => { fechar(); irPara('fundo', { galeriaId: item.id }); }));
    botoes.push(acao('Ampliar', () => { fechar(); irPara('ampliar', { galeriaId: item.id }); }));
    botoes.push(acao('Animar (imagem para vídeo)', () => { fechar(); form.video.origem = { galeriaId: item.id }; form.video.modelo = 'ltx'; irPara('video'); }));
  }
  botoes.push(acao('Excluir', async () => {
    if (!confirm('Excluir este arquivo da galeria? Não dá para desfazer.')) return;
    await api('/api/galeria/' + item.id, { method: 'DELETE' });
    for (const lista of [sessao.criar, sessao.video, sessao['3d']]) for (const e of lista) if (e.itens) e.itens = e.itens.filter((i) => i.id !== item.id), e.nos = null;
    fechar(); if (estado.vista === 'galeria') renderGaleria(); else atualizarResultados();
  }, 'perigo'));
  luz.hidden = false;
  luz.replaceChildren(
    h('button', { class: 'fechar', on: { click: fechar }, title: 'Fechar (Esc)' }, '✕'),
    h('div', { class: 'palco' + (item.tipo === 'fundo' ? ' xadrez' : ''), on: { click: (ev) => { if (ev.target.classList.contains('palco')) fechar(); } } },
      item.tipo === 'video' ? h('video', { src: url, controls: true, autoplay: true, loop: true })
        : item.tipo === '3d' ? h('model-viewer', { src: url, 'camera-controls': true, 'auto-rotate': true, 'shadow-intensity': '1', exposure: '1.1', 'environment-image': 'neutral', 'interaction-prompt': 'none', alt: p.vocab?.en || 'modelo 3D' })
          : h('img', { src: url, alt: p.prompt || '' })),
    h('aside', {}, h('h2', { style: 'margin:0' }, item.tipo === '3d' && p.vocab ? p.vocab.en : ROTULOS[item.tipo] || 'Arquivo'),
      p.pedido ? h('p', {}, h('b', {}, 'Seu pedido: '), p.pedido) : null,
      p.promptOriginal ? h('p', {}, h('b', {}, 'Seu texto: '), p.promptOriginal) : null,
      p.prompt ? h('p', {}, p.promptOriginal ? h('b', {}, 'Prompt usado (inglês): ') : null, p.prompt) : null,
      h('dl', {}, ...linhas), escolhaLetreiro(item, () => { fechar(); abrirLuz(galeriaItem(item.id) || item, aoMudar); }),
      h('div', { class: 'barra-acoes', style: 'flex-direction:column' }, ...botoes)),
  );
}

// Fachada: as 3 variações do letreiro que o FLUX fez; clicar remonta a loja com a escolhida (segundos, só no Godot).
const itensAtualizados = new Map();
const galeriaItem = (id) => itensAtualizados.get(id);
function escolhaLetreiro(item, reabrir) {
  const p = item.params || {};
  if (p.modelo !== 'fachada' || !Array.isArray(p.letreiros)) return null;
  const escolhido = p.letreiro_escolhido || 0;
  return h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Letreiro (escolha o que saiu escrito certo)'),
    h('div', { class: 'letreiros' }, ...p.letreiros.map((id, i) => h('button', {
      class: 'letreiro' + (i === escolhido ? ' on' : ''), type: 'button', title: i === escolhido ? 'Em uso' : 'Usar este letreiro',
      on: { click: async (ev) => {
        if (i === escolhido) return;
        ev.currentTarget.disabled = true;
        try { const novo = await postar(`/api/galeria/${item.id}/letreiro`, { indice: i }); itensAtualizados.set(item.id, novo); aviso('Letreiro trocado: a loja foi montada de novo.'); reabrir(); }
        catch (e) { aviso(e.message, true); ev.currentTarget.disabled = false; }
      } },
    }, h('img', { src: `/api/galeria/${id}/arquivo`, alt: `variação ${i + 1}` }), h('span', {}, i === escolhido ? 'em uso' : `variação ${i + 1}`)))));
}

function reutilizar(item) {
  const p = item.params || {};
  if (item.tipo === '3d' && p.fachada) { Object.assign(form['3d'], { modo: 'fachada', tipo: p.fachada.tipo_pt, marca: p.fachada.marca, semente: '' }); irPara('3d'); return; }
  if (item.tipo === '3d') { Object.assign(form['3d'], { modo: 'um', pedido: p.pedido || '', cor: p.cor || 'textura', semente: p.semente ?? '' }); irPara('3d'); return; }
  if (item.tipo === 'imagem') {
    Object.assign(form.criar, { modelo: p.modelo, prompt: p.promptOriginal || p.prompt, negativo: p.negativo || '', passos: p.passos, cfg: p.cfg, semente: p.semente, quantidade: 1 });
    const f = Object.entries(FORMATOS_IMAGEM).find(([, d]) => d[0] === p.largura && d[1] === p.altura);
    if (f) form.criar.formato = f[0];
    irPara('criar');
  } else {
    Object.assign(form.video, { modelo: p.modelo, prompt: p.promptOriginal || p.prompt, passos: p.passos, semente: p.semente, quadros: p.quadros, origem: null });
    const f = Object.entries(FORMATOS_VIDEO[p.modelo] || {}).find(([, d]) => d[0] === p.largura && d[1] === p.altura);
    if (f) form.video.formato = f[0];
    irPara('video');
  }
}

// ---------------------------------------------------------------- campo de descrição (com tradução e estilos)
const ESTILOS = [
  ['Fotográfico', 'photorealistic, high detail, sharp focus'], ['Cinematográfico', 'cinematic lighting, film still, dramatic atmosphere'],
  ['Ilustração', 'digital illustration, highly detailed'], ['Anime', 'anime style, vibrant colors'],
  ['Pintura a óleo', 'oil painting, textured brush strokes'], ['Render 3D', '3d render, soft studio lighting'], ['Aquarela', 'watercolor painting, soft washes'],
];

function campoDescricao(f, rotulo, placeholder, linhas) {
  const area = h('textarea', { rows: linhas, placeholder, value: f.prompt, on: { input: (e) => { f.prompt = e.target.value; salvarForm(); } } });
  const nota = h('div', { class: 'dica' });
  const traduzirBtn = h('button', { class: 'secundario', type: 'button', style: 'flex:none;padding:6px 12px;font-size:12px', on: { click: async () => {
    if (!f.prompt.trim()) return;
    traduzirBtn.disabled = true; traduzirBtn.textContent = 'Traduzindo…';
    try {
      const r = await postar('/api/traduzir', { textos: [f.prompt] });
      f.prompt = r.traducoes[0]; area.value = f.prompt; salvarForm();
      nota.textContent = 'Traduzido. Revise o texto em inglês e ajuste se quiser.';
    } catch (e) { nota.textContent = e.message; } finally { traduzirBtn.disabled = false; traduzirBtn.textContent = 'Traduzir e revisar'; }
  } } }, 'Traduzir e revisar');
  const auto = h('label', { class: 'marca-check' }, h('input', { type: 'checkbox', checked: f.traduzir !== false, on: { change: (e) => { f.traduzir = e.target.checked; salvarForm(); } } }), 'Traduzir do português ao gerar');
  const estilos = h('div', { class: 'fichas', style: 'margin-top:8px' }, ...ESTILOS.map(([nome, texto]) => h('button', { class: 'ficha', type: 'button', title: texto, on: { click: () => {
    if (f.prompt.includes(texto)) return;
    f.prompt = (f.prompt.trim() ? f.prompt.trim().replace(/[,.]$/, '') + ', ' : '') + texto; area.value = f.prompt; salvarForm();
  } } }, nome)));
  return h('div', { class: 'campo' }, h('label', {}, rotulo), area,
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px' }, auto, traduzirBtn), estilos, nota,
    h('div', { class: 'dica' }, 'Pode escrever em português: o Prisma traduz para o inglês, que os modelos entendem melhor.'));
}

// ---------------------------------------------------------------- vista: criar imagem
function fichas(opcoes, atual, aoEscolher) {
  const alvo = h('div', { class: 'fichas' });
  const pintar = (valor) => { alvo.replaceChildren(...opcoes.map(([v, r]) => h('button', { class: 'ficha' + (String(v) === String(valor) ? ' on' : ''), type: 'button', on: { click: () => { aoEscolher(v); pintar(v); } } }, r))); };
  pintar(atual);
  return alvo;
}

function seletorModelos(catalogo, atual, aoEscolher, disponiveis) {
  const alvo = h('div', { class: 'modelos' });
  const pintar = (valor) => {
    alvo.replaceChildren(...Object.values(catalogo).map((m) => h('button', {
      class: 'modelo' + (m.id === valor ? ' on' : ''), type: 'button', disabled: disponiveis && disponiveis[m.id] === false,
      title: disponiveis && disponiveis[m.id] === false ? (m.online ? 'Cadastre a chave na aba IA online.' : 'Os arquivos deste modelo não estão no computador.') : '',
      on: { click: () => { aoEscolher(m.id); pintar(m.id); } },
    }, h('strong', {}, m.nome), h('span', {}, m.descricao))));
  };
  pintar(atual);
  return alvo;
}

function renderCriar() {
  const f = form.criar;
  const cat = estado.catalogo.imagem;
  const raiz = h('div', {});
  const campoNeg = h('div', { class: 'campo' }, h('label', {}, 'O que evitar (opcional)'),
    h('textarea', { rows: 2, placeholder: 'Ex.: borrado, mãos deformadas, texto na imagem', value: f.negativo, on: { input: (e) => { f.negativo = e.target.value; salvarForm(); } } }));
  const dicaModelo = h('div', { class: 'dica' });
  const avancado = h('details', {}, h('summary', {}, 'Ajustes avançados'),
    h('div', { class: 'linha' },
      h('div', { class: 'campo' }, h('label', {}, 'Passos'), h('input', { type: 'number', min: 1, max: 60, placeholder: 'automático', value: f.passos, on: { input: (e) => { f.passos = e.target.value; salvarForm(); } } })),
      h('div', { class: 'campo' }, h('label', {}, 'Guia (cfg)'), h('input', { type: 'number', min: 1, max: 20, step: 0.5, placeholder: 'automático', value: f.cfg, on: { input: (e) => { f.cfg = e.target.value; salvarForm(); } } }))),
    h('div', { class: 'campo' }, h('label', {}, 'Semente (vazio = aleatória)'), h('input', { type: 'text', inputMode: 'numeric', placeholder: 'aleatória', value: f.semente, on: { input: (e) => { f.semente = e.target.value.replace(/\D/g, ''); salvarForm(); } } })));
  const botao = h('button', { class: 'principal', on: { click: gerar } }, 'Gerar imagem');
  const ajustarModelo = () => { campoNeg.hidden = !cat[f.modelo].negativo; dicaModelo.textContent = cat[f.modelo].online ? 'Modelo na nuvem: o texto vai para a fal.ai e cada imagem é cobrada na sua conta de lá.' : f.modelo === 'flux' ? 'O FLUX entende descrições longas e escreve texto nas imagens. Não usa "o que evitar".' : ''; };
  const painel = h('div', { class: 'cartao' },
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Modelo'), seletorModelos(cat, f.modelo, (id) => { f.modelo = id; salvarForm(); ajustarModelo(); }, estado.status?.modelos), dicaModelo),
    campoDescricao(f, 'Descreva a imagem', 'Ex.: retrato fotográfico de uma astronauta em um campo de lavanda ao pôr do sol, luz suave, 85mm', 5),
    campoNeg,
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Formato'), fichas(Object.keys(FORMATOS_IMAGEM).map((k) => [k, k]), f.formato, (v) => { f.formato = v; salvarForm(); })),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Quantidade'), fichas([1, 2, 3, 4].map((n) => [n, n + (n === 1 ? ' imagem' : '')]), f.quantidade, (v) => { f.quantidade = Number(v); salvarForm(); })),
    avancado, botao);
  ajustarModelo();
  raiz.append(h('h1', {}, 'Criar imagem'), h('p', { class: 'sub' }, 'Descreva o que você imagina. Os modelos locais geram no seu computador, sem enviar nada para a internet; os marcados como online usam a nuvem. Tudo fica salvo na galeria.'),
    h('div', { class: 'vista' }, painel, h('div', { id: 'resultados' })));
  return raiz;

  async function gerar() {
    if (!f.prompt.trim()) return aviso('Escreva o que você quer ver.', true);
    botao.disabled = true;
    try {
      const [largura, altura] = FORMATOS_IMAGEM[f.formato];
      const r = await postar('/api/gerar', { modelo: f.modelo, prompt: f.prompt, negativo: f.negativo, largura, altura, quantidade: f.quantidade,
        traduzir: f.traduzir !== false, passos: f.passos || undefined, cfg: f.cfg || undefined, semente: f.semente === '' ? null : Number(f.semente) });
      for (const id of r.trabalhos) { const e = {}; sessao.criar.unshift(e); acompanhar(e, id); }
      atualizarResultados();
    } catch (e) { aviso(e.message, true); } finally { botao.disabled = false; }
  }
}

// ---------------------------------------------------------------- vista: criar vídeo
function renderVideo() {
  const f = form.video;
  const cat = estado.catalogo.video;
  const raiz = h('div', {});
  const zona = h('div', { class: 'campo' });
  const duracao = h('div', {}); const formato = h('div', {}); const dicaModelo = h('div', { class: 'dica' });
  const pintarOpcoes = () => {
    if (!FORMATOS_VIDEO[f.modelo][f.formato]) f.formato = 'paisagem';
    if (!DURACOES[f.modelo].some(([q]) => q === f.quadros)) f.quadros = DURACOES[f.modelo][1][0];
    formato.replaceChildren(fichas(Object.keys(FORMATOS_VIDEO[f.modelo]).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), f.formato, (v) => { f.formato = v; salvarForm(); }));
    duracao.replaceChildren(fichas(DURACOES[f.modelo].map(([q, r]) => [q, r]), f.quadros, (v) => { f.quadros = Number(v); salvarForm(); }));
    dicaModelo.textContent = f.modelo === 'wan' ? 'O Wan é mais lento (uns 2 minutos) e só faz texto para vídeo.' : 'O LTX leva cerca de 1 minuto para ~2 s de vídeo.';
    pintarOrigem();
  };
  const pintarOrigem = () => {
    zona.replaceChildren(h('label', {}, 'Imagem inicial (opcional, só no LTX)'));
    if (f.modelo !== 'ltx') { zona.append(h('div', { class: 'dica' }, 'Troque para o LTX para animar uma imagem.')); f.origem = null; return; }
    if (f.origem) {
      const src = f.origem.galeriaId ? `/api/galeria/${f.origem.galeriaId}/arquivo` : f.origem.previa;
      zona.append(h('div', { class: 'item', style: 'aspect-ratio:16/9;cursor:default' }, h('img', { src, alt: 'imagem inicial' })),
        h('button', { class: 'secundario', type: 'button', on: { click: () => { f.origem = null; pintarOrigem(); } } }, 'Tirar imagem'));
    } else {
      const entrada = h('input', { type: 'file', accept: 'image/*', hidden: true, on: { change: async (e) => { if (e.target.files[0]) { const o = await enviarEntrada(e.target.files[0]); f.origem = { entradaId: o.entradaId, previa: o.previa }; pintarOrigem(); } } } });
      zona.append(entrada, h('button', { class: 'soltar', type: 'button', on: { click: () => entrada.click() } }, h('b', {}, 'Escolher imagem'), ' para o vídeo começar dela'));
    }
  };
  const botao = h('button', { class: 'principal', on: { click: criar } }, 'Criar vídeo');
  const painel = h('div', { class: 'cartao' },
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Modelo'), seletorModelos(cat, f.modelo, (id) => { f.modelo = id; salvarForm(); pintarOpcoes(); }, estado.status?.modelos), dicaModelo),
    campoDescricao(f, 'Descreva a cena e o movimento', 'Ex.: um cachorro correndo na praia, ondas ao fundo, câmera seguindo, luz natural', 5),
    zona,
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Formato'), formato),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Duração'), duracao),
    h('details', {}, h('summary', {}, 'Ajustes avançados'), h('div', { class: 'campo' }, h('label', {}, 'Semente (vazio = aleatória)'), h('input', { type: 'text', inputMode: 'numeric', value: f.semente, placeholder: 'aleatória', on: { input: (e) => { f.semente = e.target.value.replace(/\D/g, ''); salvarForm(); } } }))),
    botao);
  pintarOpcoes();
  raiz.append(h('h1', {}, 'Criar vídeo'), h('p', { class: 'sub' }, 'Vídeos curtos a partir de uma descrição, ou animando uma imagem sua. Os modelos que cabem na sua placa de vídeo geram clipes de 1 a 4 segundos.'),
    h('div', { class: 'vista' }, painel, h('div', { id: 'resultados' })));
  return raiz;

  async function criar() {
    if (!f.prompt.trim()) return aviso('Descreva a cena e o movimento.', true);
    botao.disabled = true;
    try {
      const [largura, altura] = FORMATOS_VIDEO[f.modelo][f.formato];
      const r = await postar('/api/video', { modelo: f.modelo, prompt: f.prompt, largura, altura, quadros: f.quadros, traduzir: f.traduzir !== false, semente: f.semente === '' ? null : Number(f.semente),
        origem: f.origem ? { galeriaId: f.origem.galeriaId, entradaId: f.origem.entradaId } : null });
      for (const id of r.trabalhos) { const e = {}; sessao.video.unshift(e); acompanhar(e, id); }
      atualizarResultados();
    } catch (e) { aviso(e.message, true); } finally { botao.disabled = false; }
  }
}

// ---------------------------------------------------------------- vista: criar 3D
// usados pela tela de revisão do Criar 3D
const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const CATEG = ['furniture', 'vehicle', 'animal', 'food', 'drink', 'plant', 'clothing', 'tool', 'electronics', 'decoration', 'building', 'object'];
const ORIGEM = { tabela: 'medidas da tabela padrão', qwen: 'medidas sugeridas pelo qwen: confira', revisao: 'medidas conferidas por você' };

function render3d() {
  const f = form['3d'];
  const raiz = h('div', {});
  const pronto = estado.status?.modelos?.['3d'] !== false;
  const lote = () => f.modo === 'lote';
  const fach = () => f.modo === 'fachada';
  const campoTipo = h('input', { type: 'text', placeholder: 'Ex.: café, padaria, loja de pets', value: f.tipo || '', on: { input: (e) => { f.tipo = e.target.value; salvarForm(); fecharRevisao(); } } });
  // o FLUX erra acentos no letreiro ("Pão" sai "Páo"); a cidade é americana, então nomes em inglês sem acento funcionam melhor
  const dicaMarca = h('div', { class: 'dica' });
  const pintarDicaMarca = () => {
    const acento = /[^\x00-\x7f]/.test(f.marca || '');
    dicaMarca.textContent = acento ? 'Atenção: o FLUX costuma errar letras com acento (ã, é, ç) no letreiro. Para uma loja de cidade americana, prefira um nome em inglês sem acento.'
      : 'Invente o nome (nada de marca real). O FLUX escreve no letreiro (3 variações; você escolhe a certa); nomes curtos saem com menos erro.';
    dicaMarca.style.color = acento ? '#eab308' : '';
  };
  const campoMarca = h('input', { type: 'text', maxLength: 28, placeholder: 'Ex.: Hazelbrook Coffee (invente um nome)', value: f.marca || '', on: { input: (e) => { f.marca = e.target.value; salvarForm(); fecharRevisao(); pintarDicaMarca(); } } });
  pintarDicaMarca();
  const campoDetalhes = h('label', { class: 'marca-check' }, h('input', { type: 'checkbox', checked: f.detalhes !== false, on: { change: (e) => { f.detalhes = e.target.checked; salvarForm(); } } }), 'Criar também os detalhes da calçada (mesinhas, vasos, placa) no TRELLIS.2');
  const blocoFachada = h('div', {},
    h('div', { class: 'campo' }, h('label', {}, 'Tipo de loja'), campoTipo),
    h('div', { class: 'campo' }, h('label', {}, 'Nome da marca'), campoMarca, dicaMarca),
    h('div', { class: 'campo' }, campoDetalhes));
  const dicaPeso = h('div', { class: 'dica', style: 'margin:0' });
  const blocoCor = h('div', { class: 'campo' });
  const area = h('textarea', { rows: 3, value: lote() ? (f.lista || '') : f.pedido, on: { input: (e) => { if (lote()) f.lista = e.target.value; else f.pedido = e.target.value; salvarForm(); fecharRevisao(); contar(); } } });
  const rotuloArea = h('label', {});
  const dicaArea = h('div', { class: 'dica' });
  const botao = h('button', { class: 'principal', disabled: !pronto, on: { click: revisar } }, 'Revisar nome e medidas');
  const blocoRevisao = h('div', { class: 'revisao', hidden: true });
  const blocoRecursos = h('div', { class: 'recursos', hidden: true });
  // conta os itens do lote como o servidor conta (vírgula, ponto e vírgula ou linha; "cenário:" no começo)
  const itensLote = (t) => { let s = String(t || ''); const i = s.indexOf(':'); if (i > 0 && i < 60 && !/[,;\n]/.test(s.slice(0, i))) s = s.slice(i + 1); return [...new Set(s.split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]; };
  function contar() {
    if (fach()) { botao.textContent = 'Revisar o plano da loja'; return; }
    if (!lote()) { botao.textContent = 'Revisar nome e medidas'; return; }
    const n = Math.min(20, itensLote(f.lista).length);
    botao.textContent = n > 1 ? `Revisar os ${n} nomes e medidas` : 'Revisar nome e medidas';
    dicaArea.textContent = n ? `${n} ${n === 1 ? 'objeto' : 'objetos'} na fila, um de cada vez (até 20). Cada um leva de 8 a 25 minutos.` : 'Separe os objetos por vírgula. O cenário antes dos dois-pontos ajuda o qwen a acertar o tipo.';
  }
  function pintarModo() {
    fecharRevisao();
    rotuloArea.textContent = lote() ? 'Lista de objetos' : 'O que você quer criar';
    area.placeholder = lote() ? 'Ex.: loja de pets: cachorro, gato, aquário, ração, coleira' : 'Ex.: uma mesa de café redonda de madeira';
    area.value = lote() ? (f.lista || '') : f.pedido;
    dicaArea.textContent = 'Um objeto por vez. Pode escrever em português: o qwen da Elara descreve o objeto com as medidas reais.';
    campoTexto.hidden = fach(); blocoFachada.hidden = !fach(); blocoCor.hidden = fach() && f.detalhes === false;
    dicaPeso.textContent = fach() ? 'Loja montada por peças: ~350 faces e ~1,5 MB, com porta de verdade (dá para entrar) e colisão. Cerca de 8 minutos (os detalhes vão depois, na fila).'
      : 'Automático pelo tamanho real: pequeno ~3 mil faces, médio ~10 mil, grande ou veículo ~30 mil.';
    contar();
  }
  const campoTexto = h('div', { class: 'campo' }, rotuloArea, area, dicaArea);
  blocoCor.append(h('span', { class: 'rotulo' }, 'Cor'),
    fichas([['textura', 'Textura'], ['vertices', 'Cor por vértice']], f.cor, (v) => { f.cor = v; salvarForm(); }),
    h('div', { class: 'dica' }, 'Textura: mais detalhe. Cor por vértice: arquivo menor, cores mais chapadas.'));
  campoDetalhes.querySelector('input').addEventListener('change', pintarModo);
  const painel = h('div', { class: 'cartao' },
    blocoRecursos,
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'O que criar'),
      fichas([['um', 'Um objeto'], ['lote', 'Lista (lote)'], ['fachada', 'Fachada de loja']], f.modo || 'um', (v) => { f.modo = v; salvarForm(); pintarModo(); })),
    campoTexto, blocoFachada, blocoCor,
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Estilo'),
      h('div', { class: 'travado' }, h('b', {}, 'EnglishQuest'), ' · low poly, cores chapadas e foscas, sem texto (combina com os assets do jogo)')),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Peso'), dicaPeso),
    h('details', {}, h('summary', {}, 'Ajustes avançados'), h('div', { class: 'campo' }, h('label', {}, 'Semente (vazio = aleatória)'),
      h('input', { type: 'text', inputMode: 'numeric', value: f.semente, placeholder: 'aleatória', on: { input: (e) => { f.semente = e.target.value.replace(/\D/g, ''); salvarForm(); } } }))),
    botao, blocoRevisao,
    pronto ? h('div', { class: 'dica' }, 'Leva de 8 a 25 minutos por modelo na RTX 2070. Pode deixar vários na fila.')
      : h('div', { class: 'dica', style: 'color:var(--erro)' }, 'Faltam arquivos: TRELLIS.2, FLUX, o Ollama da Elara ou o Godot.'));
  pintarModo();
  verRecursos();
  raiz.append(h('h1', {}, 'Criar 3D'), h('p', { class: 'sub' }, 'Modelos 3D (.glb) prontos para o Godot, no tamanho real e com a base no chão: descrição com medidas, imagem no FLUX, fundo removido e modelo no TRELLIS.2. Tudo no seu computador.'),
    h('div', { class: 'vista' }, painel, h('div', { id: 'resultados' })));
  return raiz;

  // ---- aviso de quem ocupa a placa e a RAM (Elara, Ollama) e o botão de liberar
  async function verRecursos() {
    let r;
    try { r = await api('/api/recursos'); } catch { blocoRecursos.hidden = true; return []; }
    blocoRecursos.replaceChildren();
    blocoRecursos.hidden = !r.avisos.length;
    if (!r.avisos.length) return [];
    blocoRecursos.append(h('b', {}, 'Antes de gerar, libere a memória'), ...r.avisos.map((a) => h('div', { class: 'linha-recurso' }, h('span', {}, a.texto),
      a.acao ? h('button', { class: 'secundario', type: 'button', on: { click: () => liberar(a.tipo === 'elara') } }, a.acao) : null)),
      h('div', { class: 'dica' }, 'O FLUX e o TRELLIS.2 precisam de quase toda a placa (8 GB) e de bastante RAM. Com a Elara ou o qwen carregados, o 3D fica até 5 vezes mais lento.'));
    return r.avisos;
  }
  async function liberar(elara) {
    if (elara && !confirm('Fechar a Elara Voz? Ela para de ouvir até você abrir de novo (Iniciar Elara.bat).')) return;
    try { const r = await postar('/api/recursos/liberar', { elara }); aviso(r.elaraFechada ? 'Elara fechada e placa liberada.' : 'Placa liberada.'); } catch (e) { aviso(e.message, true); }
    verRecursos();
  }

  // ---- tela de revisão: o qwen sugere, você corrige o nome (é um jogo de ensinar inglês) e as medidas
  function fecharRevisao() { blocoRevisao.hidden = true; blocoRevisao.replaceChildren(); botao.hidden = false; }

  // campos editáveis de um objeto; devolve { no, ler() }
  function camposObjeto(pedido, d) {
    const en = h('input', { type: 'text', value: d.nome_en, maxLength: 60 });
    const pt = h('input', { type: 'text', value: d.nome_pt, maxLength: 60 });
    const cat = h('select', {}, ...CATEG.map((c) => h('option', { value: c, selected: c === d.categoria }, c)));
    const m = d.medidas_m;
    const med = ['largura', 'profundidade', 'altura'].map((k) => h('input', { type: 'number', min: 0.01, max: 30, step: 0.01, value: m[k], title: k }));
    const desc = h('textarea', { rows: 2, value: d.descricao_en });
    const origem = h('span', { class: 'origem ' + (d.origem_medidas || 'qwen') }, ORIGEM[d.origem_medidas] || ORIGEM.qwen, d.tabela?.nota ? ` · ${d.tabela.nota}` : '');
    for (const i of med) i.addEventListener('input', () => { origem.className = 'origem revisao'; origem.textContent = ORIGEM.revisao; });
    const no = h('div', { class: 'item-revisao' },
      h('div', { class: 'dica', style: 'margin:0 0 6px' }, h('b', {}, 'Pedido: '), pedido),
      h('div', { class: 'linha' }, h('div', { class: 'campo' }, h('label', {}, 'Inglês (o que o jogo ensina)'), en), h('div', { class: 'campo' }, h('label', {}, 'Português'), pt)),
      h('div', { class: 'linha' }, h('div', { class: 'campo' }, h('label', {}, 'Largura (m)'), med[0]), h('div', { class: 'campo' }, h('label', {}, 'Profundidade (m)'), med[1]),
        h('div', { class: 'campo' }, h('label', {}, 'Altura (m)'), med[2])),
      origem,
      h('details', {}, h('summary', {}, 'Categoria e descrição em inglês (para o desenho)'), h('div', { class: 'campo' }, h('label', {}, 'Categoria'), cat), h('div', { class: 'campo' }, desc)));
    const ler = () => ({ nome_en: en.value.trim().toLowerCase(), nome_pt: pt.value.trim().toLowerCase(), categoria: cat.value, descricao_en: desc.value.trim(),
      medidas_m: { largura: num(med[0].value), profundidade: num(med[1].value), altura: num(med[2].value) } });
    return { no, ler };
  }

  function abrirRevisao(titulo, conteudo, rotuloConfirmar, confirmar) {
    const ok = h('button', { class: 'principal', type: 'button', on: { click: async () => { ok.disabled = true; try { await confirmar(); fecharRevisao(); } catch (e) { aviso(e.message, true); ok.disabled = false; } } } }, rotuloConfirmar);
    blocoRevisao.replaceChildren(h('h3', {}, titulo), ...conteudo,
      h('div', { class: 'barra-acoes' }, ok, h('button', { class: 'secundario', type: 'button', on: { click: fecharRevisao } }, 'Voltar')));
    blocoRevisao.hidden = false; botao.hidden = true;
    blocoRevisao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function revisar() {
    const semente = f.semente === '' ? null : Number(f.semente);
    if (fach() ? !String(f.tipo || '').trim() || !String(f.marca || '').trim() : lote() ? !itensLote(f.lista).length : !f.pedido.trim()) {
      return aviso(fach() ? 'Escreva o tipo de loja e o nome da marca.' : lote() ? 'Escreva a lista de objetos.' : 'Descreva o objeto.', true);
    }
    const avisos = await verRecursos();
    if (avisos.some((a) => a.tipo !== 'placa') && !confirm('A Elara ou o qwen estão ocupando a placa (veja o aviso em cima). Continuar mesmo assim?')) return;
    botao.disabled = true; const antes = botao.textContent; botao.textContent = 'O qwen está pensando… (10 a 30 s)';
    try {
      if (fach()) {
        const { plano } = await postar('/api/fachada/planejar', { tipo: f.tipo, marca: f.marca });
        const c = camposFachada(plano);
        abrirRevisao(`Revise a loja "${plano.marca}"`, [c.no], 'Criar fachada', async () => {
          const pl = c.ler();
          if (!pl.tipo_en || !pl.tipo_pt) throw new Error('Preencha o nome da loja em inglês e em português.');
          const r = await postar('/api/fachada', { tipo: f.tipo, marca: f.marca, detalhes: f.detalhes !== false, cor: f.cor, semente, plano: pl });
          for (const id of r.trabalhos) { const e = {}; sessao['3d'].unshift(e); acompanhar(e, id); }
          atualizarResultados();
        });
      } else if (lote()) {
        const r = await postar('/api/3d/lote/descrever', { lista: f.lista });
        let itens = r.itens.map((x) => ({ pedido: x.pedido, ...camposObjeto(x.pedido, x.desc) }));
        const lista = h('div', { class: 'lista-revisao' });
        const pintar = () => lista.replaceChildren(...itens.map((x) => { const tirar = h('button', { class: 'sutil', type: 'button', title: 'Tirar da lista', on: { click: () => { itens = itens.filter((y) => y !== x); pintar(); } } }, 'Tirar');
          const n = x.no; if (!n.querySelector('.sutil')) n.prepend(tirar); return n; }));
        pintar();
        abrirRevisao(`Revise os ${itens.length} objetos${r.contexto ? ' de ' + r.contexto : ''}`, [lista], 'Criar todos', async () => {
          const lidos = itens.map((x) => ({ pedido: x.pedido, revisado: x.ler() }));
          if (!lidos.length) throw new Error('A lista ficou vazia.');
          if (lidos.some((x) => !x.revisado.nome_en || !x.revisado.nome_pt)) throw new Error('Preencha o nome em inglês e em português de todos.');
          const q = await postar('/api/3d/lote', { itens: lidos, contexto: r.contexto, cor: f.cor, semente });
          for (const id of [...q.trabalhos].reverse()) { const e = {}; sessao['3d'].unshift(e); acompanhar(e, id); }
          aviso(`${q.trabalhos.length} modelos na fila.`);
          atualizarResultados();
        });
      } else {
        const r = await postar('/api/3d/descrever', { pedido: f.pedido });
        const c = camposObjeto(r.pedido, r.desc);
        abrirRevisao('Revise antes de gerar', [c.no], 'Criar modelo 3D', async () => {
          const rev = c.ler();
          if (!rev.nome_en || !rev.nome_pt) throw new Error('Preencha o nome em inglês e em português.');
          const q = await postar('/api/3d', { pedido: f.pedido, cor: f.cor, semente, revisado: rev });
          for (const id of q.trabalhos) { const e = {}; sessao['3d'].unshift(e); acompanhar(e, id); }
          atualizarResultados();
        });
      }
    } catch (e) { aviso(e.message, true); } finally { botao.disabled = !pronto; botao.textContent = antes; }
  }

  // campos editáveis do plano da fachada
  function camposFachada(p) {
    const t = (v, max = 160) => h('input', { type: 'text', value: v ?? '', maxLength: max });
    const en = t(p.tipo_en, 40); const pt = t(p.tipo_pt, 40);
    const larg = h('input', { type: 'number', min: 6, max: 10, step: 0.1, value: p.largura_m });
    const alt = h('input', { type: 'number', min: 4, max: 6, step: 0.1, value: p.altura_m });
    const mats = ['parede', 'lateral', 'madeira', 'piso'].map((k) => [k, t(p[k])]);
    const cores = p.toldo.map((c) => h('input', { type: 'color', value: c, class: 'cor-toldo' }));
    const det = t((p.detalhes || []).join(', '), 200);
    const ROT = { parede: 'Parede da frente', lateral: 'Paredes do lado', madeira: 'Madeira (rodapé e moldura)', piso: 'Piso de dentro' };
    const no = h('div', { class: 'item-revisao' },
      h('div', { class: 'linha' }, h('div', { class: 'campo' }, h('label', {}, 'Tipo de loja em inglês'), en), h('div', { class: 'campo' }, h('label', {}, 'Em português'), pt)),
      h('div', { class: 'linha' }, h('div', { class: 'campo' }, h('label', {}, 'Largura (m)'), larg), h('div', { class: 'campo' }, h('label', {}, 'Altura (m)'), alt),
        h('div', { class: 'campo' }, h('label', {}, 'Toldo'), h('div', { style: 'display:flex;gap:6px' }, ...cores))),
      h('details', {}, h('summary', {}, 'Materiais (texto em inglês para o FLUX)'), ...mats.map(([k, i]) => h('div', { class: 'campo' }, h('label', {}, ROT[k]), i))),
      h('div', { class: 'campo' }, h('label', {}, 'Detalhes da calçada (separados por vírgula)'), det));
    const ler = () => ({ ...p, tipo_en: en.value.trim().toLowerCase(), tipo_pt: pt.value.trim().toLowerCase(), largura_m: num(larg.value), altura_m: num(alt.value),
      ...Object.fromEntries(mats.map(([k, i]) => [k, i.value.trim()])), toldo: cores.map((c) => c.value), detalhes: det.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3) });
    return { no, ler };
  }
}

// ---------------------------------------------------------------- vistas: remover fundo e ampliar
async function enviarEntrada(arquivo) {
  const r = await fetch('/api/entrada', { method: 'POST', headers: { 'Content-Type': arquivo.type || 'image/png' }, body: arquivo });
  const d = await r.json();
  if (!r.ok) throw new Error(d.erro || 'Não consegui enviar a imagem.');
  return { entradaId: d.entradaId, previa: URL.createObjectURL(arquivo) };
}

function urlOrigem(o) { return o ? (o.galeriaId ? `/api/galeria/${o.galeriaId}/arquivo` : o.previa) : null; }

const CORES = [['xadrez', 'Transparente'], ['#ffffff', 'Branco'], ['#000000', 'Preto'], ['#22c55e', 'Verde'], ['#3b82f6', 'Azul'], ['#f472b6', 'Rosa'], ['#fbbf24', 'Amarelo']];

function montarEdicao() {
  const alvo = $('#edicao');
  if (!alvo) return;
  const modo = estado.vista;
  const s = sessao[modo];
  alvo.replaceChildren();
  const trocar = () => { s.origem = null; s.entrada = null; montarEdicao(); };
  if (!s.origem) {
    const entrada = h('input', { type: 'file', accept: 'image/*', hidden: true, on: { change: (e) => escolher(e.target.files[0]) } });
    const zona = h('div', { class: 'soltar', on: {
      click: () => entrada.click(),
      dragover: (e) => { e.preventDefault(); zona.classList.add('sobre'); }, dragleave: () => zona.classList.remove('sobre'),
      drop: (e) => { e.preventDefault(); zona.classList.remove('sobre'); escolher(e.dataTransfer.files[0]); },
    } }, entrada, h('div', { style: 'font-size:34px' }, '🖼'), h('p', {}, h('b', {}, 'Arraste uma imagem aqui'), ' ou clique para escolher'), h('p', { class: 'dica' }, 'Também dá para colar (Ctrl+V). Aceita PNG, JPG e WebP.'));
    alvo.append(zona);
    return;
  }
  const depois = s.entrada;
  const resultado = depois?.estado === 'pronto' ? depois.itens[0] : null;
  const original = h('figure', {}, h('div', { class: 'tela' }, h('img', { src: urlOrigem(s.origem), alt: 'original' })),
    h('figcaption', {}, 'Original', h('button', { class: 'secundario', on: { click: trocar } }, 'Trocar imagem')));
  let telaDepois;
  if (resultado) {
    const url = `/api/galeria/${resultado.id}/arquivo`;
    const cor = s.cor;
    telaDepois = h('div', { class: 'tela' + (modo === 'fundo' && cor === 'xadrez' ? ' xadrez' : ''), style: modo === 'fundo' && cor !== 'xadrez' ? `background:${cor}` : '' }, h('img', { src: url, alt: 'resultado', crossOrigin: 'anonymous', id: 'imgResultado' }));
  } else if (depois && ['na fila', 'executando'].includes(depois.estado)) {
    telaDepois = h('div', { class: 'tela' }, cartaoEspera(depois));
  } else {
    telaDepois = h('div', { class: 'tela', style: 'color:var(--suave)' }, depois?.estado === 'erro' ? (depois.erro || 'Erro') : 'O resultado aparece aqui.');
  }
  const legenda = [];
  if (modo === 'fundo' && resultado) legenda.push(h('div', { class: 'cores' }, ...CORES.map(([c, r]) => h('button', { class: 'cor' + (c === s.cor ? ' on' : ''), title: r, style: c === 'xadrez' ? 'background:repeating-conic-gradient(#555 0 25%,#333 0 50%) 50%/12px 12px' : `background:${c}`, on: { click: () => { s.cor = c; montarEdicao(); } } }))));
  else legenda.push(h('span', {}, modo === 'fundo' ? 'Sem fundo' : 'Ampliada'));
  const par = h('div', { class: 'par' }, original, h('figure', {}, telaDepois, h('figcaption', {}, ...legenda)));
  const acoes = h('div', { class: 'barra-acoes' });
  if (modo === 'ampliar') acoes.append(fichas([[2, '2×'], [4, '4×']], s.fator, (v) => { s.fator = Number(v); }));
  const rodando = depois && ['na fila', 'executando'].includes(depois.estado);
  acoes.append(h('button', { class: 'principal', style: 'width:auto;padding:11px 24px', disabled: rodando, on: { click: executar } }, modo === 'fundo' ? 'Remover fundo' : 'Ampliar'));
  if (resultado) {
    const url = `/api/galeria/${resultado.id}/arquivo`;
    acoes.append(h('a', { class: 'secundario', href: url, download: `prisma-${modo}-${resultado.id}.png`, style: 'text-decoration:none' }, modo === 'fundo' ? 'Baixar PNG transparente' : 'Baixar'));
    if (modo === 'fundo' && s.cor !== 'xadrez') acoes.append(h('button', { class: 'secundario', on: { click: baixarComFundo } }, 'Baixar com esta cor de fundo'));
    acoes.append(h('button', { class: 'secundario', on: { click: () => abrirLuz(resultado) } }, 'Ver em tela cheia'));
  }
  alvo.append(par, acoes);

  async function escolher(arquivo) {
    if (!arquivo || !arquivo.type.startsWith('image/')) return aviso('Escolha um arquivo de imagem.', true);
    try { const o = await enviarEntrada(arquivo); s.origem = { entradaId: o.entradaId, previa: o.previa }; s.entrada = null; montarEdicao(); } catch (e) { aviso(e.message, true); }
  }
  async function executar() {
    try {
      const corpo = { origem: { galeriaId: s.origem.galeriaId, entradaId: s.origem.entradaId } };
      if (modo === 'ampliar') corpo.fator = s.fator;
      const r = await postar(modo === 'fundo' ? '/api/fundo' : '/api/ampliar', corpo);
      s.entrada = {}; acompanhar(s.entrada, r.trabalhos[0]); montarEdicao();
    } catch (e) { aviso(e.message, true); }
  }
  async function baixarComFundo() {
    const img = $('#imgResultado');
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.fillStyle = s.cor; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
    c.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: `prisma-com-fundo-${Date.now()}.png` }); a.click(); }, 'image/png');
  }
}

function renderEdicao(modo) {
  const titulo = modo === 'fundo' ? 'Remover fundo' : 'Ampliar imagem';
  const sub = modo === 'fundo'
    ? 'Tira o fundo de qualquer foto e deixa só a pessoa, o objeto ou o animal, com o contorno bem recortado (inclusive cabelo e pelos). Resultado em PNG transparente.'
    : 'Aumenta a resolução da imagem em 2× ou 4×, recuperando detalhes. Funciona melhor em imagens a partir de 512 pixels.';
  return h('div', {}, h('h1', {}, titulo), h('p', { class: 'sub' }, sub), h('div', { id: 'edicao' }));
}

// ---------------------------------------------------------------- vista: galeria
const FILTROS = [['todas', 'Tudo'], ['imagem', 'Imagens'], ['video', 'Vídeos'], ['3d', '3D'], ['fundo', 'Sem fundo'], ['ampliada', 'Ampliadas'], ['favoritas', 'Favoritas']];
let filtroGaleria = 'todas';

async function renderGaleria() {
  const raiz = $('#conteudo');
  const itens = (await api('/api/galeria')).itens;
  estado.galeria = itens;
  const lista = itens.filter((i) => filtroGaleria === 'todas' || (filtroGaleria === 'favoritas' ? i.favorita : i.tipo === filtroGaleria));
  raiz.replaceChildren(h('h1', {}, 'Galeria'), h('p', { class: 'sub' }, `${itens.length} ${itens.length === 1 ? 'arquivo salvo' : 'arquivos salvos'} no seu computador.`),
    h('div', { class: 'fichas', style: 'margin-bottom:18px' }, ...FILTROS.map(([k, r]) => h('button', { class: 'ficha' + (k === filtroGaleria ? ' on' : ''), on: { click: () => { filtroGaleria = k; renderGaleria(); } } }, r))),
    lista.length ? h('div', { class: 'grade' }, ...lista.map((i) => cartaoItem(i, () => {}))) : h('div', { class: 'vazio' }, 'Nada aqui ainda. Crie uma imagem ou um vídeo e ele aparece nesta galeria.'));
}

// ---------------------------------------------------------------- navegação
// ---------------------------------------------------------------- vista: IA online (fal.ai)
async function renderOnline() {
  const raiz = $('#conteudo');
  const status = await api('/api/status');
  estado.status = status;
  const tem = !!status.online?.chave;
  const campo = h('input', { type: 'password', placeholder: 'Cole aqui a chave da fal.ai', autocomplete: 'off', spellcheck: false });
  const salvar = async () => {
    try { await postar('/api/online/chave', { chave: campo.value }); campo.value = ''; aviso('Chave salva neste computador.'); renderOnline(); } catch (e) { aviso(e.message, true); }
  };
  const remover = async () => { try { await api('/api/online/chave', { method: 'DELETE' }); aviso('Chave removida.'); renderOnline(); } catch (e) { aviso(e.message, true); } };
  raiz.replaceChildren(
    h('h1', {}, 'IA online'),
    h('p', { class: 'sub' }, 'Além dos modelos que rodam no seu computador, dá para usar modelos maiores na nuvem (fal.ai), com mais qualidade. É opcional e pago por imagem.'),
    h('div', { class: 'cartao', style: 'max-width:640px' },
      h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Situação'),
        h('div', {}, tem ? 'Chave cadastrada. Os modelos "online" já aparecem em Criar imagem.' : 'Sem chave. Os modelos online ficam bloqueados.')),
      h('div', { class: 'campo' }, h('label', {}, tem ? 'Trocar a chave' : 'Chave da fal.ai'), campo),
      h('div', { class: 'barra-acoes' },
        h('button', { class: 'principal', style: 'width:auto;padding:10px 20px', on: { click: salvar } }, 'Salvar chave'),
        tem ? h('button', { class: 'secundario perigo', on: { click: remover } }, 'Remover chave') : null),
      h('details', { open: !tem }, h('summary', {}, 'Como conseguir a chave'),
        h('ol', { class: 'dica' },
          h('li', {}, 'Crie uma conta em fal.ai (você mesmo, no site) e coloque um pequeno saldo.'),
          h('li', {}, 'No painel, abra "API Keys" e crie uma chave.'),
          h('li', {}, 'Cole a chave acima. Ela fica salva só neste computador, na pasta config, e não volta para a tela.'))),
      h('div', { class: 'dica' }, 'Atenção: ao usar um modelo online, o texto que você escreve é enviado à fal.ai, e o serviço tem filtro de conteúdo próprio. Os modelos locais continuam sem enviar nada para a internet.')));
}

function irPara(vista, origem) {
  estado.vista = vista;
  for (const b of document.querySelectorAll('#menu button')) b.classList.toggle('ativo', b.dataset.vista === vista);
  const raiz = $('#conteudo');
  raiz.scrollTop = 0;
  if (vista === 'galeria') { renderGaleria().catch((e) => aviso(e.message, true)); return; }
  if (vista === 'online') { renderOnline().catch((e) => aviso(e.message, true)); return; }
  if (!estado.catalogo) { raiz.replaceChildren(h('p', { class: 'sub' }, 'Carregando…')); return; }
  if (vista === 'criar') { raiz.replaceChildren(renderCriar()); atualizarResultados(); }
  else if (vista === 'video') { raiz.replaceChildren(renderVideo()); atualizarResultados(); }
  else if (vista === '3d') { raiz.replaceChildren(render3d()); atualizarResultados(); }
  else { raiz.replaceChildren(renderEdicao(vista)); if (origem) { sessao[vista].origem = origem; sessao[vista].entrada = null; } montarEdicao(); if (origem) $('#edicao button.principal')?.click(); }
}

document.addEventListener('paste', async (ev) => {
  if (!['fundo', 'ampliar'].includes(estado.vista)) return;
  const arq = [...(ev.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (!arq) return;
  try { const o = await enviarEntrada(arq); const s = sessao[estado.vista]; s.origem = { entradaId: o.entradaId, previa: o.previa }; s.entrada = null; montarEdicao(); } catch (e) { aviso(e.message, true); }
});

$('#menu').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) irPara(b.dataset.vista); });
$('#sair').addEventListener('click', async () => { if (confirm('Encerrar o Prisma? Os trabalhos em andamento serão cancelados.')) { try { await postar('/api/sair'); } catch { /* já saiu */ } window.close(); document.body.innerHTML = '<p style="padding:40px;color:#98a1b5">Prisma encerrado. Pode fechar esta janela.</p>'; } });

// ---------------------------------------------------------------- estado do motor
async function atualizarStatus() {
  try {
    const s = await api('/api/status');
    estado.status = s;
    const el = $('#estado');
    if (s.motor.noAr) {
      el.className = 'estado pronto';
      el.querySelector('span').textContent = s.motor.vram ? `Motor pronto · ${s.motor.vram.nome.replace('NVIDIA GeForce ', '')} · ${s.motor.vram.livreGB} GB livres` : 'Motor pronto';
    } else {
      el.className = 'estado' + (s.motor.iniciando ? '' : ' fora');
      el.querySelector('span').textContent = s.motor.iniciando ? 'Ligando o motor de IA…' : 'Motor desligado (liga sozinho ao gerar)';
    }
    if (s.fila) el.querySelector('span').textContent += ` · fila: ${s.fila}`;
  } catch { const el = $('#estado'); el.className = 'estado fora'; el.querySelector('span').textContent = 'Sem contato com o app'; }
}

async function iniciar() {
  estado.catalogo = await api('/api/modelos');
  await atualizarStatus();
  irPara(['criar', 'video', '3d', 'fundo', 'ampliar', 'galeria'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'criar');
  postar('/api/motor/iniciar').catch(() => {});
  setInterval(atualizarStatus, 3000);
  setInterval(() => postar('/api/ping').catch(() => {}), 5000);
  postar('/api/ping').catch(() => {});
}
iniciar().catch((e) => { $('#conteudo').textContent = 'Não consegui iniciar: ' + e.message; });
