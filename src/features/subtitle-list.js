import { byId as $, escapeHTML } from "../lib/dom.js";
import { formatTime, plainText } from "../lib/subtitles.js";

// Scroll the list itself, never its ancestors, and never move keyboard focus.
export function scrollRowIntoList(list, row, behavior = "auto") {
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

export function createSubtitleList({ store, playLine, importSubtitles }) {
  const list = $("subtitleList");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  let filter = "all",
    query = "";
  function matches(entry) {
    return (
      (filter === "all" ||
        (filter === "reviewed" ? entry.reviewed : !entry.reviewed)) &&
      entry.text.toLowerCase().includes(query)
    );
  }
  function rowContent(entry, index) {
    return `<span class="row-number">${String(index + 1).padStart(2, "0")}</span><span class="row-content"><span class="row-top"><span>${formatTime(entry.start)} → ${formatTime(entry.end)}</span><span class="row-status ${entry.reviewed ? "" : "pending"}">${entry.reviewed ? "✓ 已校对" : "待校对"}</span></span><span class="row-text">${escapeHTML(plainText(entry.text)) || "（空字幕）"}</span></span><span class="row-play">▷</span>`;
  }
  function render() {
    const scrollTop = list.scrollTop;
    const { project, index } = store.getState();
    list.innerHTML =
      project.entries
        .map((entry, i) => ({ entry, i }))
        .filter(({ entry }) => matches(entry))
        .map(
          ({ entry, i }) =>
            `<button class="subtitle-row ${i === index ? "selected" : ""}" data-index="${i}" aria-label="第 ${i + 1} 条字幕" aria-current="${i === index}">${rowContent(entry, i)}</button>`,
        )
        .join("") ||
      (project.entries.length
        ? '<div class="no-results">没有符合条件的字幕</div>'
        : '<div class="empty-subtitles"><span class="empty-icon">Aa</span><strong>还没有字幕</strong><p>导入 ASS 文件后，即可开始编辑</p><button class="button secondary" id="importEmpty">导入 ASS 文件</button></div>');
    list.scrollTop = scrollTop;
  }
  function resetFilters() {
    filter = "all";
    query = "";
    $("search").value = "";
    filterButtons.forEach((button) =>
      button.classList.toggle("selected", button.dataset.filter === filter),
    );
  }
  list.onclick = (event) => {
    if (event.target.closest("#importEmpty")) return importSubtitles();
    const row = event.target.closest("[data-index]");
    if (!row) return;
    $("editorPanel").open = true;
    store.selectSubtitle(Number(row.dataset.index));
    if (event.target.closest(".row-play")) playLine();
  };
  $("search").oninput = () => {
    query = $("search").value.toLowerCase();
    render();
  };
  filterButtons.forEach(
    (button) =>
      (button.onclick = () => {
        filter = button.dataset.filter;
        filterButtons.forEach((other) =>
          other.classList.toggle("selected", other === button),
        );
        render();
      }),
  );
  $("jumpCurrent").onclick = () => {
    resetFilters();
    $("listPanel").open = true;
    render();
    scrollRowIntoList(list, list.querySelector(".selected"), "smooth");
  };
  store.subscribe((event) => {
    if (event.type === "project") {
      resetFilters();
      render();
    } else if (event.type === "selection") {
      list.querySelector(".selected")?.classList.remove("selected");
      list
        .querySelector('[aria-current="true"]')
        ?.setAttribute("aria-current", "false");
      const row = list.querySelector(`[data-index="${event.index}"]`);
      row?.classList.add("selected");
      row?.setAttribute("aria-current", "true");
      if (event.follow) scrollRowIntoList(list, row);
    } else if (filter !== "all" || query) render();
    else {
      const { project } = store.getState();
      for (const i of event.indices ?? []) {
        const row = list.querySelector(`[data-index="${i}"]`);
        if (row) row.innerHTML = rowContent(project.entries[i], i);
      }
    }
  });
  render();
  return {
    focusSearch() {
      $("listPanel").open = true;
      $("search").focus();
    },
  };
}
