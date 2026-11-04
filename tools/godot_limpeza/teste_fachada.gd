extends SceneTree
## Testes sem tela da fachada por peças e da textura sem emenda (chamado por tools/teste_3d.mjs).
## Escreve "RELATORIO {json}" com cada conferência.


func _initialize() -> void:
	_rodar.call_deferred()


func _corpo(pos: Vector3) -> CharacterBody3D:
	var c := CharacterBody3D.new()
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.3
	cap.height = 1.7
	cs.shape = cap
	c.add_child(cs)
	root.add_child(c)
	c.global_position = pos
	return c


## Anda 6 s para -Z (para dentro da loja) a partir de x; devolve o z final.
func _andar(x: float) -> float:
	var c := _corpo(Vector3(x, 0.9, 2.0))
	for i in 360:
		c.velocity = Vector3(0, c.velocity.y - 9.8 / 60.0, -1.5)
		c.move_and_slide()
		await physics_frame
	var z := c.global_position.z
	c.queue_free()
	return z


func _rodar() -> void:
	var r := {}
	var F = load("res://fachada_b.gd")
	var loja: Node3D = F.montar({})
	root.add_child(loja)
	var chao := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var bx := BoxShape3D.new()
	bx.size = Vector3(40, 1, 40)
	cs.shape = bx
	chao.add_child(cs)
	chao.position = Vector3(0, -0.5, 0)
	root.add_child(chao)
	await physics_frame
	await physics_frame
	var malha: MeshInstance3D = loja.get_node("Loja")
	var faces := 0
	for s in malha.mesh.get_surface_count():
		faces += malha.mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX].size() / 3
	r["faces"] = faces
	r["superficies"] = malha.mesh.get_surface_count()
	r["entra_pela_porta"] = await _andar(0.0) < -1.5
	r["parede_bloqueia"] = await _andar(-2.6) > -0.5      # na frente da vitrine/parede
	r["parede_lateral_bloqueia"] = await _andar(3.9) > -0.5
	var porta: Node3D = loja.get_node("Porta")
	r["porta_dentro"] = porta.global_position.z < 0.0
	# textura sem emenda: a imagem deslocada começa no meio da original e a máscara é uma cruz no meio
	var L = load("res://ladrilho.gd")
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	for y in 64:
		for x in 64:
			img.set_pixel(x, y, Color(x / 63.0, y / 63.0, 0.5))
	var d: Image = L.deslocar(img)
	r["deslocar_certo"] = d.get_pixel(0, 0).is_equal_approx(img.get_pixel(32, 32)) and d.get_pixel(31, 31).is_equal_approx(img.get_pixel(63, 63)) and d.get_pixel(32, 32).is_equal_approx(img.get_pixel(0, 0))
	r["emenda_some_ao_deslocar"] = L.emenda(d) < L.emenda(img) * 0.1
	var m: Image = L.mascara_cruz(64, 0.04, 0.03)
	r["mascara_cruz"] = m.get_pixel(32, 5).r > 0.9 and m.get_pixel(5, 32).r > 0.9 and m.get_pixel(5, 5).r < 0.05 and m.get_pixel(60, 60).r < 0.05
	# máscara de prédio: fundo cinza liso nas bordas, "parede" cinza um pouco diferente e porta escura no meio
	var p := Image.create(64, 64, false, Image.FORMAT_RGB8)
	p.fill(Color(0.9, 0.9, 0.9))
	p.fill_rect(Rect2i(10, 10, 44, 44), Color(0.7, 0.45, 0.35))
	p.fill_rect(Rect2i(28, 30, 8, 24), Color(0.2, 0.1, 0.05))
	var mf: Image = L.mascara_fundo(p, 0.1)
	r["mascara_fundo"] = mf.get_pixel(2, 2).r < 0.1 and mf.get_pixel(15, 15).r > 0.9 and mf.get_pixel(31, 40).r > 0.9
	# variação: 2 andares, degrau, rodapé, calha, laterais de tijolo e o nome escrito pelo Godot
	loja.queue_free()
	await physics_frame
	var loja2: Node3D = F.montar({"marca": "Pão da Vila", "fonte": 1, "andares": 2, "degrau": true, "rodape": true, "calha": true, "laterais": "tijolo"})
	root.add_child(loja2)
	await physics_frame
	await physics_frame
	r["degrau_entra"] = await _andar(0.0) < -1.5
	var malha2: MeshInstance3D = loja2.get_node("Loja")
	r["dois_andares_altura"] = snappedf(malha2.get_aabb().size.y, 0.01)
	var nomes := []
	for sidx in malha2.mesh.get_surface_count():
		nomes.append(malha2.mesh.surface_get_material(sidx).resource_name)
	r["dois_andares_janelas"] = "vidro_escuro" in nomes
	r["laterais_tijolo"] = "tijolo" in nomes and "reboco" in nomes and "telhado" in nomes
	var piso_ok := false
	var corpo2: StaticBody3D = loja2.get_node("Colisao")
	for forma: CollisionShape3D in corpo2.get_children():
		var caixa_f := forma.shape as BoxShape3D
		if caixa_f and absf(forma.position.y + caixa_f.size.y / 2.0 - 0.15) < 0.001 and caixa_f.size.x > 6.0:
			piso_ok = true
	r["degrau_piso"] = piso_ok
	var texto := loja2.get_node_or_null("Letreiro") as MeshInstance3D
	r["texto_existe"] = texto != null
	if texto:
		var tm := texto.mesh as TextMesh
		var cx := texto.global_transform * tm.get_aabb()
		r["texto_na_placa"] = cx.size.x > 1.0 and cx.size.x < 5.2 and cx.position.y > 2.9 and cx.end.y < 4.1
		r["texto_acento"] = tm.text == "Pão da Vila"
	print("RELATORIO ", JSON.stringify(r))
	quit()
