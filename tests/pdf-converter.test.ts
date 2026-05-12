import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MdToPdfConverter } from "../src/pdf-converter.js";
import { PDFDocument } from "pdf-lib";
import * as fs from "node:fs";
import * as path from "node:path";

describe("MdToPdfConverter", () => {
  let converter: MdToPdfConverter;
  const testDir = path.join(process.cwd(), "tests", "fixtures", "pdf-test");

  beforeEach(() => {
    converter = new MdToPdfConverter();
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(async () => {
    await converter.cleanup();
  });

  describe("convert", () => {
    it("should convert simple markdown to pdf buffer", async () => {
      const markdown = "# Hello World\n\nThis is a test.";
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(result.toString("utf-8", 0, 4)).toBe("%PDF");
    });

    it("should handle GFM tables", async () => {
      const markdown = `
# Table Test

| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
`;
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle bold and italic text", async () => {
      const markdown = "**Bold** and *italic* text.";
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle code blocks", async () => {
      const markdown = `
\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`
`;
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle lists", async () => {
      const markdown = `
- Item 1
- Item 2
  - Sub item 2.1
  - Sub item 2.2
- Item 3

1. First
2. Second
3. Third
`;
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("convertWithMermaid", () => {
    it("should convert markdown with mermaid flowchart to pdf", async () => {
      const markdown = `
# Flowchart Example

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[End]
\`\`\`
`;
      const result = await converter.convertWithMermaid(markdown);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(result.toString("utf-8", 0, 4)).toBe("%PDF");
    });

    it("should handle sequence diagrams", async () => {
      const markdown = `
# Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B->>A: Hi Alice
\`\`\`
`;
      const result = await converter.convertWithMermaid(markdown);

      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle multiple mermaid diagrams", async () => {
      const markdown = `
# Multiple Diagrams

## Flowchart
\`\`\`mermaid
flowchart LR
    A --> B --> C
\`\`\`

## Pie Chart
\`\`\`mermaid
pie title Pets
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15
\`\`\`
`;
      const result = await converter.convertWithMermaid(markdown);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("convertFile", () => {
    const testMdFile = path.join(testDir, "test.md");
    const outputFile = path.join(testDir, "output.pdf");

    beforeEach(() => {
      fs.writeFileSync(testMdFile, "# Test File\n\nContent here.");
    });

    afterEach(() => {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    });

    it("should convert a markdown file to pdf file", async () => {
      await converter.convertFile(testMdFile, outputFile);

      expect(fs.existsSync(outputFile)).toBe(true);
      const stats = fs.statSync(outputFile);
      expect(stats.size).toBeGreaterThan(0);

      // Verify it's a valid PDF
      const buffer = fs.readFileSync(outputFile);
      expect(buffer.toString("utf-8", 0, 4)).toBe("%PDF");
    });

    it("should auto-detect mermaid and use convertWithMermaid", async () => {
      const mermaidMd = path.join(testDir, "mermaid.md");
      const mermaidPdf = path.join(testDir, "mermaid.pdf");
      fs.writeFileSync(mermaidMd, `# Test\n\n\`\`\`mermaid\nflowchart TD\n    A --> B\n\`\`\``);

      await converter.convertFile(mermaidMd, mermaidPdf, { enableMermaid: true });

      expect(fs.existsSync(mermaidPdf)).toBe(true);

      // Cleanup
      fs.unlinkSync(mermaidMd);
      fs.unlinkSync(mermaidPdf);
    });

    it("should throw error for non-existent input file", async () => {
      await expect(
        converter.convertFile("/non/existent/file.md", outputFile)
      ).rejects.toThrow();
    });
  });

  describe("convertDirectory", () => {
    const mergeDir = path.join(testDir, "merge");
    const outputFile = path.join(testDir, "merged.pdf");

    beforeEach(() => {
      if (fs.existsSync(mergeDir)) {
        fs.rmSync(mergeDir, { recursive: true });
      }
      fs.mkdirSync(mergeDir, { recursive: true });

      fs.writeFileSync(path.join(mergeDir, "00-intro.md"), "# Introduction\n\nThis is the intro.");
      fs.writeFileSync(path.join(mergeDir, "01-chapter1.md"), "# Chapter 1\n\nFirst chapter content.");
      fs.writeFileSync(path.join(mergeDir, "02-chapter2.md"), "# Chapter 2\n\nSecond chapter content.");
    });

    afterEach(() => {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    });

    it("should merge multiple markdown files to single pdf", async () => {
      await converter.convertDirectory(mergeDir, outputFile);

      expect(fs.existsSync(outputFile)).toBe(true);
      const stats = fs.statSync(outputFile);
      expect(stats.size).toBeGreaterThan(0);
    });

    it("should throw error for non-existent directory", async () => {
      await expect(
        converter.convertDirectory("/non/existent/dir", outputFile)
      ).rejects.toThrow("Input directory not found");
    });

    it("should throw error for empty directory", async () => {
      const emptyDir = path.join(testDir, "empty");
      fs.mkdirSync(emptyDir, { recursive: true });

      await expect(
        converter.convertDirectory(emptyDir, outputFile)
      ).rejects.toThrow("No markdown files found");
    });
  });

  describe("convertFiles", () => {
    const filesDir = path.join(testDir, "files");
    const outputFile = path.join(testDir, "merged-files.pdf");

    beforeEach(() => {
      if (fs.existsSync(filesDir)) {
        fs.rmSync(filesDir, { recursive: true });
      }
      fs.mkdirSync(filesDir, { recursive: true });

      fs.writeFileSync(path.join(filesDir, "a.md"), "# File A\n\nContent A.");
      fs.writeFileSync(path.join(filesDir, "b.md"), "# File B\n\nContent B.");
    });

    afterEach(() => {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    });

    it("should merge specified files in given order", async () => {
      const files = [
        path.join(filesDir, "b.md"),
        path.join(filesDir, "a.md"),
      ];
      await converter.convertFiles(files, outputFile);

      expect(fs.existsSync(outputFile)).toBe(true);
      const stats = fs.statSync(outputFile);
      expect(stats.size).toBeGreaterThan(0);
    });

    it("should throw error when no files provided", async () => {
      await expect(
        converter.convertFiles([], outputFile)
      ).rejects.toThrow("No input files provided");
    });

    it("should throw error for non-existent file in list", async () => {
      const files = [
        path.join(filesDir, "a.md"),
        "/non/existent/file.md",
      ];
      await expect(
        converter.convertFiles(files, outputFile)
      ).rejects.toThrow("Input file not found");
    });
  });

  describe("containsMermaid", () => {
    it("should detect mermaid code blocks", () => {
      const markdown = "# Test\n\n```mermaid\nflowchart TD\n    A --> B\n```";
      expect(converter.containsMermaid(markdown)).toBe(true);
    });

    it("should return false for markdown without mermaid", () => {
      const markdown = "# Test\n\n```javascript\nconsole.log('hello');\n```";
      expect(converter.containsMermaid(markdown)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty markdown", async () => {
      const result = await converter.convert("");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // Should still produce a valid PDF
      expect(result.toString("utf-8", 0, 4)).toBe("%PDF");
    });

    it("should handle markdown with only whitespace", async () => {
      const result = await converter.convert("   \n\n  \t  \n");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString("utf-8", 0, 4)).toBe("%PDF");
    });

    it("should handle very long markdown content", async () => {
      const longContent = "# Long Document\n\n" + "This is a paragraph.\n\n".repeat(500);
      const result = await converter.convert(longContent);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle unicode characters", async () => {
      const markdown = "# 中文標題\n\nこんにちは 🎉 émoji test";
      const result = await converter.convert(markdown);
      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle markdown with special characters", async () => {
      const markdown = "# Test <>&\"' special chars\n\n`code with <html>`";
      const result = await converter.convert(markdown);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("Custom Options", () => {
    it("should accept custom format option", async () => {
      const markdown = "# Letter Format Test";
      const result = await converter.convert(markdown, { format: "Letter" });
      expect(result).toBeInstanceOf(Buffer);
    });

    it("should accept custom margin options", async () => {
      const markdown = "# Custom Margins";
      const result = await converter.convert(markdown, {
        margin: {
          top: "10mm",
          right: "15mm",
          bottom: "10mm",
          left: "15mm",
        },
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it("should accept custom mermaidTimeout option", async () => {
      const markdown = `# Test\n\n\`\`\`mermaid\nflowchart TD\n    A --> B\n\`\`\``;
      const result = await converter.convertWithMermaid(markdown, {
        mermaidTimeout: 60000,
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it("should handle useLocalStyleFallback option", async () => {
      const markdown = "# Fallback Style Test";
      const result = await converter.convertWithMermaid(markdown, {
        useLocalStyleFallback: true,
      });
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("Error Handling", () => {
    it("should provide meaningful error for non-existent input file", async () => {
      const outputFile = path.join(testDir, "error-output.pdf");
      await expect(
        converter.convertFile("/non/existent/path/file.md", outputFile)
      ).rejects.toThrow(/Input file not found/);
    });

    it("should provide meaningful error for directory as input file", async () => {
      const outputFile = path.join(testDir, "error-output.pdf");
      await expect(
        converter.convertFile(testDir, outputFile)
      ).rejects.toThrow(/Not a file/);
    });

    it("should surface a meaningful error when the output file write fails", async () => {
      const writeSpy = vi
        .spyOn(fs.promises, "writeFile")
        .mockRejectedValueOnce(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }));

      const inputMd = path.join(testDir, "perm-test.md");
      const outputFile = path.join(testDir, "perm-output.pdf");
      fs.writeFileSync(inputMd, "# Permission test\n\nContent.");

      try {
        await expect(converter.convertFile(inputMd, outputFile)).rejects.toThrow(
          /Failed to write output file/
        );
      } finally {
        writeSpy.mockRestore();
        if (fs.existsSync(inputMd)) fs.unlinkSync(inputMd);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      }
    });
  });

  describe("Resource Cleanup", () => {
    it("should clear the internal browser reference after cleanup", async () => {
      const markdown = "# Cleanup Test";
      await converter.convert(markdown);

      const browserBefore = (converter as unknown as { browser?: { close: () => Promise<void> } }).browser;
      expect(browserBefore).toBeDefined();

      await converter.cleanup();

      const browserAfter = (converter as unknown as { browser?: unknown }).browser;
      expect(browserAfter).toBeUndefined();
    });

    it("should call browser.close() on cleanup", async () => {
      const markdown = "# Cleanup Test";
      await converter.convert(markdown);

      const browser = (converter as unknown as { browser: { close: () => Promise<void> } }).browser;
      const closeSpy = vi.spyOn(browser, "close");

      await converter.cleanup();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it("should leave a clean state after a failed convertFile call", async () => {
      await expect(
        converter.convertFile("/non/existent/file.md", "output.pdf")
      ).rejects.toThrow();

      // Browser should never have launched for a pre-flight failure path.
      const browser = (converter as unknown as { browser?: unknown }).browser;
      expect(browser).toBeUndefined();

      // cleanup() should still be safe to call.
      await expect(converter.cleanup()).resolves.toBeUndefined();
    });

    it("should be idempotent across multiple cleanup calls", async () => {
      await converter.cleanup();
      await converter.cleanup();
      const browser = (converter as unknown as { browser?: unknown }).browser;
      expect(browser).toBeUndefined();
    });
  });

  describe("Separator Options", () => {
    const sepTestDir = path.join(testDir, "separator-test");
    const outputFile = path.join(testDir, "sep-output.pdf");

    beforeEach(() => {
      if (fs.existsSync(sepTestDir)) {
        fs.rmSync(sepTestDir, { recursive: true });
      }
      fs.mkdirSync(sepTestDir, { recursive: true });
      fs.writeFileSync(path.join(sepTestDir, "01.md"), "# Part 1\n\nContent 1");
      fs.writeFileSync(path.join(sepTestDir, "02.md"), "# Part 2\n\nContent 2");
    });

    afterEach(() => {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    });

    it("should use pagebreak separator by default", async () => {
      await converter.convertDirectory(sepTestDir, outputFile);
      expect(fs.existsSync(outputFile)).toBe(true);
    });

    it("should support hr separator", async () => {
      await converter.convertDirectory(sepTestDir, outputFile, { separator: "hr" });
      expect(fs.existsSync(outputFile)).toBe(true);
    });

    it("should support none separator", async () => {
      await converter.convertDirectory(sepTestDir, outputFile, { separator: "none" });
      expect(fs.existsSync(outputFile)).toBe(true);
    });

    it("should produce one PDF page per source file when using pagebreak (pdf-lib merge)", async () => {
      // Three single-line files should yield three single-page PDFs which
      // pdf-lib joins into a 3-page output.
      const tripleDir = path.join(testDir, "triple");
      if (fs.existsSync(tripleDir)) fs.rmSync(tripleDir, { recursive: true });
      fs.mkdirSync(tripleDir, { recursive: true });
      fs.writeFileSync(path.join(tripleDir, "01.md"), "# Page One\n\nA");
      fs.writeFileSync(path.join(tripleDir, "02.md"), "# Page Two\n\nB");
      fs.writeFileSync(path.join(tripleDir, "03.md"), "# Page Three\n\nC");

      const tripleOut = path.join(testDir, "triple.pdf");
      try {
        await converter.convertDirectory(tripleDir, tripleOut, { separator: "pagebreak" });
        const buffer = fs.readFileSync(tripleOut);
        const pdfDoc = await PDFDocument.load(buffer);
        expect(pdfDoc.getPageCount()).toBe(3);
      } finally {
        if (fs.existsSync(tripleOut)) fs.unlinkSync(tripleOut);
        fs.rmSync(tripleDir, { recursive: true });
      }
    });
  });
});
