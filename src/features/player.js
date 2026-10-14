import { byId as $ } from "../lib/dom.js";
import { plainText } from "../lib/subtitles.js";

const clock = (time) => `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

export function createPlayer({ store, toast, onPosition }) {
  const video = $("video");
  let videoUrl = null, mode = "continuous", lineEnd = null;
  let follow = true, autoApprove = false, lastPlaybackTime = null, editingTimeline = false;
  const getPosition = () => videoUrl ? video.currentTime : Number($("seek").value);
  function updatePosition(time) {
    $("seek").value = time;
    $("currentTime").textContent = clock(time);
    onPosition(time);
  }
  function renderDuration() {
    const { project } = store.getState();
    const duration = Number.isFinite(video.duration) ? video.duration : Math.max(0.1, ...project.entries.map((entry) => entry.end));
    $("seek").max = duration;
    $("duration").textContent = clock(duration);
  }
  function renderOverlay() {
    $("subtitleOverlay").textContent = videoUrl ? store.getState().project.entries
      .filter((entry) => video.currentTime >= entry.start && video.currentTime < entry.end)
      .map((entry) => plainText(entry.text)).join("\n") : "";
  }
  function seek(time) {
    lineEnd = null;
    if (videoUrl) video.currentTime = time;
    updatePosition(time);
    renderOverlay();
  }
  function pauseLine() {
    video.pause();
    lineEnd = null;
  }
  async function play() {
    if (!videoUrl) { toast("先加载视频"); $("videoFile").click(); return; }
    if (!video.paused) { video.pause(); return; }
    const entry = store.current();
    if (entry && mode !== "continuous") {
      video.currentTime = entry.start;
      lineEnd = entry.end;
    }
    try { await video.play(); }
    catch { toast("视频无法播放，请尝试 MP4（H.264）格式"); }
  }
  async function playLine() {
    const entry = store.current();
    if (!entry) return;
    if (!videoUrl) { toast("先加载与字幕对应的视频"); $("videoFile").click(); return; }
    video.currentTime = entry.start;
    lineEnd = entry.end;
    try { await video.play(); }
    catch { toast("该视频无法播放"); }
  }
  $("play").onclick = play;
  $("seek").oninput = () => seek(Number($("seek").value));
  $("speed").onchange = () => { video.playbackRate = Number($("speed").value); };
  $("follow").checked = follow;
  $("follow").onchange = () => { follow = $("follow").checked; };
  $("autoApprove").setAttribute("aria-pressed", String(autoApprove));
  $("autoApprove").onclick = () => {
    autoApprove = !autoApprove;
    $("autoApprove").setAttribute("aria-pressed", String(autoApprove));
  };
  document.querySelectorAll("[data-mode]").forEach((button) => button.onclick = () => {
    mode = button.dataset.mode;
    lineEnd = mode === "continuous" ? null : (store.current()?.end ?? null);
    document.querySelectorAll("[data-mode]").forEach((other) => other.classList.toggle("selected", other === button));
  });
  video.ontimeupdate = () => {
    if (editingTimeline) return;
    const time = video.currentTime;
    updatePosition(time);
    if (!video.paused) {
      if (autoApprove && !video.seeking) store.approveCompletedSubtitles(lastPlaybackTime, time);
      lastPlaybackTime = time;
    }
    if (lineEnd !== null && time >= lineEnd) {
      if (mode === "loop" && store.current()) video.currentTime = store.current().start;
      else pauseLine();
    }
    if (follow && mode === "continuous" && lineEnd === null) {
      const { project, index } = store.getState();
      const next = project.entries.findIndex((entry) => time >= entry.start && time < entry.end);
      if (next >= 0 && next !== index) store.selectSubtitle(next, { seek: false, follow: true });
    }
    renderOverlay();
  };
  video.onplay = () => { lastPlaybackTime = video.currentTime; $("play").textContent = "❚❚"; };
  video.onpause = () => { lastPlaybackTime = null; $("play").textContent = "▶"; };
  video.onseeking = () => { lastPlaybackTime = null; };
  video.onseeked = () => { if (!video.paused) lastPlaybackTime = video.currentTime; };
  video.onloadedmetadata = () => { renderDuration(); updatePosition(video.currentTime); };
  video.onended = () => {
    if (mode === "loop" && lineEnd !== null && store.current()) {
      video.currentTime = store.current().start;
      video.play().catch(() => {});
    }
  };
  video.onerror = () => toast("浏览器不支持此视频编码，请尝试 H.264 MP4");
  $("importVideo").onclick = $("emptyPlay").onclick = () => $("videoFile").click();
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
  $("fullscreen").onclick = async () => {
    if (!videoUrl) { toast("请先加载视频"); return; }
    try {
      if ($("videoStage").requestFullscreen) await $("videoStage").requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch { toast("当前浏览器不支持全屏"); }
  };
  store.subscribe((event) => {
    if (event.type === "project") pauseLine();
    if (event.type === "project" || event.type === "timing") renderDuration();
    if (event.type === "timing" && lineEnd !== null) lineEnd = store.current().end;
    if (event.type === "selection") {
      lineEnd = mode !== "continuous" && !video.paused ? store.current().end : null;
      if (event.seek) {
        if (videoUrl) video.currentTime = store.current().start;
        updatePosition(store.current().start);
      }
    }
    if (event.type !== "review") renderOverlay();
  });
  renderDuration();
  return {
    play, playLine, seek, getPosition, pauseLine,
    beginTimelineEdit() { editingTimeline = true; pauseLine(); },
    endTimelineEdit() { editingTimeline = false; },
  };
}
