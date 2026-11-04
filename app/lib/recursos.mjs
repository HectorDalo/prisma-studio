// Antes de gerar 3D: a Elara Voz (Whisper ~2 GB na placa) e o Ollama (qwen2.5:7b ~4,8 GB) disputam a RTX 2070 de 8 GB
// e os 14 GB de RAM com o FLUX e o TRELLIS.2. Aqui o Prisma olha quem está ocupando e oferece liberar.
import { spawn } from 'node:child_process';

const OLLAMA = process.env.PRISMA_OLLAMA_URL || 'http://127.0.0.1:11434';

function rodar(exe, args, limiteMs = 8000) {
  return new Promise((resolve) => {
    let s = '';
    let p;
    try { p = spawn(exe, args, { windowsHide: true }); } catch { return resolve(''); }
    const t = setTimeout(() => { try { p.kill(); } catch { /* já saiu */ } }, limiteMs);
    p.stdout.on('data', (d) => { s += d; });
    p.on('error', () => { clearTimeout(t); resolve(''); });
    p.on('close', () => { clearTimeout(t); resolve(s); });
  });
}

// Modelos que o Ollama tem na memória agora (nome e quanto ocupa na placa).
export async function ollamaCarregados() {
  try {
    const r = await fetch(OLLAMA + '/api/ps', { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return [];
    return ((await r.json()).models || []).map((m) => ({ nome: m.name, vramGB: +((m.size_vram || 0) / 1e9).toFixed(1) }));
  } catch { return []; }
}

// Processos da Elara Voz (Python rodando de D:\Claude\elara-voz). Só no Windows.
export async function processosElara() {
  if (process.platform !== 'win32') return [];
  const cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*elara-voz*' -and $_.Name -match '^pythonw?\\.exe$' } | "
    + "Select-Object ProcessId,@{n='mb';e={[math]::Round($_.WorkingSetSize/1MB)}} | ConvertTo-Json -Compress";
  const s = (await rodar('powershell', ['-NoProfile', '-Command', cmd])).trim();
  if (!s) return [];
  try { const j = JSON.parse(s); return (Array.isArray(j) ? j : [j]).map((p) => ({ pid: p.ProcessId, ramMB: p.mb })); } catch { return []; }
}

export async function placa() {
  const s = (await rodar('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'])).trim();
  const [usada, total] = s.split(',').map((x) => Number(x));
  return Number.isFinite(usada) && Number.isFinite(total) ? { usadaGB: +(usada / 1024).toFixed(1), totalGB: +(total / 1024).toFixed(1) } : null;
}

// Decide os avisos (puro, testado em tools/teste_3d.mjs). `motorGB`: o que o próprio ComfyUI do Prisma ocupa.
export function avaliarRecursos({ ollama = [], elara = [], vram = null, motorGB = 0, ocupado = false }) {
  const avisos = [];
  const qwen = ollama.reduce((s, m) => s + m.vramGB, 0);
  if (ollama.length && !ocupado) avisos.push({ tipo: 'ollama', texto: `O Ollama está com ${ollama.map((m) => m.nome).join(', ')} na placa (${qwen.toFixed(1)} GB).`, acao: 'Descarregar' });
  if (elara.length) {
    const ram = elara.reduce((s, p) => s + p.ramMB, 0);
    avisos.push({ tipo: 'elara', texto: `A Elara Voz está aberta (${(ram / 1024).toFixed(1)} GB de RAM; o Whisper usa ~2 GB da placa).`, acao: 'Fechar a Elara' });
  }
  if (vram) {
    const whisper = elara.length ? 2.0 : 0;   // o Whisper da Elara já tem o aviso dele
    const outros = vram.usadaGB - motorGB - qwen - whisper;
    if (outros > 1.5) avisos.push({ tipo: 'placa', texto: `Outros programas ocupam ~${outros.toFixed(1)} GB da placa (jogos, navegador com vídeo...). O 3D fica mais lento.`, acao: null });
  }
  return avisos;
}

export async function estadoRecursos({ motorGB = 0, ocupado = false } = {}) {
  const [ollama, elara, vram] = await Promise.all([ollamaCarregados(), processosElara(), placa()]);
  return { ollama, elara, vram, avisos: avaliarRecursos({ ollama, elara, vram, motorGB, ocupado }) };
}

export async function descarregarOllama() {
  for (const m of await ollamaCarregados()) {
    try { await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.nome, keep_alive: 0 }), signal: AbortSignal.timeout(20000) }); } catch { /* segue */ }
  }
}

// Fecha só os processos da Elara (o Ollama portátil dela continua, mas sem modelo na placa). Você abre de novo pelo "Iniciar Elara.bat".
export async function fecharElara() {
  const ps = await processosElara();
  for (const p of ps) await rodar('taskkill', ['/PID', String(p.pid), '/T', '/F']);
  return ps.length;
}
