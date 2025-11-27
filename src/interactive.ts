#!/usr/bin/env node

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { MdToDocxConverter } from "./converter.js";
import { t, setLanguage, getLanguage, initLanguageFromConfig, saveConfig, type Language } from "./i18n.js";

// ANSI color codes
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

/**
 * Simple input function using raw mode
 */
function ask(question: string): Promise<string> {
  return askWithHotkeys(question, {});
}

/**
 * Real-time key input with hotkey support
 * @param question Prompt text
 * @param hotkeys Hotkey callbacks { key: callback }
 */
function askWithHotkeys(
  question: string,
  hotkeys: Record<string, () => void>
): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);

    let input = "";
    const stdin = process.stdin;

    // Ensure stdin is in clean state
    stdin.removeAllListeners("data");

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.removeAllListeners("data");
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
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
        resolve(input.trim());
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

      // Check hotkeys (only trigger when input is empty)
      if (input === "" && hotkeys[key.toLowerCase()]) {
        cleanup();
        process.stdout.write("\n");
        hotkeys[key.toLowerCase()]();
        resolve("\0HOTKEY"); // Special marker
        return;
      }

      // Regular characters
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
║   ${c.bright}${c.magenta}📄 ${t("interBanner")}${c.reset}${c.cyan}${" ".repeat(Math.max(0, 22 - t("interBanner").length))}║
║   ${c.dim}${t("interSubtitle")}${c.reset}${c.cyan}${" ".repeat(Math.max(0, 23 - t("interSubtitle").length))}║
║                                          ║
╚══════════════════════════════════════════╝${c.reset}
`);
}

function printMenu(): void {
  console.log(`${c.yellow}${t("interSelectOption")}${c.reset}

  ${c.bright}1.${c.reset} ${t("interOpt1")}
  ${c.bright}2.${c.reset} ${t("interOpt2")}
  ${c.bright}3.${c.reset} ${t("interOpt3")}
  ${c.bright}4.${c.reset} ${t("interOpt4")}
  ${c.bright}5.${c.reset} ${t("interOpt5")}
  ${c.bright}0.${c.reset} ${t("interOpt0")}
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
    console.log(`${c.dim}${t("interCurrentMdFiles")}${c.reset}`);
    mdFiles.forEach((f, i) => {
      const content = fs.readFileSync(f, "utf-8");
      const hasMermaid = containsMermaid(content);
      const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
      console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
    });
    console.log("");
  } else {
    console.log(`${c.dim}${t("interNoMdFiles")}${c.reset}\n`);
  }
}

async function convertSingleFile(): Promise<void> {
  console.log(`\n${c.bright}📄 ${t("interConvertSingle")}${c.reset}\n`);

  const currentDir = process.cwd();
  let mdFiles = listMdFiles(currentDir);
  printMdFileList(mdFiles);

  let inputPath = "";
  let refreshTriggered = false;

  do {
    refreshTriggered = false;
    inputPath = await askWithHotkeys(
      `${c.cyan}?${c.reset} ${t("interInputFilePath")} `,
      {
        r: () => {
          refreshTriggered = true;
          console.log(`${c.cyan}→${c.reset} ${t("interRefreshing")}\n`);
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
    console.log(`\n${c.red}✗${c.reset} ${t("fileNotFound")} ${resolvedPath}\n`);
    return;
  }

  const baseName = path.basename(resolvedPath, ".md");
  const defaultOutput = path.join(path.dirname(resolvedPath), `${baseName}.docx`);

  const outputPath = await ask(
    `${c.cyan}?${c.reset} ${t("interOutputPath")} ${c.dim}(Enter = ${path.basename(defaultOutput)})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  const hasMermaid = detectMermaidInPath(resolvedPath);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} ${t("interAutoRenderMermaid")}`);
  }

  console.log(`${c.cyan}→${c.reset} ${t("converting")}`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertFile(resolvedPath, finalOutput, {
      enableMermaid: hasMermaid,
    });
    console.log(`\n${c.green}✓${c.reset} ${t("done")} ${t("completed")} ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} ${t("conversionFailed")} ${error instanceof Error ? error.message : t("unknownError")}\n`);
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
    console.log(`${c.dim}${t("interCurrentDirs")}${c.reset}`);
    dirs.forEach((d, i) => {
      const mdCount = listMdFiles(path.join(currentDir, d)).length;
      const suffix = mdCount > 0 ? ` ${c.dim}(${mdCount} ${t("interMdFileCount")})${c.reset}` : ` ${c.dim}(${t("interNoMdInDir")})${c.reset}`;
      console.log(`  ${c.dim}${i + 1}.${c.reset} ${d}${suffix}`);
    });
    console.log("");
  } else {
    console.log(`${c.dim}${t("interNoDirs")}${c.reset}\n`);
  }
}

async function mergeDirectory(): Promise<void> {
  console.log(`\n${c.bright}📁 ${t("interMergeDir")}${c.reset}\n`);

  let dirs = listDirectories();
  printDirectoryList(dirs);

  let inputDir = "";
  let refreshTriggered = false;

  do {
    refreshTriggered = false;
    inputDir = await askWithHotkeys(
      `${c.cyan}?${c.reset} ${t("interInputDirPath")} `,
      {
        r: () => {
          refreshTriggered = true;
          console.log(`${c.cyan}→${c.reset} ${t("interRefreshing")}\n`);
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
    console.log(`\n${c.red}✗${c.reset} ${t("dirNotFound")} ${resolvedDir}\n`);
    return;
  }

  const mdFiles = listMdFiles(resolvedDir);
  if (mdFiles.length === 0) {
    console.log(`\n${c.red}✗${c.reset} ${t("noMdFiles")}\n`);
    return;
  }

  console.log(`\n${c.dim}${t("interWillMerge")}${c.reset}`);
  mdFiles.forEach((f, i) => {
    const content = fs.readFileSync(path.join(resolvedDir, f), "utf-8");
    const hasMermaid = containsMermaid(content);
    const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
  });

  const dirName = path.basename(resolvedDir);
  const defaultOutput = path.join(path.dirname(resolvedDir), `${dirName}.docx`);

  const outputPath = await ask(
    `\n${c.cyan}?${c.reset} ${t("interOutputPath")} ${c.dim}(Enter = ${path.basename(defaultOutput)})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  // Separator selection
  console.log(`\n${c.dim}${t("interSeparatorType")}${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} ${t("interSepPagebreak")}`);
  console.log(`  ${c.dim}2.${c.reset} ${t("interSepHr")}`);
  console.log(`  ${c.dim}3.${c.reset} ${t("interSepNone")}`);

  const sepChoice = await ask(`${c.cyan}?${c.reset} ${t("interSelectSeparator")} `);
  const separators: Record<string, "pagebreak" | "hr" | "none"> = {
    "1": "pagebreak",
    "2": "hr",
    "3": "none",
    "": "pagebreak",
  };
  const separator = separators[sepChoice] || "pagebreak";

  const hasMermaid = detectMermaidInPath(resolvedDir);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} ${t("interAutoRenderMermaid")}`);
  }

  console.log(`${c.cyan}→${c.reset} ${t("converting")}`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertDirectory(resolvedDir, finalOutput, {
      enableMermaid: hasMermaid,
      separator,
    });
    console.log(`\n${c.green}✓${c.reset} ${t("done")} ${t("completed")} ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} ${t("conversionFailed")} ${error instanceof Error ? error.message : t("unknownError")}\n`);
  }
}

async function specifyDirectory(): Promise<void> {
  console.log(`\n${c.bright}📂 ${t("interSpecifyDir")}${c.reset}\n`);

  const inputDir = await ask(`${c.cyan}?${c.reset} ${t("interInputFullDirPath")} `);

  if (!inputDir) {
    console.log(`\n${c.yellow}!${c.reset} ${t("cancel")}\n`);
    return;
  }

  const resolvedDir = path.resolve(inputDir);

  if (!fs.existsSync(resolvedDir)) {
    console.log(`\n${c.red}✗${c.reset} ${t("dirNotFound")} ${resolvedDir}\n`);
    return;
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    console.log(`\n${c.red}✗${c.reset} ${t("notADir")} ${resolvedDir}\n`);
    return;
  }

  const mdFiles = listMdFiles(resolvedDir);
  if (mdFiles.length === 0) {
    console.log(`\n${c.red}✗${c.reset} ${t("noMdFiles")}\n`);
    return;
  }

  console.log(`\n${c.green}✓${c.reset} ${t("interFoundMdFiles")} ${mdFiles.length}`);
  mdFiles.forEach((f, i) => {
    const content = fs.readFileSync(path.join(resolvedDir, f), "utf-8");
    const hasMermaid = containsMermaid(content);
    const suffix = hasMermaid ? ` ${c.dim}(mermaid)${c.reset}` : "";
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${f}${suffix}`);
  });

  const confirm = await ask(`\n${c.cyan}?${c.reset} ${t("interConfirmMerge")} `);
  if (confirm.toLowerCase() === "n") {
    console.log(`\n${c.yellow}!${c.reset} ${t("cancel")}\n`);
    return;
  }

  const dirName = path.basename(resolvedDir);
  const defaultOutput = path.join(path.dirname(resolvedDir), `${dirName}.docx`);

  const outputPath = await ask(
    `${c.cyan}?${c.reset} ${t("interOutputPath")} ${c.dim}(Enter = ${defaultOutput})${c.reset}: `
  );
  const finalOutput = outputPath || defaultOutput;

  // Separator selection
  console.log(`\n${c.dim}${t("interSeparatorType")}${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} ${t("interSepPagebreak")}`);
  console.log(`  ${c.dim}2.${c.reset} ${t("interSepHr")}`);
  console.log(`  ${c.dim}3.${c.reset} ${t("interSepNone")}`);

  const sepChoice = await ask(`${c.cyan}?${c.reset} ${t("interSelectSeparator")} `);
  const separators: Record<string, "pagebreak" | "hr" | "none"> = {
    "1": "pagebreak",
    "2": "hr",
    "3": "none",
    "": "pagebreak",
  };
  const separator = separators[sepChoice] || "pagebreak";

  const hasMermaid = detectMermaidInPath(resolvedDir);
  if (hasMermaid) {
    console.log(`\n${c.cyan}→${c.reset} ${t("interAutoRenderMermaid")}`);
  }

  console.log(`${c.cyan}→${c.reset} ${t("converting")}`);

  try {
    const converter = new MdToDocxConverter();
    await converter.convertDirectory(resolvedDir, finalOutput, {
      enableMermaid: hasMermaid,
      separator,
    });
    console.log(`\n${c.green}✓${c.reset} ${t("done")} ${t("completed")} ${c.bright}${finalOutput}${c.reset}\n`);
  } catch (error) {
    console.log(`\n${c.red}✗${c.reset} ${t("conversionFailed")} ${error instanceof Error ? error.message : t("unknownError")}\n`);
  }
}

function showHelp(): void {
  console.log(`
${c.bright}${t("helpTitle")}${c.reset}
${c.dim}────────────────────────────────────────${c.reset}

${c.yellow}${t("helpFeatures")}${c.reset}
  • ${t("helpFeature1")}
  • ${t("helpFeature2")}
  • ${t("helpFeature3")}
  • ${t("helpFeature4")}

${c.yellow}${t("helpMermaidTypes")}${c.reset}
  • flowchart
  • sequenceDiagram
  • classDiagram
  • erDiagram
  • gantt

${c.yellow}${t("helpCliUsage")}${c.reset}
  ${c.dim}$${c.reset} mermadoc example/example.md
  ${c.dim}$${c.reset} mermadoc ./reports
  ${c.dim}$${c.reset} mermadoc ./reports -o out.docx

${c.yellow}${t("helpExampleFile")}${c.reset}
  example/example.md

${c.dim}${t("pressEnterToReturn")}${c.reset}`);
}

async function showSettings(): Promise<void> {
  console.log(`\n${c.bright}⚙️  ${t("settingsTitle")}${c.reset}\n`);

  const currentLang = getLanguage();
  const langName = currentLang === "zh-TW" ? t("langChinese") : t("langEnglish");
  console.log(`${c.dim}${t("settingsCurrentLang")} ${langName}${c.reset}\n`);

  console.log(`${c.yellow}${t("langSelect")}${c.reset}
  ${c.bright}1.${c.reset} ${t("langEnglish")}
  ${c.bright}2.${c.reset} ${t("langChinese")}
`);

  const choice = await ask(`${c.cyan}?${c.reset} Select (1-2): `);

  let newLang: Language = currentLang;
  if (choice === "1") {
    newLang = "en";
  } else if (choice === "2") {
    newLang = "zh-TW";
  }

  if (newLang !== currentLang) {
    setLanguage(newLang);
    saveConfig({ language: newLang });
    console.log(`\n${c.green}✓${c.reset} ${t("settingsSaved")}\n`);
  }
}

async function main(): Promise<void> {
  createReadline();

  // Load language from config (defaults to English if no config)
  initLanguageFromConfig();

  clear();
  printBanner();

  let running = true;

  while (running) {
    printMenu();
    const choice = await ask(`${c.cyan}?${c.reset} ${t("interPromptSelect")} `);

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
      case "5":
        await showSettings();
        clear();
        printBanner();
        break;
      case "0":
      case "q":
      case "exit":
        running = false;
        console.log(`\n${c.dim}${t("goodbye")}${c.reset}\n`);
        break;
      default:
        console.log(`\n${c.yellow}!${c.reset} ${t("invalidOption")}\n`);
    }
  }

  rl.close();
}

main();
