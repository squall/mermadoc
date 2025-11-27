import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import { remarkDocx } from "@m2d/remark-docx";
import { listPlugin, mathPlugin, tablePlugin, emojiPlugin, imagePlugin } from "mdast2docx/dist/plugins";
import { codePlugin, disposeHighlighter } from "./code-plugin.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as crypto from "node:crypto";
import sharp from "sharp";

export interface ConvertOptions {
  enableMermaid?: boolean;
}

export interface MergeOptions extends ConvertOptions {
  /** Custom file sorting function, defaults to natural sort by filename */
  sortFn?: (a: string, b: string) => number;
  /** Section separator, defaults to page break */
  separator?: "pagebreak" | "hr" | "none";
}

interface MermaidBlock {
  code: string;
  startIndex: number;
  endIndex: number;
}

interface ImageData {
  type: string;
  data: ArrayBuffer;
  transformation: {
    width: number;
    height: number;
  };
}

const nodeImageResolver = async (
  src: string,
  options: { maxW: number; maxH: number; dpi: number; scale: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  let imageBuffer: Buffer;
  let imageType: "png" | "jpg" | "gif" | "bmp" = "png";

  if (src.startsWith("data:")) {
    const matches = src.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const type = matches[1] === "jpeg" ? "jpg" : matches[1];
      if (type === "jpg" || type === "png" || type === "gif" || type === "bmp") {
        imageType = type;
      }
      imageBuffer = Buffer.from(matches[2], "base64");
    } else {
      throw new Error("Invalid data URI format");
    }
  } else if (src.startsWith("http://") || src.startsWith("https://")) {
    const response = await fetch(src);
    imageBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
      imageType = "jpg";
    } else if (contentType?.includes("gif")) {
      imageType = "gif";
    } else if (contentType?.includes("png")) {
      imageType = "png";
    }
  } else {
    imageBuffer = fs.readFileSync(src);
    const ext = path.extname(src).toLowerCase().slice(1);
    if (ext === "jpg" || ext === "jpeg") {
      imageType = "jpg";
    } else if (ext === "png" || ext === "gif" || ext === "bmp") {
      imageType = ext;
    }
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 200;
  const height = metadata.height || 200;

  const maxWidthPixels = options.maxW * options.dpi;
  const maxHeightPixels = options.maxH * options.dpi;
  const scale = Math.min(maxWidthPixels / width, maxHeightPixels / height, 1);

  return {
    type: imageType,
    data: new Uint8Array(imageBuffer).buffer as ArrayBuffer,
    transformation: {
      width: width * scale,
      height: height * scale,
    },
  };
};

export class MdToDocxConverter {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), "md-docx-mermaid");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private extractMermaidBlocks(markdown: string): MermaidBlock[] {
    const blocks: MermaidBlock[] = [];
    const regex = /```mermaid\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        code: match[1].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return blocks;
  }

  private async renderMermaidToPng(mermaidCode: string): Promise<string> {
    const hash = crypto.createHash("md5").update(mermaidCode).digest("hex");
    const inputFile = path.join(this.tempDir, `${hash}.mmd`);
    const outputFile = path.join(this.tempDir, `${hash}.png`);

    if (fs.existsSync(outputFile)) {
      return outputFile;
    }

    fs.writeFileSync(inputFile, mermaidCode);

    const mmdc = path.join(
      process.cwd(),
      "node_modules",
      ".bin",
      "mmdc"
    );

    return new Promise((resolve, reject) => {
      const proc = spawn(mmdc, [
        "-i", inputFile,
        "-o", outputFile,
        "-b", "white",
        "-s", "2",
      ]);

      let stderr = "";
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Mermaid rendering failed: ${stderr}`));
          return;
        }

        if (!fs.existsSync(outputFile)) {
          reject(new Error("Mermaid output file not created"));
          return;
        }

        resolve(outputFile);
      });

      proc.on("error", reject);
    });
  }

  private async preprocessMermaid(markdown: string): Promise<string> {
    const blocks = this.extractMermaidBlocks(markdown);

    if (blocks.length === 0) {
      return markdown;
    }

    let result = markdown;
    let offset = 0;

    for (const block of blocks) {
      try {
        const pngPath = await this.renderMermaidToPng(block.code);
        const pngBuffer = fs.readFileSync(pngPath);
        const base64 = pngBuffer.toString("base64");
        const dataUri = `data:image/png;base64,${base64}`;
        const imgMarkdown = `\n\n![Mermaid Diagram](${dataUri})\n\n`;

        const adjustedStart = block.startIndex + offset;
        const adjustedEnd = block.endIndex + offset;

        result =
          result.substring(0, adjustedStart) +
          imgMarkdown +
          result.substring(adjustedEnd);

        offset += imgMarkdown.length - (block.endIndex - block.startIndex);
      } catch (error) {
        console.error(`Failed to render mermaid block: ${error}`);
      }
    }

    return result;
  }

  async convert(markdown: string, options: ConvertOptions = {}): Promise<Buffer> {
    const { enableMermaid = false } = options;

    let processedMarkdown = markdown;
    if (enableMermaid) {
      processedMarkdown = await this.preprocessMermaid(markdown);
    }

    const sectionProps = {
      plugins: [
        listPlugin(),
        mathPlugin(),
        tablePlugin(),
        emojiPlugin(),
        codePlugin({
          backgroundColor: "F6F8FA",
          fontFamily: "Consolas",
          fontSize: 20,
          showLineNumbers: false,
        }),
        imagePlugin({
          imageResolver: nodeImageResolver,
          cacheConfig: { cacheMode: "memory" },
        }),
      ],
    };

    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter)
      .use(remarkMath)
      .use(remarkDocx, "nodebuffer", undefined, sectionProps);

    const result = await processor.process(processedMarkdown);
    const buffer = await result.result;

    if (buffer instanceof Buffer) {
      return buffer;
    }

    if (buffer instanceof Uint8Array) {
      return Buffer.from(buffer);
    }

    throw new Error("Unexpected result type from docx conversion");
  }

  async convertFile(
    inputPath: string,
    outputPath: string,
    options: ConvertOptions = {}
  ): Promise<void> {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);

    if (!fs.existsSync(absoluteInputPath)) {
      throw new Error(`Input file not found: ${absoluteInputPath}`);
    }

    const markdown = fs.readFileSync(absoluteInputPath, "utf-8");
    const buffer = await this.convert(markdown, options);

    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(absoluteOutputPath, buffer);
  }

  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    }
    // Cleanup shiki highlighter
    disposeHighlighter();
  }

  /**
   * Natural sort comparison function, supports numeric prefix sorting (00, 01, 02...)
   */
  private naturalSort(a: string, b: string): number {
    const regex = /(\d+)|(\D+)/g;
    const aParts = a.match(regex) || [];
    const bParts = b.match(regex) || [];

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || "";
      const bPart = bParts[i] || "";

      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
      } else {
        const cmp = aPart.localeCompare(bPart);
        if (cmp !== 0) return cmp;
      }
    }
    return 0;
  }

  /**
   * Merge multiple Markdown files in a directory into a single DOCX
   */
  async convertDirectory(
    inputDir: string,
    outputPath: string,
    options: MergeOptions = {}
  ): Promise<void> {
    const absoluteInputDir = path.resolve(inputDir);
    const absoluteOutputPath = path.resolve(outputPath);

    if (!fs.existsSync(absoluteInputDir)) {
      throw new Error(`Input directory not found: ${absoluteInputDir}`);
    }

    const stat = fs.statSync(absoluteInputDir);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absoluteInputDir}`);
    }

    // Get all .md files
    const files = fs.readdirSync(absoluteInputDir)
      .filter(file => file.endsWith(".md"))
      .sort(options.sortFn || this.naturalSort.bind(this));

    if (files.length === 0) {
      throw new Error(`No markdown files found in: ${absoluteInputDir}`);
    }

    // Determine separator
    const separator = options.separator || "pagebreak";
    let separatorMarkdown = "";
    if (separator === "pagebreak") {
      separatorMarkdown = "\n\n<div style=\"page-break-after: always;\"></div>\n\n";
    } else if (separator === "hr") {
      separatorMarkdown = "\n\n---\n\n";
    }

    // Merge all Markdown contents
    const contents: string[] = [];
    for (const file of files) {
      const filePath = path.join(absoluteInputDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      contents.push(content);
    }

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Convert to DOCX
    const buffer = await this.convert(mergedMarkdown, options);

    // Ensure output directory exists
    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(absoluteOutputPath, buffer);
  }

  /**
   * Merge multiple Markdown files into a single DOCX
   */
  async convertFiles(
    inputPaths: string[],
    outputPath: string,
    options: MergeOptions = {}
  ): Promise<void> {
    const absoluteOutputPath = path.resolve(outputPath);

    if (inputPaths.length === 0) {
      throw new Error("No input files provided");
    }

    // Determine separator
    const separator = options.separator || "pagebreak";
    let separatorMarkdown = "";
    if (separator === "pagebreak") {
      separatorMarkdown = "\n\n<div style=\"page-break-after: always;\"></div>\n\n";
    } else if (separator === "hr") {
      separatorMarkdown = "\n\n---\n\n";
    }

    // Read and merge all files
    const contents: string[] = [];
    for (const inputPath of inputPaths) {
      const absoluteInputPath = path.resolve(inputPath);
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Input file not found: ${absoluteInputPath}`);
      }
      const content = fs.readFileSync(absoluteInputPath, "utf-8");
      contents.push(content);
    }

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Convert to DOCX
    const buffer = await this.convert(mergedMarkdown, options);

    // Ensure output directory exists
    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(absoluteOutputPath, buffer);
  }
}
