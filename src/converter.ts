import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import { remarkDocx } from "@m2d/remark-docx";
import { listPlugin, mathPlugin, tablePlugin, emojiPlugin, imagePlugin } from "mdast2docx/dist/plugins";
import { codePlugin, disposeHighlighter } from "./code-plugin.js";
import { MermaidRenderer } from "./mermaid-renderer.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import sharp from "sharp";
import { inlineLocalImages } from "./image-inliner.js";

export interface ConvertOptions {
  enableMermaid?: boolean;
  /** Directory to save extracted images */
  saveImagesDir?: string;
  /** Image DPI/resolution (default: 150, range: 72-600) */
  imageDpi?: number;
  /**
   * Base directory used to resolve relative image paths. `convertFile()` and
   * `convertDirectory()` set this automatically. Pass explicitly when calling
   * `convert()` with a markdown string that contains `![](./relative.png)`.
   */
  baseDir?: string;
}

export interface MergeOptions extends ConvertOptions {
  /** Custom file sorting function, defaults to natural sort by filename */
  sortFn?: (a: string, b: string) => number;
  /** Section separator, defaults to page break */
  separator?: "pagebreak" | "hr" | "none";
}

interface ImageData {
  type: string;
  data: ArrayBuffer;
  transformation: {
    width: number;
    height: number;
  };
}

interface ImageSaveContext {
  saveImagesDir?: string;
  imageCounter: number;
  savedHashes: Set<string>;
}

/**
 * Save image buffer to specified directory (with deduplication)
 */
function saveImageToDir(
  imageBuffer: Buffer,
  imageType: string,
  context: ImageSaveContext
): void {
  if (!context.saveImagesDir) return;

  // Calculate hash to avoid duplicates
  const hash = crypto.createHash("md5").update(imageBuffer).digest("hex");
  if (context.savedHashes.has(hash)) {
    return;
  }
  context.savedHashes.add(hash);

  if (!fs.existsSync(context.saveImagesDir)) {
    fs.mkdirSync(context.saveImagesDir, { recursive: true });
  }

  context.imageCounter++;
  const filename = `image-${String(context.imageCounter).padStart(3, "0")}.${imageType}`;
  const filePath = path.join(context.saveImagesDir, filename);
  fs.writeFileSync(filePath, imageBuffer);
}

/**
 * Create an image resolver with optional image saving capability
 */
function createImageResolver(context: ImageSaveContext) {
  return async (
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

    // Save image to directory if configured
    saveImageToDir(imageBuffer, imageType, context);

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
}

export class MdToDocxConverter {
  private mermaidRenderer: MermaidRenderer;

  constructor() {
    this.mermaidRenderer = new MermaidRenderer();
  }

  async convert(markdown: string, options: ConvertOptions = {}): Promise<Buffer> {
    const {
      enableMermaid = false,
      saveImagesDir,
      imageDpi = 150,
    } = options;

    // Calculate scale from DPI (base DPI is 96)
    const imageScale = Math.max(1, imageDpi / 96);

    let processedMarkdown = markdown;
    if (options.baseDir) {
      processedMarkdown = inlineLocalImages(processedMarkdown, options.baseDir);
    }
    if (enableMermaid) {
      processedMarkdown = await this.mermaidRenderer.preprocessToMarkdown(processedMarkdown, imageDpi);
    }

    // Create image save context
    const imageSaveContext: ImageSaveContext = {
      saveImagesDir,
      imageCounter: 0,
      savedHashes: new Set<string>(),
    };

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
          imageResolver: createImageResolver(imageSaveContext),
          cacheConfig: { cacheMode: "memory" },
          scale: imageScale,
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
    const buffer = await this.convert(markdown, {
      ...options,
      baseDir: options.baseDir ?? path.dirname(absoluteInputPath),
    });

    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(absoluteOutputPath, buffer);
  }

  cleanup(): void {
    this.mermaidRenderer.cleanup();
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

    // Merge all Markdown contents — inline each file's relative images using
    // its own directory before joining, so paths stay correct after concat.
    const contents: string[] = [];
    for (const file of files) {
      const filePath = path.join(absoluteInputDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      contents.push(
        options.baseDir ? content : inlineLocalImages(content, path.dirname(filePath))
      );
    }

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Convert to DOCX — baseDir is already applied per-file; pass through
    // user-supplied baseDir for back-compat without re-inlining.
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

    // Read and merge all files — inline each file's relative images using
    // its own directory before joining.
    const contents: string[] = [];
    for (const inputPath of inputPaths) {
      const absoluteInputPath = path.resolve(inputPath);
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Input file not found: ${absoluteInputPath}`);
      }
      const content = fs.readFileSync(absoluteInputPath, "utf-8");
      contents.push(
        options.baseDir ? content : inlineLocalImages(content, path.dirname(absoluteInputPath))
      );
    }

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Convert to DOCX — baseDir already applied per-file above.
    const buffer = await this.convert(mergedMarkdown, options);

    // Ensure output directory exists
    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(absoluteOutputPath, buffer);
  }
}
