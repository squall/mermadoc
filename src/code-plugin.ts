import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";
import type { IPlugin } from "@m2d/core";
import type { Code } from "mdast";

// 常用語言列表
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

// 預設語言（當語言不支援時使用）
const DEFAULT_LANGUAGE: BundledLanguage = "javascript";

// 語言別名對應
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
 * 取得或建立 highlighter 實例
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
 * 解析語言名稱
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
 * 將 hex 顏色轉換為 DOCX 格式（去除 # 號）
 */
function hexToDocxColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  return hex.replace("#", "");
}

export interface CodePluginOptions {
  /**
   * 程式碼區塊背景顏色
   * @default "F6F8FA"
   */
  backgroundColor?: string;

  /**
   * 程式碼字體
   * @default "Consolas"
   */
  fontFamily?: string;

  /**
   * 程式碼字體大小（單位：half-points，20 = 10pt）
   * @default 20
   */
  fontSize?: number;

  /**
   * 是否顯示行號
   * @default false
   */
  showLineNumbers?: boolean;
}

/**
 * 程式碼區塊語法高亮插件
 */
export function codePlugin(options: CodePluginOptions = {}): IPlugin {
  const {
    backgroundColor = "F6F8FA",
    fontFamily = "Consolas",
    fontSize = 20,
    showLineNumbers = false,
  } = options;

  // 預先載入 highlighter
  const highlighterPromise = getHighlighter();

  return {
    async preprocess() {
      // 確保 highlighter 已載入
      await highlighterPromise;
    },

    block(docx, node, paraProps, _blockChildrenProcessor, _inlineChildrenProcessor) {
      if (node.type !== "code") {
        return [];
      }

      const codeNode = node as Code;
      const code = codeNode.value || "";
      const lang = resolveLanguage(codeNode.lang);

      // 如果 highlighter 還沒準備好或語言不支援，使用純文字渲染
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

      // 使用 shiki 進行語法高亮
      const tokens = highlighterInstance.codeToTokensBase(code, {
        lang,
        theme: "github-light",
      });

      const paragraphs: InstanceType<typeof docx.Paragraph>[] = [];

      tokens.forEach((lineTokens, lineIndex) => {
        const runs: InstanceType<typeof docx.TextRun>[] = [];

        // 行號
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

        // 程式碼 tokens
        if (lineTokens.length === 0) {
          // 空行
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

      // 標記節點已處理，避免重複處理
      (node as { type: string }).type = "";

      return paragraphs;
    },
  };
}

/**
 * 清理 highlighter 實例
 */
export function disposeHighlighter(): void {
  if (highlighterInstance) {
    highlighterInstance.dispose();
    highlighterInstance = null;
  }
}
