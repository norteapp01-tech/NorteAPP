import { useEffect, useState } from "react";

const BAR_COUNT = 12;
const IDLE_LEVELS = Array(BAR_COUNT).fill(0.08);

/** Reduz os bytes de frequência (0–255) do AnalyserNode a `barCount` barras
 * normalizadas (0–1) — média por faixa, com piso de 0.08 pra nunca ficar
 * com barra "invisível" (0px) na UI. Pura, sem Web Audio API — é o que
 * permite testar a matemática sem precisar de um browser real. */
export function reduceToBars(data: Uint8Array, barCount: number): number[] {
  if (data.length === 0) return Array(barCount).fill(0.08);
  const chunk = Math.max(1, Math.floor(data.length / barCount));
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < chunk; j++) sum += data[i * chunk + j] ?? 0;
    bars.push(Math.max(0.08, sum / chunk / 255));
  }
  return bars;
}

/**
 * Amplitude real do microfone, em barras normalizadas (0 a 1) — Web Audio
 * API nativa (AnalyserNode), sem lib nova. Lê o MESMO MediaStream que já
 * está sendo gravado (nunca abre um segundo stream/pede permissão de novo).
 *
 * `ctx.resume()` é mitigação padrão pro Safari/iOS não deixar o
 * AudioContext suspenso — best-effort, não garante funcionar em todo
 * navegador/versão.
 */
export function useMicWaveform(active: boolean, stream: MediaStream | null): number[] {
  const [levels, setLevels] = useState<number[]>(IDLE_LEVELS);

  useEffect(() => {
    if (!active || !stream) {
      setLevels(IDLE_LEVELS);
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let frame: number;
    const step = () => {
      analyser.getByteFrequencyData(data);
      setLevels(reduceToBars(data, BAR_COUNT));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
    };
  }, [active, stream]);

  return levels;
}
