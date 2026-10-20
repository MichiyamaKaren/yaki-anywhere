import { getMediaTimeOrigin } from "../lib/media-timing.js";

export async function readMediaTimeOrigin(file) {
  const { Input, ALL_FORMATS, BlobSource, UrlSource } =
    await import("/assets/vendor/mediabunny.mjs");
  const input = new Input({
    formats: ALL_FORMATS,
    source: file.url
      ? new UrlSource(file.url, { maxCacheSize: 2 * 1024 * 1024 })
      : new BlobSource(file, { maxCacheSize: 2 * 1024 * 1024 }),
  });
  try {
    return await getMediaTimeOrigin(input);
  } finally {
    input.dispose();
  }
}
