#!/usr/bin/env node

import { MdToDocxConverter } from "./converter.js";
import { MdToPdfConverter } from "./pdf-converter.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { t, setLanguage, detectSystemLanguage, type Language } from "./i18n.js";

export type OutputFormat = "docx" | "pdf";

export interface CliOptions {
  input: string;
  output?: string;
  format: OutputFormat;
  mermaid: boolean | "auto";
  separator: "pagebreak" | "hr" | "none";
  noMermaid: boolean;
  saveImagesDir?: string;
  imageDpi?: number;
  lang?: Language;
}

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

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    format: "docx",
    mermaid: "auto",
    separator: "pagebreak",
    noMermaid: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      options.output = args[++i];
    } else if (arg === "-f" || arg === "--format") {
      const fmt = args[++i]?.toLowerCase();
      if (fmt === "docx" || fmt === "pdf") {
        options.format = fmt;
      } else {
        logError(`Invalid format: ${fmt}. Use 'docx' or 'pdf'.`);
        process.exit(1);
      }
    } else if (arg === "-m" || arg === "--mermaid") {
      options.mermaid = true;
    } else if (arg === "--no-mermaid") {
      options.noMermaid = true;
    } else if (arg === "-i" || arg === "--save-images") {
      options.saveImagesDir = args[++i];
    } else if (arg === "-d" || arg === "--dpi") {
      const dpi = parseInt(args[++i], 10);
      if (!isNaN(dpi) && dpi >= 72 && dpi <= 600) {
        options.imageDpi = dpi;
      }
    } else if (arg === "-s" || arg === "--separator") {
      const sep = args[++i];
      if (sep === "pagebreak" || sep === "hr" || sep === "none") {
        options.separator = sep;
      } else {
        logError(`Invalid separator: ${sep}. Use 'pagebreak', 'hr', or 'none'.`);
        process.exit(1);
      }
    } else if (arg === "-l" || arg === "--lang") {
      const lang = args[++i];
      if (lang === "en" || lang === "zh-TW" || lang === "zh") {
        options.lang = lang === "zh" ? "zh-TW" : lang as Language;
      }
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      options.input = arg;
    }
  }

  // Auto-detect format from output extension if not explicitly specified
  if (options.output && !args.some(a => a === "-f" || a === "--format")) {
    const ext = path.extname(options.output).toLowerCase();
    if (ext === ".pdf") {
      options.format = "pdf";
    } else if (ext === ".docx") {
      options.format = "docx";
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${colors.bright}mermadoc${colors.reset} - ${t("cliTitle")}

${colors.yellow}${t("cliUsage")}${colors.reset}
  mermadoc <file.md>              ${t("cliExConvertSingle")}
  mermadoc <directory>            ${t("cliExMergeDir")}

${colors.yellow}${t("cliOptions")}${colors.reset}
  -o, --output <file>     ${t("cliOptOutput")}
  -f, --format <type>     ${t("cliOptFormat")}
  -s, --separator <type>  ${t("cliOptSeparator")}
  -i, --save-images <dir> ${t("cliOptSaveImages")}
  -d, --dpi <n>           ${t("cliOptImageDpi")}
  -l, --lang <lang>       Language: en, zh-TW
  --no-mermaid            ${t("cliOptNoMermaid")}
  -h, --help              ${t("cliOptHelp")}

${colors.yellow}${t("cliExamples")}${colors.reset}
  ${colors.dim}${t("cliExConvertSingle")}${colors.reset}
  mermadoc example/example.md

  ${colors.dim}${t("cliExMergeDir")}${colors.reset}
  mermadoc ./reports -o manual.docx

  ${colors.dim}${t("cliExWithSeparator")}${colors.reset}
  mermadoc ./reports -o manual.docx -s hr

  ${colors.dim}${t("cliExConvertToPdf")}${colors.reset}
  mermadoc example.md -f pdf
  mermadoc example.md -o output.pdf

${colors.dim}${t("cliTip")}${colors.reset}
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Pre-parse to check for language option
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-l" || args[i] === "--lang") {
      const lang = args[i + 1];
      if (lang === "en" || lang === "zh-TW" || lang === "zh") {
        setLanguage(lang === "zh" ? "zh-TW" : lang as Language);
      }
      break;
    }
  }

  // If no language specified, detect from system
  if (!args.some(a => a === "-l" || a === "--lang")) {
    setLanguage(detectSystemLanguage());
  }

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.input) {
    logError(t("cliInputRequired"));
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(options.input);

  if (!fs.existsSync(inputPath)) {
    logError(`${t("fileNotFound")} ${inputPath}`);
    process.exit(1);
  }

  const docxConverter = new MdToDocxConverter();
  const pdfConverter = new MdToPdfConverter();
  const outputFormat = options.format;
  const fileExt = outputFormat === "pdf" ? ".pdf" : ".docx";

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
        : path.join(path.dirname(inputPath), `${dirName}${fileExt}`);

      const mdFiles = fs.readdirSync(inputPath)
        .filter(f => f.endsWith(".md"))
        .sort();

      if (mdFiles.length === 0) {
        logError(`${t("noMdFiles")}: ${inputPath}`);
        process.exit(1);
      }

      log("");
      log(`${colors.bright}${icons.folder} ${t("cliMergeFiles")}${colors.reset}`);
      log(`${colors.dim}───────────────────────────────${colors.reset}`);

      // Display file list, indicate if contains Mermaid
      mdFiles.forEach((f, i) => {
        const content = fs.readFileSync(path.join(inputPath, f), "utf-8");
        const hasMermaid = containsMermaid(content);
        logFile(i + 1, f, hasMermaid);
      });

      log(`${colors.dim}───────────────────────────────${colors.reset}`);

      if (enableMermaid) {
        logInfo(t("mermaidDetected"));
      }

      logInfo(`${t("converting")} (${outputFormat.toUpperCase()})`);

      if (outputFormat === "pdf") {
        await pdfConverter.convertDirectory(inputPath, outputPath, {
          enableMermaid,
          separator: options.separator,
        });
      } else {
        await docxConverter.convertDirectory(inputPath, outputPath, {
          enableMermaid,
          separator: options.separator,
          saveImagesDir: options.saveImagesDir,
          imageDpi: options.imageDpi,
        });
      }

      log("");
      logSuccess(`${t("done")} ${t("completed")} ${colors.bright}${outputPath}${colors.reset}`);
      if (options.saveImagesDir && outputFormat === "docx") {
        logInfo(`${t("cliImagesSaved")} ${colors.bright}${path.resolve(options.saveImagesDir)}${colors.reset}`);
      }
      log("");
    } else {
      // Single file mode
      const baseName = path.basename(inputPath, ".md");
      const outputPath = options.output
        ? path.resolve(options.output)
        : path.join(path.dirname(inputPath), `${baseName}${fileExt}`);

      log("");
      log(`${colors.bright}${icons.file} ${t("cliConvertFile")}${colors.reset}`);
      log(`${colors.dim}───────────────────────────────${colors.reset}`);
      logInfo(`${t("cliInput")} ${path.basename(inputPath)}`);

      if (enableMermaid) {
        logInfo(t("mermaidDetected"));
      }

      logInfo(`${t("converting")} (${outputFormat.toUpperCase()})`);

      if (outputFormat === "pdf") {
        await pdfConverter.convertFile(inputPath, outputPath, {
          enableMermaid,
        });
      } else {
        await docxConverter.convertFile(inputPath, outputPath, {
          enableMermaid,
          saveImagesDir: options.saveImagesDir,
          imageDpi: options.imageDpi,
        });
      }

      log("");
      logSuccess(`${t("done")} ${t("completed")} ${colors.bright}${outputPath}${colors.reset}`);
      if (options.saveImagesDir && outputFormat === "docx") {
        logInfo(`${t("cliImagesSaved")} ${colors.bright}${path.resolve(options.saveImagesDir)}${colors.reset}`);
      }
      log("");
    }
  } catch (error) {
    log("");
    if (error instanceof Error) {
      logError(error.message);
    } else {
      logError(t("unknownError"));
    }
    process.exit(1);
  } finally {
    // Always release Chromium / temp resources, even on error paths.
    await pdfConverter.cleanup();
  }
}

// Only execute main() when run directly (not when imported by tests).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
