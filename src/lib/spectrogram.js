export const SPECTRUM_ROWS = 64;
export const MIN_FREQUENCY = 50;
export const MAX_FREQUENCY = 8000;
const plans = new Map();

export function frequencyAtRow(row, rows = SPECTRUM_ROWS, maximum = MAX_FREQUENCY) {
  return MIN_FREQUENCY * (maximum / MIN_FREQUENCY) ** (1 - row / (rows - 1));
}

function fftPlan(size) {
  if (plans.has(size)) return plans.get(size);
  const reverse = new Uint16Array(size), window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let bits = i, reversed = 0;
    for (let j = 1; j < size; j *= 2) { reversed = (reversed << 1) | (bits & 1); bits >>= 1; }
    reverse[i] = reversed;
    window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
  }
  const plan = { reverse, window };
  plans.set(size, plan);
  return plan;
}

// Hann-windowed STFT, logarithmic frequency axis, fixed -85 to -10 dB scale.
export function computeSpectrogram(pcm, sampleRate, {
  start = 0, duration = pcm.length / sampleRate, windowStart = start,
  columns = 200, rows = SPECTRUM_ROWS,
} = {}) {
  if (!(sampleRate > 0) || !(duration > 0) || columns < 1 || rows < 2) throw Error("Invalid spectrum dimensions");
  const size = sampleRate >= 32000 ? 2048 : 1024;
  const maximum = Math.min(MAX_FREQUENCY, sampleRate / 2);
  const { reverse, window } = fftPlan(size);
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  const values = new Uint8Array(columns * rows);
  const bands = Array.from({ length: rows }, (_, row) => {
    const center = frequencyAtRow(row, rows, maximum);
    const ratio = (maximum / MIN_FREQUENCY) ** (1 / (2 * (rows - 1)));
    return [Math.max(1, Math.floor(center / ratio * size / sampleRate)), Math.min(size / 2, Math.ceil(center * ratio * size / sampleRate))];
  });
  for (let column = 0; column < columns; column++) {
    const center = Math.round((start + (column + 0.5) / columns * duration - windowStart) * sampleRate);
    imaginary.fill(0);
    for (let i = 0; i < size; i++) real[reverse[i]] = (pcm[center - size / 2 + i] ?? 0) * window[i];
    for (let length = 2; length <= size; length *= 2) {
      const half = length / 2, angle = -2 * Math.PI / length;
      const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
      for (let offset = 0; offset < size; offset += length) {
        let twiddleReal = 1, twiddleImaginary = 0;
        for (let i = 0; i < half; i++) {
          const a = offset + i, b = a + half;
          const r = real[b] * twiddleReal - imaginary[b] * twiddleImaginary;
          const im = real[b] * twiddleImaginary + imaginary[b] * twiddleReal;
          real[b] = real[a] - r; imaginary[b] = imaginary[a] - im;
          real[a] += r; imaginary[a] += im;
          const next = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
          twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
          twiddleReal = next;
        }
      }
    }
    for (let row = 0; row < rows; row++) {
      let power = 0;
      for (let bin = bands[row][0]; bin <= bands[row][1]; bin++) power = Math.max(power, real[bin] ** 2 + imaginary[bin] ** 2);
      const db = 20 * Math.log10(Math.max(1e-12, Math.sqrt(power) / (size / 4)));
      values[row * columns + column] = Math.round(Math.max(0, Math.min(1, (db + 85) / 75)) * 255);
    }
  }
  return { values, columns, rows, maximum };
}

// Audio packets have their own timestamps; align them to the video's time base.
export function copyMonoSample(sample, destination, windowStart, sampleRate) {
  const offset = Math.round((sample.timestamp - windowStart) * sampleRate);
  const first = Math.max(0, -offset), last = Math.min(sample.numberOfFrames, destination.length - offset);
  if (last <= first) return false;
  if (sample.sampleRate !== sampleRate) throw Error("Audio sample rate changed");
  const plane = new Float32Array(last - first);
  for (let channel = 0; channel < sample.numberOfChannels; channel++) {
    sample.copyTo(plane, { planeIndex: channel, format: "f32-planar", frameOffset: first, frameCount: plane.length });
    for (let i = 0; i < plane.length; i++) destination[offset + first + i] += plane[i] / sample.numberOfChannels;
  }
  return true;
}

export function spectrumColor(value) {
  const stops = [[24, 22, 45], [73, 51, 119], [157, 94, 172], [237, 150, 133], [255, 229, 159]];
  const position = Math.max(0, Math.min(255, value)) / 255 * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(position)), fraction = position - i;
  return stops[i].map((color, channel) => Math.round(color + (stops[i + 1][channel] - color) * fraction));
}
