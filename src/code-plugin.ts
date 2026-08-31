import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";
import type { IPlugin } from "@m2d/core";
import type { Code } from "mdast";

// Supported languages list
const SUPPORTED_LANGUAGES: BundledLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "sql",
  "html",
  "css",
  "json",
  "yaml",
  "xml",
  "markdown",
  "bash",
  "shellscript",
  "powershell",
  "dockerfile",
];

// Default language (used when language is not supported)
const DEFAULT_LANGUAGE: BundledLanguage = "javascript";

// Language aliases mapping
const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  cs: "csharp",
  "c++": "cpp",
  sh: "bash",
  zsh: "bash",
  shell: "shellscript",
  console: "bash",
  yml: "yaml",
  md: "markdown",
  // JSON with comments / trailing commas — highlight as JSON
  jsonc: "json",
  json5: "json",
  htm: "html",
  psql: "sql",
  mysql: "sql",
  docker: "dockerfile",
};

let highlighterInstance: Highlighter | null = null;

/**
 * Get or create highlighter instance
 */
async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({
      themes: ["github-light"],
      langs: SUPPORTED_LANGUAGES,
    });
  }
  return highlighterInstance;
}

/**
 * Resolve language name
 */
function resolveLanguage(lang: string | null | undefined): BundledLanguage | null {
  if (!lang) return null;
  const normalized = lang.toLowerCase().trim();
  if (LANGUAGE_ALIASES[normalized]) {
    return LANGUAGE_ALIASES[normalized];
  }
  if (SUPPORTED_LANGUAGES.includes(normalized as BundledLanguage)) {
    return normalized as BundledLanguage;
  }
  return null;
}

/**
 * Convert hex color to DOCX format (remove # prefix)
 */
function hexToDocxColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  return hex.replace("#", "");
}

export interface CodePluginOptions {
  /**
   * Code block background color
   * @default "F6F8FA"
   */
  backgroundColor?: string;

  /**
   * Code font family
   * @default "Consolas"
   */
  fontFamily?: string;

  /**
   * Code font size (unit: half-points, 20 = 10pt)
   * @default 20
   */
  fontSize?: number;

  /**
   * Whether to show line numbers
   * @default false
   */
  showLineNumbers?: boolean;

  /**
   * Code block border color (hex without #). Set to null to disable the border.
   * @default "D0D7DE"
   */
  borderColor?: string | null;

  /**
   * Horizontal padding inside the code block, in twips (240 = 0.42cm)
   * @default 240
   */
  padding?: number;

  /**
   * Line spacing for code lines, in twentieths of a point (240 = single)
   * @default 240
   */
  lineSpacing?: number;
}

/**
 * Code block syntax highlighting plugin
 */
export function codePlugin(options: CodePluginOptions = {}): IPlugin {
  const {
    backgroundColor = "F6F8FA",
    fontFamily = "Consolas",
    fontSize = 20,
    showLineNumbers = false,
    borderColor = "D0D7DE",
    padding = 240,
    lineSpacing = 240,
  } = options;

  /**
   * Build paragraph properties shared by every line of a code block.
   *
   * A DOCX paragraph cannot span multiple lines, so a code block is rendered as
   * one paragraph per line. Drawing left/right borders on every line and the
   * top/bottom border only on the first/last line makes the separate paragraphs
   * read as a single framed block.
   */
  const blockFrame = (docx: any, index: number, total: number) => {
    const edge = borderColor
      ? { style: docx.BorderStyle.SINGLE, size: 4, color: borderColor, space: 0 }
      : undefined;
    const none = { style: docx.BorderStyle.NONE, size: 0, color: "auto", space: 0 };

    return {
      shading: {
        type: docx.ShadingType.SOLID,
        color: backgroundColor,
        fill: backgroundColor,
      },
      indent: { left: padding, right: padding },
      spacing: {
        before: index === 0 ? 120 : 0,
        after: index === total - 1 ? 120 : 0,
        line: lineSpacing,
      },
      contextualSpacing: true,
      ...(edge
        ? {
            border: {
              top: index === 0 ? edge : none,
              bottom: index === total - 1 ? edge : none,
              left: edge,
              right: edge,
            },
          }
        : {}),
    };
  };

  // Pre-load highlighter
  const highlighterPromise = getHighlighter();

  return {
    async preprocess() {
      // Ensure highlighter is loaded
      await highlighterPromise;
    },

    block(docx, node, paraProps, _blockChildrenProcessor, _inlineChildrenProcessor) {
      if (node.type !== "code") {
        return [];
      }

      const codeNode = node as Code;
      const code = codeNode.value || "";
      const lang = resolveLanguage(codeNode.lang);

      // If highlighter not ready or language not supported, use plain text rendering.
      // The node must be marked as processed here too — otherwise the default
      // handler emits the same code block a second time and every unlabelled
      // block appears twice in the document.
      if (!highlighterInstance || !lang) {
        const lines = code.split("\n");
        (node as { type: string }).type = "";

        return lines.map(
          (line, index) =>
            new docx.Paragraph({
              ...paraProps,
              ...blockFrame(docx, index, lines.length),
              children: [
                ...(showLineNumbers
                  ? [
                      new docx.TextRun({
                        text: `${String(index + 1).padStart(3, " ")} │ `,
                        font: fontFamily,
                        size: fontSize,
                        color: "999999",
                      }),
                    ]
                  : []),
                new docx.TextRun({
                  text: line || " ",
                  font: fontFamily,
                  size: fontSize,
                }),
              ],
            })
        );
      }

      // Use shiki for syntax highlighting
      const tokens = highlighterInstance.codeToTokensBase(code, {
        lang,
        theme: "github-light",
      });

      const paragraphs: InstanceType<typeof docx.Paragraph>[] = [];

      tokens.forEach((lineTokens, lineIndex) => {
        const runs: InstanceType<typeof docx.TextRun>[] = [];

        // Line numbers
        if (showLineNumbers) {
          runs.push(
            new docx.TextRun({
              text: `${String(lineIndex + 1).padStart(3, " ")} │ `,
              font: fontFamily,
              size: fontSize,
              color: "999999",
            })
          );
        }

        // Code tokens
        if (lineTokens.length === 0) {
          // Empty line
          runs.push(
            new docx.TextRun({
              text: " ",
              font: fontFamily,
              size: fontSize,
            })
          );
        } else {
          lineTokens.forEach((token) => {
            runs.push(
              new docx.TextRun({
                text: token.content,
                font: fontFamily,
                size: fontSize,
                color: hexToDocxColor(token.color),
              })
            );
          });
        }

        paragraphs.push(
          new docx.Paragraph({
            ...paraProps,
            ...blockFrame(docx, lineIndex, tokens.length),
            children: runs,
          })
        );
      });

      // Mark node as processed to avoid duplicate processing
      (node as { type: string }).type = "";

      return paragraphs;
    },
  };
}

/**
 * Cleanup highlighter instance
 */
export function disposeHighlighter(): void {
  if (highlighterInstance) {
    highlighterInstance.dispose();
    highlighterInstance = null;
  }
}
