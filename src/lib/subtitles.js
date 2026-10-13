export function parseTime(value) {
  const m = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!m || +m[2] > 59 || +m[3] > 59) throw Error("时间格式应为 0:00:00.00");
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + Number("0." + m[4]);
}
export function formatTime(t) {
  const n = Math.round(Math.max(0, t) * 100);
  return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
}
export function parseASS(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let inEvents = false,
    format = [],
    entries = [];
  lines.forEach((line, index) => {
    if (/^\[/.test(line)) inEvents = /^\[Events\]/i.test(line);
    if (!inEvents) return;
    if (/^Format:/i.test(line))
      format = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((s) => s.trim().toLowerCase());
    if (!/^Dialogue:/i.test(line)) return;
    if (!format.length) throw Error("ASS 缺少 Events Format");
    if (format.at(-1) !== "text")
      throw Error("暂不支持 Text 字段不在末尾的 ASS");
    let rest = line.slice(line.indexOf(":") + 1).trimStart(),
      fields = [];
    for (let i = 0; i < format.length - 1; i++) {
      const comma = rest.indexOf(",");
      if (comma < 0) throw Error("ASS 对话行字段不完整");
      fields.push(rest.slice(0, comma));
      rest = rest.slice(comma + 1);
    }
    fields.push(rest);
    const start = parseTime(fields[format.indexOf("start")]),
      end = parseTime(fields[format.indexOf("end")]);
    if (end <= start) throw Error(`第 ${index + 1} 行结束时间必须晚于开始时间`);
    entries.push({
      id: index,
      start,
      end,
      text: rest,
      reviewed: false,
      fields,
      format: [...format],
      line: index,
    });
  });
  if (!entries.length) throw Error("没有找到可编辑的 Dialogue 字幕");
  return { lines, entries };
}
export function exportASS(project) {
  const lines = [...project.lines];
  for (const e of project.entries) {
    const fields = [...e.fields];
    fields[e.format.indexOf("start")] = formatTime(e.start);
    fields[e.format.indexOf("end")] = formatTime(e.end);
    fields[e.format.indexOf("text")] = e.text.replace(/\r?\n/g, "\\N");
    lines[e.line] = "Dialogue: " + fields.join(",");
  }
  return lines.join("\r\n");
}
export function plainText(s) {
  return s
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, " ");
}

// Upgrade saved projects without discarding text edited in the previous version.
export function migrateProject(project) {
  return {
    ...project,
    entries: project.entries.map((entry) => {
      const { source, translation, ...rest } = entry;
      return {
        ...rest,
        text:
          entry.text ??
          (source ?? "") + (translation ? "\\N" + translation : ""),
      };
    }),
  };
}
export function timelineRange(entries, index, scope = "current") {
  if (scope === "all")
    return { start: 0, end: Math.max(0.1, ...entries.map((e) => e.end)) };
  const entry = entries[index];
  const padding = Math.max(0.5, (entry.end - entry.start) * 0.35);
  return {
    start: Math.max(0, entry.start - padding),
    end: entry.end + padding,
  };
}
