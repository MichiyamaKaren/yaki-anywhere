import { byId as $ } from "../lib/dom.js";
import { parseTime, formatTime } from "../lib/subtitles.js";

export function createSubtitleEditor({ store, playLine, toast }) {
  function renderTiming() {
    const entry = store.current();
    $("startTime").value = entry ? formatTime(entry.start) : "";
    $("endTime").value = entry ? formatTime(entry.end) : "";
    $("lineDuration").textContent = entry ? `${(entry.end - entry.start).toFixed(2)} 秒` : "—";
  }
  function render() {
    const { project, index } = store.getState();
    const entry = store.current();
    for (const id of ["subtitleText", "startTime", "endTime", "playLine", "review"]) $(id).disabled = !entry;
    $("subtitleText").value = entry?.text ?? "";
    $("selectedNumber").textContent = entry ? String(index + 1).padStart(2, "0") : "—";
    $("position").textContent = entry ? `${index + 1} / ${project.entries.length}` : "等待导入";
    $("previous").disabled = !entry || index === 0;
    $("next").disabled = !entry || index === project.entries.length - 1;
    renderTiming();
  }
  function commitTiming() {
    if (!store.current()) return;
    try {
      const start = parseTime($("startTime").value), end = parseTime($("endTime").value);
      if (end <= start) throw Error("结束时间必须晚于开始时间");
      store.updateTiming(start, end);
    } catch (error) {
      toast(error.message);
    }
    renderTiming();
  }
  $("subtitleText").addEventListener("input", () => store.updateText($("subtitleText").value));
  for (const id of ["startTime", "endTime"]) {
    $(id).addEventListener("change", commitTiming);
    $(id).addEventListener("blur", commitTiming);
    $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") $(id).blur();
    });
  }
  $("review").onclick = () => {
    if (!store.current()) return;
    const { index, project } = store.getState();
    store.approveSubtitle();
    if (index < project.entries.length - 1) store.selectSubtitle(index + 1);
    else toast("已确认最后一条字幕");
  };
  $("previous").onclick = () => store.selectSubtitle(store.getState().index - 1);
  $("next").onclick = () => store.selectSubtitle(store.getState().index + 1);
  $("playLine").onclick = playLine;
  store.subscribe((event) => {
    if (event.type === "project" || event.type === "selection") render();
    else if (event.type === "timing") renderTiming();
  });
  render();
}
