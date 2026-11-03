"""Extrai quadros de um vídeo (PyAV do motor) e monta uma tira para conferir o movimento. Uso: python quadros.py video.mp4 saida.png"""
import sys
import av
from PIL import Image

video, saida = sys.argv[1], sys.argv[2]
frames = []
with av.open(video) as c:
    stream = c.streams.video[0]
    info = "%dx%d, %s fps, %s quadros" % (stream.codec_context.width, stream.codec_context.height, stream.average_rate, stream.frames)
    for f in c.decode(stream):
        frames.append(f.to_image())
print(info, "| lidos:", len(frames))
idx = [0, len(frames) // 3, 2 * len(frames) // 3, len(frames) - 1]
w, h = frames[0].size
tira = Image.new("RGB", (w * 4 // 2, h // 2))
for i, k in enumerate(idx):
    tira.paste(frames[k].resize((w // 2, h // 2)), (i * w // 2, 0))
tira.save(saida)
import numpy as np
a, b = np.asarray(frames[0], dtype=float), np.asarray(frames[-1], dtype=float)
print("diferença média entre primeiro e último quadro: %.1f (0 = imagem parada)" % abs(a - b).mean())
