export function packReviews(entries) {
  const bits = new Uint8Array(Math.ceil(entries.length / 8));
  entries.forEach((entry, index) => {
    if (entry.reviewed) bits[index >> 3] |= 1 << (index & 7);
  });
  return btoa(Array.from(bits, (byte) => String.fromCharCode(byte)).join(""));
}

export function unpackReviews(encoded, count) {
  const raw = atob(encoded);
  if (raw.length !== Math.ceil(count / 8)) throw Error("校对状态长度不匹配");
  if (count % 8 && raw.charCodeAt(raw.length - 1) >> (count % 8))
    throw Error("校对状态包含无效位");
  return Array.from({ length: count }, (_, i) =>
    Boolean(raw.charCodeAt(i >> 3) & (1 << (i & 7))),
  );
}

export async function hashASS(text) {
  const bytes = new TextEncoder().encode(text.replace(/^\uFEFF/, ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
