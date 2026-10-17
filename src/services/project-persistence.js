import { captureProject } from "./project-repository.js";

export function createProjectPersistence({
  store,
  repository,
  onStatus,
  onError,
  onSaved = () => {},
}) {
  let record = null,
    dirty = false,
    changes = 0,
    automatic = false,
    transient = false,
    loading = false,
    inFlight = null;
  let autoQueued = false,
    metadataOperation = null;
  function requestAutomaticSave() {
    if (autoQueued) return;
    autoQueued = true;
    queueMicrotask(() => {
      autoQueued = false;
      if (automatic && dirty && !transient && !inFlight && !metadataOperation)
        void save();
    });
  }
  async function save() {
    if (metadataOperation) await metadataOperation.catch(() => {});
    if (inFlight) {
      const success = await inFlight;
      return success && dirty ? save() : success;
    }
    if (!dirty || !record) return true;
    const version = changes,
      previous = record,
      snapshot = captureProject(store.getState().project);
    onStatus("saving");
    inFlight = (async () => {
      try {
        const saved = await repository.save(previous, snapshot);
        // A rename can be entered while the previous disk write is still running.
        record =
          record.name !== previous.name
            ? { ...saved, name: record.name }
            : saved;
        dirty = changes !== version;
        onStatus(dirty ? "dirty" : "saved");
        onSaved(record);
        return true;
      } catch (error) {
        onStatus("failed");
        onError(`保存失败：${error.message}。修改仍在当前页面，可重试或导出。`);
        return false;
      }
    })();
    const success = await inFlight;
    inFlight = null;
    if (success && automatic && dirty && !transient) requestAutomaticSave();
    return success;
  }
  store.subscribe((event) => {
    if (loading || !record || event.type === "selection") return;
    dirty = true;
    changes++;
    transient = Boolean(event.transient);
    onStatus("dirty");
    if (automatic && !transient) requestAutomaticSave();
  });
  return {
    save,
    isDirty: () => dirty,
    current: () => record,
    isSaving: () => Boolean(inFlight),
    setAutoApprove(enabled) {
      automatic = enabled;
      if (enabled) requestAutomaticSave();
    },
    activate(next, project) {
      if (inFlight) throw Error("请等待保存完成");
      record = next;
      dirty = false;
      changes = 0;
      transient = false;
      loading = true;
      try {
        store.replaceProject(project, next?.assName || "未命名项目");
      } finally {
        loading = false;
      }
      onStatus(next ? "saved" : "empty");
    },
    updateMetadata(next) {
      record = { ...record, ...next };
      dirty = true;
      changes++;
      onStatus("dirty");
      if (automatic && !transient) requestAutomaticSave();
    },
    acceptVideoRecord(next) {
      record = { ...record, revision: next.revision, video: next.video };
      onSaved(record);
    },
    async exclusive(operation) {
      if (inFlight) await inFlight;
      if (metadataOperation) throw Error("项目操作正在进行");
      metadataOperation = Promise.resolve().then(operation);
      try {
        return await metadataOperation;
      } finally {
        metadataOperation = null;
        if (automatic && dirty && !transient) requestAutomaticSave();
      }
    },
    async settled() {
      if (inFlight) await inFlight;
    },
  };
}
