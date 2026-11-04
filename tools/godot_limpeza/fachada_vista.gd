extends SceneTree
## Vista rápida da fachada B (com tela): tools/godot_d.cmd --path tools/godot_limpeza -s res://fachada_vista.gd -- <saida.png> <config.json>


func _initialize() -> void:
	_rodar.call_deferred()


func _rodar() -> void:
	var a := OS.get_cmdline_user_args()
	var cfg: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(a[1])) if a.size() > 1 else {}
	root.size = Vector2i(1280, 720)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.7, 0.8, 0.9)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.8, 0.85)
	e.ambient_light_energy = 0.7
	env.environment = e
	root.add_child(env)
	var sol := DirectionalLight3D.new()
	sol.rotation_degrees = Vector3(-45, -30, 0)
	sol.shadow_enabled = true
	root.add_child(sol)
	var loja: Node3D = load("res://fachada_b.gd").montar(cfg)
	root.add_child(loja)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.fov = 50
	cam.position = Vector3(3.5, 2.4, 10.5)
	cam.look_at(Vector3(0, 2.0, 0))
	cam.make_current()
	for i in 8:
		await process_frame
	root.get_texture().get_image().save_png(a[0])
	cam.position = Vector3(0.0, 1.6, 2.2)
	cam.look_at(Vector3(0, 1.3, -4))
	for i in 4:
		await process_frame
	root.get_texture().get_image().save_png(a[0].replace(".png", "_porta.png"))
	print("RELATORIO {}")
	quit()
