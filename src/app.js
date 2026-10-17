import { byId as $ } from "./lib/dom.js";
import { isAndroidApp } from "./lib/native-files.js";
import { createProjectStore } from "./state/project-store.js";
import { loadDraft } from "./services/project-storage.js";
import { createProjectRepository } from "./services/project-repository.js";
import { createProjectPersistence } from "./services/project-persistence.js";
import { createWebProjectStorage } from "./services/web-project-storage.js";
import { createNativeProjectStorage } from "./services/native-project-storage.js";
import { createProjectFiles } from "./services/project-files.js";
import { createWorkspace } from "./ui/workspace.js";
import { createPlayer } from "./features/player.js";
import { createSubtitleEditor } from "./features/subtitle-editor.js";
import { createSubtitleList } from "./features/subtitle-list.js";
import { createTimeline } from "./features/timeline.js";
import { createAudioSpectrum } from "./features/audio-spectrum.js";
import { createProjectManager } from "./features/project-manager.js";
import { createPageNavigation } from "./ui/page-navigation.js";

if (isAndroidApp()) {
  $("installHelp").hidden = true;
  $("assFile").accept = "*/*";
}
const storage = {
  getItem: (key) => window.localStorage.getItem(key),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const store = createProjectStore(loadDraft(storage));
const workspace = createWorkspace({ store });
let timeline, manager, persistence;
const spectrum = createAudioSpectrum();
const player = createPlayer({
  store,
  toast: workspace.toast,
  onPosition: (time) => timeline?.updatePosition(time),
  onMedia: spectrum.setMedia,
  chooseMedia: () => manager?.chooseVideo(),
  onAutoApproveChange: (enabled) => persistence?.setAutoApprove(enabled),
});
const navigation = createPageNavigation({
  onProjects() {
    player.pauseLine();
    void manager?.refresh().catch((error) => workspace.toast(error.message));
  },
});
const list = createSubtitleList({
  store,
  playLine: player.playLine,
  importSubtitles: () => $("assFile").click(),
});
createSubtitleEditor({
  store,
  playLine: player.playLine,
  toast: workspace.toast,
});
timeline = createTimeline({
  store,
  getPosition: player.getPosition,
  seek: player.seek,
  onDragStart: player.beginTimelineEdit,
  onDragEnd: player.endTimelineEdit,
  onRange: spectrum.setRange,
});

createProjectFiles({
  store,
  toast: workspace.toast,
  importProject: (project, name) =>
    manager
      ? manager.importProject(project, name)
      : (workspace.toast("项目存储尚未就绪，请稍后重试"), false),
});

try {
  const nativeStorage = isAndroidApp()
    ? await createNativeProjectStorage()
    : null;
  const repository = createProjectRepository(
    nativeStorage || (await createWebProjectStorage()),
  );
  persistence = createProjectPersistence({
    store,
    repository,
    onStatus(status) {
      workspace.setSaveStatus(status);
      manager?.render();
    },
    onError: workspace.toast,
    onSaved() {
      void manager?.refresh().catch((error) => workspace.toast(error.message));
    },
  });
  manager = createProjectManager({
    store,
    repository,
    persistence,
    player,
    nativeStorage,
    toast: workspace.toast,
    showWorkspace: navigation.showWorkspace,
  });
  await manager.initialize(storage);
  for (const id of ["importAss", "newProject", "importVideo"])
    $(id).disabled = false;
  nativeStorage?.onBackground(() => {
    void persistence.save();
  });
  if (!persistence.current()) workspace.setSaveStatus("empty");
} catch (error) {
  workspace.setSaveStatus("failed");
  workspace.toast(
    `项目读取失败：${error.message}。旧草稿仍保留，请勿清理站点数据。`,
  );
} finally {
  $("workspaceContent").inert = false;
}

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    $("saveProject").click();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    event.preventDefault();
    navigation.showWorkspace();
    list.focusSearch();
    return;
  }
  if (
    navigation.isMenuOpen() ||
    navigation.isProjects() ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) ||
    document.querySelector("dialog[open]")
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    player.play();
  }
  if (event.key === "ArrowLeft")
    store.selectSubtitle(store.getState().index - 1);
  if (event.key === "ArrowRight")
    store.selectSubtitle(store.getState().index + 1);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void persistence?.save();
});
window.addEventListener("pagehide", () => {
  void persistence?.save();
});
window.addEventListener("beforeunload", (event) => {
  if (persistence?.isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
