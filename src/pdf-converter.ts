import puppeteer, { Browser, Page } from "puppeteer";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MermaidRenderer } from "./mermaid-renderer.js";

export interface PdfConvertOptions {
  enableMermaid?: boolean;
  /** PDF page format */
  format?: "A4" | "Letter" | "Legal";
  /** PDF margins */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  /** Mermaid PNG resolution (default: 150, range: 72-600). */
  imageDpi?: number;
  /**
   * @deprecated Mermaid is now pre-rendered to PNG before reaching the browser,
   * so an in-page rendering timeout is no longer applied. Accepted for backwards
   * compatibility but ignored.
   */
  mermaidTimeout?: number;
  /**
   * Custom stylesheet URL. Network access is disabled by default for security;
   * passing a URL here re-enables fetching only that origin.
   */
  stylesheetUrl?: string;
  /**
   * @deprecated Styles are always bundled locally now. Accepted for backwards
   * compatibility but ignored.
   */
  useLocalStyleFallback?: boolean;
}

export interface PdfMergeOptions extends PdfConvertOptions {
  /** Custom file sorting function */
  sortFn?: (a: string, b: string) => number;
  /** Section separator */
  separator?: "pagebreak" | "hr" | "none";
}

const PDF_CONSTANTS = {
  FORMAT: "A4" as const,
  MARGIN: {
    TOP: "20mm",
    RIGHT: "20mm",
    BOTTOM: "20mm",
    LEFT: "20mm",
  },
  BODY_CLASS: "markdown-body",
  MERMAID_MARKER: "```mermaid",
  PAGE_TIMEOUT: 60000,
} as const;

/**
 * Restrict URIs (`href`, `src`, etc.) to safe schemes plus base64-encoded
 * inline images — Mermaid diagrams are pre-rendered to `data:image/png;base64,`
 * payloads, so they must pass through.
 */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|ftp):|#|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i;

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "a", "ul", "ol", "li",
    "code", "pre", "strong", "em", "b", "i",
    "blockquote", "hr", "br", "span", "div",
    "table", "thead", "tbody", "tr", "th", "td",
    "img", "sup", "sub", "del", "ins",
  ],
  ALLOWED_ATTR: ["href", "class", "id", "src", "alt", "title", "width", "height"],
  ALLOWED_URI_REGEXP,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
};

/**
 * Bundled GitHub-flavored Markdown stylesheet — replaces the CDN dependency so
 * the renderer works offline and resists supply-chain tampering.
 */
const BUNDLED_GITHUB_CSS = `
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    font-size: 16px;
    line-height: 1.5;
    word-wrap: break-word;
    color: #1f2328;
  }
  .markdown-body h1, .markdown-body h2 { border-bottom: 1px solid #d1d9e0b3; padding-bottom: 0.3em; }
  .markdown-body h1 { font-size: 2em; margin: 0.67em 0; }
  .markdown-body h2 { font-size: 1.5em; margin: 0.83em 0; }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body h4 { font-size: 1em; }
  .markdown-body h5 { font-size: 0.875em; }
  .markdown-body h6 { font-size: 0.85em; color: #59636e; }
  .markdown-body p, .markdown-body blockquote, .markdown-body ul, .markdown-body ol, .markdown-body pre, .markdown-body table { margin-top: 0; margin-bottom: 16px; }
  .markdown-body code { background-color: #818b981f; padding: 0.2em 0.4em; border-radius: 6px; font-size: 85%; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; }
  .markdown-body pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; font-size: 85%; }
  .markdown-body pre code { background: transparent; padding: 0; font-size: 100%; }
  .markdown-body blockquote { border-left: 0.25em solid #d1d9e0; padding: 0 1em; color: #59636e; }
  .markdown-body table { border-collapse: collapse; width: max-content; max-width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #d1d9e0b3; padding: 6px 13px; }
  .markdown-body th { background-color: #f6f8fa; font-weight: 600; }
  .markdown-body img { max-width: 100%; box-sizing: content-box; }
  .markdown-body a { color: #0969da; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d1d9e0b3; border: 0; }
  .markdown-body ul, .markdown-body ol { padding-left: 2em; }
  .markdown-body li + li { margin-top: 0.25em; }
`;

/**
 * Async, non-throwing temp file cleanup.
 */
async function safeCleanupFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Determines whether the given separator option requires inserting markdown
 * between merged files.
 */
function getSeparatorMarkdown(separator: "pagebreak" | "hr" | "none"): string {
  if (separator === "pagebreak") return "\n\n<div style=\"page-break-after: always;\"></div>\n\n";
  if (separator === "hr") return "\n\n---\n\n";
  return "";
}

export class MdToPdfConverter {
  private tempDir: string;
  private browser?: Browser;
  private mermaidRenderer: MermaidRenderer;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), "md-docx-pdf");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    // Use the shared Mermaid renderer so PDF runs hit the same on-disk PNG
    // cache as DOCX runs (md-docx-mermaid temp dir).
    this.mermaidRenderer = new MermaidRenderer();
  }

  containsMermaid(markdown: string): boolean {
    return markdown.includes(PDF_CONSTANTS.MERMAID_MARKER);
  }

  /**
   * Lazily launches Chromium and reuses the same browser instance across
   * subsequent conversions in the same process. Callers must invoke
   * `cleanup()` when finished to release the browser.
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }
    this.browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    });
    return this.browser;
  }

  /**
   * Configures a Page to block all network traffic except local Puppeteer
   * injections, optionally allow-listing a single stylesheet origin.
   */
  private async applyNetworkPolicy(page: Page, allowStylesheetUrl?: string): Promise<void> {
    const allowedOrigin = allowStylesheetUrl ? new URL(allowStylesheetUrl).origin : null;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) {
        req.continue();
        return;
      }
      if (allowedOrigin && req.resourceType() === "stylesheet") {
        try {
          if (new URL(url).origin === allowedOrigin) {
            req.continue();
            return;
          }
        } catch {
          // fall through to abort
        }
      }
      req.abort();
    });
  }

  private buildHtml(htmlContent: string, stylesheetUrl?: string): string {
    const externalStylesheet = stylesheetUrl
      ? `<link rel="stylesheet" href="${stylesheetUrl}" onerror="this.onerror=null;this.remove();">`
      : "";
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${externalStylesheet}
  <style>
    ${BUNDLED_GITHUB_CSS}
    body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    .mermaid { text-align: center; margin: 20px 0; }
    .mermaid-error {
      color: #d73a49;
      background-color: #ffeef0;
      border: 1px solid #d73a49;
      border-radius: 6px;
      padding: 16px;
      margin: 20px 0;
    }
  </style>
</head>
<body class="${PDF_CONSTANTS.BODY_CLASS}">
${htmlContent}
</body>
</html>`;
  }

  /**
   * Renders a sanitized HTML document to PDF using a reused Puppeteer browser.
   */
  private async renderHtmlToPdf(
    sanitizedHtml: string,
    options: PdfConvertOptions
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    let page: Page | undefined;
    try {
      page = await browser.newPage();
      page.setDefaultTimeout(PDF_CONSTANTS.PAGE_TIMEOUT);
      await this.applyNetworkPolicy(page, options.stylesheetUrl);

      const fullHtml = this.buildHtml(sanitizedHtml, options.stylesheetUrl);
      await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

      const format = options.format || PDF_CONSTANTS.FORMAT;
      const margin = {
        top: options.margin?.top || PDF_CONSTANTS.MARGIN.TOP,
        right: options.margin?.right || PDF_CONSTANTS.MARGIN.RIGHT,
        bottom: options.margin?.bottom || PDF_CONSTANTS.MARGIN.BOTTOM,
        left: options.margin?.left || PDF_CONSTANTS.MARGIN.LEFT,
      };

      const pdfBuffer = await page.pdf({
        format,
        margin,
        printBackground: true,
      });
      return Buffer.from(pdfBuffer);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          console.warn("Failed to close page:", error instanceof Error ? error.message : error);
        }
      }
    }
  }

  /**
   * Convert markdown string to PDF buffer. When `enableMermaid` is true and
   * the document contains Mermaid fences, they are pre-rendered to base64
   * PNGs (shared cache with DOCX) before reaching the browser — the page
   * itself never executes any Mermaid JavaScript.
   */
  async convert(markdown: string, options: PdfConvertOptions = {}): Promise<Buffer> {
    let processedMarkdown = markdown;
    if (options.enableMermaid && this.containsMermaid(markdown)) {
      try {
        processedMarkdown = await this.mermaidRenderer.preprocessToMarkdown(
          markdown,
          options.imageDpi ?? 150
        );
      } catch (error) {
        throw new Error(
          `Mermaid pre-rendering failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    let rawHtml: string;
    try {
      rawHtml = await marked.parse(processedMarkdown);
    } catch (error) {
      throw new Error(
        `Markdown parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const sanitized = DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG);
    if (!sanitized || sanitized.trim() === "") {
      if (rawHtml && rawHtml.trim() !== "") {
        console.warn("Warning: HTML content was sanitized to empty - possible malicious content detected");
      }
    }

    try {
      return await this.renderHtmlToPdf(sanitized, options);
    } catch (error) {
      throw new Error(
        `PDF generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Convenience alias that forces Mermaid rendering on.
   */
  async convertWithMermaid(markdown: string, options: PdfConvertOptions = {}): Promise<Buffer> {
    return this.convert(markdown, { ...options, enableMermaid: true });
  }

  private async ensureOutputDir(absoluteOutputPath: string): Promise<void> {
    const outputDir = path.dirname(absoluteOutputPath);
    try {
      if (!fs.existsSync(outputDir)) {
        await fs.promises.mkdir(outputDir, { recursive: true });
      }
    } catch (error) {
      throw new Error(
        `Failed to create output directory ${outputDir}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async convertFile(
    inputPath: string,
    outputPath: string,
    options: PdfConvertOptions = {}
  ): Promise<void> {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);

    if (!fs.existsSync(absoluteInputPath)) {
      throw new Error(`Input file not found: ${absoluteInputPath}`);
    }
    const stat = fs.statSync(absoluteInputPath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${absoluteInputPath}`);
    }

    let markdown: string;
    try {
      markdown = await fs.promises.readFile(absoluteInputPath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read input file ${absoluteInputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    let buffer: Buffer;
    try {
      buffer = await this.convert(markdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed for ${absoluteInputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    await this.ensureOutputDir(absoluteOutputPath);
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

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

  private async readFileAsync(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read file ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async convertDirectory(
    inputDir: string,
    outputPath: string,
    options: PdfMergeOptions = {}
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

    let files: string[];
    try {
      files = (await fs.promises.readdir(absoluteInputDir))
        .filter((file) => file.endsWith(".md"))
        .sort(options.sortFn || this.naturalSort.bind(this));
    } catch (error) {
      throw new Error(
        `Failed to read directory ${absoluteInputDir}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    if (files.length === 0) {
      throw new Error(`No markdown files found in: ${absoluteInputDir}`);
    }

    const separatorMarkdown = getSeparatorMarkdown(options.separator || "pagebreak");
    const filePaths = files.map((file) => path.join(absoluteInputDir, file));
    const contents = await Promise.all(filePaths.map((p) => this.readFileAsync(p)));
    const mergedMarkdown = contents.join(separatorMarkdown);

    let buffer: Buffer;
    try {
      buffer = await this.convert(mergedMarkdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed for directory ${absoluteInputDir}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    await this.ensureOutputDir(absoluteOutputPath);
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async convertFiles(
    inputPaths: string[],
    outputPath: string,
    options: PdfMergeOptions = {}
  ): Promise<void> {
    const absoluteOutputPath = path.resolve(outputPath);

    if (inputPaths.length === 0) {
      throw new Error("No input files provided");
    }

    const absoluteInputPaths = inputPaths.map((p) => path.resolve(p));
    for (const absoluteInputPath of absoluteInputPaths) {
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Input file not found: ${absoluteInputPath}`);
      }
    }

    const separatorMarkdown = getSeparatorMarkdown(options.separator || "pagebreak");
    const contents = await Promise.all(absoluteInputPaths.map((p) => this.readFileAsync(p)));
    const mergedMarkdown = contents.join(separatorMarkdown);

    let buffer: Buffer;
    try {
      buffer = await this.convert(mergedMarkdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    await this.ensureOutputDir(absoluteOutputPath);
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.warn("Failed to close browser during cleanup:", error instanceof Error ? error.message : error);
      }
      this.browser = undefined;
    }

    // Mermaid PNG cache is shared with DOCX runs; leave it in place so the
    // next conversion can reuse it. Only purge our own temp dir.
    if (fs.existsSync(this.tempDir)) {
      try {
        const files = await fs.promises.readdir(this.tempDir);
        await Promise.all(
          files.map((file) => safeCleanupFile(path.join(this.tempDir, file)))
        );
      } catch (error) {
        console.warn("Failed to cleanup temp directory:", error instanceof Error ? error.message : error);
      }
    }
  }
}
