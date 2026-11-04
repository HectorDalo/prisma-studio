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
	var loja: Node3D = load("res://fachada_b.gd").montar(cfg)
	root.add_child(loja)
	# troca o StaticBody (que o glTF não guarda) por caixas "-colonly"
	var corpo: StaticBody3D = loja.get_node("Colisao")
	var n := 0
	for cs: CollisionShape3D in corpo.get_children():
		var bm := BoxMesh.new()
		bm.size = (cs.shape as BoxShape3D).size
		var mi := MeshInstance3D.new()
		mi.name = "parede%02d-colonly" % n
		mi.mesh = bm
		mi.position = cs.position
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
	var caixa: AABB = malha.get_aabb()
	_fim({"faces": faces, "bytes": FileAccess.get_file_as_bytes(a[1]).size(), "colisoes": n, "luz": luz != null,
		"tamanho_m": [snappedf(caixa.size.x, 0.01), snappedf(caixa.size.y, 0.01), snappedf(caixa.size.z, 0.01)]})


func _fim(d: Dictionary) -> void:
	print("RELATORIO ", JSON.stringify(d))
	quit(1 if d.has("erro") else 0)
