extends SceneTree
## Ícones de itens a partir do modelo 3D: cada .glb é renderizado de três quartos, centrado, com fundo transparente, luz suave
## e um contorno escuro fino (o mesmo estilo para todos os itens), num PNG quadrado.
## Precisa de tela (não roda com --headless):
## godot --rendering-driver d3d12 --path tools/godot_limpeza -s res://icone.gd -- <lado> <modelo.glb>=<saida.png> ...
## Escreve "RELATORIO {json}" com os ícones feitos.

const FUNDO := Color(0, 0, 0, 0)


func _initialize() -> void:
	_rodar.call_deferred()


func _rodar() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() < 2:
		_fim({"erro": "uso: <lado> <modelo.glb>=<saida.png> ..."})
		return
	var lado := int(a[0])
	root.size = Vector2i(lado, lado)
	var vp := SubViewport.new()
	vp.size = Vector2i(lado, lado)
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.own_world_3d = true
	root.add_child(vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.85, 0.85, 0.9)
	e.ambient_light_energy = 0.75
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	vp.add_child(env)
	var sol := DirectionalLight3D.new()
	sol.rotation_degrees = Vector3(-50, -35, 0)
	sol.light_energy = 1.25
	vp.add_child(sol)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	vp.add_child(cam)
	cam.make_current()
	var feitos := {}
	for par in a.slice(1):
		var partes := str(par).split("=")
		if partes.size() != 2:
			continue
		var doc := GLTFDocument.new()
		var st := GLTFState.new()
		if doc.append_from_file(partes[0], st) != OK:
			feitos[partes[1].get_file()] = "não li " + partes[0]
			continue
		var modelo := doc.generate_scene(st) as Node3D
		vp.add_child(modelo)
		var caixa := _caixa(modelo)
		# centraliza e põe de três quartos
		modelo.position = -caixa.get_center()
		var dir := Vector3(1.0, 0.85, 1.25).normalized()
		var raio := caixa.size.length() / 2.0
		cam.size = raio * 2.15
		cam.position = dir * (raio * 4.0)
		cam.look_at(Vector3.ZERO)
		for i in 6:
			await process_frame
		var img := vp.get_texture().get_image()
		img.convert(Image.FORMAT_RGBA8)
		_contorno(img)
		DirAccess.make_dir_recursive_absolute(partes[1].get_base_dir())
		img.save_png(partes[1])
		feitos[partes[1].get_file()] = "ok"
		modelo.queue_free()
		await process_frame
	_fim({"icones": feitos})


func _caixa(n: Node) -> AABB:
	var box := AABB()
	var primeiro := true
	for m: MeshInstance3D in n.find_children("*", "MeshInstance3D", true, false):
		var b: AABB = m.transform * m.get_aabb()
		var p := m.get_parent()
		while p != n and p is Node3D:
			b = (p as Node3D).transform * b
			p = p.get_parent()
		box = b if primeiro else box.merge(b)
		primeiro = false
	return box


## Contorno escuro de 2 px em volta da silhueta (o estilo dos ícones do jogo: dá para ver em qualquer fundo).
func _contorno(img: Image) -> void:
	var w := img.get_width()
	var h := img.get_height()
	var copia := img.duplicate() as Image
	for y in h:
		for x in w:
			if copia.get_pixel(x, y).a > 0.5:
				continue
			var perto := false
			for dy in range(-2, 3):
				for dx in range(-2, 3):
					var nx := x + dx
					var ny := y + dy
					if nx >= 0 and ny >= 0 and nx < w and ny < h and copia.get_pixel(nx, ny).a > 0.5:
						perto = true
						break
				if perto:
					break
			if perto:
				img.set_pixel(x, y, Color(0.12, 0.1, 0.09, 0.85))


func _fim(d: Dictionary) -> void:
	print("RELATORIO ", JSON.stringify(d))
	quit(1 if d.has("erro") else 0)
