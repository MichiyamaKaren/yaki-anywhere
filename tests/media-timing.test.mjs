import test from "node:test";
import assert from "node:assert/strict";
import { getMediaTimeOrigin } from "../src/lib/media-timing.js";
import { copyMonoSample } from "../src/lib/spectrogram.js";

const input = (audio, video) => ({
  getPrimaryAudioTrack: async () => audio == null ? null : { getFirstTimestamp: async () => audio },
  getPrimaryVideoTrack: async () => video == null ? null : { getFirstTimestamp: async () => video },
});

test("the phone video's audio and video share the earliest playable timestamp origin", async () => {
  assert.equal(await getMediaTimeOrigin(input(1.3850113378684807, 1.518)), 1.3850113378684807);
  assert.equal(await getMediaTimeOrigin(input(1.5, 1)), 1);
});

test("zero-start media, preroll and missing tracks retain a valid time origin", async () => {
  assert.equal(await getMediaTimeOrigin(input(0, 0.133)), 0);
  assert.equal(await getMediaTimeOrigin(input(-0.02, 0)), 0);
  assert.equal(await getMediaTimeOrigin(input(null, 1.5)), 1.5);
  assert.equal(await getMediaTimeOrigin(input(null, null)), 0);
  assert.equal(await getMediaTimeOrigin(input(NaN, Infinity)), 0);
});

test("spectrum windows place raw packet timestamps on the ASS time axis", () => {
  const origin = 1.3850113378684807;
  const pcm = new Float32Array(4);
  const sample = {
    timestamp: origin + 2.5, sampleRate: 4, numberOfFrames: 2, numberOfChannels: 1,
    copyTo(target) { target.fill(1); },
  };
  copyMonoSample(sample, pcm, 2 + origin, 4);
  assert.deepEqual([...pcm], [0, 0, 1, 1]);
});
