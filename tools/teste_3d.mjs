// Testes do "Criar 3D" (não usam a placa de vídeo): node tools/teste_3d.mjs
// - regras do estilo travado e do peso por tamanho;
// - o fluxo do TRELLIS.2 (ligações entre nós; e, se o motor estiver ligado, os nós e entradas existem no ComfyUI);
// - o descritor com um Ollama falso (pede JSON e descarrega o modelo da placa);
// - a limpeza no Godot de verdade, com um .glb gerado aqui (escala real, base no chão, centro).
import http from 'node:http';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESTILO_EQ, classeTamanho, normalizarDescricao, promptImagem, nomeArquivo, TAMANHOS, proporcao, correcaoPara, lerLote, pedidoDoLote, vocabExportado, precisaCostura, normalizarFachada, marcaLimpa, promptPlaca, configFachada, SISTEMA_DESCRITOR, escolherVariacao, normalizarVariacao, SISTEMA_FACHADA, paredeLisa, temPadrao, ehFarmacia } from '../app/lib/estilo3d.mjs';
import { trellis3d } from '../app/lib/workflows.mjs';
import { Limpeza } from '../app/lib/limpeza.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
// temporários no D: (o C: está quase cheio)
const TMP = mkdtempSync(join(existsSync(join(RAIZ, 'tmp')) ? join(RAIZ, 'tmp') : tmpdir(), 'teste3d-'));
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHA ') + msg); if (!cond) falhas++; };
const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

console.log('estilo e peso por tamanho');
ok(classeTamanho({ largura: 0.08, profundidade: 0.12, altura: 0.1 }, 'object') === 'pequeno', 'xícara é pequena');
ok(classeTamanho({ largura: 0.7, profundidade: 0.7, altura: 0.75 }, 'furniture') === 'medio', 'mesa de café é média');
ok(classeTamanho({ largura: 0.3, profundidade: 0.9, altura: 0.6 }, 'animal') === 'medio', 'cachorro é médio');
ok(classeTamanho({ largura: 0.6, profundidade: 1.2, altura: 0.9 }, 'vehicle') === 'grande', 'veículo é sempre grande');
ok(classeTamanho({ largura: 2.0, profundidade: 0.9, altura: 0.8 }, 'furniture') === 'grande', 'sofá de 2 m é grande');
ok(TAMANHOS.pequeno.faces === 3000 && TAMANHOS.medio.faces === 10000 && TAMANHOS.grande.faces === 30000, 'faces: 3 mil, 10 mil e 30 mil');

const d = normalizarDescricao('Claro! {"nome_en":"Cafe Table","nome_pt":"Mesa de café","categoria":"FURNITURE","medidas_m":{"largura":"0,7","profundidade":0.7,"altura":0.75},"descricao_en":"A round wooden table\nwith one leg."} pronto', 'mesa');
ok(d.nome_en === 'cafe table' && d.nome_pt === 'mesa de café' && d.categoria === 'furniture', 'lê o JSON mesmo com texto em volta');
ok(d.medidas_m.largura === 0.7 && d.tamanho === 'medio' && d.faces === 10000, 'aceita vírgula decimal e calcula o peso');
ok(!/\n/.test(d.descricao_en), 'tira quebras de linha da descrição');
const vazio = normalizarDescricao('não sei', 'um vaso');
ok(vazio.nome_pt === 'um vaso' && vazio.categoria === 'object' && vazio.medidas_m.altura > 0, 'resposta torta vira valores seguros');
ok(normalizarDescricao({ nome_en: 'cafe_table' }, 'x').nome_en === 'cafe table', 'nome em inglês sem sublinhado');
ok(normalizarDescricao({ medidas_m: { largura: -3, altura: 999 } }, 'x').medidas_m.altura === 30, 'limita medidas absurdas');
const p = promptImagem(d);
ok(p.endsWith(ESTILO_EQ + '.') && p.includes('75 cm tall') && p.includes('70 cm wide'), 'prompt traz as medidas reais e termina no estilo travado');
ok(p.includes('About as tall as it is wide'), 'mesa: diz em palavras que ela não é baixa');
ok(/Long and low/.test(proporcao({ largura: 0.8, profundidade: 2.0, altura: 0.5 })) && /Tall and slender/.test(proporcao({ largura: 0.3, profundidade: 0.3, altura: 1.8 })), 'proporção em palavras: comprido e baixo, alto e fino');
ok(correcaoPara('animal') === 1 && correcaoPara('vehicle') === 1.1 && correcaoPara('furniture') === 1.25, 'animal não é esticado, veículo só 10%, móvel até 25%');
ok(precisaCostura(2.9) && !precisaCostura(1.1) && precisaCostura(undefined), 'só repinta a emenda quando ela aparece (razão ≥ 1,5)');
ok(/low poly/.test(ESTILO_EQ) && /no text/.test(ESTILO_EQ) && /no logos/.test(ESTILO_EQ), 'estilo: low poly, sem texto, sem marca');
ok(nomeArquivo('Café Table!') === 'cafe_table' && nomeArquivo('') === 'objeto', 'nome de arquivo seguro');

console.log('lote e exportação para o EnglishQuest');
const l = lerLote('loja de pets: cachorro, gato, aquário, ração, coleira');
ok(l.contexto === 'loja de pets' && l.itens.join('|') === 'cachorro|gato|aquário|ração|coleira', 'lê "cenário: a, b, c"');
const l2 = lerLote('- vaso\n2) banco de praça; Vaso;\n\nplaca.');
ok(!l2.contexto && l2.itens.join('|') === 'vaso|banco de praça|placa', 'linhas, ponto e vírgula, marcadores e repetidos');
ok(lerLote('mesa de café, uma xícara: grande').contexto === '', 'dois-pontos depois de uma vírgula não vira cenário');
const muitos = lerLote(Array.from({ length: 25 }, (_, i) => 'obj' + i).join(','));
ok(muitos.itens.length === 20 && muitos.cortados === 5, 'no máximo 20 por lote (avisa os cortados)');
ok(pedidoDoLote('ração', 'loja de pets') === 'ração (objeto para o cenário: loja de pets)' && pedidoDoLote('vaso', '') === 'vaso', 'o cenário vai junto no pedido ao qwen');
const itemFake = (id, en) => ({ id, tipo: '3d', criadoEm: '2026-11-04T05:00:00Z', params: { pedido: 'um ' + en, cor: 'vertices', faces: 3000, tamanho_m: [0.3, 0.2, 0.3], lote: 'loja de pets', vocab: { en, pt: 'coleira', categoria: 'object', medidas_m: { largura: 0.3, profundidade: 0.3, altura: 0.2 } } } });
const vj = vocabExportado(itemFake('abc123', 'dog collar'), 'dog_collar.glb');
ok(vj.en === 'dog collar' && vj.pt === 'coleira' && vj.categoria === 'object' && vj.medidas_m.altura === 0.2 && vj.arquivo === 'dog_collar.glb', '.json do vocabulário: inglês, português, categoria e medidas');
ok(vj.cenario === 'loja de pets' && vj.prisma_id === 'abc123' && /TRELLIS\.2 \(MIT\)/.test(vj.gerado_com), '.json guarda o cenário, a origem e as licenças');
const { Exportador } = await import('../app/lib/exportar.mjs');
const destino = join(TMP, 'eq', 'assets', 'prisma');
mkdirSync(dirname(dirname(destino)), { recursive: true });
writeFileSync(join(dirname(dirname(destino)), 'project.godot'), '');
const glbFalso = join(TMP, 'falso.glb'); writeFileSync(glbFalso, 'glTF');
const ex = new Exportador({ destino, backups: join(TMP, 'backups') });
const e1 = ex.exportar(itemFake('aaa111', 'dog collar'), glbFalso);
ok(e1.nome === 'dog_collar' && existsSync(e1.glb) && JSON.parse(readFileSync(e1.json, 'utf8')).en === 'dog collar', 'exporta <nome>.glb e <nome>.json para assets/prisma');
const e2 = ex.exportar(itemFake('bbb222', 'dog collar'), glbFalso);
ok(e2.nome === 'dog_collar_2', 'outro modelo com o mesmo nome não sobrescreve (ganha _2)');
const e3 = ex.exportar(itemFake('aaa111', 'dog collar'), glbFalso);
ok(e3.nome === 'dog_collar', 'exportar de novo o mesmo item atualiza o dele');
const fachadaFake = { id: 'fff999', tipo: '3d', criadoEm: 'x', params: { fachada: { marca: 'Greenleaf Pharmacy', variacao: { andares: 2 } }, colisoes: 29, vocab: { en: 'pharmacy', pt: 'farmácia', categoria: 'building' } } };
const ef = ex.exportar(fachadaFake, glbFalso);
const jf = JSON.parse(readFileSync(ef.json, 'utf8'));
ok(ef.nome === 'greenleaf_pharmacy' && jf.en === 'pharmacy' && jf.marca === 'Greenleaf Pharmacy' && jf.variacao.andares === 2, 'fachada: arquivo com o nome da marca, .json ensina a palavra (pharmacy) e guarda a marca');
const fachada2 = { ...fachadaFake, id: 'ggg111', params: { ...fachadaFake.params, fachada: { marca: 'Greenleaf Drugstore', outras_palavras: [{ en: 'drugstore', pt: 'drogaria' }] } } };
const jf2 = JSON.parse(readFileSync(ex.exportar(fachada2, glbFalso).json, 'utf8'));
ok(jf2.palavras.length === 2 && jf2.palavras[0].en === 'pharmacy' && jf2.palavras[1].en === 'drugstore' && jf2.palavras[1].pt === 'drogaria', '.json ensina as duas palavras: pharmacy (farmácia) e drugstore (drogaria)');
ok(e1.backup === null && e3.backup && existsSync(join(e3.backup, 'dog_collar.glb')) && existsSync(join(e3.backup, 'dog_collar.json')), 'antes de trocar, copia os arquivos antigos para o backup (o 1º export não tem o que guardar)');
const { Galeria } = await import('../app/lib/gallery.mjs');
const gal = new Galeria(join(TMP, 'galeria'));
const gi = gal.salvar({ buffer: Buffer.from('a'), ext: 'glb', tipo: '3d', params: { letreiro_escolhido: 0, x: 1 } });
const gu = gal.atualizar(gi.id, Buffer.from('bb'), { letreiro_escolhido: 2 });
ok(gu.params.letreiro_escolhido === 2 && gu.params.x === 1 && gu.atualizadoEm && readFileSync(gal.caminho(gi.id)).length === 2, 'trocar o letreiro troca o arquivo e guarda a escolha');
let recusou = false; try { ex.exportar({ ...itemFake('ccc', 'x'), tipo: 'imagem' }, glbFalso); } catch { recusou = true; }
ok(recusou, 'imagem não é exportada como modelo');
{
  const { importarEmbutido } = await import('../app/lib/exportar.mjs');
  const imp = join(destino, 'dog_collar.glb.import');
  ok(readFileSync(imp, 'utf8').includes('gltf/embedded_image_handling=2'), 'exportar cria o .import com as texturas embutidas (sem PNG soltos no jogo)');
  writeFileSync(imp, '[remap]\n\nimporter="scene"\n\n[params]\n\nnodes/root_type=""\ngltf/embedded_image_handling=1\n');
  importarEmbutido(join(destino, 'dog_collar.glb'));
  const s2 = readFileSync(imp, 'utf8');
  ok(s2.includes('gltf/embedded_image_handling=2') && !s2.includes('handling=1') && s2.includes('nodes/root_type'), 'import que extraía PNG passa a embutir, sem perder o resto');
}
ok(!new Exportador({ destino: join(TMP, 'nada', 'assets', 'prisma') }).disponivel() || !!process.env.PRISMA_EQ_ASSETS, 'sem o projeto do jogo, não cria pasta solta');

console.log('tabela de medidas padrão e revisão');
const { medidaPadrao, MEDIDAS_PADRAO, tabelaParaPrompt } = await import('../app/lib/medidas.mjs');
ok(medidaPadrao('cafe table').medidas_m.altura === 0.75 && medidaPadrao('wooden cafe table').nome === 'cafe table', 'mesa de café: 0,75 m de altura (também com adjetivo no nome)');
ok(medidaPadrao('chair').nota.includes('0,45') && medidaPadrao('door').medidas_m.altura === 2.1, 'cadeira com assento a 0,45 m e porta de 2,10 m');
ok(medidaPadrao('table lamp').nome === 'table lamp' && medidaPadrao('dog food bowl').nome === 'dog food bowl', 'o nome mais comprido ganha ("table lamp" não vira mesa; "dog food bowl" não vira cachorro)');
ok(medidaPadrao('dog collar').medidas_m.altura < 0.1 && medidaPadrao('leash').nome === 'leash' && medidaPadrao('xyz') === null, 'coleira e guia são itens diferentes; nome desconhecido não acha nada');
ok(MEDIDAS_PADRAO.every((i) => i.m.length === 3 && i.m.every((x) => x > 0 && x < 20)) && tabelaParaPrompt().includes('cafe table 0.7 x 0.7 x 0.75'), 'tabela válida e no pedido ao qwen');
ok(/collar/.test(SISTEMA_DESCRITOR) && /leash/.test(SISTEMA_DESCRITOR) && /ALWAYS follow this table/.test(SISTEMA_DESCRITOR), 'o qwen recebe a tabela e o aviso coleira = collar, guia = leash');
const dt = normalizarDescricao({ nome_en: 'cafe table', nome_pt: 'mesa de café', categoria: 'furniture', medidas_m: { largura: 0.6, profundidade: 0.6, altura: 0.5 } }, 'mesa');
ok(dt.origem_medidas === 'tabela' && dt.medidas_m.altura === 0.75, 'quando o nome está na tabela, a tabela vence a medida do qwen');
const dr = normalizarDescricao({ nome_en: 'cafe table', nome_pt: 'mesa de café', categoria: 'furniture', medidas_m: { largura: 0.8, profundidade: 0.8, altura: 0.74 } }, 'mesa', 'revisao');
ok(dr.origem_medidas === 'revisao' && dr.medidas_m.altura === 0.74 && dr.tabela.medidas_m.altura === 0.75, 'a sua revisão vence a tabela (e a tabela fica como referência)');
ok(normalizarDescricao({ nome_en: 'spaceship', medidas_m: { largura: 3, profundidade: 5, altura: 2 } }, 'nave').origem_medidas === 'qwen', 'sem item na tabela, fica a sugestão do qwen (para conferir)');
ok(correcaoPara('furniture', 'tabela') === 1.5 && correcaoPara('furniture', 'revisao') === 1.5 && correcaoPara('furniture', 'qwen') === 1.25 && correcaoPara('animal', 'revisao') === 1, 'medida confiável corrige até 50% (conserta a mesa baixa); animal nunca estica');

console.log('aviso de memória (Elara, Ollama)');
const { avaliarRecursos } = await import('../app/lib/recursos.mjs');
const av = avaliarRecursos({ ollama: [{ nome: 'qwen2.5:7b', vramGB: 4.8 }], elara: [{ pid: 1, ramMB: 2400 }], vram: { usadaGB: 7.4, totalGB: 8 }, motorGB: 0 });
ok(av.some((a) => a.tipo === 'ollama' && a.acao) && av.some((a) => a.tipo === 'elara' && a.acao === 'Fechar a Elara'), 'avisa o qwen na placa e a Elara aberta, com botão para liberar');
ok(!av.some((a) => a.tipo === 'placa'), 'o que o qwen ocupa não conta como "outros programas"');
ok(avaliarRecursos({ vram: { usadaGB: 3.5, totalGB: 8 }, motorGB: 1.0 }).some((a) => a.tipo === 'placa'), 'avisa quando outros programas ocupam a placa');
ok(avaliarRecursos({ vram: { usadaGB: 6.5, totalGB: 8 }, motorGB: 6.0 }).length === 0, 'a placa ocupada pelo próprio Prisma não gera aviso');
ok(!avaliarRecursos({ ollama: [{ nome: 'qwen2.5:7b', vramGB: 4.8 }], ocupado: true }).some((a) => a.tipo === 'ollama'), 'com a fila rodando, o qwen do próprio Prisma não vira aviso');

console.log('modo fachada (plano do qwen)');
const pf = normalizarFachada('ok {"tipo_en":"Pet Shop","tipo_pt":"Loja de pets","largura_m":"14","altura_m":2,"parede":"light blue painted wooden clapboard siding","toldo":["#1e88e5","#ffffff"],"detalhes":["vaso","banco","placa","extra"]}', 'loja de pets', 'Patinhas "Felizes"');
ok(pf.tipo_en === 'pet shop' && pf.tipo_pt === 'loja de pets' && pf.largura_m === 10 && pf.altura_m === 4, 'plano: nomes em minúsculas e medidas dentro de 6-10 x 4-6 m');
ok(pf.parede.includes('clapboard') && pf.lateral.length > 5 && pf.piso.length > 5 && pf.toldo[0] === '#1e88e5' && pf.detalhes.length === 3, 'materiais, cores do toldo e até 3 detalhes (o que faltar tem padrão)');
ok(pf.marca === 'Patinhas Felizes' && marcaLimpa('a'.repeat(50)).length === 28, 'marca sem aspas nem quebras, até 28 letras');
ok(/NEVER decorative patterns/.test(SISTEMA_FACHADA) && /outras_palavras/.test(SISTEMA_FACHADA), 'o qwen pede parede de material liso (sem arcos nem motivos) e outras palavras da loja');
const op = normalizarFachada({ outras_palavras: [{ en: 'Drugstore', pt: 'Drogaria' }, { en: '', pt: 'x' }, 'lixo'] }, 'farmácia', 'X').outras_palavras;
ok(op.length === 1 && op[0].en === 'drugstore' && op[0].pt === 'drogaria', 'outras palavras: conferidas e em minúsculas');
ok(normalizarFachada('nada', 'padaria', 'Pão Bom').toldo.length === 2 && normalizarFachada({ toldo: ['vermelho', 'x'] }, 'x', 'y').toldo[0] === '#2f6e4f', 'resposta torta e cor inválida viram padrão');
const pl = promptPlaca(pf);
ok(!pl.includes('Patinhas') && /no text, no letters/.test(pl) && /no wall/.test(pl), 'placa: o FLUX faz só a placa, sem o nome (quem escreve é o Godot)');
ok(pf.telhado.length > 5, 'telhado tem material próprio (não é o piso de madeira)');
const va = escolherVariacao(123), vb = escolherVariacao(123);
ok(JSON.stringify(va) === JSON.stringify(vb) && [1, 2].includes(va.andares) && ['tijolo', 'reboco'].includes(va.laterais), 'variação sorteada pela semente: a mesma semente dá a mesma loja');
const todas = Array.from({ length: 40 }, (_, i) => escolherVariacao(i + 1));
ok(todas.some((v) => v.andares === 2) && todas.some((v) => v.andares === 1) && todas.some((v) => v.degrau) && todas.some((v) => !v.calha), 'as lojas variam (1 ou 2 andares, com e sem degrau, calha...)');
ok(normalizarVariacao({ andares: '2', laterais: 'x', rodape: 1 }).andares === 2 && normalizarVariacao({}).laterais === 'reboco', 'variação revisada é conferida');
ok(!/accents|arch|ornament|pattern/i.test(paredeLisa('white stucco wall with dark gray accents and arches').split(', plain')[0]) && /no pattern$/.test(paredeLisa('red brick wall with light gray mortar')) && /mortar/.test(paredeLisa('red brick wall with light gray mortar')), 'texto da parede sem palavras decorativas (arcos, ornamentos), rejunte mantido');
ok(temPadrao(0.14) && !temPadrao(0.03), 'limite do padrão decorativo: 0,08');
ok(ehFarmacia('pharmacy') && ehFarmacia('drugstore') && !ehFarmacia('bakery'), 'farmácia reconhecida para a cruz');
ok(configFachada({ tipo_en: 'pharmacy', cor_detalhe: '#2f6e4f', toldo: ['#2f6e4f', '#ffffff'] }, {}, '', 0).cruz === true && configFachada({ tipo_en: 'cafe', toldo: ['#2f6e4f', '#ffffff'] }, {}, '', 0).cor_detalhe === null, 'config da fachada: cruz na farmácia e cor dos detalhes');
ok(normalizarFachada({ cor_detalhe: '#123456' }, 'x', 'y').cor_detalhe === '#123456' && normalizarFachada({ toldo: ['#aa0000', '#ffffff'] }, 'x', 'y').cor_detalhe === '#aa0000', 'cor dos detalhes do qwen, ou a do toldo');
{
  const { CONJUNTOS, conjuntoPara, PECAS_DE_MESA } = await import('../app/lib/calcadas.mjs');
  ok(Object.entries(CONJUNTOS).every(([t, c]) => c.pecas.includes('tables') === c.mesas) && Object.entries(CONJUNTOS).filter(([, c]) => c.mesas).map(([t]) => t).sort().join() === 'cafe,pizzeria,restaurant', 'conjuntos de calçada: mesas só no café, no restaurante e na pizzaria');
  ok(PECAS_DE_MESA.includes('tables'), 'a peça de mesa é a "tables"');
  ok(conjuntoPara('pharmacy') === 'pharmacy' && conjuntoPara('ramen restaurant') === 'restaurant' && conjuntoPara('ice cream shop') === 'ice_cream' && conjuntoPara('clothing store') === 'clothing' && conjuntoPara('pizzeria') === 'pizzeria' && conjuntoPara('mini market') === 'market', 'cada tipo de loja ganha o conjunto de calçada certo');
  const tipos = Object.values(CONJUNTOS).map((c) => c.pecas.join());
  ok(new Set(tipos).size === tipos.length, 'a calçada de cada tipo é diferente das outras');
}
const cf = configFachada({ ...pf, variacao: { andares: 2, laterais: 'tijolo', rodape: true, calha: false, degrau: true } }, { tijolo: 'a.png' }, 'l.png', 2);
ok(cf.largura === 10 && cf.altura === 4 && cf.letreiro === 'l.png' && cf.toldo[1] === '#ffffff' && cf.marca === 'Patinhas Felizes' && cf.fonte === 2, 'config para o Godot: placa, nome e fonte da variação');
ok(cf.andares === 2 && cf.laterais === 'tijolo' && cf.rodape && cf.degrau && !cf.calha, 'config leva a variação (andares, laterais, rodapé, calha, degrau)');
const pedidosF = [];
const falsoF = http.createServer((req, res) => {
  let c = ''; req.on('data', (x) => (c += x)); req.on('end', () => {
    if (req.url === '/api/tags') return res.end('{"models":[]}');
    const b = JSON.parse(c); pedidosF.push(b);
    res.end(JSON.stringify({ response: b.prompt ? '{"tipo_en":"bakery","tipo_pt":"padaria","largura_m":7,"altura_m":4.5}' : '' }));
  });
});
await new Promise((r) => falsoF.listen(0, '127.0.0.1', r));
const planoF = await new (await import('../app/lib/descritor.mjs')).Descritor({ url: `http://127.0.0.1:${falsoF.address().port}` }).planejarFachada('padaria', 'Pão Bom');
falsoF.close();
ok(planoF.tipo_en === 'bakery' && planoF.marca === 'Pão Bom' && pedidosF[0].keep_alive === 0 && /Marca: Pão Bom/.test(pedidosF[0].prompt), 'planejar fachada: pede ao qwen com tipo e marca e descarrega');

console.log('desligar sozinho (janela fechada ou minimizada)');
const { deveEncerrar, SEM_SINAL_MS } = await import('../app/lib/vigia.mjs');
const agora = 1e9;
ok(!deveEncerrar({ recebeuPing: true, ultimoPing: agora - 70000, ocupado: false, agora }), 'janela minimizada (sinal a cada ~1 min) não desliga');
ok(!deveEncerrar({ recebeuPing: true, ultimoPing: agora - 30 * 60000, ocupado: true, agora }), 'com trabalho na fila nunca desliga');
ok(deveEncerrar({ recebeuPing: true, ultimoPing: agora - SEM_SINAL_MS - 1, ocupado: false, agora }), 'janela fechada e fila vazia: desliga');
ok(!deveEncerrar({ recebeuPing: false, ultimoPing: 0, ocupado: false, agora }), 'sem janela nenhuma (servidor de teste): não desliga');

console.log('fluxo do TRELLIS.2');
for (const cor of ['textura', 'vertices']) {
  const wf = trellis3d({ imagem: 'a.png', faces: 3000, textura: 512, cor, semente: 5, prefixo: 'x' });
  const ligacoes = Object.values(wf).flatMap((n) => Object.values(n.inputs).filter((v) => Array.isArray(v)));
  ok(ligacoes.every(([id, i]) => wf[id] && Number.isInteger(i)), `${cor}: toda ligação aponta para um nó que existe`);
  ok(wf.dec.inputs.target_face_count === 3000, `${cor}: o peso chega ao DecimateMesh`);
  ok(cor === 'vertices' ? wf.paint && !wf.uv : wf.bake && wf.uv.inputs.resolution === 512, `${cor}: usa a cor certa`);
  ok(wf.save.class_type === 'SaveGLB', `${cor}: salva .glb`);
}
try {
  const info = await (await fetch('http://127.0.0.1:8188/object_info', { signal: AbortSignal.timeout(3000) })).json();
  const wf = trellis3d({ imagem: 'a.png', faces: 3000, textura: 512, cor: 'textura', semente: 5, prefixo: 'x' });
  const v = trellis3d({ imagem: 'a.png', faces: 3000, textura: 512, cor: 'vertices', semente: 5, prefixo: 'x' });
  const nos = Object.values({ ...wf, ...v });
  ok(nos.every((n) => info[n.class_type]), 'motor ligado: todos os nós existem no ComfyUI');
  ok(nos.every((n) => Object.keys(info[n.class_type].input.required || {}).every((k) => k in n.inputs)), 'motor ligado: nenhuma entrada obrigatória faltando');
} catch { console.log('  (motor desligado: pulei a conferência com o ComfyUI)'); }

console.log('descritor com um Ollama falso');
const pedidos = [];
const falso = http.createServer((req, res) => {
  let c = ''; req.on('data', (x) => (c += x)); req.on('end', () => {
    if (req.url === '/api/tags') return res.end('{"models":[]}');
    const b = JSON.parse(c); pedidos.push(b);
    res.end(JSON.stringify({ response: b.prompt ? '{"nome_en":"motorcycle","nome_pt":"moto","categoria":"vehicle","medidas_m":{"largura":0.8,"profundidade":2,"altura":1.1},"descricao_en":"A red motorcycle."}' : '' }));
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const { Descritor } = await import('../app/lib/descritor.mjs');
const desc = await new Descritor({ url: `http://127.0.0.1:${falso.address().port}` }).descrever('uma moto vermelha');
falso.close();
ok(desc.nome_en === 'motorcycle' && desc.tamanho === 'grande' && desc.faces === 30000, 'moto vira veículo grande (30 mil faces)');
ok(pedidos[0].format === 'json' && pedidos[0].keep_alive === 0 && pedidos[0].model === 'qwen2.5:7b' && /JSON/.test(pedidos[0].system), 'pede JSON ao qwen2.5:7b e descarrega logo (keep_alive 0)');
ok(pedidos.length === 2 && pedidos[1].keep_alive === 0 && !pedidos[1].prompt, 'confirma a descarga da placa no fim');

console.log('limpeza no Godot');
// caixa de 2 x 1 x 4 (unidades do TRELLIS), fora do centro e flutuando em y = 5
function caixaGlb(cor) {
  const [x0, x1, y0, y1, z0, z1] = [3, 5, 5, 6, -1, 3];
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  const pos = Buffer.from(new Float32Array(v.flat()).buffer);
  const ind = Buffer.from(new Uint16Array(idx).buffer);
  const col = Buffer.from(new Float32Array(v.flatMap(() => [0.8, 0.3, 0.2, 1])).buffer);
  const bin = Buffer.concat([pos, ind, ...(cor ? [col] : [])]);
  const attrs = { POSITION: 0, ...(cor ? { COLOR_0: 2 } : {}) };
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: attrs, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: ind.length },
      ...(cor ? [{ buffer: 0, byteOffset: pos.length + ind.length, byteLength: col.length }] : [])],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [x0, y0, z0], max: [x1, y1, z1] }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
      ...(cor ? [{ bufferView: 2, componentType: 5126, count: 8, type: 'VEC4' }] : [])],
  };
  let js = Buffer.from(JSON.stringify(gltf)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const corpo = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + corpo.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.write('JSON', 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(corpo.length, 0); h2.write('BIN\0', 4);
  return Buffer.concat([cab, h1, js, h2, corpo]);
}
const limpeza = new Limpeza({ raiz: RAIZ });
const amb = limpeza.ambiente();
ok(/^[dD]:/.test(amb.APPDATA) && /^[dD]:/.test(amb.LOCALAPPDATA), 'o Godot grava logs e cache no D: (APPDATA e LOCALAPPDATA), nunca no C:');
if (!limpeza.disponivel()) { ok(false, 'Godot encontrado em ' + limpeza.godot); } else {
  for (const cor of [false, true]) {
    const ent = join(TMP, `caixa${cor ? '_cor' : ''}.glb`); const sai = join(TMP, `caixa${cor ? '_cor' : ''}_pronta.glb`);
    writeFileSync(ent, caixaGlb(cor));
    const r = await limpeza.limpar(ent, sai, 0.9);
    const [x, y, z] = r.tamanho_m;
    ok(perto(Math.max(x, y, z), 0.9) && perto(x, 0.45) && perto(y, 0.225), `${cor ? 'com cor' : 'sem cor'}: escala real (maior lado 0,9 m, proporção mantida)`);
    ok(perto(r.base_y, 0, 0.001) && perto(r.centro_xz[0], 0, 0.001) && perto(r.centro_xz[1], 0, 0.001), `${cor ? 'com cor' : 'sem cor'}: base no chão e centrado`);
    ok(r.faces === 12 && existsSync(sai) && r.bytes > 0, `${cor ? 'com cor' : 'sem cor'}: arquivo salvo com as 12 faces`);
    ok(r.cor_por_vertice === cor, `${cor ? 'com cor' : 'sem cor'}: cor por vértice ${cor ? 'mantida' : 'ausente'} no .glb`);
  }
  // correção por eixo: caixa 2 x 1 x 4 com medidas reais 0,5 x 0,5 x 0,9 (L x A x P): escala uniforme 0,225 e depois
  // x vai até 0,5 (+11%), y quer +122% mas para em +25% (0,281) e z já está certo (0,9)
  const ent = join(TMP, 'caixa.glb'); const sai = join(TMP, 'caixa_eixos.glb');
  const r = await limpeza.limpar(ent, sai, { largura: 0.5, altura: 0.5, profundidade: 0.9 }, 1.25);
  ok(perto(r.tamanho_m[0], 0.5) && perto(r.tamanho_m[1], 0.281) && perto(r.tamanho_m[2], 0.9), 'corrige cada eixo para a medida real, no máximo 25%');
  ok(perto(r.base_y, 0, 0.001), 'depois da correção a base continua no chão');
  console.log('fachada por peças e textura sem emenda (Godot)');
  const f = await limpeza.rodar('teste_fachada.gd', [], 180000);
  ok(f.entra_pela_porta && f.porta_dentro, 'um corpo de 1,7 m entra pela porta (a folha abre para dentro)');
  ok(f.parede_bloqueia && f.parede_lateral_bloqueia, 'parede e vitrine bloqueiam (não dá para atravessar)');
  ok(f.faces < 2500 && f.superficies <= 14, `loja leve: ${f.faces} faces em ${f.superficies} superfícies (uma por material)`);
  ok(f.deslocar_certo && f.emenda_some_ao_deslocar, 'deslocar meia volta deixa as bordas contínuas');
  ok(f.mascara_cruz, 'a máscara é a cruz do meio (só ela é repintada)');
  ok(f.mascara_fundo, 'máscara de prédio: fundo liso fora, parede lisa dentro (o BiRefNet tiraria a parede)');
  ok(f.degrau_entra && f.degrau_piso, 'com degrau na porta: o corpo sobe a rampa e entra; o piso de dentro fica na altura do degrau');
  ok(f.dois_andares_altura > 7 && f.dois_andares_janelas, `2 andares: ${f.dois_andares_altura} m de altura, com janelas em cima`);
  ok(f.texto_existe && f.texto_na_placa && f.texto_acento, 'o nome é escrito pelo Godot na placa, com acento ("Pão da Vila")');
  ok(f.laterais_tijolo, 'laterais e fundo com acabamento por fora (tijolo) e reboco por dentro');
  ok(f.padrao_arcos > 0.08 && f.padrao_tijolos < 0.04, `mede o padrão decorativo: desenho grande ${f.padrao_arcos}, tijolo miúdo ${f.padrao_tijolos}`);
  ok(f.parede_barrada, 'parede com padrão decorativo repetido é barrada (vira reboco liso)');
  ok(f.placa_existe && f.placa_paralela && f.placa_encostada && f.placa_centrada, 'letreiro paralelo à fachada, encostado nela e centrado sobre a porta');
  ok(f.texto_na_frente && f.contraste >= 4.5, `nome na frente da placa, dentro dela, com contraste ${f.contraste}:1 (mínimo 4,5)`);
  ok(f.floreiras_com_plantas, 'floreiras sob as vitrines com terra, folhagem e flores');
  ok(f.cruz && f.sem_cruz_fora_da_farmacia, 'farmácia tem a cruz verde luminosa; as outras lojas não');
  ok(f.placa_horario, 'toda fachada tem a placa de horário (OPEN/CLOSED) na vitrine, na altura dos olhos');
  const cfgF = join(TMP, 'fachada.json'); const glbF = join(TMP, 'fachada.glb');
  writeFileSync(cfgF, JSON.stringify({ largura: 7, altura: 4.5, toldo: ['#1e88e5', '#ffffff'] }));
  const ex2 = await limpeza.rodar('fachada_exportar.gd', [cfgF, glbF]);
  ok(existsSync(glbF) && ex2.colisoes >= 10 && Math.abs(ex2.tamanho_m[1] - 4.68) < 0.3 && ex2.faces < 2000, `exporta a loja: ${ex2.faces} faces, ${ex2.colisoes} caixas de colisão convexas ("-convcolonly")`);
  ok(ex2.no_arquivo.imagens_webp >= 1 && ex2.no_arquivo.imagens_outras === 0, `texturas dentro do .glb em WebP (${ex2.no_arquivo.imagens_webp} imagens, nenhuma PNG)`);
  ok(ex2.no_arquivo.colisao_invisivel, 'as caixas de colisão vão invisíveis no .glb (eram elas as manchas pontilhadas e as laterais brancas)');
  writeFileSync(cfgF, JSON.stringify({ largura: 8, altura: 4.4, marca: 'Pão da Vila', fonte: 1, andares: 2, degrau: true, calha: true, rodape: true, laterais: 'tijolo' }));
  const ex3 = await limpeza.rodar('fachada_exportar.gd', [cfgF, glbF]);
  ok(ex3.no_arquivo.texto && ex3.faces_texto > 50 && ex3.faces_texto < 4000 && ex3.colisoes > ex2.colisoes, `letreiro escrito vai no .glb (${ex3.faces_texto} faces de letras), com a rampa e as janelas de cima na colisão`);
  ok(ex3.bytes < 3 * 1024 * 1024, `loja de 2 andares continua leve: ${(ex3.bytes / 1024 / 1024).toFixed(1)} MB`);
  try { await limpeza.limpar(join(TMP, 'nao_existe.glb'), join(TMP, 'x.glb'), 1); ok(false, 'arquivo inexistente dá erro'); } catch (e) { ok(/não consegui ler/.test(e.message), 'arquivo inexistente dá erro claro'); }
}

rmSync(TMP, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
