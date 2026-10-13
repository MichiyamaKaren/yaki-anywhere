import { saveTextFile, isAndroidApp } from "./lib/native-files.js";
import {
  parseASS,
  exportASS,
  parseTime,
  formatTime,
  plainText,
  migrateProject,
  timelineRange,
} from "./lib/subtitles.js";
const $ = (id) => document.getElementById(id),
  video = $("video"),
  key = "yaki-project-v1";
if (isAndroidApp()) {
  $("installHelp").hidden = true;
  $("assFile").accept = "*/*";
}
function emptyProject() {
  return {
    lines: [
      "[Script Info]",
      "Title: Untitled subtitles",
      "ScriptType: v4.00+",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ],
    entries: [],
  };
}
let project = emptyProject(),
  name = "未命名项目",
  index = 0,
  mode = "continuous",
  filter = "all",
  videoUrl = null,
  lineEnd = null,
  toastTimer,
  saveTimer;
try {
  const old = JSON.parse(localStorage.getItem(key));
  if (old?.isDemo) {
    localStorage.removeItem(key);
  } else if (old?.project?.entries?.length) {
    const restored = migrateProject(old.project);
    exportASS(restored);
    project = restored;
    name = old.name || name;
    index = 0;
  }
} catch {
  project = emptyProject();
}
let timelineZoom = 1,
  timelineView,
  lastPlaybackTime = null;
const current = () => project.entries[index];
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      c
      ],
  );
const clock = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify({ project, name }));
    $("saved").textContent = "✓ 已保存到本地";
  } catch {
    $("saved").textContent = "本地存储已满，请导出";
    toast("本地保存失败，请及时导出 ASS");
  }
}
function changed() {
  if (!current()) return;
  current().reviewed = false;
  $("saved").textContent = "正在保存…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
  renderList();
  renderProgress();
  renderTimeline();
  overlay();
}
function total() {
  return Number.isFinite(video.duration)
    ? video.duration
    : Math.max(0.1, ...project.entries.map((e) => e.end));
}
function renderProgress() {
  const reviewed = project.entries.filter((e) => e.reviewed).length,
    n = project.entries.length;
  $("count").textContent = $("allCount").textContent = n;
  $("pendingCount").textContent = n - reviewed;
  $("reviewCount").textContent = reviewed;
  $("progressText").textContent = n
    ? `校对进度 ${reviewed} / ${n}`
    : "导入 ASS 后开始校对";
  $("progressBar").style.width = n ? `${(reviewed / n) * 100}%` : "0%";
  $("projectInfo").textContent = n ? `ASS 字幕 · ${n} 条字幕` : "尚未载入字幕";
  $("projectName").textContent = name;
  $("exportAss").disabled = n === 0;
}
function renderList() {
  const list = $("subtitleList"),
    scrollTop = list.scrollTop;
  const q = $("search").value.toLowerCase();
  const visible = project.entries
    .map((e, i) => ({ e, i }))
    .filter(
      ({ e }) =>
        (filter === "all" ||
          (filter === "reviewed" ? e.reviewed : !e.reviewed)) &&
        e.text.toLowerCase().includes(q),
    );
  $("subtitleList").innerHTML =
    visible
      .map(
        ({ e, i }) =>
          `<button class="subtitle-row ${i === index ? "selected" : ""}" data-index="${i}" aria-label="第 ${i + 1} 条字幕" aria-current="${i === index}"><span class="row-number">${String(i + 1).padStart(2, "0")}</span><span class="row-content"><span class="row-top"><span>${formatTime(e.start)} → ${formatTime(e.end)}</span><span class="row-status ${e.reviewed ? "" : "pending"}">${e.reviewed ? "✓ 已校对" : "待校对"}</span></span><span class="row-text">${escape(plainText(e.text)) || "（空字幕）"}</span></span><span class="row-play">▷</span></button>`,
      )
      .join("") ||
    (project.entries.length
      ? '<div class="no-results">没有符合条件的字幕</div>'
      : '<div class="empty-subtitles"><span class="empty-icon">Aa</span><strong>还没有字幕</strong><p>导入 ASS 文件后，即可开始编辑</p><button class="button secondary" id="importEmpty">导入 ASS 文件</button></div>');
  $("importEmpty")?.addEventListener("click", () => $("assFile").click());
  list.scrollTop = scrollTop;
}
function scrollCurrentSubtitle(behavior = "auto") {
  const list = $("subtitleList"),
    row = list.querySelector(".selected");
  if (!row || !list.clientHeight) return;
  const bounds = list.getBoundingClientRect(),
    selected = row.getBoundingClientRect();
  const top = bounds.top + list.clientTop,
    bottom = top + list.clientHeight;
  if (selected.top < top)
    list.scrollTo({ top: list.scrollTop + selected.top - top, behavior });
  else if (selected.bottom > bottom)
    list.scrollTo({ top: list.scrollTop + selected.bottom - bottom, behavior });
}
function approveCompletedSubtitles(t) {
  if (
    $("autoApprove").getAttribute("aria-pressed") === "true" &&
    !video.seeking &&
    lastPlaybackTime !== null &&
    t >= lastPlaybackTime
  ) {
    let approved = false;
    for (const entry of project.entries) {
      if (
        !entry.reviewed &&
        entry.start <= lastPlaybackTime &&
        entry.end > lastPlaybackTime &&
        entry.end <= t
      ) {
        entry.reviewed = true;
        approved = true;
      }
    }
    if (approved) {
      save();
      renderProgress();
      renderList();
    }
  }
  lastPlaybackTime = t;
}
function renderEditor() {
  const e = current();
  $("subtitleText").disabled = !e;
  $("startTime").disabled = !e;
  $("endTime").disabled = !e;
  $("playLine").disabled = !e;
  $("review").disabled = !e;
  if (!e) {
    $("subtitleText").value = "";
    $("startTime").value = "";
    $("endTime").value = "";
    $("lineDuration").textContent = "—";
    $("selectedNumber").textContent = "—";
    $("position").textContent = "等待导入";
    $("previous").disabled = true;
    $("next").disabled = true;
    return;
  }
  $("subtitleText").value = e.text;
  $("startTime").value = formatTime(e.start);
  $("endTime").value = formatTime(e.end);
  $("lineDuration").textContent = `${(e.end - e.start).toFixed(2)} 秒`;
  $("selectedNumber").textContent = String(index + 1).padStart(2, "0");
  $("position").textContent = `${index + 1} / ${project.entries.length}`;
  $("previous").disabled = index === 0;
  $("next").disabled = index === project.entries.length - 1;
}
function select(i, seek = true) {
  if (!project.entries.length) return;
  const previousIndex = index;
  index = Math.max(0, Math.min(project.entries.length - 1, i));
  lineEnd = mode !== "continuous" && !video.paused ? current().end : null;
  renderEditor();
  renderList();
  if (index !== previousIndex) $("timelineScroll").scrollLeft = 0;
  renderTimeline();
  if (seek) {
    if (videoUrl) video.currentTime = current().start;
    else {
      $("seek").value = current().start;
      updatePosition(current().start);
    }
  }
  overlay();
}
function updatePosition(t) {
  $("currentTime").textContent = clock(t);
  if (!project.entries.length) return;
  if (timelineView) {
    const ratio =
      (t - timelineView.start) / (timelineView.end - timelineView.start);
    $("playhead").hidden = ratio < 0 || ratio > 1;
    $("playhead").style.left = `${ratio * 100}%`;
  }
}
function overlay() {
  if (!videoUrl) {
    $("subtitleOverlay").textContent = "";
    return;
  }
  const matches = project.entries.filter(
    (e) => video.currentTime >= e.start && video.currentTime < e.end,
  );
  $("subtitleOverlay").textContent = matches
    .map((e) => plainText(e.text))
    .join("\n");
}
function renderTimeline() {
  $("seek").max = total();
  $("duration").textContent = clock(total());
  if (!project.entries.length) {
    timelineView = null;
    $("timelineZoom").disabled = true;
    $("ruler").innerHTML = "";
    $("timelineTrack").innerHTML =
      '<div class="timeline-empty">导入 ASS 字幕后显示时间轴</div>';
    $("playhead").hidden = true;
    return;
  }
  $("timelineZoom").disabled = false;
  timelineView = timelineRange(project.entries, index);
  if (timelineZoom < 1) {
    const span = (timelineView.end - timelineView.start) / timelineZoom;
    const center = (timelineView.start + timelineView.end) / 2;
    timelineView = {
      start: Math.max(0, center - span / 2),
      end: Math.max(0, center - span / 2) + span,
    };
  }
  $("timeline").style.width = `${Math.max(1, timelineZoom) * 100}%`;
  const { start, end } = timelineView,
    span = end - start;
  $("ruler").innerHTML = Array.from(
    { length: 5 },
    (_, i) =>
      '<span style="left:' +
      i * 25 +
      '%">' +
      formatTime(start + (span * i) / 4) +
      "</span>",
  ).join("");
  const entries = [{ e: current(), i: index }];
  $("timelineTrack").innerHTML = entries
    .map(
      ({ e, i }) =>
        '<div class="timeline-block ' +
        (i === index ? "active" : "") +
        '" data-index="' +
        i +
        '" style="left:' +
        ((e.start - start) / span) * 100 +
        "%;width:" +
        ((e.end - e.start) / span) * 100 +
        '%" title="' +
        escape(plainText(e.text)) +
        '"><span class="handle" data-edge="start" aria-label="拖动开始时间">│</span><span class="block-label">' +
        String(i + 1).padStart(2, "0") +
        " " +
        escape(plainText(e.text)) +
        '</span><span class="handle" data-edge="end" aria-label="拖动结束时间">│</span></div>',
    )
    .join("");
  updatePosition(videoUrl ? video.currentTime : Number($("seek").value));
}
function render() {
  renderProgress();
  renderEditor();
  renderList();
  renderTimeline();
}
async function play() {
  if (!videoUrl) {
    toast("先加载视频");
    $("videoFile").click();
    return;
  }
  if (!video.paused) {
    video.pause();
    return;
  }
  if (!current()) {
    video.play().catch(() => toast("该视频无法播放"));
    return;
  }
  if (mode !== "continuous") {
    video.currentTime = current().start;
    lineEnd = current().end;
  }
  try {
    await video.play();
  } catch {
    toast("视频无法播放，请尝试 MP4（H.264）格式");
  }
}
async function playLine() {
  if (!current()) return;
  if (!videoUrl) {
    toast("先加载与字幕对应的视频");
    $("videoFile").click();
    return;
  }
  video.currentTime = current().start;
  lineEnd = current().end;
  try {
    await video.play();
  } catch {
    toast("该视频无法播放");
  }
}
$("subtitleText").addEventListener("input", () => {
  if (!current()) return;
  current().text = $("subtitleText").value;
  changed();
});
function commitTiming() {
  if (!current()) return;
  try {
    const start = parseTime($("startTime").value),
      end = parseTime($("endTime").value);
    if (end <= start) throw Error("结束时间必须晚于开始时间");
    if (current().start === start && current().end === end) return;
    Object.assign(current(), { start, end });
    if (lineEnd !== null) lineEnd = end;
    changed();
    renderEditor();
  } catch (e) {
    toast(e.message);
    renderEditor();
  }
}
for (const id of ["startTime", "endTime"]) {
  $(id).addEventListener("change", commitTiming);
  $(id).addEventListener("blur", commitTiming);
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      $(id).blur();
    }
  });
}
$("review").onclick = () => {
  if (!current()) return;
  current().reviewed = true;
  save();
  renderProgress();
  if (index < project.entries.length - 1) select(index + 1);
  else {
    renderList();
    toast("已确认最后一条字幕");
  }
};
$("previous").onclick = () => select(index - 1);
$("next").onclick = () => select(index + 1);
$("play").onclick = play;
$("playLine").onclick = playLine;
$("subtitleList").onclick = (e) => {
  const row = e.target.closest("[data-index]");
  if (row) {
    $("editorPanel").open = true;
    select(+row.dataset.index);
    if (e.target.closest(".row-play")) playLine();
  }
};
$("search").oninput = renderList;
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
  (b.onclick = () => {
    filter = b.dataset.filter;
    document
      .querySelectorAll("[data-filter]")
      .forEach((x) => x.classList.toggle("selected", x === b));
    renderList();
  }),
);
$("jumpCurrent").onclick = () => {
  filter = "all";
  $("listPanel").open = true;
  $("search").value = "";
  document
    .querySelectorAll("[data-filter]")
    .forEach((x) => x.classList.toggle("selected", x.dataset.filter === "all"));
  renderList();
  scrollCurrentSubtitle("smooth");
};
$("autoApprove").onclick = () => {
  const button = $("autoApprove");
  button.setAttribute(
    "aria-pressed",
    String(button.getAttribute("aria-pressed") !== "true"),
  );
};
$("seek").oninput = () => {
  lineEnd = null;
  const t = +$("seek").value;
  if (videoUrl) video.currentTime = t;
  updatePosition(t);
};
$("speed").onchange = () => (video.playbackRate = +$("speed").value);
video.ontimeupdate = () => {
  if (drag) return;
  const t = video.currentTime;
  $("seek").value = t;
  updatePosition(t);
  if (!video.paused) approveCompletedSubtitles(t);
  if (lineEnd !== null && t >= lineEnd) {
    if (mode === "loop") {
      video.currentTime = current().start;
    } else {
      video.pause();
      lineEnd = null;
    }
  }
  if ($("follow").checked && mode === "continuous" && lineEnd === null) {
    const next = project.entries.findIndex((e) => t >= e.start && t < e.end);
    if (next >= 0 && next !== index) {
      select(next, false);
      scrollCurrentSubtitle();
    }
  }
  overlay();
};
video.onplay = () => {
  lastPlaybackTime = video.currentTime;
  $("play").textContent = "❚❚";
};
video.onpause = () => {
  $("play").textContent = "▶";
  lastPlaybackTime = null;
};
video.onseeking = () => {
  lastPlaybackTime = null;
};
video.onseeked = () => {
  if (!video.paused) lastPlaybackTime = video.currentTime;
};
video.onloadedmetadata = renderTimeline;
video.onended = () => {
  if (mode === "loop" && lineEnd !== null) {
    video.currentTime = current().start;
    video.play().catch(() => { });
  }
};
video.onerror = () => toast("浏览器不支持此视频编码，请尝试 H.264 MP4");
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    mode = b.dataset.mode;
    lineEnd = mode === "continuous" ? null : (current()?.end ?? null);
    document
      .querySelectorAll("[data-mode]")
      .forEach((x) => x.classList.toggle("selected", x === b));
  };
$("importVideo").onclick = $("emptyPlay").onclick = () =>
  $("videoFile").click();
$("importAss").onclick = $("openProject").onclick = () => $("assFile").click();
$("videoFile").onchange = () => {
  const file = $("videoFile").files[0];
  if (!file) return;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  $("videoEmpty").hidden = true;
  $("videoEmpty").style.display = "none";
  lineEnd = null;
  toast(`已加载 ${file.name}`);
  $("videoFile").value = "";
};
$("assFile").onchange = async () => {
  const file = $("assFile").files[0];
  if (!file) return;
  try {
    let text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    if (text.includes("\uFFFD"))
      text = new TextDecoder("gb18030").decode(await file.arrayBuffer());
    const next = parseASS(text);
    if (
      project.entries.length &&
      !confirm(
        "导入会替换当前字幕。当前项目如需保留，请先取消并导出。继续导入？",
      )
    )
      return;
    video.pause();
    lineEnd = null;
    project = next;
    name = file.name;
    index = 0;
    filter = "all";
    $("search").value = "";
    document
      .querySelectorAll("[data-filter]")
      .forEach((x) =>
        x.classList.toggle("selected", x.dataset.filter === "all"),
      );
    save();
    render();
    toast(`成功导入 ${project.entries.length} 条字幕`);
  } catch (e) {
    toast(`导入失败：${e.message}`);
  } finally {
    $("assFile").value = "";
  }
};
$("exportAss").onclick = async () => {
  if (!project.entries.length) return;
  $("exportAss").disabled = true;
  try {
    const filename = name.replace(/\.(ass|ssa)$/i, "") + "-校对.ass";
    await saveTextFile(filename, "\uFEFF" + exportASS(project));
    toast("已导出 ASS 字幕");
  } catch (error) {
    if (error.code === "CANCELLED") toast("已取消保存");
    else toast("导出失败：" + (error.message || "无法保存文件"));
  } finally {
    $("exportAss").disabled = !project.entries.length;
  }
};
$("fullscreen").onclick = async () => {
  if (!videoUrl) {
    toast("请先加载视频");
    return;
  }
  try {
    if ($("videoStage").requestFullscreen)
      await $("videoStage").requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch {
    toast("当前浏览器不支持全屏");
  }
};
$("timelineZoom").oninput = () => {
  const scroller = $("timelineScroll"),
    timeline = $("timeline");
  const center =
    (scroller.scrollLeft + scroller.clientWidth / 2) / timeline.clientWidth;
  timelineZoom = Number($("timelineZoom").value);
  $("timelineZoomValue").value = `${Math.round(timelineZoom * 100)}%`;
  renderTimeline();
  scroller.scrollLeft =
    center * timeline.clientWidth - scroller.clientWidth / 2;
};
let drag = null;
$("timelineTrack").onpointerdown = (e) => {
  const block = e.target.closest("[data-index]");
  if (!block) return;
  video.pause();
  lineEnd = null;
  const i = +block.dataset.index;
  select(i, false);
  const active = $("timelineTrack").querySelector(`[data-index="${i}"]`);
  drag = {
    id: e.pointerId,
    x: e.clientX,
    start: current().start,
    end: current().end,
    edge: e.target.dataset.edge,
    width: $("timeline").getBoundingClientRect().width,
    view: { ...timelineView },
    moved: false,
  };
  active.setPointerCapture(e.pointerId);
  e.preventDefault();
};
$("timelineTrack").onpointermove = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const delta =
    ((e.clientX - drag.x) / drag.width) * (drag.view.end - drag.view.start);
  drag.moved ||= Math.abs(e.clientX - drag.x) > 2;
  const item = current();
  if (drag.edge === "start")
    item.start = Math.max(0, Math.min(drag.end - 0.05, drag.start + delta));
  else if (drag.edge === "end")
    item.end = Math.max(drag.start + 0.05, drag.end + delta);
  else {
    item.start = Math.max(0, drag.start + delta);
    item.end = item.start + drag.end - drag.start;
  }
  const active = $("timelineTrack").querySelector(`[data-index="${index}"]`);
  active.style.left = `${((item.start - drag.view.start) / (drag.view.end - drag.view.start)) * 100}%`;
  active.style.width = `${((item.end - item.start) / (drag.view.end - drag.view.start)) * 100}%`;
  renderEditor();
};
function finishDrag() {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  if (moved) {
    current().start = Math.round(current().start * 100) / 100;
    current().end = Math.round(current().end * 100) / 100;
    changed();
    renderEditor();
    save();
  } else select(index);
}
$("timelineTrack").onpointerup = finishDrag;
$("timelineTrack").onpointercancel = finishDrag;
$("ruler").onclick = (e) => {
  if (!timelineView) return;
  const r = $("timeline").getBoundingClientRect();
  const t =
    timelineView.start +
    Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) *
    (timelineView.end - timelineView.start);
  if (videoUrl) video.currentTime = t;
  $("seek").value = t;
  updatePosition(t);
};
$("help").onclick = $("helpTop").onclick = () => $("helpDialog").showModal();
$("closeHelp").onclick = () => $("helpDialog").close();
$("workspace").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    $("listPanel").open = true;
    $("search").focus();
    return;
  }
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) ||
    $("helpDialog").open
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    play();
  }
  if (e.key === "ArrowLeft") select(index - 1);
  if (e.key === "ArrowRight") select(index + 1);
});
window.addEventListener("pagehide", save);
render();
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.())
  navigator.serviceWorker.register("/sw.js").catch(() => { });
