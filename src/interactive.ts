#!/usr/bin/env node

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { MdToDocxConverter } from "./converter.js";

// ANSI 顏色碼
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

let rl: readline.Interface;

function createReadline(): void {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 即時按鍵輸入，支援特定快捷鍵
 * @param question 提示文字
 * @param hotkeys 快捷鍵對應的回調 { key: callback }
 */
function askWithHotkeys(
  question: string,
  hotkeys: Record<string, () => void>
): Promise<string> {
  return new Promise((resolve) => {
    // 先暫停 readline 以避免衝突
    rl.pause();

    process.stdout.write(question);

    let input = "";
    const stdin = process.stdin;

    // 移除所有現有的 data 監聽器
    stdin.removeAllListeners("data");

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeAllListeners("data");
      stdin.pause();
      // 恢復 readline
      rl.resume();
    };

    const onData = (key: string) => {
      // Ctrl+C
      if (key === "\u0003") {
        cleanup();
        process.exit();
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(input);
        return;
      }

      // Backspace
      if (key === "\u007F" || key === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }

      // 檢查快捷鍵（只在輸入為空時觸發）
      if (input === "" && hotkeys[key.toLowerCase()]) {
        cleanup();
        process.stdout.write("\n");
        hotkeys[key.toLowerCase()]();
        resolve("\0HOTKEY"); // 特殊標記
        return;
      }

      // 一般字元
      if (key >= " " && key <= "~") {
        input += key;
        process.stdout.write(key);
      }
    };

    stdin.on("data", onData);
  });
}

function clear(): void {
  console.clear();
}

function printBanner(): void {
  console.log(`
${c.cyan}╔══════════════════════════════════════════╗
║                                          ║
║   ${c.bright}${c.magenta}📄 Mermadoc 轉換工具${c.reset}${c.cyan}                   ║
║   ${c.dim}Markdown → Word 文件${c.reset}${c.cyan}                   ║
║                                          ║
╚══════════════════════════════════════════╝${c.reset}
`);
}

function printMenu(): void {
  console.log(`${c.yellow}請選擇操作：${c.reset}

  ${c.bright}1.${c.reset} 轉換單一 Markdown 檔案
  ${c.bright}2.${c.reset} 合併資料夾內所有 Markdown 檔案
  ${c.bright}3.${c.reset} 指定資料夾路徑
  ${c.bright}4.${c.reset} 顯示說明
  ${c.bright}0.${c.reset} 離開
`);
}

function containsMermaid(content: string): boolean {
  return /```mermaid\n[\s\S]*?```/.test(content);
}

function detectMermaidInPath(inputPath: string): boolean {
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(inputPath).filter((f) => f.endsWith(".md"));
    return files.some((file) => {
      const content = fs.readFileSync(path.join(inputPath, file), "utf-8");
      return containsMermaid(content);
    });
  } else {
    const content = fs.readFileSync(inputPath, "utf-8");
    return containsMermaid(content);
  }
}

function listMdFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function printMdFileList(mdFiles: string[]): void {
  if (mdFiles.length > 0) {
    console.log(`${c.dim}目前目錄的 Markdown 檔案：${c.reset}`);
    mdFiles.forEach((f, i) => {
      const content = fs.readFileSync(f, "utf-8");
      const hasMermaid = containsMermaid(content);
      const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
      console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
    });
    console.log("");
  } else {
    console.log(`${c.dim}目前目錄沒有 Markdown 檔案${c.reset}\n`);
  }
}

async function convertSingleFile(): Promise<void> {
  console.log(`\n${c.bright}📄 轉換單一檔案${c.reset}\n`);

  const currentDir = process.cwd();
  let mdFiles = listMdFiles(currentDir);
  printMdFileList(mdFiles);

  let inputPath = "";
  let refreshTriggered = false;

  do {
    refreshTriggered = false;
    inputPath = await askWithHotkeys(
      `${c.cyan}?${c.reset} 請輸入檔案路徑（或編號，按 r 重新整理）: `,
      {
        r: () => {
          refreshTriggered = true;
          console.log(`${c.cyan}→${c.reset} 重新整理...\n`);
          mdFiles = listMdFiles(currentDir);
          printMdFileList(mdFiles);
        },
      }
    );
  } while (refreshTriggered || inputPath === "\0HOTKEY");

  let resolvedPath: string;
  const num = parseInt(inputPath, 10);
  if (!isNaN(num) && num >= 1 && num <= mdFiles.length) {
    resolvedPath = path.resolve(mdFiles[num - 1]);
  } else {
    resolvedPath = path.resolve(inputPath);
  }

  if (!fs.existsSync(resolvedPath)) {
    console.log(`\n${c.red}✗${c.reset} 找不到檔案: ${resolvedPath}\n`);
    return;
  }

  const baseName = path.basename(resolvedPath, ".md");
  const defaultOutput = path.join(path.dirname(resolvedPath), `${baseName}.docx`);

  const outputPath = await ask(
    `${c.cyan}?${c.reset} 輸出檔案路徑 ${c.dim}(Enter = ${path.basename(defaultOutput)})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  const hasMermaid = detectMermaidInPath(resolvedPath);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} 偵測到 Mermaid 圖表，將自動渲染`);
  }

  console.log(`${c.cyan}→${c.reset} 正在轉換中...`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertFile(resolvedPath, finalOutput, {
      enableMermaid: hasMermaid,
    });
    console.log(`\n${c.green}✓${c.reset} 完成！已產生: ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} 轉換失敗: ${error instanceof Error ? error.message : "未知錯誤"}\n`);
  }
}

function listDirectories(): string[] {
  const currentDir = process.cwd();
  return fs
    .readdirSync(currentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
    .map((d) => d.name);
}

function printDirectoryList(dirs: string[]): void {
  const currentDir = process.cwd();
  if (dirs.length > 0) {
    console.log(`${c.dim}目前目錄的資料夾：${c.reset}`);
    dirs.forEach((d, i) => {
      const mdCount = listMdFiles(path.join(currentDir, d)).length;
      const suffix = mdCount > 0 ? ` ${c.dim}(${mdCount} 個 .md 檔案)${c.reset}` : ` ${c.dim}(無 .md 檔案)${c.reset}`;
      console.log(`  ${c.dim}${i + 1}.${c.reset} ${d}${suffix}`);
    });
    console.log("");
  } else {
    console.log(`${c.dim}目前目錄沒有子資料夾${c.reset}\n`);
  }
}

async function mergeDirectory(): Promise<void> {
  console.log(`\n${c.bright}📁 合併資料夾${c.reset}\n`);

  let dirs = listDirectories();
  printDirectoryList(dirs);

  let inputDir = "";
  let refreshTriggered = false;

  do {
    refreshTriggered = false;
    inputDir = await askWithHotkeys(
      `${c.cyan}?${c.reset} 請輸入資料夾路徑（或編號，按 r 重新整理）: `,
      {
        r: () => {
          refreshTriggered = true;
          console.log(`${c.cyan}→${c.reset} 重新整理...\n`);
          dirs = listDirectories();
          printDirectoryList(dirs);
        },
      }
    );
  } while (refreshTriggered || inputDir === "\0HOTKEY");

  let resolvedDir: string;
  const num = parseInt(inputDir, 10);
  if (!isNaN(num) && num >= 1 && num <= dirs.length) {
    resolvedDir = path.resolve(dirs[num - 1]);
  } else {
    resolvedDir = path.resolve(inputDir);
  }

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    console.log(`\n${c.red}✗${c.reset} 找不到資料夾: ${resolvedDir}\n`);
    return;
  }

  const mdFiles = listMdFiles(resolvedDir);
  if (mdFiles.length === 0) {
    console.log(`\n${c.red}✗${c.reset} 資料夾中沒有 .md 檔案\n`);
    return;
  }

  console.log(`\n${c.dim}將合併以下檔案：${c.reset}`);
  mdFiles.forEach((f, i) => {
    const content = fs.readFileSync(path.join(resolvedDir, f), "utf-8");
    const hasMermaid = containsMermaid(content);
    const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
  });

  const dirName = path.basename(resolvedDir);
  const defaultOutput = path.join(path.dirname(resolvedDir), `${dirName}.docx`);

  const outputPath = await ask(
    `\n${c.cyan}?${c.reset} 輸出檔案路徑 ${c.dim}(Enter = ${path.basename(defaultOutput)})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  // 分隔符選擇
  console.log(`\n${c.dim}章節分隔方式：${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} pagebreak - 分頁符（預設）`);
  console.log(`  ${c.dim}2.${c.reset} hr - 水平分隔線`);
  console.log(`  ${c.dim}3.${c.reset} none - 無分隔`);

  const sepChoice = await ask(`${c.cyan}?${c.reset} 選擇分隔方式 ${c.dim}(Enter = 1)${c.reset}: `);
  const separators: Record<string, "pagebreak" | "hr" | "none"> = {
    "1": "pagebreak",
    "2": "hr",
    "3": "none",
    "": "pagebreak",
  };
  const separator = separators[sepChoice] || "pagebreak";

  const hasMermaid = detectMermaidInPath(resolvedDir);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} 偵測到 Mermaid 圖表，將自動渲染`);
  }

  console.log(`${c.cyan}→${c.reset} 正在轉換中...`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertDirectory(resolvedDir, finalOutput, {
      enableMermaid: hasMermaid,
      separator,
    });
    console.log(`\n${c.green}✓${c.reset} 完成！已產生: ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} 轉換失敗: ${error instanceof Error ? error.message : "未知錯誤"}\n`);
  }
}

async function specifyDirectory(): Promise<void> {
  console.log(`\n${c.bright}📂 指定資料夾路徑${c.reset}\n`);

  const inputDir = await ask(`${c.cyan}?${c.reset} 請輸入資料夾完整路徑: `);

  if (!inputDir) {
    console.log(`\n${c.yellow}!${c.reset} 已取消\n`);
    return;
  }

  const resolvedDir = path.resolve(inputDir);

  if (!fs.existsSync(resolvedDir)) {
    console.log(`\n${c.red}✗${c.reset} 找不到資料夾: ${resolvedDir}\n`);
    return;
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    console.log(`\n${c.red}✗${c.reset} 不是資料夾: ${resolvedDir}\n`);
    return;
  }

  const mdFiles = listMdFiles(resolvedDir);
  if (mdFiles.length === 0) {
    console.log(`\n${c.red}✗${c.reset} 資料夾中沒有 .md 檔案\n`);
    return;
  }

  console.log(`\n${c.green}✓${c.reset} 找到 ${mdFiles.length} 個 Markdown 檔案：`);
  mdFiles.forEach((f, i) => {
    const content = fs.readFileSync(path.join(resolvedDir, f), "utf-8");
    const hasMermaid = containsMermaid(content);
    const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
  });

  const confirm = await ask(`\n${c.cyan}?${c.reset} 確認要合併這些檔案嗎？(Y/n): `);
  if (confirm.toLowerCase() === "n") {
    console.log(`\n${c.yellow}!${c.reset} 已取消\n`);
    return;
  }

  const dirName = path.basename(resolvedDir);
  const defaultOutput = path.join(path.dirname(resolvedDir), `${dirName}.docx`);

  const outputPath = await ask(
    `${c.cyan}?${c.reset} 輸出檔案路徑 ${c.dim}(Enter = ${defaultOutput})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  // 分隔符選擇
  console.log(`\n${c.dim}章節分隔方式：${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} pagebreak - 分頁符（預設）`);
  console.log(`  ${c.dim}2.${c.reset} hr - 水平分隔線`);
  console.log(`  ${c.dim}3.${c.reset} none - 無分隔`);

  const sepChoice = await ask(`${c.cyan}?${c.reset} 選擇分隔方式 ${c.dim}(Enter = 1)${c.reset}: `);
  const separators: Record<string, "pagebreak" | "hr" | "none"> = {
    "1": "pagebreak",
    "2": "hr",
    "3": "none",
    "": "pagebreak",
  };
  const separator = separators[sepChoice] || "pagebreak";

  const hasMermaid = detectMermaidInPath(resolvedDir);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} 偵測到 Mermaid 圖表，將自動渲染`);
  }

  console.log(`${c.cyan}→${c.reset} 正在轉換中...`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertDirectory(resolvedDir, finalOutput, {
      enableMermaid: hasMermaid,
      separator,
    });
    console.log(`\n${c.green}✓${c.reset} 完成！已產生: ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} 轉換失敗: ${error instanceof Error ? error.message : "未知錯誤"}\n`);
  }
}

function showHelp(): void {
  console.log(`
${c.bright}Mermadoc 使用說明${c.reset}
${c.dim}────────────────────────────────────────${c.reset}

${c.yellow}功能特色：${c.reset}
  • 將 Markdown 轉換為 Word 文件 (.docx)
  • 支援 Mermaid 圖表自動渲染
  • 可合併多個 Markdown 檔案
  • 支援 GFM 表格、程式碼區塊、清單等

${c.yellow}支援的 Mermaid 圖表類型：${c.reset}
  • flowchart (流程圖)
  • sequenceDiagram (時序圖)
  • classDiagram (類別圖)
  • erDiagram (ER 圖)
  • gantt (甘特圖)
  • 其他 Mermaid 支援的圖表

${c.yellow}命令列使用方式：${c.reset}
  ${c.dim}$${c.reset} md-docx example/example.md   # 轉換單一檔案
  ${c.dim}$${c.reset} md-docx ./reports            # 合併資料夾
  ${c.dim}$${c.reset} md-docx ./reports -o out.docx # 指定輸出檔名

${c.yellow}範例檔案：${c.reset}
  example/example.md - 包含各種格式與 Mermaid 圖表的範例

${c.dim}按 Enter 返回主選單...${c.reset}`);
}

async function main(): Promise<void> {
  createReadline();
  clear();
  printBanner();

  let running = true;

  while (running) {
    printMenu();
    const choice = await ask(`${c.cyan}?${c.reset} 請選擇 (0-4): `);

    switch (choice) {
      case "1":
        await convertSingleFile();
        break;
      case "2":
        await mergeDirectory();
        break;
      case "3":
        await specifyDirectory();
        break;
      case "4":
        showHelp();
        await ask("");
        clear();
        printBanner();
        break;
      case "0":
      case "q":
      case "exit":
        running = false;
        console.log(`\n${c.dim}再見！${c.reset}\n`);
        break;
      default:
        console.log(`\n${c.yellow}!${c.reset} 請輸入有效選項\n`);
    }
  }

  rl.close();
}

main();
