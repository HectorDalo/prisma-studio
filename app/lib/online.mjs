// IA online (fal.ai): modelos de imagem na nuvem, usados só quando a pessoa escolhe um deles e cadastra a própria chave.
// A chave fica em config/chaves.json (fora do Git) e nunca volta para o navegador. O texto do pedido é enviado à fal.ai.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

const BASE = process.env.PRISMA_FAL_BASE || 'https://queue.fal.run';   // a variável só serve aos testes (servidor falso)

// preco: dólares por megapixel (tabela pública da fal.ai); null = veja o preço no site.
export const MODELOS_ONLINE = {
  'fal-flux-dev': {
    id: 'fal-flux-dev', online: true, endpoint: 'fal-ai/flux/dev', preco: 0.025, negativo: false, passos: 28, cfg: 3.5,
    nome: 'FLUX dev · online',
    descricao: 'Roda na nuvem (fal.ai), com mais qualidade que os modelos locais. Cerca de US$ 0,03 por imagem de 1 megapixel.',
  },
  'fal-flux-schnell': {
    id: 'fal-flux-schnell', online: true, endpoint: 'fal-ai/flux/schnell', preco: 0.003, negativo: false, passos: 4, cfg: 1,
    nome: 'FLUX schnell · online',
    descricao: 'Nuvem (fal.ai), muito rápido e barato: menos de 1 centavo de dólar por imagem.',
  },
  'fal-flux-pro': {
    id: 'fal-flux-pro', online: true, endpoint: 'fal-ai/flux-pro/v1.1', preco: null, negativo: false, passos: 0, cfg: 0,
    nome: 'FLUX 1.1 pro · online',
    descricao: 'Nuvem (fal.ai), a melhor qualidade da lista. Mais caro: confira o preço atual no site da fal.ai.',
  },
};

export class Online {
  constructor({ raiz }) {
    this.arquivo = join(raiz, 'config', 'chaves.json');
  }

  chave() {
    try { return String(JSON.parse(readFileSync(this.arquivo, 'utf8')).fal || ''); } catch { return ''; }
  }

  temChave() { return this.chave().length > 0; }

  salvarChave(valor) {
    const v = String(valor || '').trim();
    if (!v) throw new Error('Cole a chave da fal.ai.');
    if (v.length < 16 || /\s/.test(v)) throw new Error('Essa chave não parece válida.');
    mkdirSync(dirname(this.arquivo), { recursive: true });
    writeFileSync(this.arquivo, JSON.stringify({ fal: v }), 'utf8');
  }

  removerChave() { try { rmSync(this.arquivo); } catch { /* não havia */ } }

  async #chamar(url, opcoes = {}, tentativas = 3) {
    let ultimo;
    for (let i = 0; i < tentativas; i++) {
      try {
        const r = await fetch(url, { ...opcoes, headers: { Authorization: 'Key ' + this.chave(), 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error('A fal.ai recusou a chave. Confira se ela está certa e se a conta tem saldo.'), { fatal: true });
        if (r.status === 402) throw Object.assign(new Error('A conta da fal.ai está sem saldo.'), { fatal: true });
        if (!r.ok) {
          const corpo = await r.text();
          const msg = corpo.slice(0, 300);
          if (r.status >= 400 && r.status < 500 && r.status !== 429) throw Object.assign(new Error('A fal.ai não aceitou o pedido: ' + msg), { fatal: true });
          throw new Error('A fal.ai respondeu ' + r.status);
        }
        return r;
      } catch (e) {
        if (e.fatal) throw e;
        ultimo = e;
        await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
      }
    }
    throw new Error('Não consegui falar com a fal.ai (internet?): ' + (ultimo?.message || 'erro'));
  }

  // Gera uma imagem e devolve { buffer, ext }. onEtapa(texto) mostra o andamento; cancelado() diz se a pessoa desistiu.
  async gerarImagem(modelo, { prompt, largura, altura, semente }, onEtapa = () => {}, cancelado = () => false) {
    if (!this.temChave()) throw new Error('Cadastre a chave da fal.ai na aba Online.');
    const corpo = { prompt, image_size: { width: largura, height: altura }, seed: semente, num_images: 1, output_format: 'png' };
    onEtapa('Enviando para a fal.ai…');
    const envio = await (await this.#chamar(`${BASE}/${modelo.endpoint}`, { method: 'POST', body: JSON.stringify(corpo) })).json();
    if (!envio.status_url || !envio.response_url) throw new Error('Resposta inesperada da fal.ai.');
    const limite = Date.now() + 5 * 60 * 1000;
    for (;;) {
      if (cancelado()) {
        if (envio.cancel_url) this.#chamar(envio.cancel_url, { method: 'PUT' }, 1).catch(() => {});
        throw new Error('Cancelado.');
      }
      if (Date.now() > limite) throw new Error('A fal.ai demorou demais. Tente de novo.');
      const st = await (await this.#chamar(envio.status_url)).json();
      if (st.status === 'COMPLETED') {
        if (st.error) throw new Error('A fal.ai falhou: ' + String(st.error).slice(0, 200));
        break;
      }
      onEtapa(st.status === 'IN_QUEUE' ? 'Na fila da fal.ai…' : 'Gerando na fal.ai…');
      await new Promise((ok) => setTimeout(ok, 1200));
    }
    onEtapa('Baixando a imagem…');
    const res = await (await this.#chamar(envio.response_url)).json();
    const img = res.images?.[0];
    if (!img?.url) throw new Error('A fal.ai não devolveu imagem.');
    if (res.has_nsfw_concepts?.[0]) throw new Error('O filtro de conteúdo da fal.ai bloqueou esta imagem. Tente outra descrição ou use um modelo local.');
    const arq = await fetch(img.url);
    if (!arq.ok) throw new Error('Não consegui baixar a imagem pronta.');
    const buffer = Buffer.from(await arq.arrayBuffer());
    const ext = /jpe?g/.test(img.content_type || '') ? 'jpg' : 'png';
    return { buffer, ext };
  }
}
