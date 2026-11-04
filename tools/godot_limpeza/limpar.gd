extends SceneTree
## Limpeza do .glb do TRELLIS.2 para o Godot: escala real, base no chão (y = 0) e centro em x/z.
## godot --headless --path tools/godot_limpeza -s res://limpar.gd -- <entrada.glb> <saida.glb> <largura> <altura> <profundidade> <correcao_max>
## (ou só <maior_lado_em_metros> no lugar das medidas: escala uniforme)
## Escreve uma linha "RELATORIO {json}" medida no arquivo JÁ exportado (relido do disco).


func _initialize() -> void:
	_rodar.call_deferred()


func _rodar() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() < 3:
		_fim({"erro": "uso: entrada saida maior_lado_m"})
		return
	var modelo := _carregar(a[0])
	if modelo == null:
		_fim({"erro": "não consegui ler " + a[0]})
		return
	var raiz := Node3D.new()
	raiz.name = a[1].get_file().get_basename()
	root.add_child(raiz)
	raiz.add_child(modelo)
	var caixa := _caixa(modelo)
	var lado := maxf(caixa.size.x, maxf(caixa.size.y, caixa.size.z))
	if lado <= 0.0:
		_fim({"erro": "modelo vazio"})
		return
	if a.size() >= 6:
		# medidas reais x = largura, y = altura, z = profundidade: escala uniforme pelo maior lado e depois
		# cada eixo vai na direção da medida real, limitado a ±(a[6] - 1) (padrão 25%), para não esticar o modelo
		var alvo := Vector3(float(a[2]), float(a[3]), float(a[4]))
		var limite := float(a[5])
		modelo.scale *= maxf(alvo.x, maxf(alvo.y, alvo.z)) / lado
		caixa = _caixa(modelo)
		var corr := Vector3.ONE
		for i in 3:
			if caixa.size[i] > 0.0:
				corr[i] = clampf(alvo[i] / caixa.size[i], 1.0 / limite, limite)
		modelo.scale *= corr
	else:
		modelo.scale *= float(a[2]) / lado
	caixa = _caixa(modelo)
	modelo.position -= Vector3(caixa.get_center().x, caixa.position.y, caixa.get_center().z)
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_scene(raiz, st) != OK or doc.write_to_filesystem(st, a[1]) != OK:
		_fim({"erro": "não consegui salvar " + a[1]})
		return
	# confere relendo o arquivo salvo
	var volta := _carregar(a[1])
	root.add_child(volta)
	var c := _caixa(volta)
	_fim({
		"faces": _faces(volta), "cor_por_vertice": _tem_cor(volta),
		"tamanho_m": [snappedf(c.size.x, 0.001), snappedf(c.size.y, 0.001), snappedf(c.size.z, 0.001)],
		"base_y": snappedf(c.position.y, 0.0001), "centro_xz": [snappedf(c.get_center().x, 0.0001), snappedf(c.get_center().z, 0.0001)],
		"bytes": FileAccess.get_file_as_bytes(a[1]).size(),
	})


func _fim(d: Dictionary) -> void:
	print("RELATORIO ", JSON.stringify(d))
	quit(1 if d.has("erro") else 0)


func _carregar(caminho: String) -> Node3D:
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file(caminho, st) != OK:
		return null
	return doc.generate_scene(st) as Node3D


func _malhas(n: Node, saida: Array) -> void:
	if n is MeshInstance3D:
		saida.append(n)
	for f in n.get_children():
		_malhas(f, saida)


func _caixa(n: Node3D) -> AABB:
	var ms: Array = []
	_malhas(n, ms)
	var caixa := AABB()
	for i in ms.size():
		var m: MeshInstance3D = ms[i]
		var b: AABB = m.global_transform * m.get_aabb()
		caixa = b if i == 0 else caixa.merge(b)
	return caixa


func _faces(n: Node) -> int:
	var ms: Array = []
	_malhas(n, ms)
	var total := 0
	for m: MeshInstance3D in ms:
		for s in m.mesh.get_surface_count():
			var arr := m.mesh.surface_get_arrays(s)
			total += (arr[Mesh.ARRAY_INDEX].size() if arr[Mesh.ARRAY_INDEX] != null else arr[Mesh.ARRAY_VERTEX].size()) / 3
	return total


func _tem_cor(n: Node) -> bool:
	var ms: Array = []
	_malhas(n, ms)
	for m: MeshInstance3D in ms:
		for s in m.mesh.get_surface_count():
			if m.mesh.surface_get_arrays(s)[Mesh.ARRAY_COLOR] != null:
				return true
	return false
