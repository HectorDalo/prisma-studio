extends SceneTree
## Monta a fachada por peças (fachada_b.gd) e salva um .glb pronto para o jogo (texturas dentro).
## A colisão vai em nós "-colonly" (convenção do importador do Godot: viram colisão estática, sem malha visível),
## e o vão da porta fica livre. Base em y = 0, frente olhando para +Z.
## godot --headless --path tools/godot_limpeza -s res://fachada_exportar.gd -- <config.json> <saida.glb>
## Escreve "RELATORIO {json}" com faces, bytes, tamanho e quantas caixas de colisão foram salvas.


func _initialize() -> void:
	_rodar.call_deferred()


func _rodar() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() < 2:
		_fim({"erro": "uso: config.json saida.glb"})
		return
	var cfg = JSON.parse_string(FileAccess.get_file_as_string(a[0]))
	if typeof(cfg) != TYPE_DICTIONARY:
		_fim({"erro": "config inválida"})
		return
	for k in ["porta", "vitrine"]:          # o JSON não tem Vector2
		if cfg.has(k) and cfg[k] is Array:
			cfg[k] = Vector2(cfg[k][0], cfg[k][1])
	if cfg.has("toldo") and cfg["toldo"] is Array:
		cfg["toldo"] = [Color(cfg["toldo"][0]), Color(cfg["toldo"][1])]
	if cfg.has("cor_texto") and cfg["cor_texto"] is String:
		cfg["cor_texto"] = Color(cfg["cor_texto"])
	var loja: Node3D = load("res://fachada_b.gd").montar(cfg)
	root.add_child(loja)
	# troca o StaticBody (que o glTF não guarda) por caixas "-colonly". O editor do Godot transforma essas caixas em colisão
	# e esconde a malha; outros visualizadores (a prévia do Prisma, o Godot lendo o .glb em tempo de jogo) desenhariam as caixas.
	# Por isso: material invisível e 1 cm para dentro (nunca no mesmo plano da parede = sem as manchas pontilhadas).
	var invisivel := StandardMaterial3D.new()
	invisivel.resource_name = "colisao_invisivel"
	invisivel.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	invisivel.albedo_color = Color(1, 1, 1, 0)
	invisivel.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var corpo: StaticBody3D = loja.get_node("Colisao")
	var n := 0
	for cs: CollisionShape3D in corpo.get_children():
		var bm := BoxMesh.new()
		var tam: Vector3 = (cs.shape as BoxShape3D).size
		bm.size = Vector3(maxf(tam.x - 0.02, 0.005), maxf(tam.y - 0.02, 0.005), maxf(tam.z - 0.02, 0.005))
		bm.material = invisivel
		var mi := MeshInstance3D.new()
		mi.name = ("rampa%02d-colonly" if cs.name.begins_with("Rampa") else "parede%02d-colonly") % n
		mi.mesh = bm
		mi.transform = cs.transform
		loja.add_child(mi)
		n += 1
	corpo.free()
	var luz := loja.get_node_or_null("OmniLight3D")
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_scene(loja, st) != OK or doc.write_to_filesystem(st, a[1]) != OK:
		_fim({"erro": "não consegui salvar " + a[1]})
		return
	var malha: MeshInstance3D = loja.get_node("Loja")
	var faces := 0
	for s in malha.mesh.get_surface_count():
		faces += malha.mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX].size() / 3
	var letras := 0
	var texto := loja.get_node_or_null("Letreiro") as MeshInstance3D
	if texto:
		var arr := texto.mesh.surface_get_arrays(0)
		letras = (arr[Mesh.ARRAY_INDEX].size() if arr[Mesh.ARRAY_INDEX] != null else arr[Mesh.ARRAY_VERTEX].size()) / 3
	var caixa: AABB = malha.get_aabb()
	# confere no arquivo salvo: o texto foi junto e as caixas de colisão não têm nada visível
	var doc2 := GLTFDocument.new()
	var st2 := GLTFState.new()
	var no_arquivo := {"texto": false, "colisao_invisivel": true}
	if doc2.append_from_file(a[1], st2) == OK:
		for m in st2.get_materials():
			if m.resource_name == "texto":
				no_arquivo["texto"] = true
		for node in st2.get_nodes():
			if node.resource_name.ends_with("-colonly") and node.mesh >= 0:
				var im: ImporterMesh = st2.get_meshes()[node.mesh].mesh
				var mat := im.get_surface_material(0) as BaseMaterial3D
				if mat == null or mat.albedo_color.a > 0.01:
					no_arquivo["colisao_invisivel"] = false
	_fim({"faces": faces, "faces_texto": letras, "bytes": FileAccess.get_file_as_bytes(a[1]).size(), "colisoes": n, "luz": luz != null,
		"tamanho_m": [snappedf(caixa.size.x, 0.01), snappedf(caixa.size.y, 0.01), snappedf(caixa.size.z, 0.01)], "no_arquivo": no_arquivo,
		"paredes_barradas": loja.get_meta("paredes_barradas", [])})


func _fim(d: Dictionary) -> void:
	print("RELATORIO ", JSON.stringify(d))
	quit(1 if d.has("erro") else 0)
