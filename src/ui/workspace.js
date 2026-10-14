import { byId as $ } from "../lib/dom.js";

export function createWorkspace({ store }) {
  let toastTimer;
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
  }
  function setSaveStatus(status) {
    $("saved").textContent = {
      saved: "✓ 已保存到本地", saving: "正在保存…", failed: "本地存储已满，请导出",
    }[status];
  }
  function renderProgress() {
    const { project, name } = store.getState();
    const reviewed = project.entries.filter((entry) => entry.reviewed).length;
    const count = project.entries.length;
    $("count").textContent = $("allCount").textContent = count;
    $("pendingCount").textContent = count - reviewed;
    $("reviewCount").textContent = reviewed;
    $("progressText").textContent = count ? `校对进度 ${reviewed} / ${count}` : "导入 ASS 后开始校对";
    $("progressBar").style.width = count ? `${reviewed / count * 100}%` : "0%";
    $("projectInfo").textContent = count ? `ASS 字幕 · ${count} 条字幕` : "尚未载入字幕";
    $("projectName").textContent = name;
    $("exportAss").disabled = count === 0;
  }
  $("help").onclick = $("helpTop").onclick = () => $("helpDialog").showModal();
  $("closeHelp").onclick = () => $("helpDialog").close();
  $("workspace").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  store.subscribe((event) => {
    if (event.type !== "selection") renderProgress();
  });
  renderProgress();
  return { toast, setSaveStatus };
}
