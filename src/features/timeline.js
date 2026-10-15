import { byId as $, escapeHTML } from "../lib/dom.js";
import { timelineRange, formatTime, plainText } from "../lib/subtitles.js";

export function createTimeline({ store, getPosition, seek, onDragStart, onDragEnd, onRange = () => {} }) {
  const timeline = $("timeline"), track = $("timelineTrack"), scroller = $("timelineScroll");
  let zoom = 1, view = null, drag = null;
  function updatePosition(time) {
    if (!view) { $("playhead").hidden = true; return; }
    const ratio = (time - view.start) / (view.end - view.start);
    $("playhead").hidden = ratio < 0 || ratio > 1;
    $("playhead").style.left = `${ratio * 100}%`;
  }
  function render() {
    const { project, index } = store.getState();
    const entry = store.current();
    $("timelineZoom").disabled = !entry;
    if (!entry) {
      view = null;
      onRange(null);
      $("ruler").innerHTML = "";
      track.innerHTML = '<div class="timeline-empty">导入 ASS 字幕后显示时间轴</div>';
      updatePosition(0);
      return;
    }
    view = timelineRange(project.entries, index);
    if (zoom < 1) {
      const span = (view.end - view.start) / zoom, center = (view.start + view.end) / 2;
      const start = Math.max(0, center - span / 2);
      view = { start, end: start + span };
    }
    timeline.style.width = `${Math.max(1, zoom) * 100}%`;
    const span = view.end - view.start;
    $("ruler").innerHTML = Array.from({ length: 5 }, (_, i) => `<span style="left:${i * 25}%">${formatTime(view.start + span * i / 4)}</span>`).join("");
    track.innerHTML = `<div class="timeline-block active" data-index="${index}" style="left:${(entry.start - view.start) / span * 100}%;width:${(entry.end - entry.start) / span * 100}%" title="${escapeHTML(plainText(entry.text))}"><span class="handle" data-edge="start" aria-label="拖动开始时间">│</span><span class="block-label">${escapeHTML(plainText(entry.text))}</span><span class="handle" data-edge="end" aria-label="拖动结束时间">│</span></div>`;
    updatePosition(getPosition());
    onRange({ ...view });
  }
  $("timelineZoom").oninput = () => {
    const center = (scroller.scrollLeft + scroller.clientWidth / 2) / timeline.clientWidth;
    zoom = Number($("timelineZoom").value);
    $("timelineZoomValue").value = `${Math.round(zoom * 100)}%`;
    render();
    scroller.scrollLeft = center * timeline.clientWidth - scroller.clientWidth / 2;
  };
  track.onpointerdown = (event) => {
    const block = event.target.closest("[data-index]");
    if (!block || !store.current()) return;
    onDragStart();
    drag = {
      id: event.pointerId, x: event.clientX,
      start: store.current().start, end: store.current().end,
      edge: event.target.closest("[data-edge]")?.dataset.edge,
      width: timeline.getBoundingClientRect().width,
      view: { ...view }, moved: false, block,
    };
    block.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  track.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const delta = (event.clientX - drag.x) / drag.width * (drag.view.end - drag.view.start);
    drag.moved ||= Math.abs(event.clientX - drag.x) > 2;
    if (!drag.moved) return;
    let start = drag.start, end = drag.end;
    if (drag.edge === "start") start = Math.max(0, Math.min(drag.end - 0.05, drag.start + delta));
    else if (drag.edge === "end") end = Math.max(drag.start + 0.05, drag.end + delta);
    else { start = Math.max(0, drag.start + delta); end = start + drag.end - drag.start; }
    store.updateTiming(start, end, { transient: true });
    drag.block.style.left = `${(start - drag.view.start) / (drag.view.end - drag.view.start) * 100}%`;
    drag.block.style.width = `${(end - start) / (drag.view.end - drag.view.start) * 100}%`;
  };
  function finishDrag() {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      const entry = store.current();
      store.updateTiming(Math.round(entry.start * 100) / 100, Math.round(entry.end * 100) / 100, { force: true });
    }
    onDragEnd();
    if (!moved) seek(store.current().start);
  }
  track.onpointerup = finishDrag;
  track.onpointercancel = finishDrag;
  $("ruler").onclick = (event) => {
    if (!view) return;
    const bounds = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    seek(view.start + ratio * (view.end - view.start));
  };
  store.subscribe((event) => {
    if (event.type === "review" || drag) return;
    if (event.type === "project" || (event.type === "selection" && event.index !== event.previousIndex)) scroller.scrollLeft = 0;
    render();
  });
  render();
  return { updatePosition };
}
