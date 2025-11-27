#!/usr/bin/env node

import { MdToDocxConverter } from "./converter.js";
import * as path from "node:path";
import * as fs from "node:fs";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const icons = {
  success: "✓",
  info: "→",
  file: "📄",
  folder: "📁",
  merge: "📑",
  mermaid: "🧜",
};

interface CliOptions {
  input: string;
  output?: string;
  mermaid: boolean | "auto";
  separator: "pagebreak" | "hr" | "none";
  noMermaid: boolean;
}

function log(message: string): void {
  console.log(message);
}

function logInfo(message: string): void {
  console.log(`${colors.cyan}${icons.info}${colors.reset} ${message}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}${icons.success}${colors.reset} ${message}`);
}

function logError(message: string): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function logFile(index: number, filename: string, hasMermaid: boolean): void {
  const mermaidIcon = hasMermaid ? ` ${colors.dim}(mermaid)${colors.reset}` : "";
  console.log(`  ${colors.dim}${index}.${colors.reset} ${filename}${mermaidIcon}`);
}

/**
 * Check if content contains Mermaid blocks
 */
function containsMermaid(content: string): boolean {
  return /```mermaid\n[\s\S]*?```/.test(content);
}

/**
 * Check if file or files in directory contain Mermaid
 */
function detectMermaid(inputPath: string): boolean {
  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(inputPath).filter(f => f.endsWith(".md"));
    return files.some(file => {
      const content = fs.readFileSync(path.join(inputPath, file), "utf-8");
      return containsMermaid(content);
    });
  } else {
    const content = fs.readFileSync(inputPath, "utf-8");
    return containsMermaid(content);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    mermaid: "auto",
    separator: "pagebreak",
    noMermaid: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      options.output = args[++i];
    } else if (arg === "-m" || arg === "--mermaid") {
      options.mermaid = true;
    } else if (arg === "--no-mermaid") {
      options.noMermaid = true;
    } else if (arg === "-s" || arg === "--separator") {
      const sep = args[++i];
      if (sep === "pagebreak" || sep === "hr" || sep === "none") {
        options.separator = sep;
      } else {
        logError(`Invalid separator: ${sep}. Use 'pagebreak', 'hr', or 'none'.`);
        process.exit(1);
      }
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      options.input = arg;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${colors.bright}md-docx${colors.reset} - Markdown 轉 Word 文件工具（支援 Mermaid 圖表）

${colors.yellow}使用方式:${colors.reset}
  md-docx <檔案.md>              轉換單一檔案
  md-docx <資料夾>               合併資料夾內所有 .md 檔案

${colors.yellow}選項:${colors.reset}
  -o, --output <檔案>     指定輸出檔案路徑
  -s, --separator <類型>  章節分隔方式: pagebreak（分頁）, hr（分隔線）, none（無）
  --no-mermaid            停用 Mermaid 圖表渲染（預設自動偵測）
  -h, --help              顯示說明

${colors.yellow}範例:${colors.reset}
  ${colors.dim}# 轉換單一檔案${colors.reset}
  md-docx example/example.md

  ${colors.dim}# 合併整個資料夾的文件${colors.reset}
  md-docx ./reports -o manual.docx

  ${colors.dim}# 使用分隔線而非分頁${colors.reset}
  md-docx ./reports -o manual.docx -s hr

${colors.dim}提示: Mermaid 圖表會自動偵測並渲染，無需額外參數${colors.reset}
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.input) {
    logError("請指定輸入檔案或資料夾");
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(options.input);

  if (!fs.existsSync(inputPath)) {
    logError(`找不到: ${inputPath}`);
    process.exit(1);
  }

  const converter = new MdToDocxConverter();

  try {
    const stat = fs.statSync(inputPath);
    const isDirectory = stat.isDirectory();

    // Auto-detect Mermaid
    let enableMermaid = false;
    if (options.noMermaid) {
      enableMermaid = false;
    } else if (options.mermaid === true) {
      enableMermaid = true;
    } else {
      // Auto mode: detect if Mermaid exists
      enableMermaid = detectMermaid(inputPath);
    }

    if (isDirectory) {
      // Directory mode: merge all .md files
      const dirName = path.basename(inputPath);
      const outputPath = options.output
        ? path.resolve(options.output)
        : path.join(path.dirname(inputPath), `${dirName}.docx`);

      const mdFiles = fs.readdirSync(inputPath)
        .filter(f => f.endsWith(".md"))
        .sort();

      if (mdFiles.length === 0) {
        logError(`資料夾中沒有 .md 檔案: ${inputPath}`);
        process.exit(1);
      }

      log("");
      log(`${colors.bright}${icons.folder} 合併文件${colors.reset}`);
      log(`${colors.dim}───────────────────────────────${colors.reset}`);

      // Display file list, indicate if contains Mermaid
      mdFiles.forEach((f, i) => {
        const content = fs.readFileSync(path.join(inputPath, f), "utf-8");
        const hasMermaid = containsMermaid(content);
        logFile(i + 1, f, hasMermaid);
      });

      log(`${colors.dim}───────────────────────────────${colors.reset}`);

      if (enableMermaid) {
        logInfo(`偵測到 Mermaid 圖表，自動啟用渲染...`);
      }

      logInfo(`正在轉換中...`);

      await converter.convertDirectory(inputPath, outputPath, {
        enableMermaid,
        separator: options.separator,
      });

      log("");
      logSuccess(`完成！已產生: ${colors.bright}${outputPath}${colors.reset}`);
      log("");
    } else {
      // Single file mode
      const baseName = path.basename(inputPath, ".md");
      const outputPath = options.output
        ? path.resolve(options.output)
        : path.join(path.dirname(inputPath), `${baseName}.docx`);

      log("");
      log(`${colors.bright}${icons.file} 轉換文件${colors.reset}`);
      log(`${colors.dim}───────────────────────────────${colors.reset}`);
      logInfo(`輸入: ${path.basename(inputPath)}`);

      if (enableMermaid) {
        logInfo(`偵測到 Mermaid 圖表，自動啟用渲染...`);
      }

      logInfo(`正在轉換中...`);

      await converter.convertFile(inputPath, outputPath, {
        enableMermaid,
      });

      log("");
      logSuccess(`完成！已產生: ${colors.bright}${outputPath}${colors.reset}`);
      log("");
    }
  } catch (error) {
    log("");
    if (error instanceof Error) {
      logError(error.message);
    } else {
      logError("發生未知錯誤");
    }
    process.exit(1);
  }
}

main();
