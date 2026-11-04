extends RefCounted
## Fachada montada por peças (método B): paredes, vitrines, porta com abertura de verdade, toldo, cornija, telhado e letreiro,
## com texturas sem emenda do Prisma em escala real (UV em metros). Tudo vira UMA malha com uma superfície por material
## (poucas chamadas de desenho) + colisão em caixas, deixando o vão da porta livre para entrar.
## O NOME da loja no letreiro é escrito pelo Godot com uma fonte de verdade (letras 3D, acentos certos); o FLUX só faz a placa.
## Variações por loja: 1 ou 2 andares, rodapé de pedra, calha com descida e degrau na porta (com rampa invisível na colisão).
## Frente da loja em z = 0 olhando para +Z; o salão vai para -Z. Base em y = 0.
## Uso: var loja: Node3D = preload("fachada_b.gd").montar({ ...config... })

const T := 0.25          # espessura das paredes
const ANDAR := 3.0       # altura de cada andar de cima
const DEGRAU := 0.15     # altura do degrau da porta (o piso de dentro sobe junto)
# fontes estáticas (as variáveis, como a Fredoka, perdem letras ao virar 3D: o "d" sumia); SIL OFL 1.1, em fontes/
const FONTES := ["LilitaOne-Regular.ttf", "Pacifico-Regular.ttf", "AlfaSlabOne-Regular.ttf"]
const PASTA_FONTES := "D:/Claude/prisma/tools/godot_limpeza/fontes"   # usada quando este arquivo roda dentro de outro projeto (o jogo)


static func padrao() -> Dictionary:
	return {
		"largura": 8.0, "altura": 4.4, "profundidade": 5.0,
		"porta": Vector2(1.15, 2.35),                 # largura x altura do vão
		"vitrine": Vector2(2.3, 1.9), "vitrine_y": 0.7,
		"texturas": {}, "escala": {"tijolo": 1.3, "reboco": 2.0, "madeira": 1.2, "piso": 1.6, "telhado": 1.5},
		"letreiro": "", "marca": "", "fonte": 0, "cor_texto": null,
		"toldo": [Color("#2f6e4f"), Color("#f3efe2")], "vidro": Color(0.55, 0.7, 0.75, 0.32),
		"andares": 1, "laterais": "reboco", "rodape": false, "calha": false, "degrau": false,
	}


static func montar(cfg_in: Dictionary) -> Node3D:
	var cfg := padrao()
	cfg.merge(cfg_in, true)
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
			m.caixa("vidro", Vector3(x0, vy, -T * 0.55), Vector3(x1, vy + vit.y, -T * 0.45), true)   # vidro também colide
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
	# --- toldo inclinado com listras + barrado
	var aw := vx0 + vit.x + 0.15
	m.toldo(Vector3(-aw, vy + vit.y + 0.35, 0.0), Vector3(aw, vy + vit.y - 0.15, 1.3))
	# --- letreiro: a placa do FLUX (sem texto) e o nome escrito pelo Godot por cima
	var lw := minf(W * 0.62, 5.2)
	var placa_lo := Vector3(-lw / 2, H - 1.35, 0.0)
	var placa_hi := Vector3(lw / 2, H - 0.45, 0.1)
	m.caixa("letreiro", placa_lo, placa_hi, false)
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
		if cor == null:
			cor = Color("#3a2414") if luminancia_placa > 0.5 else Color("#f6ead0")
		mt.albedo_color = Color(cor)
		mt.roughness = 0.6
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
