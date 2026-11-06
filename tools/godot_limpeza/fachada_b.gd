extends RefCounted
## Fachada montada por peças (método B): paredes, vitrines, porta com abertura de verdade, toldo, cornija, telhado e letreiro,
## com texturas sem emenda do Prisma em escala real (UV em metros). Tudo vira UMA malha com uma superfície por material
## (poucas chamadas de desenho) + colisão em caixas, deixando o vão da porta livre para entrar.
## O NOME da loja no letreiro é escrito pelo Godot com uma fonte de verdade (letras 3D, acentos certos); o FLUX só faz a placa.
## Variações por loja: 1 ou 2 andares, rodapé de pedra, calha com descida e degrau na porta (com rampa invisível na colisão).
## Peças padrão de toda fachada: floreiras com plantas sob as vitrines, a placa de horário ("PlacaHorario": o jogo escreve
## OPEN/CLOSED e o horário nela, como no Maple Café) e o letreiro: placa escura lisa ("Placa", paralela e encostada na
## parede, centrada sobre a porta) com o nome em letra clara. Farmácia ganha a cruz verde luminosa ("cruz": true).
## Parede com padrão decorativo repetido (arcos, ornamentos, mosaico) é barrada: vira reboco liso (padrao_decorativo).
## Frente da loja em z = 0 olhando para +Z; o salão vai para -Z. Base em y = 0.
## Uso: var loja: Node3D = preload("fachada_b.gd").montar({ ...config... })

const T := 0.25          # espessura das paredes
const ANDAR := 3.0       # altura de cada andar de cima
const DEGRAU := 0.15     # altura do degrau da porta (o piso de dentro sobe junto)
# fontes estáticas (as variáveis, como a Fredoka, perdem letras ao virar 3D: o "d" sumia); SIL OFL 1.1, em fontes/
const FONTES := ["LilitaOne-Regular.ttf", "Pacifico-Regular.ttf", "AlfaSlabOne-Regular.ttf"]
const PASTA_FONTES := "D:/Claude/prisma/tools/godot_limpeza/fontes"   # usada quando este arquivo roda dentro de outro projeto (o jogo)
## Limite do padrão decorativo: dispersão do brilho entre as médias de 8 x 8 blocos da textura. Tijolo, reboco, madeira e
## telha ficam abaixo de 0,04 (o desenho é miúdo e se repete por igual); arcos e ornamentos grandes passam de 0,14.
const PADRAO_MAX := 0.08
const CONTRASTE_MIN := 4.5     # letra x placa (razão de contraste da WCAG)
const CREME := Color("#f6ead0")
const CARVAO := Color("#1f2622")
const CORES_FLOR := [Color("#f4f1e8"), Color("#f2c94c"), Color("#e9889a")]


static func padrao() -> Dictionary:
	return {
		"largura": 8.0, "altura": 4.4, "profundidade": 5.0,
		"porta": Vector2(1.15, 2.35),                 # largura x altura do vão
		"vitrine": Vector2(2.3, 1.9), "vitrine_y": 0.7,
		"texturas": {}, "escala": {"tijolo": 1.3, "reboco": 2.0, "madeira": 1.2, "piso": 1.6, "telhado": 1.5},
		"letreiro": "", "marca": "", "fonte": 0, "cor_texto": null,
		"toldo": [Color("#2f6e4f"), Color("#f3efe2")], "vidro": Color(0.55, 0.7, 0.75, 0.32),
		"andares": 1, "laterais": "reboco", "rodape": false, "calha": false, "degrau": false,
		"cor_detalhe": null,        # cor dos detalhes pintados (batentes, molduras, cornija, floreiras); null = textura de madeira
		"cor_placa": null,          # fundo do letreiro; null = cor dos detalhes (ou do toldo) bem escurecida
		"cruz": false,              # cruz verde de farmácia
		"placa_flux": false,        # usar a imagem do FLUX como placa (antiga; em perspectiva ela parece torta)
	}


## Dispersão do brilho entre as médias de 8 x 8 blocos: alta quando a textura tem um desenho grande repetido.
static func padrao_decorativo(img: Image) -> float:
	var w := img.get_width()
	var h := img.get_height()
	var medias: Array[float] = []
	var passo := maxi(1, w / 256)
	for by in 8:
		for bx in 8:
			var soma := 0.0
			var k := 0
			for y in range(by * h / 8, (by + 1) * h / 8, passo):
				for x in range(bx * w / 8, (bx + 1) * w / 8, passo):
					soma += img.get_pixel(x, y).get_luminance()
					k += 1
			medias.append(soma / maxi(k, 1))
	var m := 0.0
	for v in medias:
		m += v
	m /= medias.size()
	var d := 0.0
	for v in medias:
		d += (v - m) * (v - m)
	return sqrt(d / medias.size())


## A textura (arquivo) tem padrão decorativo grande?
static func tem_padrao(caminho: String) -> bool:
	var img := Image.load_from_file(caminho)
	return img != null and padrao_decorativo(img) > PADRAO_MAX


## Razão de contraste (WCAG) entre duas cores.
static func contraste(a: Color, b: Color) -> float:
	var la := lum_rel(a)
	var lb := lum_rel(b)
	return (maxf(la, lb) + 0.05) / (minf(la, lb) + 0.05)


static func lum_rel(c: Color) -> float:
	var r := 0.0
	var pesos := [0.2126, 0.7152, 0.0722]
	var canais := [c.r, c.g, c.b]
	for i in 3:
		var v: float = canais[i]
		r += pesos[i] * (v / 12.92 if v <= 0.03928 else pow((v + 0.055) / 1.055, 2.4))
	return r


## Fundo e letra do letreiro: placa escura e letra creme, com contraste garantido.
static func cores_letreiro(cfg: Dictionary) -> Array:
	var base: Color = Color(cfg["toldo"][0])
	if cfg.get("cor_placa") != null:
		base = Color(cfg["cor_placa"])
	elif cfg.get("cor_detalhe") != null:
		base = Color(cfg["cor_detalhe"])
	var placa := base
	while lum_rel(placa) > 0.035 and placa.v > 0.05:
		placa = placa.darkened(0.15)
	var letra: Color = CREME if cfg.get("cor_texto") == null else Color(cfg["cor_texto"])
	if contraste(placa, letra) < CONTRASTE_MIN:
		placa = CARVAO
		letra = CREME
	return [placa, letra]


static func montar(cfg_in: Dictionary) -> Node3D:
	var cfg := padrao()
	cfg.merge(cfg_in, true)
	for k in ["porta", "vitrine"]:          # vindo de JSON: listas viram Vector2 e textos viram cores
		if cfg[k] is Array:
			cfg[k] = Vector2(cfg[k][0], cfg[k][1])
	cfg["toldo"] = [Color(cfg["toldo"][0]), Color(cfg["toldo"][1])]
	# paredes com padrão decorativo: o montador troca por reboco liso (e o relatório conta quais foram barradas)
	var bloqueados: Array = []
	var tex: Dictionary = cfg["texturas"]
	for slot in ["tijolo", "reboco"]:
		if tex.has(slot) and tem_padrao(tex[slot]):
			bloqueados.append(slot)
	cfg["_bloqueados"] = bloqueados
	cfg["_cores_letreiro"] = cores_letreiro(cfg)
	cfg["_cores_flor"] = CORES_FLOR
	var W: float = cfg["largura"]
	var H: float = cfg["altura"]                     # altura do térreo
	var D: float = cfg["profundidade"]
	var andares: int = clampi(int(cfg["andares"]), 1, 2)
	var HT: float = H + (andares - 1) * ANDAR        # altura total da fachada
	var porta: Vector2 = cfg["porta"]
	var vit: Vector2 = cfg["vitrine"]
	var vy: float = cfg["vitrine_y"]
	var piso_y: float = DEGRAU if cfg["degrau"] else 0.0
	var ext: String = "tijolo" if cfg["laterais"] == "tijolo" else "reboco"   # acabamento de fora das laterais e do fundo
	var raiz := Node3D.new()
	raiz.name = "FachadaB"
	raiz.set_meta("paredes_barradas", bloqueados)
	var m := _Montador.new(cfg)
	# --- parede da frente do térreo, recortada em colunas: vitrine | parede | porta | parede | vitrine
	var vx0 := porta.x / 2.0 + 0.45                 # começo da vitrine (depois do batente)
	var xs := [-W / 2, -vx0 - vit.x, -vx0, -porta.x / 2, porta.x / 2, vx0, vx0 + vit.x, W / 2]
	for i in xs.size() - 1:
		var x0: float = xs[i]
		var x1: float = xs[i + 1]
		var meio := (x0 + x1) / 2.0
		var eh_porta := absf(meio) < porta.x / 2.0
		var eh_vitrine := absf(meio) > vx0 and absf(meio) < vx0 + vit.x
		if eh_porta:
			m.caixa("tijolo", Vector3(x0, porta.y, -T), Vector3(x1, H, 0), true)
		elif eh_vitrine:
			m.caixa("madeira", Vector3(x0, 0, -T), Vector3(x1, vy, 0.04), true)        # painel de madeira sob a vitrine
			m.caixa("tijolo", Vector3(x0, vy + vit.y, -T), Vector3(x1, H, 0), true)
			m.caixa("vidro", Vector3(x0, vy, -T * 0.55), Vector3(x1, vy + vit.y, -T * 0.45), false)
			# a colisão da vitrine ocupa a espessura toda da parede: um vidro de 2,5 cm (0,5 cm depois de recuar 1 cm de cada
			# lado na exportação) deixava a cápsula do jogador atravessar
			m.solidos.append(AABB(Vector3(x0, vy, -T), Vector3(x1 - x0, vit.y, T)))
			for y in [vy, vy + vit.y - 0.08]:
				m.caixa("madeira", Vector3(x0, y, -T * 0.5), Vector3(x1, y + 0.08, 0.05), false)
			m.caixa("madeira", Vector3(meio - 0.04, vy, -T * 0.5), Vector3(meio + 0.04, vy + vit.y, 0.03), false)
		else:
			m.caixa("tijolo", Vector3(x0, 0, -T), Vector3(x1, H, 0), true)
	# batente e porta (aberta para dentro, dobradiça à esquerda)
	var px := porta.x / 2.0
	m.caixa("madeira", Vector3(-px - 0.1, 0, -T - 0.02), Vector3(-px, porta.y + 0.1, 0.06), false)
	m.caixa("madeira", Vector3(px, 0, -T - 0.02), Vector3(px + 0.1, porta.y + 0.1, 0.06), false)
	m.caixa("madeira", Vector3(-px - 0.1, porta.y, -T - 0.02), Vector3(px + 0.1, porta.y + 0.1, 0.06), false)
	var folha := m.caixa_solta("madeira", Vector3(porta.x - 0.06, porta.y - 0.04 - piso_y, 0.05))
	folha.name = "Porta"
	folha.position = Vector3(-px + 0.03 + (porta.x - 0.06) / 2.0 * cos(deg_to_rad(100)), piso_y + (porta.y - 0.04 - piso_y) / 2.0, -T - (porta.x - 0.06) / 2.0 * sin(deg_to_rad(100)))
	folha.rotation.y = deg_to_rad(100)
	raiz.add_child(folha)
	# --- andar de cima: parede com janelas (sem salão; o vidro é escuro, com cortina)
	if andares == 2:
		var jw := 1.1
		var jh := 1.4
		var jy := H + 0.8
		var n := 3 if W >= 7.0 else 2
		var cols: Array[float] = [-W / 2]
		for k in n:
			var c := -W / 2 + W * (k + 0.5) / n
			cols.append(c - jw / 2)
			cols.append(c + jw / 2)
		cols.append(W / 2)
		for i in cols.size() - 1:
			var x0 := cols[i]
			var x1 := cols[i + 1]
			if i % 2 == 1:     # janela
				m.caixa("tijolo", Vector3(x0, H, -T), Vector3(x1, jy, 0), true)
				m.caixa("tijolo", Vector3(x0, jy + jh, -T), Vector3(x1, HT, 0), true)
				m.caixa("vidro_escuro", Vector3(x0, jy, -T * 0.6), Vector3(x1, jy + jh, -T * 0.5), true)
				m.caixa("madeira", Vector3(x0 - 0.06, jy - 0.08, -T * 0.5), Vector3(x1 + 0.06, jy, 0.1), false)      # peitoril
				m.caixa("madeira", Vector3(x0 - 0.06, jy + jh, -T * 0.5), Vector3(x1 + 0.06, jy + jh + 0.08, 0.04), false)
				m.caixa("madeira", Vector3((x0 + x1) / 2 - 0.035, jy, -T * 0.5), Vector3((x0 + x1) / 2 + 0.035, jy + jh, 0.02), false)
			else:
				m.caixa("tijolo", Vector3(x0, H, -T), Vector3(x1, HT, 0), true)
		m.caixa("madeira", Vector3(-W / 2 - 0.05, H - 0.12, -T), Vector3(W / 2 + 0.05, H + 0.05, 0.12), false)   # faixa entre andares
	# --- laterais e fundo: acabamento de fora (tijolo ou reboco) e reboco por dentro
	m.parede_dupla(ext, Vector3(-W / 2, 0, -D), Vector3(-W / 2 + T, HT, -T), 0, H)
	m.parede_dupla(ext, Vector3(W / 2 - T, 0, -D), Vector3(W / 2, HT, -T), 1, H)
	m.parede_dupla(ext, Vector3(-W / 2, 0, -D - T), Vector3(W / 2, HT, -D), 2, H)
	m.caixa("piso", Vector3(-W / 2 + T, piso_y - 0.05, -D), Vector3(W / 2 - T, piso_y, -T), true)
	m.caixa("reboco", Vector3(-W / 2 + T, H - 0.05, -D), Vector3(W / 2 - T, H, -T), false)
	# --- cornija e telhado (laje com manta/telha: textura própria)
	m.caixa("madeira", Vector3(-W / 2 - 0.15, HT - 0.35, -T), Vector3(W / 2 + 0.15, HT, 0.25), false)
	m.caixa("telhado", Vector3(-W / 2 - 0.2, HT, -D - T - 0.1), Vector3(W / 2 + 0.2, HT + 0.18, 0.3), false)
	# --- rodapé de pedra (frente sem a porta, e laterais)
	if cfg["rodape"]:
		for par in [[-W / 2 - 0.03, -px - 0.1], [px + 0.1, W / 2 + 0.03]]:
			m.caixa("pedra", Vector3(par[0], 0, -0.02), Vector3(par[1], 0.35, 0.05), false)
		for lado in [-1.0, 1.0]:
			var xl: float = lado * (W / 2 + 0.015)
			m.caixa("pedra", Vector3(xl - 0.03, 0, -D - T), Vector3(xl + 0.03, 0.35, -0.02), false)
	# --- calha na frente e descida no canto direito
	if cfg["calha"]:
		m.caixa("metal", Vector3(-W / 2 - 0.15, HT - 0.5, 0.25), Vector3(W / 2 + 0.15, HT - 0.38, 0.38), false)
		m.caixa("metal", Vector3(W / 2 - 0.2, 0.05, 0.27), Vector3(W / 2 - 0.1, HT - 0.45, 0.36), false)
		m.caixa("metal", Vector3(W / 2 - 0.25, 0.0, 0.25), Vector3(W / 2 - 0.05, 0.08, 0.5), false)
	# --- degrau na porta: a pedra se vê; na colisão vira uma rampa suave (um degrau de verdade trava a cápsula)
	if cfg["degrau"]:
		m.caixa("pedra", Vector3(-px - 0.25, 0, 0), Vector3(px + 0.25, DEGRAU, 0.38), false)
		var ang := atan(DEGRAU / 0.6)
		var xf := Transform3D(Basis(Vector3.RIGHT, ang), Vector3(0, DEGRAU / 2.0 - 0.05 * cos(ang), 0.3 - 0.05 * sin(ang)))
		m.solido_girado(Vector3(porta.x + 0.5, 0.1, sqrt(0.36 + DEGRAU * DEGRAU)), xf)
	# --- floreiras com plantas sob as vitrines (colidem: ninguém atravessa o canteiro)
	for lado in [-1.0, 1.0]:
		var xa: float = lado * vx0
		var xb: float = lado * (vx0 + vit.x)
		m.floreira(Vector3(minf(xa, xb) + 0.05, 0.0, 0.0), Vector3(maxf(xa, xb) - 0.05, minf(0.5, vy - 0.12), 0.38))
	# --- placa de horário no vidro da vitrine da direita, na altura dos olhos (o jogo escreve OPEN/CLOSED e o horário)
	var horario := m.caixa_solta("placa_horario", Vector3(0.86, 0.42, 0.012))
	horario.name = "PlacaHorario"
	horario.position = Vector3(vx0 + 0.1 + 0.43, vy + 0.85, -T * 0.45 + 0.012)
	raiz.add_child(horario)
	# --- toldo inclinado com listras + barrado
	var aw := vx0 + vit.x + 0.15
	m.toldo(Vector3(-aw, vy + vit.y + 0.35, 0.0), Vector3(aw, vy + vit.y - 0.15, 1.3))
	# --- letreiro: placa lisa e escura, paralela e encostada na parede, centrada sobre a porta, com moldura na cor dos
	# detalhes; o nome é escrito pelo Godot por cima, em letra clara
	var lw := minf(W * 0.62, 5.2)
	var placa_lo := Vector3(-lw / 2, H - 1.35, 0.0)
	var placa_hi := Vector3(lw / 2, H - 0.45, 0.1)
	if cfg["placa_flux"] and cfg["letreiro"] != "":
		m.caixa("letreiro", placa_lo, placa_hi, false)
	else:
		var placa := m.caixa_solta("placa", placa_hi - placa_lo)
		placa.name = "Placa"
		placa.position = (placa_lo + placa_hi) / 2.0
		raiz.add_child(placa)
		for y in [[placa_lo.y - 0.06, placa_lo.y], [placa_hi.y, placa_hi.y + 0.06]]:
			m.caixa("madeira", Vector3(placa_lo.x - 0.06, y[0], 0.0), Vector3(placa_hi.x + 0.06, y[1], placa_hi.z + 0.02), false)
		for x in [[placa_lo.x - 0.06, placa_lo.x], [placa_hi.x, placa_hi.x + 0.06]]:
			m.caixa("madeira", Vector3(x[0], placa_lo.y, 0.0), Vector3(x[1], placa_hi.y, placa_hi.z + 0.02), false)
	# --- cruz verde de farmácia, luminosa, entre o letreiro e o canto da fachada
	if cfg["cruz"]:
		var cx := (lw / 2.0 + 0.06 + W / 2.0) / 2.0
		var tam := minf(0.9, W / 2.0 - lw / 2.0 - 0.3)
		var cy := (placa_lo.y + placa_hi.y) / 2.0
		var braco := tam / 3.0
		m.caixa("cruz", Vector3(cx - tam / 2, cy - braco / 2, 0.0), Vector3(cx + tam / 2, cy + braco / 2, 0.08), false)
		m.caixa("cruz", Vector3(cx - braco / 2, cy - tam / 2, 0.0), Vector3(cx + braco / 2, cy - braco / 2, 0.08), false)
		m.caixa("cruz", Vector3(cx - braco / 2, cy + braco / 2, 0.0), Vector3(cx + braco / 2, cy + tam / 2, 0.08), false)
		var brilho := OmniLight3D.new()
		brilho.name = "LuzCruz"
		brilho.position = Vector3(cx, cy, 0.5)
		brilho.light_color = Color("#3ee07a")
		brilho.omni_range = 1.6
		brilho.light_energy = 0.6
		raiz.add_child(brilho)
	raiz.add_child(m.malha())
	var texto := m.texto_letreiro(placa_lo, placa_hi)
	if texto:
		raiz.add_child(texto)
	raiz.add_child(m.colisao())
	var luz := OmniLight3D.new()
	luz.position = Vector3(0, H - 0.8, -D / 2)
	luz.light_color = Color(1.0, 0.85, 0.65)
	luz.omni_range = maxf(W, D)
	luz.light_energy = 1.2
	raiz.add_child(luz)
	return raiz


class _Montador:
	var cfg: Dictionary
	var st := {}        # material -> SurfaceTool
	var mats := {}
	var solidos: Array[AABB] = []
	var girados: Array = []          # [tamanho, Transform3D] (rampa do degrau)
	var luminancia_placa := -1.0

	func _init(c: Dictionary) -> void:
		cfg = c

	func material(nome: String) -> StandardMaterial3D:
		if mats.has(nome):
			return mats[nome]
		var mt := StandardMaterial3D.new()
		mt.resource_name = nome
		mt.roughness = 0.9
		var tex: Dictionary = cfg["texturas"]
		if nome == "vidro":
			mt.albedo_color = cfg["vidro"]
			mt.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mt.roughness = 0.1
			mt.metallic_specular = 0.8
		elif nome == "vidro_escuro":
			mt.albedo_color = Color(0.16, 0.2, 0.26)
			mt.roughness = 0.15
			mt.metallic_specular = 0.9
		elif nome == "pedra":
			mt.albedo_color = Color("#9c968b")
		elif nome == "metal":
			mt.albedo_color = Color("#585e66")
			mt.metallic = 0.5
			mt.roughness = 0.5
		elif nome == "letreiro" and cfg["letreiro"] != "":
			mt.albedo_texture = _textura(cfg["letreiro"], false)
		elif nome == "placa":
			mt.albedo_color = cfg["_cores_letreiro"][0]
			mt.roughness = 0.7
		elif nome == "placa_horario":
			mt.albedo_color = Color("#1f2622")
			mt.roughness = 0.7
		elif nome == "cruz":
			mt.albedo_color = Color("#0b8a3a")
			mt.emission_enabled = true
			mt.emission = Color("#079a3a")
			mt.emission_energy_multiplier = 0.45
		elif nome == "terra":
			mt.albedo_color = Color("#4a3426")
		elif nome == "planta":
			mt.albedo_color = Color("#3f8a3c")
			mt.roughness = 0.8
		elif nome.begins_with("flor"):
			mt.albedo_color = cfg["_cores_flor"][int(nome.substr(4))]
		elif nome == "madeira" and cfg["cor_detalhe"] != null:
			mt.albedo_color = Color(cfg["cor_detalhe"])     # madeira pintada na cor dos detalhes da marca
			mt.roughness = 0.75
		elif (nome == "tijolo" or nome == "reboco") and nome in cfg["_bloqueados"]:
			# parede com padrão decorativo repetido: barrada, vira reboco liso (ou a cor do reboco, se ele também tiver)
			if nome == "tijolo" and tex.has("reboco") and not ("reboco" in cfg["_bloqueados"]):
				mt.albedo_texture = _textura(tex["reboco"], true)
			else:
				mt.albedo_color = Color("#ece3cf")
		elif nome == "toldo":
			mt.albedo_texture = _listras(cfg["toldo"][0], cfg["toldo"][1])
		elif tex.has(nome):
			mt.albedo_texture = _textura(tex[nome], true)
		else:
			mt.albedo_color = {"tijolo": Color("#a5523a"), "reboco": Color("#ece3cf"), "madeira": Color("#2f5a43"), "piso": Color("#b98a52"),
				"telhado": Color("#4a4f55"), "letreiro": Color("#2f4a3a")}.get(nome, Color.GRAY)
		mats[nome] = mt
		return mt

	func _textura(caminho: String, repetir: bool) -> Texture2D:
		var img := Image.load_from_file(caminho)
		if img == null:
			return null
		img.convert(Image.FORMAT_RGB8)    # sem canal alfa: nada de transparência por engano
		if not repetir:
			_recortar_fundo(img)
			luminancia_placa = _luminancia(img)
		# 512 px bastam para uma textura que repete a cada ~1,5 m (e o .glb fica 4 vezes menor); placa até 1024 de largura
		var maximo := 512 if repetir else 1024
		if img.get_width() > maximo:
			img.resize(maximo, int(img.get_height() * float(maximo) / img.get_width()), Image.INTERPOLATE_LANCZOS)
		img.generate_mipmaps()
		return ImageTexture.create_from_image(img)

	func _luminancia(img: Image) -> float:
		var s := 0.0
		var n := 0
		var w := img.get_width()
		var h := img.get_height()
		for y in range(h / 4, 3 * h / 4, maxi(1, h / 16)):
			for x in range(w / 6, 5 * w / 6, maxi(1, w / 32)):
				s += img.get_pixel(x, y).get_luminance()
				n += 1
		return s / maxf(n, 1)

	## Recorta só a placa. O FLUX desenha a placa no meio de um fundo liso (preto, cinza, às vezes com degradê). O fundo é
	## tudo o que está ligado à borda e muda pouco de um pixel para o vizinho (cresce a partir das bordas); a placa é o que sobra.
	func _recortar_fundo(img: Image) -> void:
		var w := img.get_width()
		var h := img.get_height()
		var pq := img.duplicate() as Image
		var lw := 256
		var lh := maxi(8, int(h * 256.0 / w))
		pq.resize(lw, lh, Image.INTERPOLATE_BILINEAR)
		var fundo := PackedByteArray()
		fundo.resize(lw * lh)
		var fila := PackedInt32Array()
		for x in lw:
			fila.append(x)
			fila.append((lh - 1) * lw + x)
		for y in lh:
			fila.append(y * lw)
			fila.append(y * lw + lw - 1)
		for p in fila:
			fundo[p] = 1
		var i := 0
		while i < fila.size():
			var p := fila[i]
			i += 1
			var x := p % lw
			var y := p / lw
			var c := pq.get_pixel(x, y)
			for d in [[-1, 0], [1, 0], [0, -1], [0, 1]]:
				var nx: int = x + d[0]
				var ny: int = y + d[1]
				if nx < 0 or ny < 0 or nx >= lw or ny >= lh:
					continue
				var q := ny * lw + nx
				if fundo[q] == 1:
					continue
				var c2 := pq.get_pixel(nx, ny)
				if absf(c.r - c2.r) + absf(c.g - c2.g) + absf(c.b - c2.b) < 0.07:
					fundo[q] = 1
					fila.append(q)
		var x0 := lw
		var y0 := lh
		var x1 := -1
		var y1 := -1
		for p in lw * lh:
			if fundo[p] == 0:
				x0 = mini(x0, p % lw)
				x1 = maxi(x1, p % lw)
				y0 = mini(y0, p / lw)
				y1 = maxi(y1, p / lw)
		if x1 - x0 < lw * 0.2 or y1 - y0 < lh * 0.1:
			return    # não achou uma placa clara: usa a imagem inteira
		var fx := float(w) / lw
		var fy := float(h) / lh
		var r := Rect2i(int((x0 + 1) * fx), int((y0 + 1) * fy), int((x1 - x0 - 1) * fx), int((y1 - y0 - 1) * fy))
		img.copy_from(img.get_region(r))

	func _listras(a: Color, b: Color) -> Texture2D:
		var img := Image.create(64, 8, false, Image.FORMAT_RGB8)
		for x in 64:
			for y in 8:
				img.set_pixel(x, y, a if (x / 16) % 2 == 0 else b)
		return ImageTexture.create_from_image(img)

	## Nome da loja em letras 3D (TextMesh) com uma das 3 fontes, centrado na placa e na cor que contrasta com ela.
	func texto_letreiro(lo: Vector3, hi: Vector3) -> MeshInstance3D:
		var marca := String(cfg["marca"]).strip_edges()
		if marca == "":
			return null
		if cfg["placa_flux"]:
			material("letreiro")    # carrega a placa (e mede o quanto ela é clara)
		var arquivo: String = FONTES[clampi(int(cfg["fonte"]), 0, FONTES.size() - 1)]
		var pasta := "res://fontes" if FileAccess.file_exists("res://fontes/" + arquivo) else String(cfg.get("pasta_fontes", PASTA_FONTES))
		var ff := FontFile.new()
		if ff.load_dynamic_font(ProjectSettings.globalize_path(pasta.path_join(arquivo))) != OK:
			return null
		var fonte: Font = ff
		var tm := TextMesh.new()
		tm.text = marca
		tm.font = fonte
		# letras com curvas mais grossas: a placa fica a metros de distância (o detalhe fino só pesaria o arquivo)
		tm.font_size = 32
		tm.pixel_size = 0.03
		tm.depth = 0.04
		tm.curve_step = 4.0
		var mt := StandardMaterial3D.new()
		mt.resource_name = "texto"
		var cor = cfg["cor_texto"]
		if cfg["placa_flux"] and cfg["letreiro"] != "":
			if cor == null:
				cor = Color("#3a2414") if luminancia_placa > 0.5 else Color("#f6ead0")
		else:
			cor = cfg["_cores_letreiro"][1]
		mt.albedo_color = Color(cor)
		mt.roughness = 0.6
		if not cfg["placa_flux"]:
			# letreiro iluminado: a letra clara continua clara com a fachada na sombra
			mt.emission_enabled = true
			mt.emission = Color(cor)
			mt.emission_energy_multiplier = 0.55
		tm.material = mt
		var mi := MeshInstance3D.new()
		mi.name = "Letreiro"
		mi.mesh = tm
		var caixa := tm.get_aabb()
		var esc := minf((hi.x - lo.x) * 0.76 / maxf(caixa.size.x, 0.001), (hi.y - lo.y) * 0.55 / maxf(caixa.size.y, 0.001))
		mi.scale = Vector3(esc, esc, 0.5)
		mi.position = Vector3((lo.x + hi.x) / 2.0 - caixa.get_center().x * esc, (lo.y + hi.y) / 2.0 - caixa.get_center().y * esc, hi.z + tm.depth * 0.25 + 0.003)
		return mi

	func _st(nome: String) -> SurfaceTool:
		if not st.has(nome):
			var s := SurfaceTool.new()
			s.begin(Mesh.PRIMITIVE_TRIANGLES)
			s.set_material(material(nome))
			st[nome] = s
		return st[nome]

	## Quadrilátero com UV em metros / escala da textura (a textura repete no tamanho real).
	func quad(nome: String, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, ua: Vector2, ub: Vector2, uc: Vector2, ud: Vector2) -> void:
		var s := _st(nome)
		for par in [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]]:   # horário visto de fora (frente no Godot)
			s.set_normal(n)
			s.set_uv(par[1])
			s.add_vertex(par[0])

	func caixa(nome: String, p0: Vector3, p1: Vector3, solida: bool) -> void:
		var lo := Vector3(minf(p0.x, p1.x), minf(p0.y, p1.y), minf(p0.z, p1.z))
		var hi := Vector3(maxf(p0.x, p1.x), maxf(p0.y, p1.y), maxf(p0.z, p1.z))
		if solida:
			solidos.append(AABB(lo, hi - lo))
		var e: float = cfg["escala"].get(nome, 1.0)
		var uv := func(u: float, v: float) -> Vector2: return Vector2(u / e, -v / e)
		# frente (+Z): a placa do letreiro recebe a imagem inteira; o resto, a textura repetida
		if nome == "letreiro":
			quad(nome, Vector3(lo.x, lo.y, hi.z), Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(lo.x, hi.y, hi.z), Vector3.BACK,
				Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0))
			nome = "madeira"
			e = cfg["escala"]["madeira"]
			uv = func(u: float, v: float) -> Vector2: return Vector2(u / e, -v / e)
		else:
			quad(nome, Vector3(lo.x, lo.y, hi.z), Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(lo.x, hi.y, hi.z), Vector3.BACK,
				uv.call(lo.x, lo.y), uv.call(hi.x, lo.y), uv.call(hi.x, hi.y), uv.call(lo.x, hi.y))
		# trás (-Z)
		quad(nome, Vector3(hi.x, lo.y, lo.z), Vector3(lo.x, lo.y, lo.z), Vector3(lo.x, hi.y, lo.z), Vector3(hi.x, hi.y, lo.z), Vector3.FORWARD,
			uv.call(-hi.x, lo.y), uv.call(-lo.x, lo.y), uv.call(-lo.x, hi.y), uv.call(-hi.x, hi.y))
		# direita (+X) e esquerda (-X)
		quad(nome, Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, lo.y, lo.z), Vector3(hi.x, hi.y, lo.z), Vector3(hi.x, hi.y, hi.z), Vector3.RIGHT,
			uv.call(-hi.z, lo.y), uv.call(-lo.z, lo.y), uv.call(-lo.z, hi.y), uv.call(-hi.z, hi.y))
		quad(nome, Vector3(lo.x, lo.y, lo.z), Vector3(lo.x, lo.y, hi.z), Vector3(lo.x, hi.y, hi.z), Vector3(lo.x, hi.y, lo.z), Vector3.LEFT,
			uv.call(lo.z, lo.y), uv.call(hi.z, lo.y), uv.call(hi.z, hi.y), uv.call(lo.z, hi.y))
		# cima (+Y) e baixo (-Y)
		quad(nome, Vector3(lo.x, hi.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(hi.x, hi.y, lo.z), Vector3(lo.x, hi.y, lo.z), Vector3.UP,
			uv.call(lo.x, hi.z), uv.call(hi.x, hi.z), uv.call(hi.x, lo.z), uv.call(lo.x, lo.z))
		quad(nome, Vector3(lo.x, lo.y, lo.z), Vector3(hi.x, lo.y, lo.z), Vector3(hi.x, lo.y, hi.z), Vector3(lo.x, lo.y, hi.z), Vector3.DOWN,
			uv.call(lo.x, lo.z), uv.call(hi.x, lo.z), uv.call(hi.x, hi.z), uv.call(lo.x, hi.z))

	## Parede com duas camadas: acabamento de fora (`ext`, até a altura total) e reboco por dentro (até o teto do térreo).
	## `lado`: 0 = esquerda, 1 = direita, 2 = fundo. A colisão é uma caixa só, na espessura toda.
	func parede_dupla(ext: String, lo: Vector3, hi: Vector3, lado: int, h_dentro: float) -> void:
		solidos.append(AABB(lo, hi - lo))
		var meio_x := (lo.x + hi.x) / 2.0
		var meio_z := (lo.z + hi.z) / 2.0
		match lado:
			0:
				caixa(ext, lo, Vector3(meio_x, hi.y, hi.z), false)
				caixa("reboco", Vector3(meio_x, lo.y, lo.z), Vector3(hi.x, h_dentro, hi.z), false)
			1:
				caixa(ext, Vector3(meio_x, lo.y, lo.z), hi, false)
				caixa("reboco", lo, Vector3(meio_x, h_dentro, hi.z), false)
			_:
				caixa(ext, lo, Vector3(hi.x, hi.y, meio_z), false)
				caixa("reboco", Vector3(lo.x + 0.25, lo.y, meio_z), Vector3(hi.x - 0.25, h_dentro, hi.z), false)

	func solido_girado(tamanho: Vector3, xf: Transform3D) -> void:
		girados.append([tamanho, xf])

	## Toldo: placa inclinada da parede (a) até a ponta (b), com barrado na ponta.
	func toldo(a: Vector3, b: Vector3) -> void:
		var esp := 0.05
		var p: Array[Vector3] = [Vector3(a.x, a.y, a.z), Vector3(b.x, a.y, a.z), Vector3(b.x, b.y, b.z), Vector3(a.x, b.y, b.z)]
		var faixas := (b.x - a.x) / 0.5
		for lado in [1.0, -1.0]:      # face de cima e de baixo
			var off := Vector3(0, esp * (0.5 if lado > 0 else -0.5), 0)
			var n: Vector3 = (p[1] - p[0]).cross(p[3] - p[0]).normalized() * -lado
			if lado > 0:
				quad("toldo", p[3] + off, p[2] + off, p[1] + off, p[0] + off, n, Vector2(0, 1), Vector2(faixas, 1), Vector2(faixas, 0), Vector2(0, 0))
			else:
				quad("toldo", p[0] + off, p[1] + off, p[2] + off, p[3] + off, n, Vector2(0, 0), Vector2(faixas, 0), Vector2(faixas, 1), Vector2(0, 1))
		# barrado vertical na ponta (35 cm)
		quad("toldo", Vector3(a.x, b.y - 0.35, b.z), Vector3(b.x, b.y - 0.35, b.z), Vector3(b.x, b.y, b.z), Vector3(a.x, b.y, b.z), Vector3.BACK,
			Vector2(0, 1), Vector2(faixas, 1), Vector2(faixas, 0), Vector2(0, 0))
		quad("toldo", Vector3(b.x, b.y - 0.35, b.z - 0.01), Vector3(a.x, b.y - 0.35, b.z - 0.01), Vector3(a.x, b.y, b.z - 0.01), Vector3(b.x, b.y, b.z - 0.01), Vector3.FORWARD,
			Vector2(faixas, 1), Vector2(0, 1), Vector2(0, 0), Vector2(faixas, 0))

	## Floreira: caixa na cor dos detalhes, terra e uma fileira de plantas (folhagem em esferas achatadas e flores miúdas).
	func floreira(lo: Vector3, hi: Vector3) -> void:
		caixa("madeira", lo, hi, true)
		caixa("terra", Vector3(lo.x + 0.04, hi.y - 0.04, lo.z + 0.04), Vector3(hi.x - 0.04, hi.y + 0.005, hi.z - 0.04), false)
		var folha := SphereMesh.new()
		folha.radial_segments = 8
		folha.rings = 4
		var flor := SphereMesh.new()
		flor.radial_segments = 6
		flor.rings = 3
		var n := maxi(2, int((hi.x - lo.x) / 0.32))
		var zc := (lo.z + hi.z) / 2.0
		for i in n:
			var x := lo.x + (i + 0.5) * (hi.x - lo.x) / n
			var r := 0.15 + 0.015 * float((i * 7) % 3)
			_st("planta").append_from(folha, 0, Transform3D(Basis.from_scale(Vector3(r * 2.4, r * 1.6, r * 1.9)), Vector3(x, hi.y + r * 0.45, zc)))
			for k in 2:
				var fx := x + (0.07 if k == 0 else -0.06)
				var fz := zc + (0.06 if k == 0 else -0.05)
				_st("flor%d" % ((i + k) % 3)).append_from(flor, 0, Transform3D(Basis.from_scale(Vector3.ONE * 0.09), Vector3(fx, hi.y + r * 1.15, fz)))

	func caixa_solta(nome: String, tam: Vector3) -> MeshInstance3D:
		var bm := BoxMesh.new()
		bm.size = tam
		bm.material = material(nome)
		var mi := MeshInstance3D.new()
		mi.mesh = bm
		return mi

	func malha() -> MeshInstance3D:
		var am := ArrayMesh.new()
		for nome in st:
			var s: SurfaceTool = st[nome]
			s.generate_tangents()
			s.commit(am)
		var mi := MeshInstance3D.new()
		mi.name = "Loja"
		mi.mesh = am
		return mi

	func colisao() -> StaticBody3D:
		var corpo := StaticBody3D.new()
		corpo.name = "Colisao"
		for c in solidos:
			var cs := CollisionShape3D.new()
			var bx := BoxShape3D.new()
			bx.size = c.size
			cs.shape = bx
			cs.position = c.get_center()
			corpo.add_child(cs)
		for g in girados:
			var cs := CollisionShape3D.new()
			var bx := BoxShape3D.new()
			bx.size = g[0]
			cs.shape = bx
			cs.transform = g[1]
			cs.name = "Rampa"
			corpo.add_child(cs)
		return corpo
