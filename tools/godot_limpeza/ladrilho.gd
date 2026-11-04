extends SceneTree
## Texturas sem emenda (seamless) para o FLUX, em duas etapas:
##  preparar: desloca a imagem meia largura e meia altura (as bordas passam a ser o meio da imagem original,
##            que é contínuo ao repetir) e cria a máscara da cruz no meio, onde ficou a emenda. O FLUX repinta só a cruz.
##  medir:    diferença média entre as bordas opostas (0 = repetir não mostra salto).
## godot --headless --path tools/godot_limpeza -s res://ladrilho.gd -- preparar <entrada.png> <deslocada.png> <mascara.png> [lado=1024]
## godot --headless --path tools/godot_limpeza -s res://ladrilho.gd -- medir <imagem.png>
## Escreve "RELATORIO {json}".


func _initialize() -> void:
	_rodar.call_deferred()


func _rodar() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() >= 2 and a[0] == "medir":
		var im := Image.load_from_file(a[1])
		if im == null:
			_fim({"erro": "não consegui ler " + a[1]})
			return
		_fim({"emenda": snappedf(emenda(im), 0.0001), "emenda_relativa": snappedf(emenda_relativa(im), 0.01), "lado": im.get_width()})
		return
	if a.size() >= 3 and a[0] == "mascara_fundo":
		var im2 := Image.load_from_file(a[1])
		if im2 == null:
			_fim({"erro": "não consegui ler " + a[1]})
			return
		var mk := mascara_fundo(im2, 0.10)
		mk.save_png(a[2])
		_fim({"lado": im2.get_width()})
		return
	if a.size() < 4 or a[0] != "preparar":
		_fim({"erro": "uso: preparar entrada deslocada mascara [lado] | medir imagem"})
		return
	var img := Image.load_from_file(a[1])
	if img == null:
		_fim({"erro": "não consegui ler " + a[1]})
		return
	var lado := int(a[4]) if a.size() >= 5 else 1024
	img.convert(Image.FORMAT_RGB8)
	img.resize(lado, lado, Image.INTERPOLATE_LANCZOS)
	var desl := deslocar(img)
	# cruz estreita (4% + 3% de borda suave): com força 0.65 o FLUX conserta a emenda sem mudar o tamanho do padrão
	var meia := float(a[5]) if a.size() >= 6 else 0.04
	var suave := float(a[6]) if a.size() >= 7 else 0.03
	var masc := mascara_cruz(lado, meia, suave)
	if desl.save_png(a[2]) != OK or masc.save_png(a[3]) != OK:
		_fim({"erro": "não consegui salvar"})
		return
	_fim({"lado": lado, "emenda_original": snappedf(emenda(img), 0.0001), "emenda_deslocada": snappedf(emenda(desl), 0.0001)})


static func deslocar(img: Image) -> Image:
	var w := img.get_width()
	var h := img.get_height()
	var out := Image.create(w, h, false, Image.FORMAT_RGB8)
	out.blit_rect(img, Rect2i(w / 2, h / 2, w - w / 2, h - h / 2), Vector2i(0, 0))
	out.blit_rect(img, Rect2i(0, h / 2, w / 2, h - h / 2), Vector2i(w - w / 2, 0))
	out.blit_rect(img, Rect2i(w / 2, 0, w - w / 2, h / 2), Vector2i(0, h - h / 2))
	out.blit_rect(img, Rect2i(0, 0, w / 2, h / 2), Vector2i(w - w / 2, h - h / 2))
	return out


## Branco = o FLUX repinta. Uma cruz no meio (meia largura `meia` da imagem) com borda suave (`suave`).
static func mascara_cruz(lado: int, meia: float, suave: float) -> Image:
	var m := Image.create(lado, lado, false, Image.FORMAT_L8)
	var c := lado / 2.0
	for y in lado:
		var dy := absf(y + 0.5 - c) / lado
		for x in lado:
			var dx := absf(x + 0.5 - c) / lado
			var d := minf(dx, dy)
			var v := clampf(1.0 - (d - meia) / suave, 0.0, 1.0)
			m.set_pixel(x, y, Color(v, v, v))
	return m


## Diferença média entre a 1ª e a última coluna/linha (o salto que aparece ao repetir).
static func emenda(img: Image) -> float:
	var w := img.get_width()
	var h := img.get_height()
	var soma := 0.0
	for i in h:
		var c1 := img.get_pixel(0, i)
		var c2 := img.get_pixel(w - 1, i)
		soma += absf(c1.r - c2.r) + absf(c1.g - c2.g) + absf(c1.b - c2.b)
	for i in w:
		var c1 := img.get_pixel(i, 0)
		var c2 := img.get_pixel(i, h - 1)
		soma += absf(c1.r - c2.r) + absf(c1.g - c2.g) + absf(c1.b - c2.b)
	return soma / (3.0 * (w + h))


## Máscara do objeto para imagens de fundo liso (prédios): o fundo é tudo o que está ligado à borda e tem a cor dos
## cantos (preenchimento a partir das bordas). Branco = objeto. Ao contrário do BiRefNet, não descarta a parede lisa.
static func mascara_fundo(img: Image, tolerancia: float) -> Image:
	img.convert(Image.FORMAT_RGB8)
	var w := img.get_width()
	var h := img.get_height()
	var fundo := (img.get_pixel(2, 2) + img.get_pixel(w - 3, 2) + img.get_pixel(2, h - 3) + img.get_pixel(w - 3, h - 3)) / 4.0
	var eh_fundo := PackedByteArray()
	eh_fundo.resize(w * h)
	var fila := PackedInt32Array()
	for x in w:
		fila.append(x)
		fila.append((h - 1) * w + x)
	for y in h:
		fila.append(y * w)
		fila.append(y * w + w - 1)
	var i := 0
	while i < fila.size():
		var p := fila[i]
		i += 1
		if eh_fundo[p] == 1:
			continue
		var c := img.get_pixel(p % w, p / w)
		if absf(c.r - fundo.r) + absf(c.g - fundo.g) + absf(c.b - fundo.b) > tolerancia * 3.0:
			continue
		eh_fundo[p] = 1
		var x := p % w
		var y := p / w
		if x > 0: fila.append(p - 1)
		if x < w - 1: fila.append(p + 1)
		if y > 0: fila.append(p - w)
		if y < h - 1: fila.append(p + w)
	var m := Image.create(w, h, false, Image.FORMAT_L8)
	for p in w * h:
		m.set_pixel(p % w, p / w, Color.BLACK if eh_fundo[p] == 1 else Color.WHITE)
	return m


## Emenda dividida pela diferença normal entre vizinhos no meio da imagem: perto de 1 = repetir não mostra salto
## (tijolo tem muita diferença entre vizinhos por natureza, reboco quase nenhuma; a razão compara os dois de igual para igual).
static func emenda_relativa(img: Image) -> float:
	var w := img.get_width()
	var h := img.get_height()
	var soma := 0.0
	var n := 0
	for x in range(w / 4, 3 * w / 4, maxi(1, w / 32)):
		for y in h:
			var c1 := img.get_pixel(x, y)
			var c2 := img.get_pixel(x + 1, y)
			soma += absf(c1.r - c2.r) + absf(c1.g - c2.g) + absf(c1.b - c2.b)
			n += 1
	var normal := soma / (3.0 * n)
	return emenda(img) / maxf(normal, 0.0005)


func _fim(d: Dictionary) -> void:
	print("RELATORIO ", JSON.stringify(d))
	quit(1 if d.has("erro") else 0)
