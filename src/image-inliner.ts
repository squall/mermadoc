import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Pre-processes Markdown to inline local image references as base64 data URIs.
 *
 * Why: downstream processing strips relative-path `src` attributes (DOMPurify
 * URI allow-list for PDF) and runs in a CWD-agnostic context (DOCX
 * imageResolver). Converting local files to `data:image/...;base64,...` at
 * the markdown layer means both pipelines see the same self-contained
 * payload, regardless of how the user invoked the CLI.
 */

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

// Matches `![alt](src "optional title")` — non-greedy alt, captures src up to
// the first whitespace or `)`, then optional `"title"` group.
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;

const ABSOLUTE_URL_RE = /^(?:https?:|data:|file:|mailto:|tel:|ftp:)/i;

function isAbsoluteOrInline(src: string): boolean {
  return ABSOLUTE_URL_RE.test(src);
}

function escapeAlt(alt: string): string {
  // Markdown alt text cannot contain unescaped `]` — preserve as-is otherwise.
  return alt;
}

function escapeTitle(title: string): string {
  return title.replace(/"/g, '\\"');
}

export interface InlineImagesOptions {
  /**
   * Maximum image file size to inline (bytes). Default 10MB.
   * Files larger than this are left untouched and logged.
   */
  maxBytes?: number;
  /**
   * Called with `(absPath, reason)` whenever a referenced image cannot be
   * inlined. Default behaviour logs a warning.
   */
  onMissing?: (absPath: string, reason: string) => void;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Inlines local image references in Markdown as base64 data URIs.
 *
 * - Absolute URLs (`http://`, `https://`, `data:`, etc.) are passed through.
 * - Paths are resolved relative to `baseDir`; `baseDir = ""` skips inlining.
 * - Missing files emit a warning and the original reference is preserved.
 */
export function inlineLocalImages(
  markdown: string,
  baseDir: string,
  options: InlineImagesOptions = {}
): string {
  if (!baseDir) return markdown;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const onMissing = options.onMissing ?? ((absPath, reason) => {
    console.warn(`[image-inliner] ${reason}: ${absPath}`);
  });

  return markdown.replace(MD_IMAGE_RE, (full, alt: string, src: string, title?: string) => {
    if (isAbsoluteOrInline(src)) return full;

    const abs = path.isAbsolute(src) ? src : path.resolve(baseDir, src);
    if (!fs.existsSync(abs)) {
      onMissing(abs, "Image not found");
      return full;
    }

    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      onMissing(abs, "Not a file");
      return full;
    }
    if (stat.size > maxBytes) {
      onMissing(abs, `Image exceeds ${maxBytes} bytes (${stat.size})`);
      return full;
    }

    const ext = path.extname(abs).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      onMissing(abs, `Unsupported image extension: ${ext}`);
      return full;
    }

    const buf = fs.readFileSync(abs);
    const base64 = buf.toString("base64");
    const titlePart = title !== undefined ? ` "${escapeTitle(title)}"` : "";
    return `![${escapeAlt(alt)}](data:${mime};base64,${base64}${titlePart})`;
  });
}
