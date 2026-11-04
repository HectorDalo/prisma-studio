# Proposta: kit de interior por tipo de loja (ainda não construído)

## Como o EnglishQuest faz os interiores hoje

- Cada lugar tem um `data/interiors/<id>.json` lido por `scripts/interior.gd`, no estilo `"cozy"` (`interior_cozy.gd`):
  `size` em blocos de 2 m (6 x 5 = 12 x 10 m), `height`, `door_tile`, `windows`, `lights`, `spawn`, `staff_area`.
- **Móveis** (`furniture`): modelos CC0 já no projeto, cada um com `pos`, `yaw` e `size` (o maior lado real, em metros):
  `house/...` (Quaternius), `kaykit/...` (KayKit) e `food/...` (Kenney). O café tem 91 móveis, o mercadinho 309 e o restaurante 111.
- **Blocos** (`blocks`): peças simples feitas na hora (caixa, cilindro, esfera) para balcão, vitrine e prateleira, com cor,
  aspereza, `solid` e `word`.
- **Lugares para sentar** (`seats`, com `table` e `yaw`), **placas** (`signs`) e o **tema** do lugar em `cozy_themes.gd`
  (piso, paredes, teto e luminárias).
- **Vocabulário:** `"vocabulary": true` no JSON; a palavra de cada objeto vem de `data/vocabulary.json`:
  - `words` dá `{id: {en, pt}}`;
  - `models` liga o começo do nome do modelo à palavra;
  - ou o item traz `"word"`.

  Cada palavra tem áudio em `assets/audio/vocab/<id>.wav` (Piper).
- **Regras conferidas por testes:**
  - `test_objects`: tamanho real (`REAL_SIZE`), objetos apoiados e quadros sem tapar portas;
  - `test_seats`: assentos;
  - `test_vocabulary`: toda palavra tem áudio;
  - `test_data`: tema próprio e tudo o que o NPC menciona existe na cena (`MENTIONS`).

## A proposta: o Prisma monta um "pacote de interior" no MESMO formato

O Prisma não inventaria um sistema novo de interior. Ele gera um rascunho do mesmo `data/interiors/<id>.json` e, só quando
falta peça, um objeto novo do TRELLIS.2. Tudo passa pela tela de revisão antes.

1. **Kit por tipo de loja**: uma tabela no Prisma (`app/lib/kits.mjs`) com as zonas e os objetos de cada tipo:

   | Zona | Para que serve |
   |---|---|
   | Balcão | caixa e atendimento (bloco ou móvel do KayKit), com o NPC atrás (`staff_area`) |
   | Prateleiras / vitrine | produtos à mostra (o que o NPC vende precisa estar ali) |
   | Mesas e assentos | só nos restaurantes e cafés (com `seats` conferidos pelo `test_seats`) |
   | Produtos | os objetos pequenos que ensinam vocabulário |
   | Decoração | quadros, plantas e o que dá identidade (tema próprio) |

2. **Primeiro reaproveita, depois gera.** Para cada objeto do kit o Prisma procura, nesta ordem:
   1. um modelo CC0 que o jogo já tem (`house/`, `kaykit/`, `food/`), pelo nome em `vocabulary.json` → `models`;
   2. um bloco simples (balcão, prateleira);
   3. só então um objeto novo no TRELLIS.2: pequeno, ~3 mil faces, cor por vértice, estilo travado, que vai para
      `assets/prisma/<palavra>.glb` com o `.json` de vocabulário (`en`, `pt`, medidas da tabela padrão).
3. **O que sai do Prisma** (para revisar e exportar, com backup):
   - `data/interiors/<id>.json` (rascunho no formato do jogo, `"vocabulary": true`, `seats`, `lights`, `staff_area`);
   - os `.glb` novos em `assets/prisma/` e as entradas novas de `words` e `models` para `data/vocabulary.json`;
   - a lista das palavras que precisam de áudio (`geradores/`) e a linha do `LICENCAS.md`;
   - o tema (piso, paredes, teto) com as texturas sem emenda do próprio Prisma, para `cozy_themes.gd`.
4. **Depois, no jogo**: gerar os áudios e rodar `test_objects`, `test_seats`, `test_vocabulary` e `test_data`.
   O jogo só dá a lista de tamanhos (`REAL_SIZE`) e os testes conferem; o Prisma já usa a mesma tabela de medidas.

## Objetos de cada kit (o qwen sugere, você revisa)

| Loja | Balcão e atendimento | Prateleiras / produtos | Mesas e assentos | Palavras novas (exemplos) |
|---|---|---|---|---|
| Kumo Ramen House | balcão com banquetas | tigelas de lámen, hashis, cardápio na parede | mesas baixas | ramen bowl, chopsticks, noodles, broth |
| Chez Margot | balcão do bar | baguete, croissant, garrafas, quadro de giz | mesinhas de bistrô | baguette, croissant, menu, bill |
| Saffron Lane | balcão com caixa | potes de temperos, panela de curry, naan | mesas com toalha | curry, rice, spice, naan |
| Casa Cactus | balcão | pratos de taco, potes de salsa, vasos de cacto | mesas coloridas | taco, salsa, lime, tortilla |
| Greenleaf Drugstore | balcão do farmacêutico com caixa | caixas de remédio, frascos, curativos, pasta de dente, xampu | (não tem) | medicine, pill, bandage, prescription |
| Correio | balcão com balança | caixas postais, pacotes, envelopes, selos | fila com cordão | package, envelope, stamp, mailbox |
| Clínica | recepção | armário, termômetro, kit de primeiros socorros | cadeiras de espera, maca | thermometer, appointment, nurse |
| Banco | caixa com vidro | caixa eletrônico, folhetos | cadeiras de espera | ATM, teller, deposit, account |

## O que eu preciso de você para construir

1. Aprovar o formato: rascunho do JSON do jogo + objetos novos só quando faltar.
2. Ordem: começar por uma loja (proponho a Greenleaf Drugstore, que já tem fachada no teste).
3. Quem posiciona os móveis: o Prisma sugere um layout por zonas (balcão no fundo, prateleiras nas laterais,
   mesas no meio) e você ajusta; ou você posiciona e o Prisma só gera os objetos e o vocabulário.
