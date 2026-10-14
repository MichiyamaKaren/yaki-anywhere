import { exportASS, migrateProject } from "../lib/subtitles.js";

const STORAGE_KEY = "yaki-project-v1";

export function loadDraft(storage) {
  try {
    const draft = JSON.parse(storage.getItem(STORAGE_KEY));
    if (draft?.isDemo) {
      storage.removeItem(STORAGE_KEY);
    } else if (draft?.project?.entries?.length) {
      const project = migrateProject(draft.project);
      exportASS(project);
      return { project, name: draft.name };
    }
  } catch {
    // Invalid or unavailable browser storage starts an empty workspace.
  }
  return {};
}

export function createDraftPersistence({ store, storage, onStatus, onError }) {
  let timer;
  function flush() {
    clearTimeout(timer);
    try {
      const { project, name } = store.getState();
      storage.setItem(STORAGE_KEY, JSON.stringify({ project, name }));
      onStatus("saved");
    } catch {
      onStatus("failed");
      onError("本地保存失败，请及时导出 ASS");
    }
  }
  store.subscribe((event) => {
    if (event.type === "selection" || event.transient) return;
    if (event.type === "project" || event.type === "review") flush();
    else {
      onStatus("saving");
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    }
  });
  return { flush };
}
