"""Testes de verdade do motor (ComfyUI em 127.0.0.1:8188): gera de fato imagens e confere o resultado.

Uso: python teste_motor.py sdxl|flux|ampliar|fundo|wan|ltx [prompt]
As imagens saem em D:\\Claude\\prisma\\tmp\\teste_<nome>.png (ou .webp/.mp4/.gif no vídeo).
"""
import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request

HOST = "http://127.0.0.1:8188"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tmp")


def post(path, data):
    req = urllib.request.Request(HOST + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(path):
    return json.load(urllib.request.urlopen(HOST + path, timeout=60))


def rodar(workflow, limite=1800):
    inicio = time.time()
    resp = post("/prompt", {"prompt": workflow})
    if resp.get("node_errors"):
        raise SystemExit("erros nos nós: %s" % json.dumps(resp["node_errors"], ensure_ascii=False)[:1500])
    pid = resp["prompt_id"]
    while time.time() - inicio < limite:
        hist = get("/history/" + pid)
        if pid in hist:
            h = hist[pid]
            status = h.get("status", {})
            if status.get("status_str") == "error":
                msgs = [m for m in status.get("messages", []) if m[0] == "execution_error"]
                raise SystemExit("erro na execução: %s" % json.dumps(msgs, ensure_ascii=False)[:1500])
            arquivos = []
            for node in h["outputs"].values():
                for chave in ("images", "gifs", "videos"):
                    arquivos += node.get(chave, [])
            return arquivos, time.time() - inicio
        time.sleep(1.5)
    raise SystemExit("demorou demais")


def baixar(info, destino):
    qs = urllib.parse.urlencode({"filename": info["filename"], "subfolder": info.get("subfolder", ""), "type": info.get("type", "output")})
    data = urllib.request.urlopen(HOST + "/view?" + qs, timeout=120).read()
    open(destino, "wb").write(data)
    return len(data)


def sdxl(prompt):
    seed = random.randint(1, 2**31)
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, deformed, text, watermark", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "seed": seed, "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m", "scheduler": "karras",
                                                    "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "prisma_teste_sdxl", "images": ["6", 0]}},
    }
    return wf


def flux(prompt):
    seed = random.randint(1, 2**31)
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_K_S.gguf"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "t5xxl_fp8_e4m3fn.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                                                    "positive": ["4", 0], "negative": ["4", 0], "latent_image": ["5", 0], "denoise": 1.0}},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["3", 0]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "prisma_teste_flux", "images": ["7", 0]}},
    }


def _entrada(nome_origem):
    """Copia uma imagem de teste para a pasta de entrada do ComfyUI e devolve o nome."""
    import shutil
    pasta = os.path.join(os.path.dirname(OUT), "engine", "ComfyUI_windows_portable", "ComfyUI", "input")
    shutil.copy(os.path.join(OUT, nome_origem), os.path.join(pasta, nome_origem))
    return nome_origem


def ampliar(_prompt):
    nome = _entrada("teste_sdxl_0.png")
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": nome}},
        "2": {"class_type": "ImageScale", "inputs": {"image": ["1", 0], "upscale_method": "lanczos", "width": 512, "height": 512, "crop": "center"}},
        "3": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "RealESRGAN_x4plus.pth"}},
        "4": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["3", 0], "image": ["2", 0]}},
        "5": {"class_type": "SaveImage", "inputs": {"filename_prefix": "prisma_teste_ampliar", "images": ["4", 0]}},
    }


def fundo(_prompt):
    nome = _entrada("teste_sdxl_0.png")
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": nome}},
        "2": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "3": {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "InvertMask", "inputs": {"mask": ["3", 0]}},   # a junção com alfa espera a máscara ao contrário (1 = transparente)
        "5": {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["1", 0], "alpha": ["4", 0]}},
        "6": {"class_type": "SaveImage", "inputs": {"filename_prefix": "prisma_teste_fundo", "images": ["5", 0]}},
    }


def wan(prompt):
    seed = random.randint(1, 2**31)
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.1_t2v_1.3B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, distorted, static, watermark, text", "clip": ["2", 0]}},
        "7": {"class_type": "EmptyHunyuanLatentVideo", "inputs": {"width": 624, "height": 368, "length": 33, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "seed": seed, "steps": 20, "cfg": 6.0, "sampler_name": "uni_pc", "scheduler": "simple",
                                                    "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "CreateVideo", "inputs": {"images": ["9", 0], "fps": 16.0}},
        "11": {"class_type": "SaveVideo", "inputs": {"video": ["10", 0], "filename_prefix": "prisma_teste_wan", "format": "mp4", "codec": "h264"}},
    }


def ltx(prompt):
    seed = random.randint(1, 2**31)
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "ltxv-2b-0.9.8-distilled-fp8.safetensors"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "t5xxl_fp8_e4m3fn.safetensors", "type": "ltxv"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "worst quality, inconsistent motion, blurry, jittery, distorted", "clip": ["2", 0]}},
        "5": {"class_type": "LTXVConditioning", "inputs": {"positive": ["3", 0], "negative": ["4", 0], "frame_rate": 24.0}},
        "6": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": 704, "height": 480, "length": 49, "batch_size": 1}},
        "7": {"class_type": "LTXVScheduler", "inputs": {"steps": 8, "max_shift": 2.05, "base_shift": 0.95, "stretch": True, "terminal": 0.1, "latent": ["6", 0]}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "SamplerCustom", "inputs": {"model": ["1", 0], "add_noise": True, "noise_seed": seed, "cfg": 1.0, "positive": ["5", 0], "negative": ["5", 1],
                                                         "sampler": ["8", 0], "sigmas": ["7", 0], "latent_image": ["6", 0]}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["1", 2]}},
        "11": {"class_type": "CreateVideo", "inputs": {"images": ["10", 0], "fps": 24.0}},
        "12": {"class_type": "SaveVideo", "inputs": {"video": ["11", 0], "filename_prefix": "prisma_teste_ltx", "format": "mp4", "codec": "h264"}},
    }


def main():
    alvo = sys.argv[1] if len(sys.argv) > 1 else "sdxl"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "photograph of an old fisherman at sunrise on a wooden boat, detailed weathered skin, soft golden light, 85mm lens, shallow depth of field"
    wf = {"sdxl": sdxl, "flux": flux, "ampliar": ampliar, "fundo": fundo, "wan": wan, "ltx": ltx}[alvo](prompt)
    arquivos, segundos = rodar(wf)
    print("%s: %d arquivo(s) em %.1f s" % (alvo, len(arquivos), segundos))
    for i, a in enumerate(arquivos):
        ext = os.path.splitext(a["filename"])[1]
        dest = os.path.join(OUT, "teste_%s_%d%s" % (alvo, i, ext))
        print("  salvo:", dest, baixar(a, dest), "bytes")


main()
