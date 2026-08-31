import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";

export interface MermaidBlock {
  code: string;
  startIndex: number;
  endIndex: number;
}

const MERMAID_REGEX_SOURCE = "```mermaid\\n([\\s\\S]*?)```";
const DEFAULT_DPI = 150;
const BASE_DPI = 96;

/**
 * Shared Mermaid PNG renderer used by both the DOCX and PDF converters.
 *
 * Renders are cached on disk by `md5(code + dpi)` so repeated runs over the
 * same document — or different output formats of the same document — reuse
 * previously generated PNGs.
 */
export class MermaidRenderer {
  private tempDir: string;

  constructor(tempDirName: string = "md-docx-mermaid") {
    this.tempDir = path.join(os.tmpdir(), tempDirName);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  extractBlocks(markdown: string): MermaidBlock[] {
    const blocks: MermaidBlock[] = [];
    const regex = new RegExp(MERMAID_REGEX_SOURCE, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        code: match[1].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    return blocks;
  }

  async renderToPng(mermaidCode: string, dpi: number = DEFAULT_DPI): Promise<string> {
    const scale = Math.max(1, Math.round((dpi / BASE_DPI) * 10) / 10);
    const hash = crypto.createHash("md5").update(mermaidCode + dpi).digest("hex");
    const inputFile = path.join(this.tempDir, `${hash}.mmd`);
    const outputFile = path.join(this.tempDir, `${hash}.png`);

    if (fs.existsSync(outputFile)) {
      return outputFile;
    }

    await fs.promises.writeFile(inputFile, mermaidCode);

    const mmdc = path.join(process.cwd(), "node_modules", ".bin", "mmdc");
    return new Promise((resolve, reject) => {
      const proc = spawn(mmdc, [
        "-i", inputFile,
        "-o", outputFile,
        "-b", "white",
        "-s", String(scale),
      ]);

      let stderr = "";
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Mermaid rendering failed: ${stderr}`));
          return;
        }
        if (!fs.existsSync(outputFile)) {
          reject(new Error("Mermaid output file not created"));
          return;
        }
        resolve(outputFile);
      });

      proc.on("error", reject);
    });
  }

  /**
   * Replaces all Mermaid code blocks in the markdown with `![](data:image/png;base64,...)`
   * image references. Failures in individual blocks are logged but do not
   * abort the surrounding document — the original fence is left in place so
   * the user can still see something.
   */
  async preprocessToMarkdown(markdown: string, dpi: number = DEFAULT_DPI): Promise<string> {
    const blocks = this.extractBlocks(markdown);
    if (blocks.length === 0) {
      return markdown;
    }

    let result = markdown;
    let offset = 0;

    for (const block of blocks) {
      try {
        const pngPath = await this.renderToPng(block.code, dpi);
        const pngBuffer = await fs.promises.readFile(pngPath);
        const base64 = pngBuffer.toString("base64");
        const dataUri = `data:image/png;base64,${base64}`;
        const imgMarkdown = `\n\n![Mermaid Diagram](${dataUri})\n\n`;

        const adjustedStart = block.startIndex + offset;
        const adjustedEnd = block.endIndex + offset;

        result =
          result.substring(0, adjustedStart) +
          imgMarkdown +
          result.substring(adjustedEnd);

        offset += imgMarkdown.length - (block.endIndex - block.startIndex);
      } catch (error) {
        console.error(`Failed to render mermaid block: ${error instanceof Error ? error.message : error}`);
      }
    }

    return result;
  }

  /**
   * No-op by default — PNG renders are content-addressed (md5 of code+dpi),
   * so leaving them on disk is both safe and a meaningful performance win
   * for repeated runs over the same document. Call `purgeCache()` to wipe
   * everything explicitly.
   */
  cleanup(): void {
    // intentionally empty
  }

  purgeCache(): void {
    if (!fs.existsSync(this.tempDir)) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(this.tempDir);
    } catch (error) {
      console.warn(`Failed to read mermaid temp dir ${this.tempDir}:`, error instanceof Error ? error.message : error);
      return;
    }
    for (const file of entries) {
      try {
        fs.unlinkSync(path.join(this.tempDir, file));
      } catch (error) {
        console.warn(`Failed to remove ${file}:`, error instanceof Error ? error.message : error);
      }
    }
  }
}
