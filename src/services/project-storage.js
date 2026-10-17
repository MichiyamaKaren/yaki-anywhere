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
