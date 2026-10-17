import { test } from "node:test";
import assert from "node:assert/strict";
import { parseASS, exportASS } from "../src/lib/subtitles.js";
import { createProjectStore } from "../src/state/project-store.js";
import { loadDraft } from "../src/services/project-storage.js";
import { readSubtitleFile } from "../src/services/project-files.js";
import { scrollRowIntoList } from "../src/features/subtitle-list.js";
import { createPlayer } from "../src/features/player.js";
import { createTimeline } from "../src/features/timeline.js";

const fixture =
  "[Script Info]\nTitle: preserved\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nComment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,keep\nDialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,{\\i1}第一条\\N第二行\nDialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,下一条";
const makeStore = () =>
  createProjectStore({ project: parseASS(fixture), name: "字幕.ass" });

test("editing a reviewed subtitle resets review and preserves ASS metadata", () => {
  const store = makeStore();
  store.approveSubtitle();
  store.updateText("{\\i1}修改文本\n完整第二行");
  assert.equal(store.current().reviewed, false);
  store.updateTiming(0.25, 2.5);
  const exported = exportASS(store.getState().project);
  assert.ok(exported.includes("Title: preserved"));
  assert.ok(exported.includes("Comment: 0,"));
  assert.equal(
    parseASS(exported).entries[0].text,
    "{\\i1}修改文本\\N完整第二行",
  );
  const previous = { ...store.current() };
  assert.throws(() => store.updateTiming(3, 2));
  assert.deepEqual(store.current(), previous);
});

test("selection distinguishes manual seeks from playback following and clamps bounds", () => {
  const store = makeStore(),
    events = [];
  store.subscribe((event) => events.push(event));
  store.selectSubtitle(1, { seek: false, follow: true });
  assert.deepEqual(events[0], {
    type: "selection",
    previousIndex: 0,
    index: 1,
    seek: false,
    follow: true,
  });
  store.selectSubtitle(100);
  assert.equal(store.getState().index, 1);
  assert.equal(events.at(-1).seek, true);
  store.selectSubtitle(-10);
  assert.equal(store.getState().index, 0);
  store.replaceProject(parseASS(fixture), "新项目.ass");
  assert.equal(store.getState().index, 0);
  assert.equal(store.getState().name, "新项目.ass");
});

test("automatic approval ignores seeks and does not approve subtitles skipped entirely", () => {
  const store = makeStore();
  store.approveCompletedSubtitles(null, 10);
  store.approveCompletedSubtitles(10, 1);
  assert.ok(store.getState().project.entries.every((entry) => !entry.reviewed));
  store.approveCompletedSubtitles(1, 5);
  assert.equal(store.getState().project.entries[0].reviewed, true);
  assert.equal(store.getState().project.entries[1].reviewed, false);
  store.approveCompletedSubtitles(3, 4);
  assert.equal(store.getState().project.entries[1].reviewed, true);
});

test("legacy and invalid drafts recover without losing edited text", () => {
  const project = parseASS(fixture);
  delete project.entries[0].text;
  project.entries[0].source = "旧原文";
  project.entries[0].translation = "旧译文";
  const draft = loadDraft({
    getItem: () => JSON.stringify({ project, name: "旧项目.ass" }),
  });
  assert.equal(draft.project.entries[0].text, "旧原文\\N旧译文");
  assert.deepEqual(loadDraft({ getItem: () => "{broken" }), {});
  assert.deepEqual(
    loadDraft({
      getItem: () => {
        throw Error("Storage blocked");
      },
    }),
    {},
  );
  let removed = false;
  assert.deepEqual(
    loadDraft({
      getItem: () => '{"isDemo":true}',
      removeItem: () => {
        removed = true;
      },
    }),
    {},
  );
  assert.equal(removed, true);
});

test("import reads bytes once and handles GB18030 fallback", async () => {
  const header = Buffer.from(
    "[Events]\nFormat: Start, End, Text\nDialogue: 0:00:00.00,0:00:01.00,",
  );
  const bytes = Buffer.concat([header, Buffer.from([0xd6, 0xd0, 0xce, 0xc4])]);
  let reads = 0;
  const project = await readSubtitleFile({
    arrayBuffer: async () => {
      reads++;
      return bytes;
    },
  });
  assert.equal(reads, 1);
  assert.equal(project.entries[0].text, "中文");
});

test("following scrolls only an overflowing list row and never focuses it", () => {
  const calls = [],
    row = {
      getBoundingClientRect: () => ({ top: 400, bottom: 470 }),
      focus: assert.fail,
    };
  const list = {
    clientHeight: 200,
    clientTop: 1,
    scrollTop: 150,
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo: (options) => calls.push(options),
    scrollIntoView: assert.fail,
  };
  scrollRowIntoList(list, row);
  assert.deepEqual(calls, [{ top: 319, behavior: "auto" }]);
  row.getBoundingClientRect = () => ({ top: 120, bottom: 180 });
  scrollRowIntoList(list, row);
  assert.equal(calls.length, 1);
  list.clientHeight = 0;
  scrollRowIntoList(list, row);
  assert.equal(calls.length, 1);
});

test("timeline drag keeps pointer capture stable and commits rounded times through the store", (context) => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "1",
        style: {},
        clientWidth: 200,
        scrollLeft: 0,
        getBoundingClientRect: () => ({ width: 200, left: 0 }),
      });
    return elements.get(id);
  };
  globalThis.document = { getElementById: element };
  context.after(() => {
    globalThis.document = previousDocument;
  });
  const store = makeStore();
  store.approveSubtitle();
  const events = [],
    edits = [],
    captures = [];
  store.subscribe((event) => events.push(event));
  const track = element("timelineTrack");
  let html = "",
    renders = 0;
  Object.defineProperty(track, "innerHTML", {
    get: () => html,
    set: (value) => {
      html = value;
      renders++;
    },
  });
  createTimeline({
    store,
    getPosition: () => 0,
    seek: assert.fail,
    onDragStart: () => edits.push("start"),
    onDragEnd: () => edits.push("end"),
  });
  const originalHTML = track.innerHTML;
  const block = { style: {}, setPointerCapture: (id) => captures.push(id) };
  const edge = { dataset: { edge: "end" } };
  const target = {
    closest: (selector) => (selector === "[data-index]" ? block : edge),
  };
  track.onpointerdown({
    target,
    pointerId: 7,
    clientX: 100,
    preventDefault() {},
  });
  track.onpointermove({ pointerId: 7, clientX: 140 });
  assert.deepEqual(captures, [7]);
  assert.equal(track.innerHTML, originalHTML);
  assert.equal(renders, 1);
  assert.equal(store.current().reviewed, false);
  assert.equal(events.at(-1).transient, true);
  track.onpointerup();
  assert.equal(store.current().end, 2.54);
  assert.equal(events.at(-1).transient, false);
  assert.equal(renders, 2);
  assert.ok(element("ruler").innerHTML.includes("0:00:03.43"));
  assert.deepEqual(edits, ["start", "end"]);
});

test("player preserves follow, approval seek guards, single-line pause and empty-project duration", (context) => {
  const previousDocument = globalThis.document;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "0",
        style: {},
        attributes: {},
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
        click() {},
      });
    return elements.get(id);
  };
  const video = Object.assign(element("video"), {
    duration: 120,
    paused: true,
    currentTime: 0,
    seeking: false,
    pause() {
      this.paused = true;
      this.onpause?.();
    },
    async play() {
      this.paused = false;
      this.onplay?.();
    },
  });
  const modes = ["continuous", "single", "loop"].map((mode) => ({
    dataset: { mode },
    classList: { toggle() {} },
  }));
  globalThis.document = {
    getElementById: element,
    querySelectorAll: () => modes,
  };
  context.after(() => {
    globalThis.document = previousDocument;
  });
  const store = makeStore(),
    events = [];
  store.subscribe((event) => events.push(event));
  const player = createPlayer({ store, toast: assert.fail, onPosition() {} });
  player.loadMedia({ url: "test:video" });
  video.onloadedmetadata();
  element("autoApprove").onclick();
  video.currentTime = 1;
  video.paused = false;
  video.onplay();
  video.currentTime = 2.1;
  video.ontimeupdate();
  assert.equal(store.getState().index, 1);
  assert.equal(events.find((event) => event.type === "selection").follow, true);
  assert.equal(store.getState().project.entries[0].reviewed, true);
  video.currentTime = 1.999999;
  video.ontimeupdate();
  assert.equal(
    store.getState().index,
    1,
    "fractional seek error must not follow back to the previous subtitle",
  );
  video.onseeking();
  video.currentTime = 4;
  video.ontimeupdate();
  assert.equal(store.getState().project.entries[1].reviewed, false);
  modes[1].onclick();
  video.ontimeupdate();
  assert.equal(video.paused, true);
  assert.equal(element("play").textContent, "▶");
  player.beginTimelineEdit();
  video.currentTime = 1;
  video.ontimeupdate();
  assert.equal(store.getState().index, 1);
  player.endTimelineEdit();
  store.replaceProject({ lines: [], entries: [] }, "空项目");
  assert.equal(Number(element("seek").max), 120);
  assert.equal(element("duration").textContent, "02:00");
  assert.doesNotThrow(() => modes[2].onclick());
});
