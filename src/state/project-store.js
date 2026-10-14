export function emptyProject() {
  return {
    lines: [
      "[Script Info]", "Title: Untitled subtitles", "ScriptType: v4.00+",
      "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ],
    entries: [],
  };
}

// Only project data lives here; playback and panel state belong to their features.
export function createProjectStore(draft = {}) {
  let project = draft.project ?? emptyProject();
  let name = draft.name || "未命名项目";
  let index = 0;
  const listeners = new Set();
  const current = () => project.entries[index];
  const emit = (event) => listeners.forEach((listener) => listener(event));

  return {
    current,
    getState: () => ({ project, name, index }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceProject(next, filename) {
      project = next;
      name = filename;
      index = 0;
      emit({ type: "project" });
    },
    selectSubtitle(next, { seek = true, follow = false } = {}) {
      if (!project.entries.length) return;
      const previousIndex = index;
      index = Math.max(0, Math.min(project.entries.length - 1, next));
      if (index !== previousIndex || seek) {
        emit({ type: "selection", previousIndex, index, seek, follow });
      }
    },
    updateText(text) {
      if (!current() || current().text === text) return;
      Object.assign(current(), { text, reviewed: false });
      emit({ type: "text", indices: [index] });
    },
    updateTiming(start, end, { transient = false, force = false } = {}) {
      if (!current()) return;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw Error("结束时间必须晚于开始时间，且时间不能为负数");
      }
      if (!force && current().start === start && current().end === end) return;
      Object.assign(current(), { start, end, reviewed: false });
      emit({ type: "timing", indices: [index], transient });
    },
    approveSubtitle(target = index) {
      const entry = project.entries[target];
      if (!entry || entry.reviewed) return;
      entry.reviewed = true;
      emit({ type: "review", indices: [target] });
    },
    approveCompletedSubtitles(from, to) {
      if (from === null || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return;
      const indices = [];
      project.entries.forEach((entry, i) => {
        if (!entry.reviewed && entry.start <= from && entry.end > from && entry.end <= to) {
          entry.reviewed = true;
          indices.push(i);
        }
      });
      if (indices.length) emit({ type: "review", indices });
    },
  };
}
