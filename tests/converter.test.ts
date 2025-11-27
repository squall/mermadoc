import { describe, it, expect, beforeEach } from "vitest";
import { MdToDocxConverter } from "../src/converter.js";
import * as fs from "node:fs";
import * as path from "node:path";

describe("MdToDocxConverter", () => {
  let converter: MdToDocxConverter;

  beforeEach(() => {
    converter = new MdToDocxConverter();
  });

  describe("convert", () => {
    it("should convert simple markdown to docx buffer", async () => {
      const markdown = "# Hello World\n\nThis is a test.";
      const result = await converter.convert(markdown);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
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
    it("should convert markdown with mermaid diagram to docx", async () => {
      const markdown = `
# Flowchart Example

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[End]
\`\`\`
`;
      const result = await converter.convert(markdown, { enableMermaid: true });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
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
      const result = await converter.convert(markdown, { enableMermaid: true });

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("convertFile", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    const testMdFile = path.join(testDir, "test.md");
    const outputFile = path.join(testDir, "output.docx");

    beforeEach(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      fs.writeFileSync(testMdFile, "# Test File\n\nContent here.");
    });

    it("should convert a markdown file to docx file", async () => {
      await converter.convertFile(testMdFile, outputFile);

      expect(fs.existsSync(outputFile)).toBe(true);
      const stats = fs.statSync(outputFile);
      expect(stats.size).toBeGreaterThan(0);
    });

    it("should throw error for non-existent input file", async () => {
      await expect(
        converter.convertFile("/non/existent/file.md", outputFile)
      ).rejects.toThrow();
    });
  });

  describe("convertDirectory", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures", "merge-test");
    const outputFile = path.join(testDir, "merged.docx");

    beforeEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
      fs.mkdirSync(testDir, { recursive: true });

      // 建立測試用的 markdown 檔案
      fs.writeFileSync(path.join(testDir, "00-intro.md"), "# Introduction\n\nThis is the intro.");
      fs.writeFileSync(path.join(testDir, "01-chapter1.md"), "# Chapter 1\n\nFirst chapter content.");
      fs.writeFileSync(path.join(testDir, "02-chapter2.md"), "# Chapter 2\n\nSecond chapter content.");
    });

    it("should merge multiple markdown files in natural order", async () => {
      await converter.convertDirectory(testDir, outputFile);

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
    const testDir = path.join(process.cwd(), "tests", "fixtures", "files-test");
    const outputFile = path.join(testDir, "merged.docx");

    beforeEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
      fs.mkdirSync(testDir, { recursive: true });

      fs.writeFileSync(path.join(testDir, "a.md"), "# File A\n\nContent A.");
      fs.writeFileSync(path.join(testDir, "b.md"), "# File B\n\nContent B.");
    });

    it("should merge specified files in given order", async () => {
      const files = [
        path.join(testDir, "b.md"),
        path.join(testDir, "a.md"),
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
        path.join(testDir, "a.md"),
        "/non/existent/file.md",
      ];
      await expect(
        converter.convertFiles(files, outputFile)
      ).rejects.toThrow("Input file not found");
    });
  });
});
