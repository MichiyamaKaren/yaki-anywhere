import test from "node:test";
import assert from "node:assert/strict";
import { computeSpectrogram, frequencyAtRow, copyMonoSample } from "../src/lib/spectrogram.js";

const sampleRate = 48000;
function tone(frequency, amplitude = 0.1, seconds = 1) {
  return Float32Array.from({ length: sampleRate * seconds }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate));
}
function peakFrequency(spectrum, column) {
  let peak = 0;
  for (let row = 1; row < spectrum.rows; row++) {
    if (spectrum.values[row * spectrum.columns + column] > spectrum.values[peak * spectrum.columns + column]) peak = row;
  }
  return frequencyAtRow(peak, spectrum.rows, spectrum.maximum);
}

test("a 1 kHz tone peaks in the corresponding frequency band", () => {
  const spectrum = computeSpectrogram(tone(1000), sampleRate, { columns: 20 });
  assert.ok(Math.abs(peakFrequency(spectrum, 10) - 1000) < 150);
});
test("frequency changes align with the audio's time axis", () => {
  const pcm = new Float32Array(sampleRate * 2);
  pcm.set(tone(300)); pcm.set(tone(3000), sampleRate);
  const spectrum = computeSpectrogram(pcm, sampleRate, { columns: 40 });
  assert.ok(Math.abs(peakFrequency(spectrum, 10) - 300) < 80);
  assert.ok(Math.abs(peakFrequency(spectrum, 30) - 3000) < 300);
  const cropped = computeSpectrogram(pcm, sampleRate, { start: 1, windowStart: 0, duration: 0.5, columns: 10 });
  assert.ok(Math.abs(peakFrequency(cropped, 5) - 3000) < 300);
});
test("silence has no energy, and quieter audio has a lower intensity", () => {
  const silence = computeSpectrogram(new Float32Array(sampleRate), sampleRate, { columns: 10 });
  assert.ok(silence.values.every(value => value === 0));
  const quiet = computeSpectrogram(tone(1000, 0.001), sampleRate, { columns: 10 });
  const loud = computeSpectrogram(tone(1000, 0.1), sampleRate, { columns: 10 });
  assert.ok(Math.max(...loud.values) > Math.max(...quiet.values));
});
test("decoded packets are clipped, timestamp aligned and mixed to mono", () => {
  const channels = [[1, 2, 3, 4], [3, 4, 5, 6]];
  const sample = {
    timestamp: 0.75, sampleRate: 4, numberOfFrames: 4, numberOfChannels: 2,
    copyTo(target, options) {
      assert.equal(options.format, "f32-planar");
      target.set(channels[options.planeIndex].slice(options.frameOffset, options.frameOffset + options.frameCount));
    },
  };
  const destination = new Float32Array(2);
  assert.equal(copyMonoSample(sample, destination, 1, 4), true);
  assert.deepEqual([...destination], [3, 4]);
  assert.equal(copyMonoSample(sample, destination, 5, 4), false);
});
test("packet timestamp gaps remain silent", () => {
  const destination = new Float32Array(6);
  const sample = { timestamp: 1, sampleRate: 4, numberOfFrames: 4, numberOfChannels: 1, copyTo(target) { target.fill(0.5); } };
  copyMonoSample(sample, destination, 0, 4);
  assert.deepEqual([...destination], [0, 0, 0, 0, 0.5, 0.5]);
});
