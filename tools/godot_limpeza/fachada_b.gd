extends RefCounted
## Fachada montada por peças (método B): paredes, vitrines, porta com abertura de verdade, toldo, cornija/telhado e letreiro,
## com texturas sem emenda do Prisma em escala real (UV em metros). Tudo vira UMA malha com uma superfície por material
## (poucas chamadas de desenho) + colisão em caixas, deixando o vão da porta livre para entrar.
## Frente da loja em z = 0 olhando para +Z; o salão vai para -Z. Base em y = 0.
## Uso: var loja: Node3D = preload("fachada_b.gd").montar({ ...config... })

const T := 0.25   # espessura das paredes


static func padrao() -> Dictionary:
	return {
		"largura": 8.0, "altura": 4.4, "profundidade": 5.0,
		"porta": Vector2(1.15, 2.35),                 # largura x altura do vão
		"vitrine": Vector2(2.3, 1.9), "vitrine_y": 0.7,
		"texturas": {}, "escala": {"tijolo": 1.3, "reboco": 2.0, "madeira": 1.2, "piso": 1.6},
		"letreiro": "", "toldo": [Color("#2f6e4f"), Color("#f3efe2")], "vidro": Color(0.55, 0.7, 0.75, 0.32),
	}


static func montar(cfg_in: Dictionary) -> Node3D:
	var cfg := padrao()
	cfg.merge(cfg_in, true)
	var W: float = cfg["largura"]
	var H: float = cfg["altura"]
	var D: float = cfg["profundidade"]
	var porta: Vector2 = cfg["porta"]
	var vit: Vector2 = cfg["vitrine"]
	var vy: float = cfg["vitrine_y"]
	var raiz := Node3D.new()
	raiz.name = "FachadaB"
	var m := _Montador.new(cfg)
	# --- parede da frente, recortada em colunas: vitrine | parede | porta | parede | vitrine
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
			m.caixa("madeira", Vector3(x0, 0, -T), Vector3(x1, vy, 0.04), true)        # rodapé de madeira
			m.caixa("tijolo", Vector3(x0, vy + vit.y, -T), Vector3(x1, H, 0), true)
			m.caixa("vidro", Vector3(x0, vy, -T * 0.55), Vector3(x1, vy + vit.y, -T * 0.45), true)   # vidro também colide
			# moldura e travessa da vitrine
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
	var folha := m.caixa_solta("madeira", Vector3(porta.x - 0.06, porta.y - 0.04, 0.05))
	folha.name = "Porta"
	folha.position = Vector3(-px + 0.03 + (porta.x - 0.06) / 2.0 * cos(deg_to_rad(100)), (porta.y - 0.04) / 2.0, -T - (porta.x - 0.06) / 2.0 * sin(deg_to_rad(100)))
	folha.rotation.y = deg_to_rad(100)
	raiz.add_child(folha)
	# laterais, fundo, piso e teto do salão
	m.caixa("reboco", Vector3(-W / 2, 0, -D), Vector3(-W / 2 + T, H, -T), true)
	m.caixa("reboco", Vector3(W / 2 - T, 0, -D), Vector3(W / 2, H, -T), true)
	m.caixa("reboco", Vector3(-W / 2, 0, -D - T), Vector3(W / 2, H, -D), true)
	m.caixa("piso", Vector3(-W / 2 + T, -0.05, -D), Vector3(W / 2 - T, 0.0, -T), true)
	m.caixa("reboco", Vector3(-W / 2, H - 0.05, -D - T), Vector3(W / 2, H, 0), false)
	# cornija e telhado
	m.caixa("madeira", Vector3(-W / 2 - 0.15, H - 0.35, -T), Vector3(W / 2 + 0.15, H, 0.25), false)
	m.caixa("madeira", Vector3(-W / 2 - 0.2, H, -D - T - 0.1), Vector3(W / 2 + 0.2, H + 0.18, 0.3), false)
	# toldo inclinado com listras + barrado
	var aw := vx0 + vit.x + 0.15
	m.toldo(Vector3(-aw, vy + vit.y + 0.35, 0.0), Vector3(aw, vy + vit.y - 0.15, 1.3))
	# letreiro (a imagem do FLUX inteira na frente)
	var lw := minf(W * 0.62, 5.2)
	m.caixa("letreiro", Vector3(-lw / 2, H - 1.35, 0.0), Vector3(lw / 2, H - 0.45, 0.1), false)
	raiz.add_child(m.malha())
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
		elif nome == "letreiro" and cfg["letreiro"] != "":
			mt.albedo_texture = _textura(cfg["letreiro"], false)
		elif nome == "toldo":
			mt.albedo_texture = _listras(cfg["toldo"][0], cfg["toldo"][1])
		elif tex.has(nome):
			mt.albedo_texture = _textura(tex[nome], true)
		else:
			mt.albedo_color = {"tijolo": Color("#a5523a"), "reboco": Color("#ece3cf"), "madeira": Color("#2f5a43"), "piso": Color("#b98a52")}.get(nome, Color.GRAY)
		mats[nome] = mt
		return mt

	func _textura(caminho: String, repetir: bool) -> Texture2D:
		var img := Image.load_from_file(caminho)
		if img == null:
			return null
		if not repetir:
			_recortar_fundo(img)
		# 512 px bastam para uma textura que repete a cada ~1,5 m (e o .glb fica 4 vezes menor); letreiro até 1024 de largura
		var maximo := 512 if repetir else 1024
		if img.get_width() > maximo:
			img.resize(maximo, int(img.get_height() * float(maximo) / img.get_width()), Image.INTERPOLATE_LANCZOS)
		img.generate_mipmaps()
		return ImageTexture.create_from_image(img)

	## Recorta só a placa: o FLUX desenha o letreiro sobre um fundo liso (preto ou cinza). O fundo é a cor dos cantos;
	## a placa é a região das linhas e colunas onde mais da metade dos pixels foge dessa cor.
	func _recortar_fundo(img: Image) -> void:
		var w := img.get_width()
		var h := img.get_height()
		var fundo := (img.get_pixel(2, 2) + img.get_pixel(w - 3, 2) + img.get_pixel(2, h - 3) + img.get_pixel(w - 3, h - 3)) / 4.0
		var diferente := func(x: int, y: int) -> bool:
			var c := img.get_pixel(x, y)
			return absf(c.r - fundo.r) + absf(c.g - fundo.g) + absf(c.b - fundo.b) > 0.18
		var faixa := func(horizontal: bool) -> Vector2i:
			var n_lin := h if horizontal else w
			var n_col := w if horizontal else h
			var dentro: Array[int] = []
			for i in range(0, n_lin, 2):
				var n := 0
				for j in range(0, n_col, 6):
					if diferente.call(j, i) if horizontal else diferente.call(i, j):
						n += 1
				if n > (n_col / 6) * 0.5:
					dentro.append(i)
			return Vector2i(dentro[0], dentro[-1]) if dentro.size() > 4 else Vector2i(0, n_lin - 1)
		var ys: Vector2i = faixa.call(true)
		var xs: Vector2i = faixa.call(false)
		img.copy_from(img.get_region(Rect2i(xs.x, ys.x, xs.y - xs.x + 1, ys.y - ys.x + 1)))

	func _listras(a: Color, b: Color) -> Texture2D:
		var img := Image.create(64, 8, false, Image.FORMAT_RGB8)
		for x in 64:
			for y in 8:
				img.set_pixel(x, y, a if (x / 16) % 2 == 0 else b)
		return ImageTexture.create_from_image(img)

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
		var frente_cheia := nome == "letreiro"
		# frente (+Z)
		if frente_cheia:
			quad(nome, Vector3(lo.x, lo.y, hi.z), Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(lo.x, hi.y, hi.z), Vector3.BACK,
				Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0))
			nome = "madeira"
			e = cfg["escala"]["madeira"]
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
		return corpo
