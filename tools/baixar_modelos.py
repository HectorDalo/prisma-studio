"""Baixa os modelos do estúdio (Hugging Face e GitHub) para a pasta do ComfyUI.

- Usa curl com retomada (-C -), tentativas e DNS por HTTPS (a rede local às vezes perde o DNS do roteador).
- Confere o SHA-256 informado pelo Hugging Face antes de aceitar o arquivo (o arquivo só ganha o nome final depois).
- Pode ser rodado de novo: o que já está completo e conferido é pulado.

Uso: python baixar_modelos.py [grupo ...]   grupos: imagem, flux, fundo, 3d, traducao, ampliar, video, ltx (sem argumentos: todos)
3d = TRELLIS.2 int8 (~8,3 GB; o Criar 3D também precisa de flux, fundo, do Ollama da Elara e do Godot do EnglishQuest)
"""
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "engine", "ComfyUI_windows_portable", "ComfyUI", "models")
META = os.path.join(ROOT, "tmp")
DOH = "https://1.1.1.1/dns-query"

# (grupo, repositório, arquivo no repositório, pasta de destino, nome local, arquivo de metadados com os hashes)
HF = [
    ("imagem", "stabilityai/stable-diffusion-xl-base-1.0", "sd_xl_base_1.0.safetensors", "checkpoints", None, "stabilityai_stable-diffusion-xl-base-1.0.json"),
    ("flux", "city96/FLUX.1-schnell-gguf", "flux1-schnell-Q4_K_S.gguf", "unet", None, "city96_FLUX.1-schnell-gguf.json"),
    ("flux", "comfyanonymous/flux_text_encoders", "clip_l.safetensors", "clip", None, "comfyanonymous_flux_text_encoders.json"),
    ("flux", "comfyanonymous/flux_text_encoders", "t5xxl_fp8_e4m3fn.safetensors", "clip", None, "comfyanonymous_flux_text_encoders.json"),
    ("flux", "Comfy-Org/Lumina_Image_2.0_Repackaged", "split_files/vae/ae.safetensors", "vae", "ae.safetensors", "v_Comfy-Org_Lumina_Image_2.0_Repackaged.json"),
    ("video", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors", "diffusion_models", None, "Comfy-Org_Wan_2.1_ComfyUI_repackaged.json"),
    ("video", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/diffusion_models/wan2.1_fun_inp_1.3B_bf16.safetensors", "diffusion_models", None, "Comfy-Org_Wan_2.1_ComfyUI_repackaged.json"),
    ("video", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", "text_encoders", None, "Comfy-Org_Wan_2.1_ComfyUI_repackaged.json"),
    ("video", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_2.1_vae.safetensors", "vae", None, "Comfy-Org_Wan_2.1_ComfyUI_repackaged.json"),
    ("video", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/clip_vision/clip_vision_h.safetensors", "clip_vision", None, "Comfy-Org_Wan_2.1_ComfyUI_repackaged.json"),
    ("fundo", "ZhengPeng7/BiRefNet", "model.safetensors", "background_removal", "birefnet.safetensors", "ZhengPeng7_BiRefNet.json"),
    ("3d", "Comfy-Org/TRELLIS.2", "diffusion_models/trellis_2_int8_convrot.safetensors", "diffusion_models", "trellis_2_int8_convrot.safetensors", "Comfy-Org_TRELLIS.2.json"),
    ("3d", "Comfy-Org/TRELLIS.2", "vae/trellis_2_shape_vae_bf16.safetensors", "vae", "trellis_2_shape_vae_bf16.safetensors", "Comfy-Org_TRELLIS.2.json"),
    ("3d", "Comfy-Org/TRELLIS.2", "vae/trellis_2_texture_vae_bf16.safetensors", "vae", "trellis_2_texture_vae_bf16.safetensors", "Comfy-Org_TRELLIS.2.json"),
    ("3d", "Comfy-Org/TRELLIS.2", "clip_vision/dino_v3_vit_l.safetensors", "clip_vision", "dino_v3_vit_l.safetensors", "Comfy-Org_TRELLIS.2.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "config.json", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "generation_config.json", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "merges.txt", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "tokenizer.json", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "tokenizer_config.json", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "vocab.json", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "LICENSE", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("traducao", "Qwen/Qwen2.5-1.5B-Instruct", "model.safetensors", "@modelos_extra/qwen2.5-1.5b-instruct", None, "qwen15.json"),
    ("ltx", "Lightricks/LTX-Video", "ltxv-2b-0.9.8-distilled-fp8.safetensors", "checkpoints", None, "Lightricks_LTX-Video.json"),
]
# (grupo, url, destino, nome local, tamanho mínimo esperado em bytes)
OUTROS = [
    ("ampliar", "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth", "upscale_models", "RealESRGAN_x4plus.pth", 60_000_000),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            block = f.read(8 * 1024 * 1024)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def info(meta_file, filename):
    path = os.path.join(META, meta_file)
    data = json.load(open(path, encoding="utf-8"))
    for s in data["siblings"]:
        if s["rfilename"] == filename:
            return int(s["size"]), (s.get("lfs") or {}).get("sha256")
    raise SystemExit("sem metadados de %s" % filename)


def curl(url, part):
    cmd = ["curl", "-L", "-C", "-", "--retry", "8", "--retry-delay", "5", "--retry-all-errors", "--doh-url", DOH, "--fail", "-sS",
           "-A", "prisma-setup/1.0", "-o", part, url]
    return subprocess.call(cmd)


def baixar(url, dest_dir, local, size, digest):
    folder = os.path.join(ROOT, dest_dir[1:]) if dest_dir.startswith("@") else os.path.join(MODELS, dest_dir)
    os.makedirs(folder, exist_ok=True)
    final = os.path.join(folder, local)
    part = final + ".part"
    if os.path.exists(final) and (size is None or os.path.getsize(final) == size):
        print("ja existe:", local, flush=True)
        return True
    print("baixando:", local, "(%.2f GB)" % ((size or 0) / 1e9), flush=True)
    for attempt in range(1, 4):
        code = curl(url, part)
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if code == 0 and (size is None or have == size):
            break
        print("  tentativa %d: curl=%s, %d bytes" % (attempt, code, have), flush=True)
    else:
        print("FALHOU:", local, flush=True)
        return False
    if digest:
        got = sha256(part)
        if got != digest:
            print("HASH DIFERENTE em %s: esperado %s, veio %s" % (local, digest, got), flush=True)
            os.remove(part)
            return False
        print("  SHA-256 conferido", flush=True)
    os.replace(part, final)
    print("pronto:", local, flush=True)
    return True


def main():
    groups = set(sys.argv[1:]) or {"imagem", "flux", "fundo", "3d", "traducao", "ampliar", "video", "ltx"}
    ok = True
    for group, repo, filename, dest, local, meta in HF:
        if group not in groups:
            continue
        size, digest = info(meta, filename)
        url = "https://huggingface.co/%s/resolve/main/%s" % (repo, filename)
        ok = baixar(url, dest, local or os.path.basename(filename), size, digest) and ok
    for group, url, dest, local, minimum in OUTROS:
        if group not in groups:
            continue
        final = os.path.join(MODELS, dest, local)
        os.makedirs(os.path.dirname(final), exist_ok=True)
        if os.path.exists(final) and os.path.getsize(final) >= minimum:
            print("ja existe:", local, flush=True)
            continue
        code = curl(url, final + ".part")
        if code == 0 and os.path.getsize(final + ".part") >= minimum:
            os.replace(final + ".part", final)
            print("pronto:", local, flush=True)
        else:
            print("FALHOU:", local, flush=True)
            ok = False
    print("TUDO PRONTO" if ok else "COM FALHAS", flush=True)
    sys.exit(0 if ok else 1)


main()
