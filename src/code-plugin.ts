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
  ts: "typescript",
  py: "python",
  rb: "ruby",
  cs: "csharp",
  "c++": "cpp",
  sh: "bash",
  zsh: "bash",
  shell: "shellscript",
  yml: "yaml",
  md: "markdown",
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
  } = options;

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

      // If highlighter not ready or language not supported, use plain text rendering
      if (!highlighterInstance || !lang) {
        const lines = code.split("\n");
        return lines.map(
          (line, index) =>
            new docx.Paragraph({
              ...paraProps,
              shading: {
                type: docx.ShadingType.SOLID,
                color: backgroundColor,
                fill: backgroundColor,
              },
              spacing: { before: index === 0 ? 120 : 0, after: index === lines.length - 1 ? 120 : 0, line: 276 },
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
            shading: {
              type: docx.ShadingType.SOLID,
              color: backgroundColor,
              fill: backgroundColor,
            },
            spacing: {
              before: lineIndex === 0 ? 120 : 0,
              after: lineIndex === tokens.length - 1 ? 120 : 0,
              line: 276,
            },
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
