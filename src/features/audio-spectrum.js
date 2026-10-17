import { byId as $ } from "../lib/dom.js";
import { spectrumColor } from "../lib/spectrogram.js";

export function createAudioSpectrum() {
  const canvas = $("audioSpectrum"),
    timeline = $("timeline"),
    scroller = $("timelineScroll");
  const status = $("audioSpectrumStatus"),
    labels = $("audioFrequencyLabels");
  const context = canvas.getContext("2d"),
    scratch = document.createElement("canvas");
  const colors = Array.from({ length: 256 }, (_, value) =>
    spectrumColor(value),
  );
  let worker = null,
    view = null,
    sourceId = 0,
    requestId = 0,
    ready = false,
    hasFile = false,
    timer,
    lastKey;
  function clear() {
    context?.clearRect(0, 0, canvas.width, canvas.height);
    timeline.classList.remove("has-spectrum");
    labels.hidden = true;
    delete canvas.dataset.rangeStart;
    delete canvas.dataset.rangeEnd;
    delete canvas.dataset.sourceId;
  }
  function request() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!ready || !view || !context || !scroller.clientWidth) return;
      const width = timeline.clientWidth;
      const start =
        view.start + (scroller.scrollLeft / width) * (view.end - view.start);
      const end = Math.min(
        view.end,
        start + (scroller.clientWidth / width) * (view.end - view.start),
      );
      const key = [sourceId, start, end, width, canvas.clientHeight].join(":");
      if (key === lastKey) return;
      lastKey = key;
      canvas.width = Math.min(
        4096,
        Math.round(width * Math.min(devicePixelRatio || 1, 2)),
      );
      canvas.height = Math.max(
        1,
        Math.round(canvas.clientHeight * Math.min(devicePixelRatio || 1, 2)),
      );
      clear();
      status.textContent = "正在生成频谱…";
      worker.postMessage({
        type: "range",
        sourceId,
        requestId: ++requestId,
        start,
        end,
        columns: scroller.clientWidth * Math.min(devicePixelRatio || 1, 2),
      });
    }, 80);
  }
  function receive({ data }) {
    if (
      data.sourceId !== sourceId ||
      (data.requestId !== undefined && data.requestId !== requestId)
    )
      return;
    if (data.type === "state") {
      if (data.state === "ready") {
        ready = true;
        lastKey = null;
        if (!view) status.textContent = "导入字幕后显示对应频谱";
        request();
      } else if (data.state === "loading") status.textContent = "正在读取音轨…";
      else {
        ready = false;
        clear();
        status.textContent =
          data.code === "NO_AUDIO" ? "视频没有音轨" : "此音轨暂不支持频谱解析";
      }
      return;
    }
    if (!view || !context) return;
    const values = new Uint8Array(data.values);
    scratch.width = data.columns;
    scratch.height = data.rows;
    const imageContext = scratch.getContext("2d"),
      image = imageContext.createImageData(data.columns, data.rows);
    for (let i = 0; i < values.length; i++) {
      image.data[i * 4] = colors[values[i]][0];
      image.data[i * 4 + 1] = colors[values[i]][1];
      image.data[i * 4 + 2] = colors[values[i]][2];
      image.data[i * 4 + 3] = 255;
    }
    imageContext.putImageData(image, 0, 0);
    const x =
      ((data.start - view.start) / (view.end - view.start)) * canvas.width;
    const width =
      ((data.end - data.start) / (view.end - view.start)) * canvas.width;
    context.drawImage(scratch, x, 0, width, canvas.height);
    timeline.classList.add("has-spectrum");
    labels.hidden = !data.hasAudio;
    labels.firstElementChild.textContent = `${(data.maximum / 1000).toFixed(data.maximum % 1000 ? 1 : 0)} kHz`;
    status.textContent = data.hasAudio
      ? "音频频谱 · 颜色越亮，能量越强"
      : "此时间区间没有音频";
    canvas.dataset.rangeStart = String(data.start);
    canvas.dataset.rangeEnd = String(data.end);
    canvas.dataset.sourceId = String(sourceId);
  }
  scroller.addEventListener("scroll", request, { passive: true });
  const observer = new ResizeObserver(request);
  observer.observe(scroller);
  return {
    setMedia(file) {
      sourceId++;
      requestId++;
      ready = false;
      hasFile = Boolean(file);
      lastKey = null;
      clear();
      if (!file) {
        worker?.terminate();
        worker = null;
        status.textContent = "加载视频后显示音频频谱";
        return;
      }
      if (!context || !window.Worker) {
        status.textContent = "当前浏览器不支持音频频谱";
        return;
      }
      if (!worker) {
        worker = new Worker(
          new URL("../workers/audio-spectrum.js", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = receive;
        worker.onerror = () => {
          ready = false;
          clear();
          worker.terminate();
          worker = null;
          status.textContent = "频谱读取失败，请重新加载视频";
        };
      }
      worker.postMessage({
        type: "source",
        sourceId,
        file: file.url ? null : file,
        url: file.url,
      });
    },
    setRange(range) {
      if (view?.start !== range?.start || view?.end !== range?.end) {
        lastKey = null;
        requestId++;
        clear();
        worker?.postMessage({ type: "cancel", sourceId, requestId });
      }
      view = range;
      if (!range)
        status.textContent = hasFile
          ? "导入字幕后显示对应频谱"
          : "加载视频后显示音频频谱";
      else if (!hasFile) status.textContent = "加载视频后显示音频频谱";
      request();
    },
  };
}
