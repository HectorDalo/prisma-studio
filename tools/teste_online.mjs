// Teste da IA online com um servidor falso da fal.ai (não gasta nada nem usa a internet): node tools/teste_online.mjs
import http from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let porta, consultas = 0, ultimoCorpo = null, chaveVista = null;
const falso = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/img.png') chaveVista = req.headers.authorization;   // o download da imagem não leva a chave
  const base = `http://127.0.0.1:${porta}`;
  if (req.method === 'POST' && u.pathname === '/fal-ai/flux/dev') {
    let c = ''; req.on('data', (d) => (c += d)); req.on('end', () => {
      ultimoCorpo = JSON.parse(c);
      res.end(JSON.stringify({ request_id: 'r1', status_url: base + '/fal-ai/flux/requests/r1/status', response_url: base + '/fal-ai/flux/requests/r1', cancel_url: base + '/c' }));
    });
  } else if (u.pathname.endsWith('/status')) {
    consultas++;
    res.end(JSON.stringify({ status: consultas < 2 ? 'IN_QUEUE' : 'COMPLETED' }));
  } else if (u.pathname === '/fal-ai/flux/requests/r1') {
    res.end(JSON.stringify({ images: [{ url: base + '/img.png', content_type: 'image/png' }], has_nsfw_concepts: [false] }));
  } else if (u.pathname === '/img.png') { res.setHeader('Content-Type', 'image/png'); res.end(png); }
  else { res.statusCode = 404; res.end('nada'); }
});
await new Promise((ok) => falso.listen(0, '127.0.0.1', ok));
porta = falso.address().port;
process.env.PRISMA_FAL_BASE = `http://127.0.0.1:${porta}`;
const { Online, MODELOS_ONLINE } = await import('../app/lib/online.mjs');
// pasta temporária no D: (tmp do Prisma), apagada no fim: nada vai para o C:
const TMP_RAIZ = join(dirname(dirname(fileURLToPath(import.meta.url))), 'tmp');
mkdirSync(TMP_RAIZ, { recursive: true });
const TMP = mkdtempSync(join(TMP_RAIZ, 'online-'));
const online = new Online({ raiz: TMP });
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
ok(!online.temChave(), 'sem chave no começo');
await online.gerarImagem(MODELOS_ONLINE['fal-flux-dev'], { prompt: 'x', largura: 512, altura: 512, semente: 1 }).then(() => ok(false, 'sem chave deveria falhar'), () => {});
try { online.salvarChave('curta'); ok(false, 'chave curta deveria ser recusada'); } catch { /* esperado */ }
online.salvarChave('abcdef0123456789:abcdef0123456789');
ok(online.temChave(), 'chave salva');
const etapas = [];
const r = await online.gerarImagem(MODELOS_ONLINE['fal-flux-dev'], { prompt: 'um gato', largura: 768, altura: 512, semente: 7 }, (e) => etapas.push(e));
ok(r.buffer.equals(png) && r.ext === 'png', 'imagem baixada igual');
ok(chaveVista === 'Key abcdef0123456789:abcdef0123456789', 'cabeçalho Authorization');
ok(ultimoCorpo.prompt === 'um gato' && ultimoCorpo.image_size.width === 768 && ultimoCorpo.seed === 7, 'corpo do pedido');
ok(etapas.includes('Na fila da fal.ai…'), 'mostra a fila');
online.removerChave();
ok(!online.temChave(), 'chave removida');
falso.close();
rmSync(TMP, { recursive: true, force: true });
console.log(falhas ? falhas + ' falha(s)' : 'RESULTADO: TUDO OK');
process.exit(falhas ? 1 : 0);
