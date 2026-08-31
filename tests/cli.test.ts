import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("__exit__");
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("format detection", () => {
    it("should default format to docx when no flag or output is given", () => {
      const opts = parseArgs(["input.md"]);
      expect(opts.format).toBe("docx");
      expect(opts.input).toBe("input.md");
    });

    it("should set format=pdf when -f pdf is passed", () => {
      const opts = parseArgs(["input.md", "-f", "pdf"]);
      expect(opts.format).toBe("pdf");
    });

    it("should set format=pdf when --format pdf is passed", () => {
      const opts = parseArgs(["input.md", "--format", "pdf"]);
      expect(opts.format).toBe("pdf");
    });

    it("should accept format value case-insensitively", () => {
      const opts = parseArgs(["input.md", "-f", "PDF"]);
      expect(opts.format).toBe("pdf");
    });

    it("should infer format=pdf from -o out.pdf", () => {
      const opts = parseArgs(["input.md", "-o", "out.pdf"]);
      expect(opts.format).toBe("pdf");
    });

    it("should infer format=docx from -o out.docx", () => {
      const opts = parseArgs(["input.md", "-o", "out.docx"]);
      expect(opts.format).toBe("docx");
    });

    it("should let explicit -f override the extension inference", () => {
      const opts = parseArgs(["input.md", "-o", "out.docx", "-f", "pdf"]);
      expect(opts.format).toBe("pdf");
    });

    it("should call process.exit(1) on invalid format", () => {
      expect(() => parseArgs(["input.md", "-f", "html"])).toThrow("__exit__");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("other options", () => {
    it("should capture output path", () => {
      const opts = parseArgs(["input.md", "-o", "result.docx"]);
      expect(opts.output).toBe("result.docx");
    });

    it("should default separator to pagebreak", () => {
      const opts = parseArgs(["dir/"]);
      expect(opts.separator).toBe("pagebreak");
    });

    it("should accept -s hr", () => {
      const opts = parseArgs(["dir/", "-s", "hr"]);
      expect(opts.separator).toBe("hr");
    });

    it("should exit on invalid separator", () => {
      expect(() => parseArgs(["dir/", "-s", "weird"])).toThrow("__exit__");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should default mermaid to auto", () => {
      const opts = parseArgs(["input.md"]);
      expect(opts.mermaid).toBe("auto");
    });

    it("should set mermaid=true with -m", () => {
      const opts = parseArgs(["input.md", "-m"]);
      expect(opts.mermaid).toBe(true);
    });

    it("should set noMermaid with --no-mermaid", () => {
      const opts = parseArgs(["input.md", "--no-mermaid"]);
      expect(opts.noMermaid).toBe(true);
    });

    it("should capture saveImagesDir via -i", () => {
      const opts = parseArgs(["input.md", "-i", "./imgs"]);
      expect(opts.saveImagesDir).toBe("./imgs");
    });

    it("should accept valid DPI via -d", () => {
      const opts = parseArgs(["input.md", "-d", "300"]);
      expect(opts.imageDpi).toBe(300);
    });

    it("should ignore DPI outside the 72-600 range", () => {
      const opts = parseArgs(["input.md", "-d", "5000"]);
      expect(opts.imageDpi).toBeUndefined();
    });

    it("should ignore non-numeric DPI", () => {
      const opts = parseArgs(["input.md", "-d", "abc"]);
      expect(opts.imageDpi).toBeUndefined();
    });
  });
});
