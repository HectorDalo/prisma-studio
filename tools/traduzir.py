"""Serviço de tradução português -> inglês para os prompts (Qwen2.5-1.5B-Instruct, Apache 2.0), roda no processador.

Um modelo de linguagem pequeno traduz com mais fidelidade que um tradutor automático simples e não inventa palavras:
o pedido é só traduzir, sem acrescentar, tirar nem censurar nada.
Protocolo: lê uma linha JSON por pedido ({"id": 1, "textos": ["..."]}) e responde uma linha JSON ({"id": 1, "traducoes": ["..."]}).
Ao ficar pronto escreve {"pronto": true}. Usado pelo servidor do app (lib/tradutor.mjs); também dá para testar à mão.
"""
import json
import os
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

pasta = sys.argv[1]
torch.set_num_threads(max(2, (os.cpu_count() or 4) - 2))
tok = AutoTokenizer.from_pretrained(pasta)
modelo = AutoModelForCausalLM.from_pretrained(pasta, dtype=torch.bfloat16).eval()
print(json.dumps({"pronto": True}), flush=True)

SISTEMA = (
    "You translate Brazilian Portuguese into natural English for AI image and video prompts. "
    "Translate faithfully: keep every detail, do not add, remove, soften or censor anything. "
    "Keep proper names and any quoted text exactly as written. Reply with the English translation only, no notes."
)


def traduzir(texto):
    mensagens = [{"role": "system", "content": SISTEMA}, {"role": "user", "content": texto}]
    entrada = tok.apply_chat_template(mensagens, add_generation_prompt=True, return_tensors="pt", return_dict=True)
    with torch.no_grad():
        saida = modelo.generate(**entrada, max_new_tokens=220, do_sample=False, repetition_penalty=1.0)
    novo = saida[0][entrada["input_ids"].shape[1]:]
    return tok.decode(novo, skip_special_tokens=True).strip().strip('"')


for linha in sys.stdin:
    linha = linha.strip()
    if not linha:
        continue
    try:
        pedido = json.loads(linha)
        inicio = time.time()
        resposta = {"id": pedido.get("id"), "traducoes": [traduzir(t) for t in pedido["textos"]], "segundos": round(time.time() - inicio, 1)}
    except Exception as erro:  # um pedido ruim não derruba o serviço
        resposta = {"id": None, "erro": str(erro)}
    print(json.dumps(resposta, ensure_ascii=False), flush=True)
