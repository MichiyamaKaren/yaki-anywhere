import { byId as $ } from "./lib/dom.js";
import { isAndroidApp } from "./lib/native-files.js";
import { createProjectStore } from "./state/project-store.js";
import { loadDraft, createDraftPersistence } from "./services/project-storage.js";
import { createProjectFiles } from "./services/project-files.js";
import { createWorkspace } from "./ui/workspace.js";
import { createPlayer } from "./features/player.js";
import { createSubtitleEditor } from "./features/subtitle-editor.js";
import { createSubtitleList } from "./features/subtitle-list.js";
import { createTimeline } from "./features/timeline.js";

if (isAndroidApp()) {
  $("installHelp").hidden = true;
  $("assFile").accept = "*/*";
}
const storage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const store = createProjectStore(loadDraft(storage));
const workspace = createWorkspace({ store });
const persistence = createDraftPersistence({
  store, storage, onStatus: workspace.setSaveStatus, onError: workspace.toast,
});
let timeline;
const player = createPlayer({
  store, toast: workspace.toast, onPosition: (time) => timeline?.updatePosition(time),
});
const files = createProjectFiles({ store, pausePlayback: player.pauseLine, toast: workspace.toast });
const list = createSubtitleList({ store, playLine: player.playLine, importSubtitles: files.importSubtitles });
createSubtitleEditor({ store, playLine: player.playLine, toast: workspace.toast });
timeline = createTimeline({
  store, getPosition: player.getPosition, seek: player.seek,
  onDragStart: player.beginTimelineEdit, onDragEnd: player.endTimelineEdit,
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    event.preventDefault();
    list.focusSearch();
    return;
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) || $("helpDialog").open) return;
  if (event.code === "Space") { event.preventDefault(); player.play(); }
  if (event.key === "ArrowLeft") store.selectSubtitle(store.getState().index - 1);
  if (event.key === "ArrowRight") store.selectSubtitle(store.getState().index + 1);
});
window.addEventListener("pagehide", persistence.flush);
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
