import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { parseASS } from "../src/lib/subtitles.js";
import {
  packReviews,
  unpackReviews,
  hashASS,
} from "../src/lib/review-state.js";
import { createWebProjectStorage } from "../src/services/web-project-storage.js";
import {
  createProjectRepository,
  captureProject,
} from "../src/services/project-repository.js";
import { createProjectPersistence } from "../src/services/project-persistence.js";
import { createProjectStore } from "../src/state/project-store.js";

const fixture =
  "[Script Info]\nTitle: retained\n[Events]\nFormat: Start, End, Text\nComment: 0:00:00.00,0:00:01.00,keep\nDialogue: 0:00:00.00,0:00:02.00,{\\i1}第一行\\N第二行\nDialogue: 0:00:02.00,0:00:04.00,下一句";
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fakeOPFS() {
  const files = new Map();
  let fail = false,
    writes = 0;
  const directory = {
    async getFileHandle(name, { create = false } = {}) {
      if (!create && !files.has(name)) throw Error("Missing file");
      return {
        async getFile() {
          return new Blob([files.get(name)]);
        },
        async createWritable() {
          return {
            async write(text) {
              if (fail) throw Error("Disk full");
              files.set(name, text);
              writes++;
            },
            async close() {},
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
  return {
    files,
    writes: () => writes,
    setFail(value) {
      fail = value;
    },
    manager: {
      async getDirectory() {
        return {
          async getDirectoryHandle() {
            return directory;
          },
        };
      },
    },
  };
}
async function storage(context, opfs = null) {
  const backend = await createWebProjectStorage({
    indexedDB: new IDBFactory(),
    storageManager: opfs?.manager,
  });
  context.after(() => backend.close());
  return { backend, repository: createProjectRepository(backend) };
}

test("bitmap spans byte boundaries, scales to 50k entries and rejects mismatched bits", () => {
  const entries = Array.from({ length: 50000 }, (_, i) => ({
    reviewed: i % 3 === 0,
  }));
  const bits = packReviews(entries);
  assert.equal(atob(bits).length, 6250);
  assert.deepEqual(
    unpackReviews(bits, entries.length),
    entries.map((entry) => entry.reviewed),
  );
  assert.throws(() => unpackReviews(bits, 1));
  assert.throws(() => unpackReviews(btoa(String.fromCharCode(128)), 1));
});
test("ASS hashes are stable when a file reader consumes the UTF-8 BOM", async () => {
  assert.equal(await hashASS("\uFEFF" + fixture), await hashASS(fixture));
});
test("private ASS and bitmap round trip through IndexedDB without persisting parsed entries", async (context) => {
  const { backend, repository } = await storage(context);
  const project = parseASS(fixture);
  project.entries[1].reviewed = true;
  const record = await repository.create(project, "original.ass");
  const reopened = await repository.read(record.id);
  assert.equal(reopened.stateValid, true);
  assert.equal(reopened.project.entries[1].reviewed, true);
  assert.equal(reopened.project.entries[0].text, "{\\i1}第一行\\N第二行");
  assert.ok((await backend.read(record.id)).ass.includes("Comment:"));
  assert.equal("project" in record, false);
  assert.equal("entries" in record, false);
  const another = await repository.create(parseASS(fixture), "original.ass");
  assert.notEqual(another.id, record.id);
  assert.equal((await repository.list()).length, 2);
});
test("OPFS saves clean old files, reuse ASS for review-only changes, and preserve data on write failure", async (context) => {
  const opfs = fakeOPFS(),
    { repository } = await storage(context, opfs);
  const project = parseASS(fixture);
  let record = await repository.create(project, "video.ass");
  project.entries[0].reviewed = true;
  record = await repository.save(record, captureProject(project));
  assert.equal(opfs.writes(), 1);
  opfs.setFail(true);
  project.entries[0].text = "unsaved";
  await assert.rejects(
    repository.save(record, captureProject(project)),
    /Disk full/,
  );
  assert.equal(
    (await repository.read(record.id)).project.entries[0].text,
    "{\\i1}第一行\\N第二行",
  );
  opfs.setFail(false);
  record = await repository.save(record, captureProject(project));
  assert.equal(opfs.files.size, 1);
  assert.equal(
    (await repository.read(record.id)).project.entries[0].text,
    "unsaved",
  );
});
test("stale windows cannot overwrite or delete a more recent project", async (context) => {
  const { repository } = await storage(context);
  const project = parseASS(fixture),
    first = await repository.create(project, "one.ass");
  const latest = await repository.save(
    { ...first, name: "renamed" },
    captureProject(project),
  );
  await assert.rejects(repository.save(first, captureProject(project)), {
    code: "CONFLICT",
  });
  await assert.rejects(repository.remove(first), { code: "CONFLICT" });
  assert.equal((await repository.read(latest.id)).record.name, "renamed");
});
test("ASS remains readable when its review bitmap no longer matches", async (context) => {
  const { backend, repository } = await storage(context);
  const record = await repository.create(parseASS(fixture), "one.ass");
  const saved = await backend.read(record.id);
  await backend.commit(
    { ...record, reviewedBits: "invalid", assHash: "mismatch" },
    saved.ass,
    record.revision,
  );
  const reopened = await repository.read(record.id);
  assert.equal(reopened.stateValid, false);
  assert.ok(reopened.project.entries.every((entry) => !entry.reviewed));
});
test("video association stores a reference only and project deletion clears the active pointer", async (context) => {
  const { backend, repository } = await storage(context);
  let record = await repository.create(parseASS(fixture), "one.ass");
  const video = {
    kind: "relink",
    name: "large.mp4",
    size: 5000000000,
    lastModified: 123,
  };
  record = await repository.setVideo(record, video);
  await repository.setActive(record.id);
  assert.deepEqual((await repository.read(record.id)).record.video, video);
  await repository.remove(record);
  assert.equal(await backend.read(record.id), null);
  assert.equal(await repository.getActive(), undefined);
});
test("legacy migration preserves reviews and is idempotent after interrupted cleanup", async (context) => {
  const { repository } = await storage(context);
  const project = parseASS(fixture);
  project.entries[0].reviewed = true;
  let value = JSON.stringify({ name: "legacy.ass", project });
  const legacy = {
    getItem: () => value,
    removeItem: () => {
      throw Error("Cleanup interrupted");
    },
  };
  await assert.rejects(repository.migrateLegacy(legacy), /Cleanup interrupted/);
  assert.equal(
    (await repository.read("legacy-project-v1")).project.entries[0].reviewed,
    true,
  );
  legacy.removeItem = () => {
    value = null;
  };
  await repository.migrateLegacy(legacy);
  assert.equal((await repository.list()).length, 1);
  assert.equal(value, null);
});
test("migration failure leaves the old draft intact", async (context) => {
  const opfs = fakeOPFS(),
    { repository } = await storage(context, opfs);
  opfs.setFail(true);
  let removed = false;
  await assert.rejects(
    repository.migrateLegacy({
      getItem: () =>
        JSON.stringify({ name: "old.ass", project: parseASS(fixture) }),
      removeItem: () => {
        removed = true;
      },
    }),
  );
  assert.equal(removed, false);
  assert.equal((await repository.list()).length, 0);
});

function persistenceFixture(save) {
  const store = createProjectStore(),
    writes = [],
    statuses = [],
    errors = [];
  const persistence = createProjectPersistence({
    store,
    repository: {
      async save(record, snapshot) {
        writes.push(snapshot);
        if (save) await save();
        return { ...record, revision: record.revision + 1 };
      },
    },
    onStatus: (status) => statuses.push(status),
    onError: (error) => errors.push(error),
  });
  persistence.activate(
    { id: "project", revision: 1, assName: "one.ass" },
    parseASS(fixture),
  );
  return { store, persistence, writes, statuses, errors };
}
test("normal edits and manual reviews stay dirty until an explicit/background save", async () => {
  const { store, persistence, writes } = persistenceFixture();
  store.selectSubtitle(1);
  assert.equal(persistence.isDirty(), false);
  store.updateText("edited");
  store.approveSubtitle();
  await tick();
  assert.equal(writes.length, 0);
  assert.equal(persistence.isDirty(), true);
  assert.equal(await persistence.save(), true);
  assert.equal(writes.length, 1);
  assert.equal(persistence.isDirty(), false);
  await persistence.save();
  assert.equal(writes.length, 1);
});
test("automatic approval enables dirty-only saving and disabling it stops queued automatic saves", async () => {
  const { store, persistence, writes } = persistenceFixture();
  store.updateText("before enabling");
  persistence.setAutoApprove(true);
  await tick();
  assert.equal(writes.length, 1);
  store.approveSubtitle();
  await tick();
  assert.equal(writes.length, 2);
  persistence.setAutoApprove(false);
  store.updateText("manual");
  await tick();
  assert.equal(writes.length, 2);
  persistence.setAutoApprove(true);
  persistence.setAutoApprove(false);
  await tick();
  assert.equal(writes.length, 2);
});
test("timeline drags mark dirty but do not write until committed in automatic mode", async () => {
  const { store, persistence, writes } = persistenceFixture();
  persistence.setAutoApprove(true);
  store.updateTiming(0.1, 2.1, { transient: true });
  await tick();
  assert.equal(persistence.isDirty(), true);
  assert.equal(writes.length, 0);
  store.updateTiming(0.1, 2.1, { force: true });
  await tick();
  assert.equal(writes.length, 1);
});
test("edits made during a save remain dirty and failed saves can be retried", async () => {
  let release;
  const { store, persistence, writes } = persistenceFixture(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  store.updateText("first");
  const pending = persistence.save();
  store.updateText("second");
  release();
  await pending;
  assert.equal(persistence.isDirty(), true);
  assert.ok(writes[0].ass.includes("first"));
  const next = persistence.save();
  release();
  await next;
  assert.equal(persistence.isDirty(), false);
  assert.ok(writes[1].ass.includes("second"));
  let failing = true;
  const failed = persistenceFixture(() => {
    if (failing) throw Error("Disk full");
  });
  failed.store.approveSubtitle();
  assert.equal(await failed.persistence.save(), false);
  assert.equal(failed.persistence.isDirty(), true);
  assert.equal(failed.errors.length, 1);
  failing = false;
  assert.equal(await failed.persistence.save(), true);
});
test("background saving waits for a video import and keeps the new revision and unsaved edits", async () => {
  const { store, persistence, writes } = persistenceFixture();
  store.updateText("pending while copying");
  let finish;
  const copying = persistence.exclusive(async () => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    persistence.acceptVideoRecord({ revision: 2, video: { kind: "private" } });
  });
  await tick();
  const background = persistence.save();
  finish();
  await copying;
  await background;
  assert.equal(persistence.current().revision, 3);
  assert.equal(writes.length, 1);
  assert.equal(persistence.current().video.kind, "private");
});
test("a project rename made while saving is not overwritten by the earlier result", async () => {
  let release;
  const { store, persistence } = persistenceFixture(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  store.updateText("first edit");
  const pending = persistence.save();
  persistence.updateMetadata({ name: "new project name" });
  release();
  await pending;
  assert.equal(persistence.current().name, "new project name");
  assert.equal(persistence.isDirty(), true);
  const next = persistence.save();
  release();
  await next;
  assert.equal(persistence.current().name, "new project name");
  assert.equal(persistence.isDirty(), false);
});
