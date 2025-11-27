/**
 * Internationalization (i18n) module
 */

export type Language = "en" | "zh-TW";

export interface Messages {
  // Common
  done: string;
  error: string;
  cancel: string;
  converting: string;
  completed: string;
  fileNotFound: string;
  dirNotFound: string;
  notADir: string;
  noMdFiles: string;
  unknownError: string;
  conversionFailed: string;
  mermaidDetected: string;
  invalidOption: string;
  goodbye: string;
  pressEnterToReturn: string;

  // CLI
  cliTitle: string;
  cliUsage: string;
  cliOptions: string;
  cliExamples: string;
  cliTip: string;
  cliOptOutput: string;
  cliOptSeparator: string;
  cliOptNoMermaid: string;
  cliOptHelp: string;
  cliExConvertSingle: string;
  cliExMergeDir: string;
  cliExWithSeparator: string;
  cliInputRequired: string;
  cliMergeFiles: string;
  cliConvertFile: string;
  cliInput: string;

  // Interactive
  interBanner: string;
  interSubtitle: string;
  interSelectOption: string;
  interOpt1: string;
  interOpt2: string;
  interOpt3: string;
  interOpt4: string;
  interOpt0: string;
  interPromptSelect: string;
  interConvertSingle: string;
  interMergeDir: string;
  interSpecifyDir: string;
  interCurrentMdFiles: string;
  interNoMdFiles: string;
  interCurrentDirs: string;
  interNoDirs: string;
  interMdFileCount: string;
  interNoMdInDir: string;
  interInputFilePath: string;
  interInputDirPath: string;
  interInputFullDirPath: string;
  interOutputPath: string;
  interRefreshing: string;
  interWillMerge: string;
  interFoundMdFiles: string;
  interConfirmMerge: string;
  interSeparatorType: string;
  interSepPagebreak: string;
  interSepHr: string;
  interSepNone: string;
  interSelectSeparator: string;
  interAutoRenderMermaid: string;

  // Help
  helpTitle: string;
  helpFeatures: string;
  helpFeature1: string;
  helpFeature2: string;
  helpFeature3: string;
  helpFeature4: string;
  helpMermaidTypes: string;
  helpCliUsage: string;
  helpExampleFile: string;

  // Language selection / Settings
  langSelect: string;
  langEnglish: string;
  langChinese: string;
  interOpt5: string;
  settingsTitle: string;
  settingsCurrentLang: string;
  settingsSaved: string;
}

const messages: Record<Language, Messages> = {
  en: {
    // Common
    done: "Done!",
    error: "Error",
    cancel: "Cancelled",
    converting: "Converting...",
    completed: "Generated:",
    fileNotFound: "File not found:",
    dirNotFound: "Directory not found:",
    notADir: "Not a directory:",
    noMdFiles: "No .md files in directory",
    unknownError: "Unknown error",
    conversionFailed: "Conversion failed:",
    mermaidDetected: "Mermaid diagrams detected, auto-rendering enabled",
    invalidOption: "Please enter a valid option",
    goodbye: "Goodbye!",
    pressEnterToReturn: "Press Enter to return to menu...",

    // CLI
    cliTitle: "md-docx - Markdown to Word converter (with Mermaid support)",
    cliUsage: "Usage:",
    cliOptions: "Options:",
    cliExamples: "Examples:",
    cliTip: "Tip: Mermaid diagrams are auto-detected and rendered",
    cliOptOutput: "Specify output file path",
    cliOptSeparator: "Section separator: pagebreak, hr, none",
    cliOptNoMermaid: "Disable Mermaid rendering (auto-detect by default)",
    cliOptHelp: "Show help",
    cliExConvertSingle: "# Convert single file",
    cliExMergeDir: "# Merge all files in directory",
    cliExWithSeparator: "# Use horizontal rule separator",
    cliInputRequired: "Please specify input file or directory",
    cliMergeFiles: "Merge Files",
    cliConvertFile: "Convert File",
    cliInput: "Input:",

    // Interactive
    interBanner: "Mermadoc Converter",
    interSubtitle: "Markdown → Word Document",
    interSelectOption: "Select an option:",
    interOpt1: "Convert single Markdown file",
    interOpt2: "Merge all Markdown files in folder",
    interOpt3: "Specify folder path",
    interOpt4: "Show help",
    interOpt0: "Exit",
    interPromptSelect: "Select (0-4):",
    interConvertSingle: "Convert Single File",
    interMergeDir: "Merge Directory",
    interSpecifyDir: "Specify Directory Path",
    interCurrentMdFiles: "Markdown files in current directory:",
    interNoMdFiles: "No Markdown files in current directory",
    interCurrentDirs: "Directories in current directory:",
    interNoDirs: "No subdirectories in current directory",
    interMdFileCount: ".md files",
    interNoMdInDir: "no .md files",
    interInputFilePath: "Enter file path (or number, press r to refresh):",
    interInputDirPath: "Enter directory path (or number, press r to refresh):",
    interInputFullDirPath: "Enter full directory path:",
    interOutputPath: "Output file path",
    interRefreshing: "Refreshing...",
    interWillMerge: "Files to merge:",
    interFoundMdFiles: "Found Markdown files:",
    interConfirmMerge: "Confirm merge? (Y/n):",
    interSeparatorType: "Section separator:",
    interSepPagebreak: "pagebreak - Page break (default)",
    interSepHr: "hr - Horizontal rule",
    interSepNone: "none - No separator",
    interSelectSeparator: "Select separator (Enter = 1):",
    interAutoRenderMermaid: "Mermaid detected, will auto-render",

    // Help
    helpTitle: "Mermadoc Help",
    helpFeatures: "Features:",
    helpFeature1: "Convert Markdown to Word documents (.docx)",
    helpFeature2: "Auto-render Mermaid diagrams",
    helpFeature3: "Merge multiple Markdown files",
    helpFeature4: "Support GFM tables, code blocks, lists, etc.",
    helpMermaidTypes: "Supported Mermaid diagram types:",
    helpCliUsage: "Command line usage:",
    helpExampleFile: "Example file:",

    // Language selection / Settings
    langSelect: "Select language:",
    langEnglish: "English",
    langChinese: "Chinese (Traditional)",
    interOpt5: "Settings",
    settingsTitle: "Settings",
    settingsCurrentLang: "Current language:",
    settingsSaved: "Settings saved!",
  },

  "zh-TW": {
    // Common
    done: "完成！",
    error: "錯誤",
    cancel: "已取消",
    converting: "正在轉換中...",
    completed: "已產生:",
    fileNotFound: "找不到檔案:",
    dirNotFound: "找不到資料夾:",
    notADir: "不是資料夾:",
    noMdFiles: "資料夾中沒有 .md 檔案",
    unknownError: "未知錯誤",
    conversionFailed: "轉換失敗:",
    mermaidDetected: "偵測到 Mermaid 圖表，自動啟用渲染",
    invalidOption: "請輸入有效選項",
    goodbye: "再見！",
    pressEnterToReturn: "按 Enter 返回主選單...",

    // CLI
    cliTitle: "md-docx - Markdown 轉 Word 文件工具（支援 Mermaid 圖表）",
    cliUsage: "使用方式:",
    cliOptions: "選項:",
    cliExamples: "範例:",
    cliTip: "提示: Mermaid 圖表會自動偵測並渲染，無需額外參數",
    cliOptOutput: "指定輸出檔案路徑",
    cliOptSeparator: "章節分隔方式: pagebreak（分頁）, hr（分隔線）, none（無）",
    cliOptNoMermaid: "停用 Mermaid 圖表渲染（預設自動偵測）",
    cliOptHelp: "顯示說明",
    cliExConvertSingle: "# 轉換單一檔案",
    cliExMergeDir: "# 合併整個資料夾的文件",
    cliExWithSeparator: "# 使用分隔線而非分頁",
    cliInputRequired: "請指定輸入檔案或資料夾",
    cliMergeFiles: "合併文件",
    cliConvertFile: "轉換文件",
    cliInput: "輸入:",

    // Interactive
    interBanner: "Mermadoc 轉換工具",
    interSubtitle: "Markdown → Word 文件",
    interSelectOption: "請選擇操作：",
    interOpt1: "轉換單一 Markdown 檔案",
    interOpt2: "合併資料夾內所有 Markdown 檔案",
    interOpt3: "指定資料夾路徑",
    interOpt4: "顯示說明",
    interOpt0: "離開",
    interPromptSelect: "請選擇 (0-4):",
    interConvertSingle: "轉換單一檔案",
    interMergeDir: "合併資料夾",
    interSpecifyDir: "指定資料夾路徑",
    interCurrentMdFiles: "目前目錄的 Markdown 檔案：",
    interNoMdFiles: "目前目錄沒有 Markdown 檔案",
    interCurrentDirs: "目前目錄的資料夾：",
    interNoDirs: "目前目錄沒有子資料夾",
    interMdFileCount: "個 .md 檔案",
    interNoMdInDir: "無 .md 檔案",
    interInputFilePath: "請輸入檔案路徑（或編號，按 r 重新整理）:",
    interInputDirPath: "請輸入資料夾路徑（或編號，按 r 重新整理）:",
    interInputFullDirPath: "請輸入資料夾完整路徑:",
    interOutputPath: "輸出檔案路徑",
    interRefreshing: "重新整理...",
    interWillMerge: "將合併以下檔案：",
    interFoundMdFiles: "找到 Markdown 檔案：",
    interConfirmMerge: "確認要合併這些檔案嗎？(Y/n):",
    interSeparatorType: "章節分隔方式：",
    interSepPagebreak: "pagebreak - 分頁符（預設）",
    interSepHr: "hr - 水平分隔線",
    interSepNone: "none - 無分隔",
    interSelectSeparator: "選擇分隔方式 (Enter = 1):",
    interAutoRenderMermaid: "偵測到 Mermaid 圖表，將自動渲染",

    // Help
    helpTitle: "Mermadoc 使用說明",
    helpFeatures: "功能特色：",
    helpFeature1: "將 Markdown 轉換為 Word 文件 (.docx)",
    helpFeature2: "支援 Mermaid 圖表自動渲染",
    helpFeature3: "可合併多個 Markdown 檔案",
    helpFeature4: "支援 GFM 表格、程式碼區塊、清單等",
    helpMermaidTypes: "支援的 Mermaid 圖表類型：",
    helpCliUsage: "命令列使用方式：",
    helpExampleFile: "範例檔案：",

    // Language selection / Settings
    langSelect: "選擇語言:",
    langEnglish: "English",
    langChinese: "繁體中文",
    interOpt5: "設定",
    settingsTitle: "設定",
    settingsCurrentLang: "目前語言:",
    settingsSaved: "設定已儲存！",
  },
};

let currentLanguage: Language = "en";

/**
 * Set current language
 */
export function setLanguage(lang: Language): void {
  currentLanguage = lang;
}

/**
 * Get current language
 */
export function getLanguage(): Language {
  return currentLanguage;
}

/**
 * Get translated message
 */
export function t(key: keyof Messages): string {
  return messages[currentLanguage][key];
}

/**
 * Get all messages for current language
 */
export function getMessages(): Messages {
  return messages[currentLanguage];
}

/**
 * Detect system language
 */
export function detectSystemLanguage(): Language {
  const env = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || "";
  if (env.toLowerCase().includes("zh") || env.toLowerCase().includes("chinese")) {
    return "zh-TW";
  }
  return "en";
}

// Config file handling
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_FILE = path.join(os.homedir(), ".mermadocrc");

interface Config {
  language: Language;
}

/**
 * Load config from file
 */
export function loadConfig(): Config {
  const defaultConfig: Config = { language: "en" };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      const config = JSON.parse(content) as Partial<Config>;
      return {
        language: config.language === "zh-TW" ? "zh-TW" : "en",
      };
    }
  } catch {
    // Ignore errors, use default
  }

  return defaultConfig;
}

/**
 * Save config to file
 */
export function saveConfig(config: Config): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Ignore errors
  }
}

/**
 * Initialize language from config
 */
export function initLanguageFromConfig(): void {
  const config = loadConfig();
  setLanguage(config.language);
}
