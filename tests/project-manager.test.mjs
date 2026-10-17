import test from "node:test";
import assert from "node:assert/strict";
import { parseASS } from "../src/lib/subtitles.js";
import { createProjectStore } from "../src/state/project-store.js";
import { createProjectPersistence } from "../src/services/project-persistence.js";
import { createProjectManager } from "../src/features/project-manager.js";
import { createPlayer } from "../src/features/player.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(
  context,
  { reviews = [true, false, false], media = true, follow = true } = {},
) {
  const previousDocument = globalThis.document,
    elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "0",
        style: {},
        setAttribute() {},
        removeAttribute() {},
      });
    return elements.get(id);
  };
  const video = Object.assign(element("video"), {
    duration: NaN,
    currentTime: 0,
    paused: true,
    readyState: 0,
    pause() {
      this.paused = true;
      this.onpause?.();
    },
    load() {
      this.readyState = 0;
      this.currentTime = 0;
      this.duration = NaN;
    },
  });
  globalThis.document = { getElementById: element, querySelectorAll: () => [] };
  context.after(() => {
    globalThis.document = previousDocument;
  });
  const project = parseASS(
    "[Events]\nFormat: Start, End, Text\n" +
      // The reviewed first cue overlaps the first pending cue's start.
      "Dialogue: 0:00:05.00,0:00:12.00,已校对\n" +
      "Dialogue: 0:00:10.00,0:00:12.00,首条待校对\n" +
      "Dialogue: 0:00:15.00,0:00:17.00,最后一条",
  );
  project.entries = project.entries.slice(0, reviews.length);
  project.entries.forEach((entry, i) => {
    entry.reviewed = reviews[i];
  });
  const record = {
    id: "one",
    assName: "one.ass",
    name: "工程一",
    entryCount: project.entries.length,
    reviewedCount: reviews.filter(Boolean).length,
    video: media ? { name: "one.mp4" } : null,
  };
  const saved = new Map([[record.id, { record, project, stateValid: true }]]),
    reads = [],
    workspaces = [];
  const repository = {
    async migrateLegacy() {},
    async list() {
      return [...saved.values()].map((item) => item.record);
    },
    async getActive() {
      return record.id;
    },
    async setActive() {},
    async read(id) {
      reads.push(id);
      return saved.get(id);
    },
  };
  const store = createProjectStore();
  const player = createPlayer({ store, toast: assert.fail, onPosition() {} });
  element("follow").checked = follow;
  element("follow").onchange();
  const persistence = createProjectPersistence({
    store,
    repository,
    onStatus() {},
    onError: assert.fail,
  });
  const nativeStorage = media
    ? {
        async getVideo() {
          return { url: "test:video" };
        },
        onCopyProgress() {},
      }
    : null;
  const manager = createProjectManager({
    store,
    repository,
    persistence,
    player,
    nativeStorage,
    toast: assert.fail,
    showWorkspace: () => workspaces.push(true),
  });
  const clickProject = (id) =>
    element("projectList").onclick({
      target: {
        closest: (selector) =>
          selector === "[data-open-project]"
            ? { dataset: { openProject: id } }
            : null,
      },
    });
  const metadata = () => {
    video.readyState = 1;
    video.duration = 60;
    video.onloadedmetadata();
    video.onseeked();
  };
  return {
    manager,
    store,
    player,
    video,
    persistence,
    element,
    record,
    saved,
    reads,
    workspaces,
    clickProject,
    metadata,
  };
}

for (const follow of [true, false]) {
  test(`restoring a project seeks to the first pending cue with follow ${follow ? "on" : "off"}`, async (context) => {
    const { manager, store, player, video, persistence, element, metadata } =
      setup(context, { follow });
    await manager.initialize({});
    assert.equal(store.getState().index, 1);
    assert.equal(player.getPosition(), 10);
    video.ontimeupdate();
    assert.equal(
      element("currentTime").textContent,
      "00:10",
      "loading events must not reset the restored position",
    );
    metadata();
    video.ontimeupdate();
    assert.equal(video.currentTime, 10);
    assert.equal(video.paused, true);
    assert.equal(
      store.getState().index,
      1,
      "an overlapping reviewed cue must not replace the pending cue",
    );
    assert.deepEqual(
      store.getState().project.entries.map((entry) => entry.reviewed),
      [true, false, false],
    );
    assert.equal(persistence.isDirty(), false);
  });
}

test("opening the active project resumes from current unsaved review progress", async (context) => {
  const {
    manager,
    store,
    player,
    persistence,
    reads,
    workspaces,
    clickProject,
  } = setup(context, { media: false });
  await manager.initialize({});
  store.approveSubtitle();
  store.selectSubtitle(0);
  clickProject("one");
  assert.equal(store.getState().index, 2);
  assert.equal(player.getPosition(), 15);
  assert.equal(persistence.isDirty(), true);
  assert.deepEqual(
    reads,
    ["one"],
    "reopening the active project must retain in-memory changes",
  );
  assert.equal(workspaces.length, 1);
});

test("switching projects selects the new project's first pending cue", async (context) => {
  const { manager, store, player, saved, clickProject, metadata, video } =
    setup(context);
  await manager.initialize({});
  metadata();
  const project = parseASS(
    "[Events]\nFormat: Start, End, Text\n" +
      "Dialogue: 0:00:20.00,0:00:22.00,另一个工程\n" +
      "Dialogue: 0:00:30.00,0:00:32.00,继续校对",
  );
  project.entries[0].reviewed = true;
  saved.set("two", {
    record: {
      id: "two",
      assName: "two.ass",
      name: "工程二",
      video: { name: "two.mp4" },
    },
    project,
    stateValid: true,
  });
  clickProject("two");
  await tick();
  assert.equal(store.getState().name, "two.ass");
  assert.equal(store.getState().index, 1);
  assert.equal(player.getPosition(), 30);
  metadata();
  assert.equal(video.currentTime, 30);
});

test("granting video access later retains the selected pending position", async (context) => {
  const { manager, record, player, element, metadata, video } = setup(context, {
    media: false,
  });
  let granted = false;
  record.video = {
    name: "one.mp4",
    size: 10,
    lastModified: 1,
    handle: {
      async queryPermission() {
        return granted ? "granted" : "prompt";
      },
      async requestPermission() {
        granted = true;
        return "granted";
      },
      async getFile() {
        return {
          url: "test:video",
          name: "one.mp4",
          size: 10,
          lastModified: 1,
        };
      },
    },
  };
  await manager.initialize({});
  assert.equal(element("allowVideo").hidden, false);
  assert.equal(player.getPosition(), 10);
  element("allowVideo").onclick();
  await tick();
  metadata();
  assert.equal(video.currentTime, 10);
});

for (const reviews of [[true, true, true], []]) {
  test(`opening ${reviews.length ? "a completed" : "an empty"} project has a safe fallback`, async (context) => {
    const { manager, store, player, video } = setup(context, {
      reviews,
      media: false,
    });
    await manager.initialize({});
    video.ontimeupdate();
    video.onseeked();
    assert.equal(store.getState().index, 0);
    assert.equal(player.getPosition(), reviews.length ? 5 : 0);
  });
}
