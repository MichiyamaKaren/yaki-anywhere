import { byId as $ } from "../lib/dom.js";
import { plainText } from "../lib/subtitles.js";

const clock = (time) =>
  `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
// Media seeks can land a microsecond before an ASS boundary. Match at millisecond precision.
const subtitleTime = (time) => Math.round(time * 1000) / 1000;

export function createPlayer({
  store,
  toast,
  onPosition,
  onMedia = () => {},
  chooseMedia = () => $("videoFile").click(),
  onAutoApproveChange = () => {},
}) {
  const video = $("video");
  let videoUrl = null,
    mode = "continuous",
    lineEnd = null,
    pendingPosition = null;
  let follow = true,
    autoApprove = false,
    lastPlaybackTime = null,
    editingTimeline = false;
  const getPosition = () =>
    pendingPosition ?? (videoUrl ? video.currentTime : Number($("seek").value));
  function updatePosition(time) {
    $("seek").value = time;
    $("currentTime").textContent = clock(time);
    onPosition(time);
  }
  function renderDuration() {
    const { project } = store.getState();
    const duration = Number.isFinite(video.duration)
      ? video.duration
      : Math.max(0.1, ...project.entries.map((entry) => entry.end));
    $("seek").max = duration;
    $("duration").textContent = clock(duration);
  }
  function renderOverlay() {
    $("subtitleOverlay").textContent = videoUrl
      ? store
          .getState()
          .project.entries.filter(
            (entry) =>
              subtitleTime(video.currentTime) >= entry.start &&
              subtitleTime(video.currentTime) < entry.end,
          )
          .map((entry) => plainText(entry.text))
          .join("\n")
      : "";
  }
  function followPosition(time) {
    if (!follow || editingTimeline) return;
    const { project, index } = store.getState();
    const position = subtitleTime(time),
      current = project.entries[index];
    // Keep an explicitly selected subtitle when reviewed cues overlap its start.
    if (current && position >= current.start && position < current.end) return;
    const next = project.entries.findIndex(
      (entry) => position >= entry.start && position < entry.end,
    );
    if (next >= 0 && next !== index)
      store.selectSubtitle(next, { seek: false, follow: true });
  }
  function setPosition(time) {
    lastPlaybackTime = null;
    if (videoUrl) {
      if (pendingPosition !== null || video.readyState === 0)
        pendingPosition = time;
      else video.currentTime = time;
    }
    updatePosition(time);
  }
  function seek(time) {
    lineEnd = null;
    setPosition(time);
    // Scrubbing must follow even while paused or before media timeupdate fires.
    followPosition(time);
    renderOverlay();
  }
  function pauseLine() {
    video.pause();
    lineEnd = null;
  }
  async function play() {
    if (!videoUrl) {
      toast("先加载视频");
      chooseMedia();
      return;
    }
    if (!video.paused) {
      video.pause();
      return;
    }
    const entry = store.current();
    if (entry && mode !== "continuous") {
      video.currentTime = entry.start;
      lineEnd = entry.end;
    }
    try {
      await video.play();
    } catch {
      toast("视频无法播放，请尝试 MP4（H.264）格式");
    }
  }
  async function playLine() {
    const entry = store.current();
    if (!entry) return;
    if (!videoUrl) {
      toast("先加载与字幕对应的视频");
      chooseMedia();
      return;
    }
    video.currentTime = entry.start;
    lineEnd = entry.end;
    try {
      await video.play();
    } catch {
      toast("该视频无法播放");
    }
  }
  $("play").onclick = play;
  $("seek").oninput = () => seek(Number($("seek").value));
  $("speed").onchange = () => {
    video.playbackRate = Number($("speed").value);
  };
  $("follow").checked = follow;
  $("follow").onchange = () => {
    follow = $("follow").checked;
    if (follow) followPosition(getPosition());
  };
  $("autoApprove").setAttribute("aria-pressed", String(autoApprove));
  $("autoApprove").onclick = () => {
    autoApprove = !autoApprove;
    $("autoApprove").setAttribute("aria-pressed", String(autoApprove));
    onAutoApproveChange(autoApprove);
  };
  document.querySelectorAll("[data-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        mode = button.dataset.mode;
        lineEnd = mode === "continuous" ? null : (store.current()?.end ?? null);
        document
          .querySelectorAll("[data-mode]")
          .forEach((other) =>
            other.classList.toggle("selected", other === button),
          );
      }),
  );
  video.ontimeupdate = () => {
    if (editingTimeline || !videoUrl || pendingPosition !== null) return;
    const time = video.currentTime;
    updatePosition(time);
    if (!video.paused) {
      if (autoApprove && !video.seeking)
        store.approveCompletedSubtitles(lastPlaybackTime, time);
      lastPlaybackTime = time;
    }
    if (lineEnd !== null && time >= lineEnd) {
      if (mode === "loop" && store.current())
        video.currentTime = store.current().start;
      else pauseLine();
    }
    if (mode === "continuous" && lineEnd === null) followPosition(time);
    renderOverlay();
  };
  video.onplay = () => {
    lastPlaybackTime = video.currentTime;
    $("play").textContent = "❚❚";
  };
  video.onpause = () => {
    lastPlaybackTime = null;
    $("play").textContent = "▶";
  };
  video.onseeking = () => {
    lastPlaybackTime = null;
  };
  video.onseeked = () => {
    if (!videoUrl || pendingPosition !== null) return;
    const time = video.currentTime;
    if (!editingTimeline) {
      updatePosition(time);
      if (mode === "continuous" && lineEnd === null) followPosition(time);
      renderOverlay();
    }
    if (!video.paused) lastPlaybackTime = time;
  };
  video.onloadedmetadata = () => {
    if (!videoUrl) return;
    renderDuration();
    if (pendingPosition !== null) {
      const time = pendingPosition;
      pendingPosition = null;
      video.currentTime = time;
    }
    updatePosition(video.currentTime);
    renderOverlay();
  };
  video.onended = () => {
    if (mode === "loop" && lineEnd !== null && store.current()) {
      video.currentTime = store.current().start;
      video.play().catch(() => {});
    }
  };
  video.onerror = () => toast("浏览器不支持此视频编码，请尝试 H.264 MP4");
  $("importVideo").onclick = $("emptyPlay").onclick = () => {
    void chooseMedia();
  };
  function loadMedia(file) {
    const position = getPosition();
    pauseLine();
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    // Metadata loads asynchronously; retain the project position until seeking is possible.
    pendingPosition = position;
    videoUrl = file.url || URL.createObjectURL(file);
    video.src = videoUrl;
    onMedia(file);
    $("videoEmpty").hidden = true;
    $("videoEmpty").style.display = "none";
    lineEnd = null;
    $("subtitleOverlay").textContent = "";
    updatePosition(position);
  }
  function clearMedia() {
    pauseLine();
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    videoUrl = null;
    pendingPosition = null;
    video.removeAttribute("src");
    video.load();
    $("videoEmpty").hidden = false;
    $("videoEmpty").style.display = "";
    onMedia(null);
    updatePosition(0);
    renderDuration();
    renderOverlay();
  }
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
  store.subscribe((event) => {
    if (event.type === "project") pauseLine();
    if (event.type === "project" || event.type === "timing") renderDuration();
    if (event.type === "timing" && lineEnd !== null)
      lineEnd = store.current().end;
    if (event.type === "selection") {
      lineEnd =
        mode !== "continuous" && !video.paused ? store.current().end : null;
      if (event.seek) {
        setPosition(store.current().start);
      }
    }
    if (event.type !== "review") renderOverlay();
  });
  renderDuration();
  return {
    play,
    playLine,
    seek,
    getPosition,
    pauseLine,
    loadMedia,
    clearMedia,
    beginTimelineEdit() {
      editingTimeline = true;
      pauseLine();
    },
    endTimelineEdit() {
      editingTimeline = false;
    },
  };
}
