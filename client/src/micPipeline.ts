import { getSettings, subscribeSettings } from "./settings.js";

export type MicGraph = {
  id: number;
  deviceId: string;
  track: MediaStreamTrack;
  gain: GainNode;
  gate: GainNode;
  inAnalyser: AnalyserNode;
  analyser: AnalyserNode;
  ctx: AudioContext;
  monitorConnected: boolean;
  source: MediaStreamAudioSourceNode;
  raw: MediaStreamTrack;
  closed: boolean;
  gateTimer: number | null;
  gateThreshold: number;
  gateAttack: number;
  gateRelease: number;
  close: () => void;
};

let nextId = 1;
let voiceGraph: MicGraph | null = null;

const liveGraphs = new Set<MicGraph>();

let unsubSettings: (() => void) | null = null;
let lastConstraintSig = "";
let lastGateSig = "";

const GATE_STEP_MS = 20;

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

function micAudioConstraints(deviceId: string): MediaTrackConstraints {
  const s = getSettings();
  const base: MediaTrackConstraints = {
    noiseSuppression: s.micNoiseSuppression,
    echoCancellation: s.micEchoCancellation,
    autoGainControl: s.micAutoGainControl,
  };
  return deviceId ? { ...base, deviceId } : base;
}

function constraintSig(): string {
  const s = getSettings();
  return [s.micNoiseSuppression, s.micEchoCancellation, s.micAutoGainControl]
    .map(String)
    .join("|");
}

function gateSig(): string {
  const s = getSettings();
  return [s.gate, s.gateThreshold, s.gateAttackMs, s.gateReleaseMs]
    .map(String)
    .join("|");
}

function ensureSettingsWatch(): void {
  if (unsubSettings) return;
  lastConstraintSig = constraintSig();
  lastGateSig = gateSig();
  unsubSettings = subscribeSettings(() => {
    const cs = constraintSig();
    if (cs !== lastConstraintSig) {
      lastConstraintSig = cs;
      for (const g of [...liveGraphs]) {
        void replaceGraphSource(g, g.deviceId);
      }
    }
    const gs = gateSig();
    if (gs !== lastGateSig) {
      lastGateSig = gs;
      for (const g of liveGraphs) applyGateParams(g);
    }
  });
}

export async function openMicGraph(deviceId: string): Promise<MicGraph> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: micAudioConstraints(deviceId),
  });
  const raw = stream.getAudioTracks()[0] ?? null;
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  gain.gain.value = clampGain(getSettings().micGain);
  const gate = ctx.createGain();
  gate.gain.value = 1;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const inAnalyser = ctx.createAnalyser();
  inAnalyser.fftSize = 512;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(gate);
  gate.connect(analyser);
  analyser.connect(dest);
  gain.connect(inAnalyser);
  const track = dest.stream.getAudioTracks()[0] ?? null;

  const graph: MicGraph = {
    id: nextId++,
    deviceId,
    track,
    gain,
    gate,
    analyser,
    inAnalyser,
    ctx,
    monitorConnected: false,
    source,
    raw,
    closed: false,
    gateTimer: null,
    gateThreshold: 0,
    gateAttack: 0.03,
    gateRelease: 0.3,
    close() {
      if (graph.closed) return;
      graph.closed = true;
      if (graph.gateTimer != null) {
        clearInterval(graph.gateTimer);
        graph.gateTimer = null;
      }
      liveGraphs.delete(graph);
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
  liveGraphs.add(graph);
  ensureSettingsWatch();
  applyGateParams(graph);
  return graph;
}

function gateTick(graph: MicGraph): void {
  if (graph.closed) return;
  try {
    const data = new Float32Array(graph.inAnalyser.fftSize);
    graph.inAnalyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const open = rms >= graph.gateThreshold;
    const target = open ? 1 : 0;
    const tau = open ? graph.gateAttack : graph.gateRelease;
    const coef = 1 - Math.exp(-(GATE_STEP_MS / 1000) / Math.max(0.001, tau));
    graph.gate.gain.value += (target - graph.gate.gain.value) * coef;
  } catch {
    /* ignore */
  }
}

export function applyGateParams(graph: MicGraph | null): void {
  if (!graph) return;
  const s = getSettings();
  graph.gateThreshold = Math.min(0.9, Math.max(0.005, s.gateThreshold / 100));
  graph.gateAttack = Math.max(0.005, s.gateAttackMs / 1000);
  graph.gateRelease = Math.max(0.01, s.gateReleaseMs / 1000);
  if (!s.gate) {
    graph.gate.gain.value = 1;
    if (graph.gateTimer != null) {
      clearInterval(graph.gateTimer);
      graph.gateTimer = null;
    }
    return;
  }
  if (graph.gateTimer == null) {
    graph.gateTimer = window.setInterval(() => gateTick(graph), GATE_STEP_MS);
  }
}

async function replaceGraphSource(graph: MicGraph, deviceId: string): Promise<boolean> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: micAudioConstraints(deviceId),
    });
  } catch {
    return false;
  }
  const raw = stream.getAudioTracks()[0] ?? null;
  if (!raw) {
    for (const t of stream.getTracks()) t.stop();
    return false;
  }
  if (graph.closed) {
    raw.stop();
    return false;
  }
  graph.source.disconnect();
  try {
    graph.raw.stop();
  } catch {
    /* ignore */
  }
  const source = graph.ctx.createMediaStreamSource(stream);
  source.connect(graph.gain);
  graph.source = source;
  graph.raw = raw;
  graph.deviceId = deviceId;
  return true;
}

export async function switchMicGraphDevice(
  graph: MicGraph | null,
  deviceId: string,
): Promise<boolean> {
  if (!graph || graph.deviceId === deviceId) return true;
  return replaceGraphSource(graph, deviceId);
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

export function setMonitorMic(graph: MicGraph | null, on: boolean): void {
  if (!graph) return;
  try {
    if (on && !graph.monitorConnected) {
      graph.gate.connect(graph.ctx.destination);
      graph.monitorConnected = true;
    } else if (!on && graph.monitorConnected) {
      try {
        graph.gate.disconnect(graph.ctx.destination);
      } catch {
        /* ignore */
      }
      graph.monitorConnected = false;
    }
  } catch {
    /* ignore */
  }
}
