import { computeSpectrogram, copyMonoSample, SPECTRUM_ROWS } from "../lib/spectrogram.js";

const TILE_SECONDS = 4, TILE_COLUMNS = 200, CACHE_LIMIT = 24;
let sourceId = 0, latestRequest = 0, input = null, opening = null, pending = null, running = false;
const cache = new Map();
const current = (request) => request.sourceId === sourceId && request.requestId === latestRequest;

async function openSource(file, id) {
  const { Input, ALL_FORMATS, BlobSource, AudioSampleSink } = await import("/assets/vendor/mediabunny.mjs");
  if (id !== sourceId) return null;
  const next = new Input({ formats: ALL_FORMATS, source: new BlobSource(file, { maxCacheSize: 2 * 1024 * 1024 }) });
  input = next;
  const track = await next.getPrimaryAudioTrack();
  if (!track) throw Error("NO_AUDIO");
  if (!await track.canDecode()) throw Error("UNSUPPORTED_AUDIO");
  const sampleRate = await track.getSampleRate();
  if (id !== sourceId) { next.dispose(); return null; }
  self.postMessage({ type: "state", sourceId: id, state: "ready" });
  return { sink: new AudioSampleSink(track), sampleRate };
}

async function getTile(number, source, request) {
  if (cache.has(number)) {
    const tile = cache.get(number);
    cache.delete(number); cache.set(number, tile);
    return tile;
  }
  const start = number * TILE_SECONDS, windowStart = Math.max(0, start - 0.1), end = start + TILE_SECONDS + 0.1;
  let pcm = new Float32Array(Math.ceil((end - windowStart) * source.sampleRate));
  let hasAudio = false;
  for await (const sample of source.sink.samples(windowStart, end)) {
    try {
      if (!current(request)) return null;
      // HE-AAC may decode at twice the sample rate declared in metadata.
      if (!hasAudio && sample.sampleRate !== source.sampleRate) {
        source.sampleRate = sample.sampleRate;
        pcm = new Float32Array(Math.ceil((end - windowStart) * source.sampleRate));
      }
      hasAudio = copyMonoSample(sample, pcm, windowStart, source.sampleRate) || hasAudio;
    } finally { sample.close(); }
  }
  if (!current(request)) return null;
  const tile = { ...computeSpectrogram(pcm, source.sampleRate, { start, duration: TILE_SECONDS, windowStart, columns: TILE_COLUMNS }), hasAudio };
  cache.set(number, tile);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return tile;
}

async function analyze(request) {
  const source = await opening;
  if (!source || !current(request)) return;
  const columns = Math.max(1, Math.min(1200, Math.round(request.columns)));
  const values = new Uint8Array(columns * SPECTRUM_ROWS);
  let previousTile = -1, tile = null, hasAudio = false;
  for (let column = 0; column < columns; column++) {
    if (!current(request)) return;
    const time = request.start + (column + 0.5) / columns * (request.end - request.start);
    const number = Math.floor(time / TILE_SECONDS);
    if (number !== previousTile) { tile = await getTile(number, source, request); previousTile = number; }
    if (!tile) return;
    hasAudio ||= tile.hasAudio;
    const tileColumn = Math.min(TILE_COLUMNS - 1, Math.floor((time / TILE_SECONDS - number) * TILE_COLUMNS));
    for (let row = 0; row < SPECTRUM_ROWS; row++) values[row * columns + column] = tile.values[row * TILE_COLUMNS + tileColumn];
  }
  if (current(request)) self.postMessage({
    type: "spectrum", sourceId, requestId: request.requestId,
    start: request.start, end: request.end, columns, rows: SPECTRUM_ROWS,
    maximum: tile.maximum, hasAudio, values: values.buffer,
  }, [values.buffer]);
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const request = pending; pending = null;
      try { await analyze(request); }
      catch (error) {
        if (current(request)) self.postMessage({ type: "state", sourceId, requestId: request.requestId, state: "error", code: error.message });
      }
    }
  } finally { running = false; }
}

self.onmessage = ({ data }) => {
  if (data.type === "source") {
    sourceId = data.sourceId; latestRequest++; pending = null;
    input?.dispose(); input = null; cache.clear();
    self.postMessage({ type: "state", sourceId, state: "loading" });
    const id = sourceId;
    opening = openSource(data.file, id).catch((error) => {
      if (id === sourceId) self.postMessage({ type: "state", sourceId: id, state: "error", code: error.message });
      return null;
    });
  } else if (data.sourceId === sourceId && data.type === "range") {
    latestRequest = data.requestId; pending = data;
    drain();
  } else if (data.sourceId === sourceId && data.type === "cancel") {
    latestRequest = data.requestId; pending = null;
  }
};
