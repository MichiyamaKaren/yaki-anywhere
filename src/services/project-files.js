import { byId as $ } from "../lib/dom.js";
import { parseASS, exportASS } from "../lib/subtitles.js";
import { saveTextFile } from "../lib/native-files.js";

export async function readSubtitleFile(file) {
  const bytes = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(bytes);
  return parseASS(text);
}

export function createProjectFiles({ store, pausePlayback, toast }) {
  function importSubtitles() { $("assFile").click(); }
  $("importAss").onclick = $("openProject").onclick = importSubtitles;
  $("assFile").onchange = async () => {
    const file = $("assFile").files[0];
    if (!file) return;
    try {
      const project = await readSubtitleFile(file);
      if (store.getState().project.entries.length && !confirm("导入会替换当前字幕。当前项目如需保留，请先取消并导出。继续导入？")) return;
      pausePlayback();
      store.replaceProject(project, file.name);
      toast(`成功导入 ${project.entries.length} 条字幕`);
    } catch (error) { toast(`导入失败：${error.message}`); }
    finally { $("assFile").value = ""; }
  };
  $("exportAss").onclick = async () => {
    const { project, name } = store.getState();
    if (!project.entries.length) return;
    $("exportAss").disabled = true;
    try {
      await saveTextFile(name.replace(/\.(ass|ssa)$/i, "") + "-校对.ass", "\uFEFF" + exportASS(project));
      toast("已导出 ASS 字幕");
    } catch (error) {
      toast(error.code === "CANCELLED" ? "已取消保存" : "导出失败：" + (error.message || "无法保存文件"));
    } finally { $("exportAss").disabled = !store.getState().project.entries.length; }
  };
  return { importSubtitles };
}
