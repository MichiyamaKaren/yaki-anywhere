import { exportASS, parseASS } from "../lib/subtitles.js";
import { packReviews, unpackReviews, hashASS } from "../lib/review-state.js";
import { loadDraft } from "./project-storage.js";

export function captureProject(project) {
  return {
    ass: "\uFEFF" + exportASS(project),
    reviewedBits: packReviews(project.entries),
    entryCount: project.entries.length,
    reviewedCount: project.entries.filter((entry) => entry.reviewed).length,
  };
}

// A single commit boundary leaves room for future snapshots without keeping history today.
export function createProjectRepository(backend) {
  async function save(record, snapshot) {
    const assHash = await hashASS(snapshot.ass);
    return backend.commit(
      {
        ...record,
        schemaVersion: 1,
        assHash,
        entryCount: snapshot.entryCount,
        reviewedCount: snapshot.reviewedCount,
        reviewedBits: snapshot.reviewedBits,
      },
      snapshot.ass,
      record.revision ?? 0,
    );
  }
  async function read(id) {
    const saved = await backend.read(id);
    if (!saved) return null;
    const { record, ass } = saved;
    if (record.schemaVersion !== 1)
      throw Error("此项目格式暂不支持，请使用匹配的应用版本");
    const project = parseASS(ass);
    let stateValid = false;
    try {
      if (
        record.entryCount !== project.entries.length ||
        (await hashASS(ass)) !== record.assHash
      )
        throw Error("状态不匹配");
      const reviewed = unpackReviews(
        record.reviewedBits,
        project.entries.length,
      );
      project.entries.forEach((entry, i) => {
        entry.reviewed = reviewed[i];
      });
      stateValid = true;
    } catch {
      /* The ASS remains editable without applying mismatched review bits. */
    }
    return { record, project, stateValid };
  }
  return {
    save,
    read,
    list: () => backend.list(),
    getActive: () => backend.getActive(),
    setActive: (id) => backend.setActive(id),
    remove: (record) => backend.remove(record.id, record.revision),
    async setVideo(record, video) {
      const saved = await backend.read(record.id);
      if (!saved) throw Error("项目不存在");
      return backend.commit(
        { ...saved.record, video },
        saved.ass,
        record.revision,
      );
    },
    async create(project, assName, id = crypto.randomUUID()) {
      return save(
        {
          id,
          name: assName.replace(/\.(ass|ssa)$/i, ""),
          assName,
          revision: 0,
          video: null,
        },
        captureProject(project),
      );
    },
    async migrateLegacy(storage) {
      const draft = loadDraft(storage);
      if (!draft.project) return;
      const name = draft.name || "未命名项目.ass";
      const id = "legacy-project-v1";
      let saved = await read(id);
      if (!saved) {
        await save(
          {
            id,
            name: name.replace(/\.(ass|ssa)$/i, ""),
            assName: name,
            revision: 0,
            video: null,
          },
          captureProject(draft.project),
        );
        saved = await read(id);
      }
      if (!saved?.stateValid) throw Error("旧草稿迁移校验失败，原草稿已保留");
      await backend.setActive(id);
      storage.removeItem("yaki-project-v1");
    },
  };
}
