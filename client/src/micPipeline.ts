import { getSettings } from "./settings.js";

export type MicGraph = {
  id: number;
  deviceId: string;
  track: MediaStreamTrack;
  gain: GainNode;
  analyser: AnalyserNode;
  close: () => void;
};

let nextId = 1;
let voiceGraph: MicGraph | null = null;

export function setVoiceMicGraph(g: MicGraph | null): void {
  voiceGraph = g;
}

export function getVoiceMicGraph(): MicGraph | null {
  return voiceGraph;
}

export function clampGain(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(3, Math.max(0.5, v));
}

export async function openMicGraph(deviceId: string): Promise<MicGraph> {
  const stream = await navigator.mediaDevices.getUserMedia(
    deviceId ? { audio: { deviceId } } : { audio: true },
  );
  const raw = stream.getAudioTracks()[0] ?? null;
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  gain.gain.value = clampGain(getSettings().micGain);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(analyser);
  analyser.connect(dest);
  const track = dest.stream.getAudioTracks()[0] ?? null;

  let closed = false;
  const graph: MicGraph = {
    id: nextId++,
    deviceId,
    track,
    gain,
    analyser,
    close() {
      if (closed) return;
      closed = true;
      try {
        raw?.stop();
      } catch {
        /* ignore */
      }
      try {
        track?.stop();
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => {});
    },
  };
  return graph;
}

export function setGraphGain(graph: MicGraph | null, value: number): void {
  if (!graph) return;
  try {
    graph.gain.gain.value = clampGain(value);
  } catch {
    /* ignore */
  }
}

export function micLevel(graph: MicGraph | null): number {
  if (!graph) return 0;
  try {
    const data = new Float32Array(graph.analyser.fftSize);
    graph.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  } catch {
    return 0;
  }
}
