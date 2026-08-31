import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { inlineLocalImages } from "../src/image-inliner.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

describe("inlineLocalImages", () => {
  let tmpDir: string;
  let imgPath: string;
  let subDir: string;
  let subImgPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "img-inliner-"));
    imgPath = path.join(tmpDir, "logo.png");
    fs.writeFileSync(imgPath, TINY_PNG);

    subDir = path.join(tmpDir, "assets");
    fs.mkdirSync(subDir);
    subImgPath = path.join(subDir, "nested.png");
    fs.writeFileSync(subImgPath, TINY_PNG);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inlines a relative image path as a data URI", () => {
    const md = "![alt](./logo.png)";
    const result = inlineLocalImages(md, tmpDir);
    expect(result).toMatch(/^!\[alt\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)$/);
  });

  it("inlines a nested relative path", () => {
    const md = "![nested](./assets/nested.png)";
    const result = inlineLocalImages(md, tmpDir);
    expect(result).toContain("data:image/png;base64,");
    expect(result).not.toContain("./assets/nested.png");
  });

  it("inlines an absolute filesystem path", () => {
    const md = `![abs](${imgPath})`;
    const result = inlineLocalImages(md, "/some/unrelated/dir");
    expect(result).toContain("data:image/png;base64,");
  });

  it("passes http(s) URLs through untouched", () => {
    const md = "![web](https://example.com/x.png)";
    expect(inlineLocalImages(md, tmpDir)).toBe(md);
  });

  it("passes existing data URIs through untouched", () => {
    const md = "![inline](data:image/png;base64,iVBORw)";
    expect(inlineLocalImages(md, tmpDir)).toBe(md);
  });

  it("preserves the optional title", () => {
    const md = `![alt](./logo.png "Logo title")`;
    const result = inlineLocalImages(md, tmpDir);
    expect(result).toMatch(/data:image\/png;base64,[^)]+ "Logo title"\)$/);
  });

  it("leaves the reference intact when the file is missing", () => {
    const onMissing = vi.fn();
    const md = "![missing](./does-not-exist.png)";
    const result = inlineLocalImages(md, tmpDir, { onMissing });
    expect(result).toBe(md);
    expect(onMissing).toHaveBeenCalledOnce();
  });

  it("returns the markdown unchanged when baseDir is empty", () => {
    const md = "![alt](./logo.png)";
    expect(inlineLocalImages(md, "")).toBe(md);
  });

  it("inlines multiple images in one pass", () => {
    const md = `
# title
![a](./logo.png)

![b](./assets/nested.png)

[not-an-image](./logo.png)
`;
    const result = inlineLocalImages(md, tmpDir);
    const matches = result.match(/data:image\/png;base64,/g);
    expect(matches).toHaveLength(2);
    expect(result).toContain("[not-an-image](./logo.png)"); // links untouched
  });

  it("respects maxBytes and skips oversized files", () => {
    const big = path.join(tmpDir, "big.png");
    fs.writeFileSync(big, Buffer.alloc(1024 * 50)); // 50KB
    const onMissing = vi.fn();
    const md = "![big](./big.png)";
    const result = inlineLocalImages(md, tmpDir, { maxBytes: 1024, onMissing });
    expect(result).toBe(md);
    expect(onMissing).toHaveBeenCalledWith(expect.stringContaining("big.png"), expect.stringMatching(/exceeds/));
  });

  it("infers correct mime type from extension", () => {
    const jpgPath = path.join(tmpDir, "photo.jpg");
    fs.writeFileSync(jpgPath, TINY_PNG); // content bytes don't matter for the mime mapping
    const md = "![jpg](./photo.jpg)";
    const result = inlineLocalImages(md, tmpDir);
    expect(result).toContain("data:image/jpeg;base64,");
  });

  it("skips unsupported extensions", () => {
    const txtPath = path.join(tmpDir, "note.txt");
    fs.writeFileSync(txtPath, "hi");
    const onMissing = vi.fn();
    const md = "![txt](./note.txt)";
    const result = inlineLocalImages(md, tmpDir, { onMissing });
    expect(result).toBe(md);
    expect(onMissing).toHaveBeenCalled();
  });
});
