import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseASS,
  exportASS,
  parseTime,
  formatTime,
  plainText,
  migrateProject,
  timelineRange,
} from "../src/lib/subtitles.js";
const fixture =
  "[Script Info]\nTitle: test\n[V4+ Styles]\nStyle: Default,Arial,20\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nComment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,keep\nDialogue: 0,0:00:01.25,0:00:04.50,Default,Name,0,0,0,,{\\i1}First line, with commas\\NSecond line\\nThird line";
test("multiline ASS is one text field, without language assumptions", () => {
  const p = parseASS(fixture);
  assert.equal(
    p.entries[0].text,
    "{\\i1}First line, with commas\\NSecond line\\nThird line",
  );
  assert.equal(p.entries[0].source, undefined);
  assert.equal(p.entries[0].translation, undefined);
  assert.equal(exportASS(p), fixture.replaceAll("\n", "\r\n"));
});
test("edits preserve styles, comments, tags and convert actual line breaks", () => {
  const p = parseASS(fixture);
  p.entries[0].text = "{\\i1}Edited, text\nAnother line";
  p.entries[0].start = 2.15;
  const result = exportASS(p);
  assert.ok(result.includes("Style: Default,Arial,20"));
  assert.ok(result.includes("Comment: 0,"));
  const again = parseASS(result);
  assert.equal(again.entries[0].start, 2.15);
  assert.equal(again.entries[0].text, "{\\i1}Edited, text\\NAnother line");
  assert.equal(again.entries[0].fields[4], "Name");
});
test("time rounding and invalid input", () => {
  assert.equal(formatTime(59.999), "0:01:00.00");
  assert.equal(parseTime("1:02:03.45"), 3723.45);
  assert.throws(() => parseTime("0:61:00.00"));
  assert.throws(() => parseASS("[Events]\n"));
});
test("text preview removes styling without changing stored text", () => {
  assert.equal(plainText("{\\i1}Hello\\Nworld\\h!"), "Hello\nworld !");
});
test("single-language text, BOM, CRLF and event field order", () => {
  const p = parseASS(
    "\uFEFF[Events]\r\nFormat: Start, End, Layer, Text\r\nDialogue: 0:00:00.00,0:00:01.00,0,只有一行字幕，包含逗号",
  );
  assert.equal(p.entries[0].text, "只有一行字幕，包含逗号");
  assert.equal(parseASS(exportASS(p)).entries[0].text, p.entries[0].text);
});
test("old saved drafts retain both text fields when migrated", () => {
  const p = parseASS(fixture);
  delete p.entries[0].text;
  p.entries[0].source = "Edited source";
  p.entries[0].translation = "Edited second line";
  p.entries[0].reviewed = true;
  const migrated = migrateProject(p);
  assert.equal(migrated.entries[0].text, "Edited source\\NEdited second line");
  assert.equal(migrated.entries[0].reviewed, true);
  assert.equal(migrated.entries[0].source, undefined);
  assert.equal(
    migrateProject(migrated).entries[0].text,
    migrated.entries[0].text,
  );
});
test("timeline fits subtitle duration independently of video duration", () => {
  const entries = [
    { start: 0, end: 0.2 },
    { start: 3600, end: 3604 },
    { start: 5, end: 11 },
  ];
  const near = timelineRange(entries, 0);
  assert.equal(near.start, 0);
  assert.ok(near.end < 2);
  const far = timelineRange(entries, 1);
  assert.ok(far.start < 3600 && far.end > 3604);
  assert.ok(far.end - far.start < 10);
  assert.deepEqual(timelineRange(entries, 0, "all"), { start: 0, end: 3604 });
});
