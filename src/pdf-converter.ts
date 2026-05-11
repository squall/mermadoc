import { mdToPdf } from "md-to-pdf";
import puppeteer, { Browser, Page } from "puppeteer";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * TypeScript declarations for window properties used in Mermaid rendering
 */
declare global {
  interface Window {
    mermaidRendered?: boolean;
    mermaidErrors?: string[];
  }
}

/**
 * PDF conversion options
 */
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
  /** Mermaid rendering timeout in milliseconds (default: 30000) */
  mermaidTimeout?: number;
  /** Custom stylesheet URL (default: GitHub markdown CSS from CDN) */
  stylesheetUrl?: string;
  /** Use local fallback if CDN unavailable */
  useLocalStyleFallback?: boolean;
}

/**
 * PDF merge options
 */
export interface PdfMergeOptions extends PdfConvertOptions {
  /** Custom file sorting function */
  sortFn?: (a: string, b: string) => number;
  /** Section separator */
  separator?: "pagebreak" | "hr" | "none";
}

/**
 * PDF constants
 */
const PDF_CONSTANTS = {
  FORMAT: "A4" as const,
  MARGIN: {
    TOP: "20mm",
    RIGHT: "20mm",
    BOTTOM: "20mm",
    LEFT: "20mm",
  },
  GITHUB_CSS_URL: "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css",
  BODY_CLASS: "markdown-body",
  MERMAID_TIMEOUT: 30000,
  MERMAID_POST_RENDER_DELAY: 1000,
  MERMAID_MARKER: "```mermaid",
  PAGE_TIMEOUT: 60000,
};

/**
 * Allowed HTML tags for DOMPurify sanitization
 */
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
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
};

/**
 * Local fallback CSS for when CDN is unavailable
 */
const LOCAL_FALLBACK_CSS = `
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    word-wrap: break-word;
  }
  .markdown-body h1, .markdown-body h2 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  .markdown-body h1 { font-size: 2em; }
  .markdown-body h2 { font-size: 1.5em; }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body code { background-color: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; }
  .markdown-body pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
  .markdown-body blockquote { border-left: 4px solid #dfe2e5; padding: 0 1em; color: #6a737d; }
  .markdown-body table { border-collapse: collapse; width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #dfe2e5; padding: 6px 13px; }
  .markdown-body th { background-color: #f6f8fa; }
`;

/**
 * Helper function for safe async file cleanup
 */
async function safeCleanupFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    // Log but don't throw - cleanup errors shouldn't affect main flow
    console.warn(`Failed to cleanup temp file ${filePath}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Markdown to PDF Converter
 */
export class MdToPdfConverter {
  private tempDir: string;
  private browser?: Browser;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), "md-docx-pdf");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Check if markdown contains mermaid code blocks
   */
  containsMermaid(markdown: string): boolean {
    return markdown.includes(PDF_CONSTANTS.MERMAID_MARKER);
  }

  /**
   * Convert markdown string to PDF buffer (standard conversion, no Mermaid)
   */
  async convert(markdown: string, options: PdfConvertOptions = {}): Promise<Buffer> {
    const timestamp = Date.now();
    const tempMdFile = path.join(this.tempDir, `temp-${timestamp}.md`);
    const tempPdfFile = path.join(this.tempDir, `temp-${timestamp}.pdf`);

    try {
      // Write markdown to temp file
      try {
        await fs.promises.writeFile(tempMdFile, markdown, "utf-8");
      } catch (error) {
        throw new Error(
          `Failed to write temp markdown file: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      const format = options.format || PDF_CONSTANTS.FORMAT;
      const marginTop = options.margin?.top || PDF_CONSTANTS.MARGIN.TOP;
      const marginRight = options.margin?.right || PDF_CONSTANTS.MARGIN.RIGHT;
      const marginBottom = options.margin?.bottom || PDF_CONSTANTS.MARGIN.BOTTOM;
      const marginLeft = options.margin?.left || PDF_CONSTANTS.MARGIN.LEFT;
      const stylesheetUrl = options.stylesheetUrl || PDF_CONSTANTS.GITHUB_CSS_URL;

      const config = {
        dest: tempPdfFile,
        pdf_options: {
          format,
          margin: {
            top: marginTop,
            right: marginRight,
            bottom: marginBottom,
            left: marginLeft,
          },
          printBackground: true,
        },
        stylesheet: [stylesheetUrl],
        body_class: [PDF_CONSTANTS.BODY_CLASS],
      };

      try {
        await mdToPdf({ path: tempMdFile }, config);
      } catch (error) {
        throw new Error(
          `PDF conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Read generated PDF
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await fs.promises.readFile(tempPdfFile);
      } catch (error) {
        throw new Error(
          `Failed to read generated PDF: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      return pdfBuffer;
    } finally {
      // Async cleanup of temp files
      await Promise.all([
        safeCleanupFile(tempMdFile),
        safeCleanupFile(tempPdfFile),
      ]);
    }
  }

  /**
   * Convert markdown with Mermaid diagrams to PDF buffer
   */
  async convertWithMermaid(markdown: string, options: PdfConvertOptions = {}): Promise<Buffer> {
    let browser: Browser | undefined;
    let page: Page | undefined;
    const tempPdfFile = path.join(this.tempDir, `mermaid-${Date.now()}.pdf`);

    try {
      // Convert Markdown to HTML
      let rawHtmlContent: string;
      try {
        rawHtmlContent = await marked.parse(markdown);
      } catch (error) {
        throw new Error(
          `Markdown parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Sanitize HTML with strict DOMPurify configuration
      const htmlContent = DOMPurify.sanitize(rawHtmlContent, DOMPURIFY_CONFIG);

      // Verify sanitized content is not empty (possible XSS attack)
      if (!htmlContent || htmlContent.trim() === "") {
        // Allow empty markdown, but warn if original had content
        if (rawHtmlContent && rawHtmlContent.trim() !== "") {
          console.warn("Warning: HTML content was sanitized to empty - possible malicious content detected");
        }
      }

      const format = options.format || PDF_CONSTANTS.FORMAT;
      const marginTop = options.margin?.top || PDF_CONSTANTS.MARGIN.TOP;
      const marginRight = options.margin?.right || PDF_CONSTANTS.MARGIN.RIGHT;
      const marginBottom = options.margin?.bottom || PDF_CONSTANTS.MARGIN.BOTTOM;
      const marginLeft = options.margin?.left || PDF_CONSTANTS.MARGIN.LEFT;
      const mermaidTimeout = options.mermaidTimeout || PDF_CONSTANTS.MERMAID_TIMEOUT;
      const stylesheetUrl = options.stylesheetUrl || PDF_CONSTANTS.GITHUB_CSS_URL;
      const useLocalFallback = options.useLocalStyleFallback ?? true;

      // Build complete HTML document with error handling for Mermaid
      const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${stylesheetUrl}" onerror="this.onerror=null;this.remove();">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    ${useLocalFallback ? LOCAL_FALLBACK_CSS : ""}
    body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
    }
    .mermaid {
      text-align: center;
      margin: 20px 0;
    }
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
<script>
  // Initialize error tracking
  window.mermaidErrors = [];
  window.mermaidRendered = false;

  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'Arial, sans-serif'
  });

  // Process Mermaid diagrams
  async function processMermaid() {
    try {
      // Find all Mermaid code blocks
      const mermaidBlocks = document.querySelectorAll('pre > code.language-mermaid');

      if (mermaidBlocks.length === 0) {
        window.mermaidRendered = true;
        return;
      }

      for (let i = 0; i < mermaidBlocks.length; i++) {
        const codeElement = mermaidBlocks[i];
        const pre = codeElement.parentElement;
        const mermaidCode = codeElement.textContent;

        // Create Mermaid container
        const container = document.createElement('div');
        container.className = 'mermaid';
        container.setAttribute('data-mermaid-index', String(i));
        container.textContent = mermaidCode;

        // Replace original pre element
        pre.replaceWith(container);
      }

      // Render all Mermaid diagrams
      await mermaid.run({
        querySelector: '.mermaid'
      });

    } catch (err) {
      const errorMsg = err.message || err.toString();
      window.mermaidErrors.push(errorMsg);
      console.error('Mermaid rendering error:', errorMsg);
    } finally {
      // Always mark as complete, even on error
      window.mermaidRendered = true;
    }
  }

  // Execute processing with error boundary
  processMermaid().catch(err => {
    window.mermaidErrors.push(err.message || err.toString());
    console.error('Mermaid processing error:', err);
    window.mermaidRendered = true;
  });
</script>
</body>
</html>
      `;

      // Launch Puppeteer with security considerations
      try {
        browser = await puppeteer.launch({
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } catch (error) {
        throw new Error(
          `Failed to launch browser: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      try {
        page = await browser.newPage();

        // Set page timeout
        page.setDefaultTimeout(PDF_CONSTANTS.PAGE_TIMEOUT);

        // Set content
        await page.setContent(fullHtml, { waitUntil: "networkidle0" });

        // Wait for Mermaid rendering to complete
        await page.waitForFunction("window.mermaidRendered === true", {
          timeout: mermaidTimeout,
        });

        // Check for Mermaid rendering errors
        const mermaidErrors = await page.evaluate(() => window.mermaidErrors);
        if (mermaidErrors && mermaidErrors.length > 0) {
          console.warn("Mermaid rendering completed with errors:", mermaidErrors);
        }

        // Extra wait to ensure complete rendering
        await new Promise((resolve) => setTimeout(resolve, PDF_CONSTANTS.MERMAID_POST_RENDER_DELAY));

        // Generate PDF
        await page.pdf({
          path: tempPdfFile,
          format,
          margin: {
            top: marginTop,
            right: marginRight,
            bottom: marginBottom,
            left: marginLeft,
          },
          printBackground: true,
        });

      } catch (error) {
        throw new Error(
          `PDF generation with Mermaid failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Read generated PDF
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await fs.promises.readFile(tempPdfFile);
      } catch (error) {
        throw new Error(
          `Failed to read generated PDF: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      return pdfBuffer;
    } finally {
      // Ensure all resources are properly released
      try {
        if (page) {
          await page.close();
        }
      } catch (error) {
        console.warn("Failed to close page:", error instanceof Error ? error.message : error);
      }

      try {
        if (browser) {
          await browser.close();
        }
      } catch (error) {
        console.warn("Failed to close browser:", error instanceof Error ? error.message : error);
      }

      await safeCleanupFile(tempPdfFile);
    }
  }

  /**
   * Convert a markdown file to PDF file
   */
  async convertFile(
    inputPath: string,
    outputPath: string,
    options: PdfConvertOptions = {}
  ): Promise<void> {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);

    // Validate input file exists
    if (!fs.existsSync(absoluteInputPath)) {
      throw new Error(`Input file not found: ${absoluteInputPath}`);
    }

    // Validate it's a file
    const stat = fs.statSync(absoluteInputPath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${absoluteInputPath}`);
    }

    // Read input file
    let markdown: string;
    try {
      markdown = await fs.promises.readFile(absoluteInputPath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read input file ${absoluteInputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Auto-detect Mermaid if enableMermaid is true
    const hasMermaid = options.enableMermaid && this.containsMermaid(markdown);

    let buffer: Buffer;
    try {
      buffer = hasMermaid
        ? await this.convertWithMermaid(markdown, options)
        : await this.convert(markdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed for ${absoluteInputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Ensure output directory exists
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

    // Write output file
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Natural sort comparison function
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
   * Read file contents asynchronously
   */
  private async readFileAsync(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read file ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Merge multiple markdown files in a directory into a single PDF
   */
  async convertDirectory(
    inputDir: string,
    outputPath: string,
    options: PdfMergeOptions = {}
  ): Promise<void> {
    const absoluteInputDir = path.resolve(inputDir);
    const absoluteOutputPath = path.resolve(outputPath);

    // Validate input directory
    if (!fs.existsSync(absoluteInputDir)) {
      throw new Error(`Input directory not found: ${absoluteInputDir}`);
    }

    const stat = fs.statSync(absoluteInputDir);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absoluteInputDir}`);
    }

    // Get all .md files
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

    // Determine separator
    const separator = options.separator || "pagebreak";
    let separatorMarkdown = "";
    if (separator === "pagebreak") {
      separatorMarkdown = "\n\n<div style=\"page-break-after: always;\"></div>\n\n";
    } else if (separator === "hr") {
      separatorMarkdown = "\n\n---\n\n";
    }

    // Read all files in parallel for better performance
    const filePaths = files.map((file) => path.join(absoluteInputDir, file));
    const contents = await Promise.all(
      filePaths.map((filePath) => this.readFileAsync(filePath))
    );

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Check if contains Mermaid
    const hasMermaid = options.enableMermaid && this.containsMermaid(mergedMarkdown);

    let buffer: Buffer;
    try {
      buffer = hasMermaid
        ? await this.convertWithMermaid(mergedMarkdown, options)
        : await this.convert(mergedMarkdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed for directory ${absoluteInputDir}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Ensure output directory exists
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

    // Write output file
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Merge multiple markdown files into a single PDF
   */
  async convertFiles(
    inputPaths: string[],
    outputPath: string,
    options: PdfMergeOptions = {}
  ): Promise<void> {
    const absoluteOutputPath = path.resolve(outputPath);

    if (inputPaths.length === 0) {
      throw new Error("No input files provided");
    }

    // Validate all input files exist
    const absoluteInputPaths = inputPaths.map((p) => path.resolve(p));
    for (const absoluteInputPath of absoluteInputPaths) {
      if (!fs.existsSync(absoluteInputPath)) {
        throw new Error(`Input file not found: ${absoluteInputPath}`);
      }
    }

    // Determine separator
    const separator = options.separator || "pagebreak";
    let separatorMarkdown = "";
    if (separator === "pagebreak") {
      separatorMarkdown = "\n\n<div style=\"page-break-after: always;\"></div>\n\n";
    } else if (separator === "hr") {
      separatorMarkdown = "\n\n---\n\n";
    }

    // Read all files in parallel for better performance
    const contents = await Promise.all(
      absoluteInputPaths.map((filePath) => this.readFileAsync(filePath))
    );

    const mergedMarkdown = contents.join(separatorMarkdown);

    // Check if contains Mermaid
    const hasMermaid = options.enableMermaid && this.containsMermaid(mergedMarkdown);

    let buffer: Buffer;
    try {
      buffer = hasMermaid
        ? await this.convertWithMermaid(mergedMarkdown, options)
        : await this.convert(mergedMarkdown, options);
    } catch (error) {
      throw new Error(
        `PDF conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Ensure output directory exists
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

    // Write output file
    try {
      await fs.promises.writeFile(absoluteOutputPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to write output file ${absoluteOutputPath}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Cleanup temporary files and resources
   */
  async cleanup(): Promise<void> {
    // Close browser if it's still open
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = undefined;
      } catch (error) {
        console.warn("Failed to close browser during cleanup:", error instanceof Error ? error.message : error);
      }
    }

    // Cleanup temp directory
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
