import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/features/player.js";
import { parseASS } from "../src/lib/subtitles.js";
import { createProjectStore } from "../src/state/project-store.js";

function setup(context, { media = false } = {}) {
  const previousDocument = globalThis.document;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "0",
        style: {},
        setAttribute() {},
        removeAttribute() {},
        click() {},
      });
    return elements.get(id);
  };
  const video = Object.assign(element("video"), {
    duration: 20,
    currentTime: 0,
    paused: true,
    seeking: false,
    readyState: 0,
    pause() {
      this.paused = true;
      this.onpause?.();
    },
    async play() {
      this.paused = false;
      this.onplay?.();
    },
    load() {
      this.readyState = 0;
      this.currentTime = 0;
    },
  });
  const modes = Object.fromEntries(
    ["continuous", "single", "loop"].map((mode) => [
      mode,
      {
        dataset: { mode },
        classList: { toggle() {} },
      },
    ]),
  );
  globalThis.document = {
    getElementById: element,
    querySelectorAll: () => Object.values(modes),
  };
  context.after(() => {
    globalThis.document = previousDocument;
  });
  const store = createProjectStore({
    project: parseASS(
      "[Events]\nFormat: Start, End, Text\n" +
        "Dialogue: 0:00:00.00,0:00:02.00,第一条\n" +
        "Dialogue: 0:00:04.00,0:00:06.00,第二条\n" +
        "Dialogue: 0:00:08.00,0:00:10.00,第三条",
    ),
  });
  const events = [];
  store.subscribe((event) => events.push(event));
  const player = createPlayer({ store, toast: assert.fail, onPosition() {} });
  if (media) {
    player.loadMedia({ url: "test:video" });
    video.readyState = 1;
    video.onloadedmetadata();
  }
  const scrub = (time) => {
    element("seek").value = String(time);
    element("seek").oninput();
  };
  return { element, video, modes, store, player, events, scrub };
}

test("scrubbing follows immediately forwards and backwards without loaded media", (context) => {
  const { store, player, element, events, scrub } = setup(context);
  scrub(8.5);
  assert.equal(store.getState().index, 2);
  assert.equal(player.getPosition(), 8.5);
  assert.equal(element("currentTime").textContent, "00:08");
  assert.deepEqual(events.at(-1), {
    type: "selection",
    previousIndex: 0,
    index: 2,
    seek: false,
    follow: true,
  });
  scrub(0.5);
  assert.equal(store.getState().index, 0);
  scrub(3.999999);
  assert.equal(
    store.getState().index,
    1,
    "seek boundary matching retains millisecond precision",
  );
});

test("paused media seeks synchronize without waiting for timeupdate", (context) => {
  const { video, store, scrub } = setup(context, { media: true });
  scrub(8.5);
  assert.equal(video.currentTime, 8.5);
  assert.equal(video.paused, true);
  assert.equal(store.getState().index, 2);
  video.onseeking();
  video.currentTime = 4.5;
  video.onseeked();
  assert.equal(
    store.getState().index,
    1,
    "completed media seeks also refresh the selected subtitle",
  );
});

test("scrubbing respects follow being off and enabling it synchronizes the current position", (context) => {
  const { element, store, scrub } = setup(context);
  element("follow").checked = false;
  element("follow").onchange();
  scrub(8.5);
  assert.equal(store.getState().index, 0);
  element("follow").checked = true;
  element("follow").onchange();
  assert.equal(store.getState().index, 2);
});

for (const mode of ["single", "loop"]) {
  test(`scrubbing retargets ${mode} playback and keeps its end behavior`, async (context) => {
    const { modes, video, store, player, scrub } = setup(context, {
      media: true,
    });
    modes[mode].onclick();
    await player.play();
    scrub(8.5);
    assert.equal(store.getState().index, 2);
    video.ontimeupdate();
    assert.equal(
      video.paused,
      false,
      "the previous subtitle end must not stop the seek target",
    );
    video.currentTime = 10;
    video.ontimeupdate();
    if (mode === "loop") {
      assert.equal(video.currentTime, 8);
      assert.equal(video.paused, false);
    } else assert.equal(video.paused, true);
  });
}

test("scrubbing never approves skipped subtitles even before media seeking events arrive", async (context) => {
  const { element, video, store, player, scrub } = setup(context, {
    media: true,
  });
  element("autoApprove").onclick();
  video.currentTime = 0.5;
  await player.play();
  scrub(8.5);
  video.ontimeupdate();
  assert.ok(store.getState().project.entries.every((entry) => !entry.reviewed));
  video.onseeking();
  video.onseeked();
  video.currentTime = 10;
  video.ontimeupdate();
  assert.deepEqual(
    store.getState().project.entries.map((entry) => entry.reviewed),
    [false, false, true],
  );
});

test("following resumes after scrubbing into a subtitle gap or beyond the subtitle range", async (context) => {
  const { video, store, player, scrub } = setup(context, { media: true });
  await player.play();
  scrub(3);
  video.currentTime = 4.5;
  video.ontimeupdate();
  assert.equal(store.getState().index, 1);
  scrub(20);
  scrub(8.5);
  assert.equal(store.getState().index, 2);
});

test("loading media retains the latest selection until metadata arrives", (context) => {
  const { store, player, video, element } = setup(context);
  store.selectSubtitle(1);
  player.loadMedia({ url: "test:video" });
  assert.equal(player.getPosition(), 4);
  video.ontimeupdate();
  assert.equal(store.getState().index, 1);
  assert.equal(element("currentTime").textContent, "00:04");
  store.selectSubtitle(2);
  video.readyState = 1;
  video.onloadedmetadata();
  video.onseeked();
  assert.equal(video.currentTime, 8);
  assert.equal(store.getState().index, 2);
  assert.equal(player.getPosition(), 8);
});
