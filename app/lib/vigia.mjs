// Quando desligar sozinho: a janela manda um sinal de vida a cada 5 s. Minimizada, o navegador segura esses sinais
// (às vezes só um por minuto), então o limite é folgado. Com trabalho na fila nunca desliga: um modelo 3D leva até 25 minutos.
export const SEM_SINAL_MS = 150000;

export function deveEncerrar({ recebeuPing, ultimoPing, ocupado, agora = Date.now() }) {
  return !!recebeuPing && !ocupado && agora - ultimoPing > SEM_SINAL_MS;
}
