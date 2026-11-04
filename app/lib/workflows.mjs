// Montagem dos fluxos de trabalho do ComfyUI (os mesmos testados em tools/teste_motor.py).
// Cada função devolve o grafo ("prompt") pronto para o POST /prompt do motor.

export const MODELOS_IMAGEM = {
  sdxl: {
    id: 'sdxl',
    nome: 'SDXL · realista e geral',
    descricao: 'Stable Diffusion XL. Ótimo para fotos, retratos e ilustrações. Aceita prompt negativo.',
    arquivos: ['checkpoints/sd_xl_base_1.0.safetensors'],
    passos: 28, cfg: 6.5, negativo: true,
  },
  flux: {
    id: 'flux',
    nome: 'FLUX · fiel ao texto',
    descricao: 'FLUX.1 schnell. Segue melhor descrições longas e escreve texto nas imagens. Rápido (4 passos).',
    arquivos: ['unet/flux1-schnell-Q4_K_S.gguf', 'clip/t5xxl_fp8_e4m3fn.safetensors', 'clip/clip_l.safetensors', 'vae/ae.safetensors'],
    passos: 4, cfg: 1.0, negativo: false,
  },
};

export const MODELOS_VIDEO = {
  ltx: {
    id: 'ltx',
    nome: 'LTX-Video · rápido',
    descricao: 'Vídeos de ~2 s em 704×480, 24 quadros por segundo, em menos de 1 minuto. Texto para vídeo e imagem para vídeo.',
    arquivos: ['checkpoints/ltxv-2b-0.9.8-distilled-fp8.safetensors', 'clip/t5xxl_fp8_e4m3fn.safetensors'],
  },
  wan: {
    id: 'wan',
    nome: 'Wan 2.1 · mais lento',
    descricao: 'Wan 2.1 de 1,3 bilhão de parâmetros, ~2 s em 624×368. Mais lento, outro estilo de movimento. Só texto para vídeo.',
    arquivos: ['diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors', 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'vae/wan_2.1_vae.safetensors'],
  },
};

// Criar 3D: FLUX (imagem) -> BiRefNet + TRELLIS.2 (modelo). Testado na RTX 2070 de 8 GB (~6 GB de VRAM, 8 a 25 min por modelo).
export const MODELO_3D = {
  id: 'trellis2',
  nome: 'TRELLIS.2 · imagem para 3D',
  arquivos: ['diffusion_models/trellis_2_int8_convrot.safetensors', 'vae/trellis_2_shape_vae_bf16.safetensors',
    'vae/trellis_2_texture_vae_bf16.safetensors', 'clip_vision/dino_v3_vit_l.safetensors', 'background_removal/birefnet.safetensors'],
};

const NEGATIVO_PADRAO ='blurry, low quality, deformed, bad anatomy, extra fingers, text, watermark';

export function sdxl({ prompt, negativo, largura, altura, passos, cfg, semente, prefixo }) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: negativo || NEGATIVO_PADRAO, clip: ['1', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width: largura, height: altura, batch_size: 1 } },
    5: { class_type: 'KSampler', inputs: { model: ['1', 0], seed: semente, steps: passos, cfg, sampler_name: 'dpmpp_2m', scheduler: 'karras', positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], denoise: 1.0 } },
    6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    7: { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['6', 0] } },
  };
}

export function flux({ prompt, largura, altura, passos, semente, prefixo }) {
  return {
    1: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    2: { class_type: 'DualCLIPLoader', inputs: { clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    5: { class_type: 'EmptySD3LatentImage', inputs: { width: largura, height: altura, batch_size: 1 } },
    6: { class_type: 'KSampler', inputs: { model: ['1', 0], seed: semente, steps: passos, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', positive: ['4', 0], negative: ['4', 0], latent_image: ['5', 0], denoise: 1.0 } },
    7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['3', 0] } },
    8: { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['7', 0] } },
  };
}

// Remove o fundo (BiRefNet nativo do ComfyUI). A junção com alfa espera a máscara ao contrário, por isso a inversão.
export function removerFundo({ imagem, prefixo }) {
  return {
    1: { class_type: 'LoadImage', inputs: { image: imagem } },
    2: { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } },
    3: { class_type: 'RemoveBackground', inputs: { bg_removal_model: ['2', 0], image: ['1', 0] } },
    4: { class_type: 'InvertMask', inputs: { mask: ['3', 0] } },
    5: { class_type: 'JoinImageWithAlpha', inputs: { image: ['1', 0], alpha: ['4', 0] } },
    6: { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['5', 0] } },
  };
}

// Amplia com Real-ESRGAN (4×); para 2× reduz o resultado pela metade.
export function ampliar({ imagem, fator, prefixo }) {
  const wf = {
    1: { class_type: 'LoadImage', inputs: { image: imagem } },
    2: { class_type: 'UpscaleModelLoader', inputs: { model_name: 'RealESRGAN_x4plus.pth' } },
    3: { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['2', 0], image: ['1', 0] } },
  };
  if (fator === 2) {
    wf[4] = { class_type: 'ImageScaleBy', inputs: { image: ['3', 0], upscale_method: 'lanczos', scale_by: 0.5 } };
    wf[5] = { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['4', 0] } };
  } else {
    wf[4] = { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['3', 0] } };
  }
  return wf;
}

export function ltxTexto({ prompt, negativo, largura, altura, quadros, passos, semente, prefixo }) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled-fp8.safetensors' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: negativo || 'worst quality, inconsistent motion, blurry, jittery, distorted', clip: ['2', 0] } },
    5: { class_type: 'LTXVConditioning', inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: 24.0 } },
    6: { class_type: 'EmptyLTXVLatentVideo', inputs: { width: largura, height: altura, length: quadros, batch_size: 1 } },
    7: { class_type: 'LTXVScheduler', inputs: { steps: passos, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['6', 0] } },
    8: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    9: { class_type: 'SamplerCustom', inputs: { model: ['1', 0], add_noise: true, noise_seed: semente, cfg: 1.0, positive: ['5', 0], negative: ['5', 1], sampler: ['8', 0], sigmas: ['7', 0], latent_image: ['6', 0] } },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['1', 2] } },
    11: { class_type: 'CreateVideo', inputs: { images: ['10', 0], fps: 24.0 } },
    12: { class_type: 'SaveVideo', inputs: { video: ['11', 0], filename_prefix: prefixo, format: 'mp4', codec: 'h264' } },
  };
}

// Imagem para vídeo com LTX: a imagem vira o primeiro quadro.
export function ltxImagem({ imagem, prompt, negativo, largura, altura, quadros, passos, semente, prefixo }) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled-fp8.safetensors' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: negativo || 'worst quality, inconsistent motion, blurry, jittery, distorted', clip: ['2', 0] } },
    5: { class_type: 'LoadImage', inputs: { image: imagem } },
    6: { class_type: 'ImageScale', inputs: { image: ['5', 0], upscale_method: 'lanczos', width: largura, height: altura, crop: 'center' } },
    7: { class_type: 'LTXVImgToVideo', inputs: { positive: ['3', 0], negative: ['4', 0], vae: ['1', 2], image: ['6', 0], width: largura, height: altura, length: quadros, batch_size: 1, strength: 1.0 } },
    8: { class_type: 'LTXVConditioning', inputs: { positive: ['7', 0], negative: ['7', 1], frame_rate: 24.0 } },
    9: { class_type: 'LTXVScheduler', inputs: { steps: passos, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['7', 2] } },
    10: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    11: { class_type: 'SamplerCustom', inputs: { model: ['1', 0], add_noise: true, noise_seed: semente, cfg: 1.0, positive: ['8', 0], negative: ['8', 1], sampler: ['10', 0], sigmas: ['9', 0], latent_image: ['7', 2] } },
    12: { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['1', 2] } },
    13: { class_type: 'CreateVideo', inputs: { images: ['12', 0], fps: 24.0 } },
    14: { class_type: 'SaveVideo', inputs: { video: ['13', 0], filename_prefix: prefixo, format: 'mp4', codec: 'h264' } },
  };
}

// Textura sem emenda: a imagem já deslocada meia volta (bordas contínuas) tem a emenda numa cruz no meio;
// o FLUX repinta só a cruz (máscara) e o resto volta exatamente como era (as bordas continuam batendo ao repetir).
export function fluxCostura({ imagem, mascara, prompt, semente, prefixo, forca = 0.65 }) {
  return {
    1: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    2: { class_type: 'DualCLIPLoader', inputs: { clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    5: { class_type: 'LoadImage', inputs: { image: imagem } },
    6: { class_type: 'VAEEncode', inputs: { pixels: ['5', 0], vae: ['3', 0] } },
    7: { class_type: 'LoadImageMask', inputs: { image: mascara, channel: 'red' } },
    8: { class_type: 'SetLatentNoiseMask', inputs: { samples: ['6', 0], mask: ['7', 0] } },
    9: { class_type: 'KSampler', inputs: { model: ['1', 0], seed: semente, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', positive: ['4', 0], negative: ['4', 0], latent_image: ['8', 0], denoise: forca } },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
    11: { class_type: 'ImageCompositeMasked', inputs: { destination: ['5', 0], source: ['10', 0], x: 0, y: 0, resize_source: false, mask: ['7', 0] } },
    12: { class_type: 'SaveImage', inputs: { filename_prefix: prefixo, images: ['11', 0] } },
  };
}

// Imagem -> modelo 3D (.glb) com o TRELLIS.2 nativo do ComfyUI 0.43. Mesmos ajustes do fluxo oficial (CFG e etapas),
// com o upsample em 1024 para caber em 8 GB. `cor`: 'textura' (cor numa imagem, UV) ou 'vertices' (cor em cada vértice, mais leve).
// `mascara` (opcional): máscara pronta do objeto (branco = objeto) no lugar do BiRefNet. Serve para prédios: o BiRefNet
// trata a parede lisa como fundo e o TRELLIS.2 faz só porta, janelas e toldo.
export function trellis3d({ imagem, faces, textura, cor, semente, prefixo, mascara = null }) {
  const n = (class_type, inputs) => ({ class_type, inputs });
  const wf = {
    img: n('LoadImage', { image: imagem }),
    ...(mascara ? { bg: n('LoadImageMask', { image: mascara, channel: 'red' }) } : {
      bgm: n('LoadBackgroundRemovalModel', { bg_removal_name: 'birefnet.safetensors' }),
      bg: n('RemoveBackground', { bg_removal_model: ['bgm', 0], image: ['img', 0] }),
    }),
    crop: n('ImageCropToMask', { images: ['img', 0], masks: ['bg', 0], width: 1024, height: 1024, pad_factor: 1.1, grow_mask: 0, background: '#000000' }),
    cv: n('CLIPVisionLoader', { clip_name: 'dino_v3_vit_l.safetensors' }),
    unet: n('UNETLoader', { unet_name: 'trellis_2_int8_convrot.safetensors', weight_dtype: 'default' }),
    svae: n('VAELoader', { vae_name: 'trellis_2_shape_vae_bf16.safetensors' }),
    tvae: n('VAELoader', { vae_name: 'trellis_2_texture_vae_bf16.safetensors' }),
    cond: n('Trellis2Conditioning', { clip_vision_model: ['cv', 0], image: ['crop', 0] }),
    cfgA: n('CFGOverride', { model: ['unet', 0], cfg: 1.0, start_percent: 0.667, end_percent: 1.0 }),
    resA: n('RescaleCFG', { model: ['cfgA', 0], multiplier: 0.7 }),
    msA: n('ModelSamplingSD3', { model: ['resA', 0], shift: 5.0 }),
    cfgB: n('CFGOverride', { model: ['unet', 0], cfg: 1.0, start_percent: 0.769, end_percent: 1.0 }),
    resB: n('RescaleCFG', { model: ['cfgB', 0], multiplier: 0.5 }),
    lat0: n('EmptyTrellis2LatentStructure', { batch_size: 1 }),
    ks1: n('KSampler', { model: ['msA', 0], seed: semente, steps: 12, cfg: 7.5, sampler_name: 'euler', scheduler: 'normal', positive: ['cond', 0], negative: ['cond', 1], latent_image: ['lat0', 0], denoise: 1.0 }),
    struct: n('VaeDecodeStructureTrellis2', { samples: ['ks1', 0], vae: ['svae', 0], resolution: '32' }),
    shape: n('Trellis2ShapeStage', { positive: ['cond', 0], negative: ['cond', 1], voxel: ['struct', 0] }),
    ks2: n('KSampler', { model: ['resB', 0], seed: semente + 1, steps: 20, cfg: 7.5, sampler_name: 'euler', scheduler: 'normal', positive: ['shape', 0], negative: ['shape', 1], latent_image: ['shape', 2], denoise: 1.0 }),
    up: n('Trellis2UpsampleStage', { positive: ['shape', 0], negative: ['shape', 1], shape_latent: ['ks2', 0], vae: ['svae', 0], target_resolution: 1024 }),
    ks3: n('KSampler', { model: ['resB', 0], seed: semente + 1, steps: 12, cfg: 7.5, sampler_name: 'euler', scheduler: 'simple', positive: ['up', 0], negative: ['up', 1], latent_image: ['up', 2], denoise: 1.0 }),
    mesh: n('VaeDecodeShapeTrellis', { samples: ['ks3', 0], vae: ['svae', 0] }),
    tex: n('Trellis2TextureStage', { positive: ['up', 0], negative: ['up', 1], shape_latent: ['ks3', 0] }),
    ks4: n('KSampler', { model: ['unet', 0], seed: semente + 2, steps: 12, cfg: 1.0, sampler_name: 'euler', scheduler: 'normal', positive: ['tex', 0], negative: ['tex', 1], latent_image: ['tex', 2], denoise: 1.0 }),
    vox: n('VaeDecodeTextureTrellis', { samples: ['ks4', 0], vae: ['tvae', 0], shape_subdivides: ['mesh', 1] }),
    remesh: n('RemeshMesh', { mesh: ['mesh', 0], resolution: 512, sign_mode: 'solid', 'sign_mode.fill': 20.0, 'sign_mode.qef': false, band: 1.0, project_back: 0.0, fix_poles: false, smooth_iters: 0, drop_small_components: 0.01, precluster_max_verts: 20000000 }),
    dec: n('DecimateMesh', { mesh: ['remesh', 0], target_face_count: faces, placement_mode: 'midpoint' }),
    smooth: n('MeshSmoothNormals', { mesh: ['dec', 0], crease_angle: 60.0 }),
  };
  if (cor === 'vertices') {
    wf.paint = n('PaintMesh', { mesh: ['smooth', 0], voxel_colors: ['vox', 0] });
    wf.save = n('SaveGLB', { mesh: ['paint', 0], filename_prefix: prefixo });
  } else {
    wf.uv = n('UnwrapMesh', { mesh: ['smooth', 0], segmenter: 'pec', resolution: textura, padding: 2, weld_distance: 0.0002 });
    wf.bake = n('BakeTextureFromVoxel', { mesh: ['uv', 0], voxel_colors: ['vox', 0], texture_size: textura, reference_mesh: ['mesh', 0] });
    wf.apply = n('ApplyTextureToMesh', { mesh: ['uv', 0], base_color: ['bake', 0], metallic: ['bake', 1], roughness: ['bake', 2] });
    wf.save = n('SaveGLB', { mesh: ['apply', 0], filename_prefix: prefixo });
  }
  return wf;
}

export function wanTexto({ prompt, negativo, largura, altura, quadros, passos, semente, prefixo }) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.1_t2v_1.3B_fp16.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    4: { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 8.0 } },
    5: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: negativo || 'blurry, low quality, distorted, static, watermark, text', clip: ['2', 0] } },
    7: { class_type: 'EmptyHunyuanLatentVideo', inputs: { width: largura, height: altura, length: quadros, batch_size: 1 } },
    8: { class_type: 'KSampler', inputs: { model: ['4', 0], seed: semente, steps: passos, cfg: 6.0, sampler_name: 'uni_pc', scheduler: 'simple', positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], denoise: 1.0 } },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    10: { class_type: 'CreateVideo', inputs: { images: ['9', 0], fps: 16.0 } },
    11: { class_type: 'SaveVideo', inputs: { video: ['10', 0], filename_prefix: prefixo, format: 'mp4', codec: 'h264' } },
  };
}
