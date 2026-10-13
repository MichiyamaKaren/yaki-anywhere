export function isAndroidApp() {
  return window.Capacitor?.getPlatform?.() === "android";
}

export async function saveTextFile(filename, text) {
  if (isAndroidApp()) {
    const { registerPlugin } = await import("/assets/vendor/capacitor.js");
    const SubtitleFiles = registerPlugin("SubtitleFiles");
    await SubtitleFiles.save({ filename, text });
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
