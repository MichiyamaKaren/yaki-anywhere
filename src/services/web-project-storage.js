const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const finished = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || Error("项目写入失败"));
  });
const conflict = () =>
  Object.assign(Error("项目已在其他窗口更新，请导出当前修改后重新打开"), {
    code: "CONFLICT",
  });

export async function createWebProjectStorage({
  indexedDB = globalThis.indexedDB,
  storageManager = globalThis.navigator?.storage,
  databaseName = "yaki-projects",
} = {}) {
  if (!indexedDB) throw Error("当前浏览器无法保存项目，请检查站点存储设置");
  const opening = indexedDB.open(databaseName, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("projects", { keyPath: "id" });
    opening.result.createObjectStore("settings");
  };
  const db = await requestResult(opening);
  db.onversionchange = () => db.close();
  let directory = null;
  try {
    const root = await storageManager?.getDirectory?.();
    if (root)
      directory = await root.getDirectoryHandle("yaki-projects", {
        create: true,
      });
  } catch {
    /* IndexedDB Blob storage remains private when OPFS is unavailable. */
  }
  async function get(id) {
    return requestResult(
      db.transaction("projects").objectStore("projects").get(id),
    );
  }
  async function removeFile(name) {
    if (name && directory) await directory.removeEntry(name).catch(() => {});
  }
  return {
    async list() {
      const records = await requestResult(
        db.transaction("projects").objectStore("projects").getAll(),
      );
      return records.map(({ assBlob, ...record }) => record);
    },
    async read(id) {
      const record = await get(id);
      if (!record) return null;
      if (record.assPath && !directory)
        throw Error("暂时无法访问项目私有字幕，请检查站点存储权限后重试");
      const file = record.assPath
        ? await (await directory.getFileHandle(record.assPath)).getFile()
        : record.assBlob;
      if (!file) throw Error("项目字幕副本不存在");
      const { assBlob, ...metadata } = record;
      return { record: metadata, ass: await file.text() };
    },
    async commit(record, ass, expectedRevision) {
      const previous = await get(record.id);
      if ((previous?.revision ?? 0) !== expectedRevision) throw conflict();
      const next = { ...record, revision: expectedRevision + 1 };
      let staged = null;
      if (
        previous?.assHash === record.assHash &&
        (previous.assPath || previous.assBlob)
      ) {
        next.assPath = previous.assPath;
        if (previous.assBlob) next.assBlob = previous.assBlob;
      } else if (directory) {
        staged = `${record.id}-${crypto.randomUUID()}.ass`;
        const handle = await directory.getFileHandle(staged, { create: true });
        try {
          const stream = await handle.createWritable();
          try {
            await stream.write(ass);
            await stream.close();
          } catch (error) {
            await stream.abort().catch(() => {});
            throw error;
          }
        } catch (error) {
          await removeFile(staged);
          throw error;
        }
        next.assPath = staged;
        delete next.assBlob;
      } else {
        next.assPath = null;
        next.assBlob = new Blob([ass], { type: "text/plain;charset=utf-8" });
      }
      const tx = db.transaction("projects", "readwrite"),
        completion = finished(tx);
      const projects = tx.objectStore("projects"),
        check = projects.get(record.id);
      let stale = false;
      check.onsuccess = () => {
        if ((check.result?.revision ?? 0) !== expectedRevision) {
          stale = true;
          tx.abort();
        } else projects.put(next);
      };
      try {
        await completion;
      } catch (error) {
        await removeFile(staged);
        throw stale ? conflict() : error;
      }
      if (previous?.assPath !== next.assPath)
        await removeFile(previous?.assPath);
      const { assBlob, ...metadata } = next;
      return metadata;
    },
    async remove(id, revision) {
      const previous = await get(id);
      const tx = db.transaction(["projects", "settings"], "readwrite"),
        completion = finished(tx);
      const projects = tx.objectStore("projects"),
        check = projects.get(id);
      let stale = false;
      check.onsuccess = () => {
        if (check.result?.revision !== revision) {
          stale = true;
          tx.abort();
        } else {
          projects.delete(id);
          const settings = tx.objectStore("settings"),
            active = settings.get("activeProject");
          active.onsuccess = () => {
            if (active.result === id) settings.delete("activeProject");
          };
        }
      };
      try {
        await completion;
      } catch (error) {
        throw stale ? conflict() : error;
      }
      await removeFile(previous?.assPath);
    },
    async getActive() {
      return requestResult(
        db.transaction("settings").objectStore("settings").get("activeProject"),
      );
    },
    async setActive(id) {
      const tx = db.transaction("settings", "readwrite"),
        completion = finished(tx);
      tx.objectStore("settings").put(id, "activeProject");
      await completion;
    },
    close() {
      db.close();
    },
  };
}
