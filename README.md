# Mermadoc

Convert Markdown to Word documents with Mermaid diagram rendering and syntax highlighting.

> **Mermadoc** = **Merma**id + **Doc**ument

## Features

- Convert Markdown to Word documents (.docx)
- Auto-detect and render Mermaid diagrams
- Code syntax highlighting (powered by Shiki)
- Merge multiple Markdown files into a single document
- Support GFM tables, code blocks, lists, and more
- Interactive CLI interface
- Multi-language support (English / Traditional Chinese)

## Installation

```bash
# Use directly with npx (no install needed)
npx mermadoc <file.md>

# Or install globally
npm install -g mermadoc
```

### For Development

```bash
git clone https://github.com/user/mermadoc.git
cd mermadoc
npm install
npm run build
```

## Usage

### Interactive Mode (Recommended)

```bash
./start
# or
npm start
```

After launching, a menu will guide you through the conversion:

```
╔══════════════════════════════════════════╗
║                                          ║
║   📄 Mermadoc Converter                  ║
║   Markdown → Word Document               ║
║                                          ║
╚══════════════════════════════════════════╝

Select an option:

  1. Convert a single Markdown file
  2. Merge all Markdown files in a folder
  3. Specify folder path
  4. Show help
  5. Settings
  0. Exit
```

#### Hotkeys

| Key | Function |
|-----|----------|
| `r` | Refresh file/folder list instantly (no Enter needed) |
| `0` or `q` | Exit |

### Command Line Mode

```bash
# Convert a single file (auto-detect Mermaid)
mermadoc example.md

# Merge all .md files in a folder
mermadoc ./reports

# Specify output filename
mermadoc ./reports -o manual.docx

# Use horizontal rule as section separator (default: page break)
mermadoc ./reports -o manual.docx -s hr

# Save images to a separate folder
mermadoc example.md -i ./images

# Set image DPI to 300 (higher resolution)
mermadoc example.md -d 300

# Combine options: high DPI + save images
mermadoc example.md -d 300 -i ./images
```

> **Note:** You can also use `npx mermadoc` if not installed globally.

### Programmatic API

```typescript
import { MdToDocxConverter } from "mermadoc";

const converter = new MdToDocxConverter();

// Convert string
const buffer = await converter.convert(markdownContent, {
  enableMermaid: true,
  saveImagesDir: "./images",  // Save images to directory
  imageDpi: 300,              // Image DPI (default: 150, range: 72-600)
});

// Convert file
await converter.convertFile("input.md", "output.docx", {
  enableMermaid: true,
  saveImagesDir: "./images",
  imageDpi: 300,
});

// Merge directory
await converter.convertDirectory("./docs", "merged.docx", {
  enableMermaid: true,
  separator: "pagebreak", // 'pagebreak' | 'hr' | 'none'
  saveImagesDir: "./images",
  imageDpi: 300,
});

// Merge specific files
await converter.convertFiles(
  ["01-intro.md", "02-chapter.md"],
  "book.docx",
  { enableMermaid: true, imageDpi: 300 }
);
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Specify output file path |
| `-s, --separator <type>` | Section separator: `pagebreak`, `hr`, `none` |
| `-i, --save-images <dir>` | Save images to specified directory |
| `-d, --dpi <n>` | Image DPI/resolution (default: 150, range: 72-600) |
| `-l, --lang <lang>` | Language: `en`, `zh-TW` |
| `--no-mermaid` | Disable Mermaid rendering (auto-detect by default) |
| `-h, --help` | Show help |

## Code Syntax Highlighting

Powered by [Shiki](https://shiki.matsu.io/), supporting:

- **Web**: JavaScript, TypeScript, HTML, CSS, JSON
- **Backend**: Python, Java, Go, Rust, Ruby, PHP, C#
- **System**: C, C++, Swift, Kotlin
- **Scripting**: Bash, Shell, PowerShell
- **Others**: SQL, YAML, XML, Markdown, Dockerfile

Code blocks are rendered with a light gray background, monospace font, and colored syntax.

## Supported Mermaid Diagrams

- flowchart
- sequenceDiagram
- classDiagram
- erDiagram
- gantt
- pie
- And other Mermaid-supported diagram types

## Example

The `example/` folder contains sample Markdown files:

```bash
# Convert example file
mermadoc example/example.md
```

Example includes:
- Basic formatting (bold, italic, inline code)
- Tables
- Code blocks (with syntax highlighting)
- Mermaid flowcharts and sequence diagrams
- Nested lists

## Project Structure

```
mermadoc/
├── src/
│   ├── converter.ts    # Core conversion logic
│   ├── code-plugin.ts  # Syntax highlighting plugin
│   ├── cli.ts          # Command line interface
│   ├── interactive.ts  # Interactive interface
│   ├── i18n.ts         # Internationalization
│   └── index.ts        # Module exports
├── example/
│   └── example.md      # Example file
├── tests/
│   └── converter.test.ts
├── start               # Interactive launch script
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode tests
npm run test:watch
```

## Dependencies

- [unified](https://github.com/unifiedjs/unified) - Markdown processing
- [remark-gfm](https://github.com/remarkjs/remark-gfm) - GitHub Flavored Markdown
- [@m2d/remark-docx](https://github.com/m2d-js/m2d) - DOCX generation
- [@mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli) - Mermaid rendering
- [shiki](https://github.com/shikijs/shiki) - Syntax highlighting
- [sharp](https://github.com/lovell/sharp) - Image processing

## Author

**squall**

## License

ISC

---

# 中文說明

Markdown 轉 Word 文件工具，支援 Mermaid 圖表自動渲染與程式碼語法高亮。

## 功能特色

- 將 Markdown 轉換為 Word 文件 (.docx)
- 支援 Mermaid 圖表自動偵測與渲染
- 程式碼區塊語法高亮（使用 Shiki）
- 合併多個 Markdown 檔案為單一文件
- 支援 GFM 表格、程式碼區塊、清單等
- 互動式操作介面
- 多國語言支援（英文 / 繁體中文）

## 安裝

```bash
# 直接使用 npx（無需安裝）
npx mermadoc <file.md>

# 或全域安裝
npm install -g mermadoc
```

### 開發環境

```bash
git clone https://github.com/user/mermadoc.git
cd mermadoc
npm install
npm run build
```

## 使用方式

### 互動式介面（推薦）

```bash
./start
# 或
npm start
```

啟動後會顯示選單，引導你完成轉換：

```
╔══════════════════════════════════════════╗
║                                          ║
║   📄 Mermadoc 轉換工具                   ║
║   Markdown → Word 文件                   ║
║                                          ║
╚══════════════════════════════════════════╝

請選擇操作：

  1. 轉換單一 Markdown 檔案
  2. 合併資料夾內所有 Markdown 檔案
  3. 指定資料夾路徑
  4. 顯示說明
  5. 設定
  0. 離開
```

#### 互動式介面快捷鍵

| 按鍵 | 功能 |
|------|------|
| `r` | 即時重新整理檔案/資料夾列表（不需按 Enter） |
| `0` 或 `q` | 離開程式 |

### 命令列模式

```bash
# 轉換單一檔案（自動偵測 Mermaid）
mermadoc example.md

# 合併資料夾內所有 .md 檔案
mermadoc ./reports

# 指定輸出檔名
mermadoc ./reports -o manual.docx

# 使用水平線作為章節分隔（預設為分頁）
mermadoc ./reports -o manual.docx -s hr

# 儲存圖片到獨立資料夾
mermadoc example.md -i ./images

# 設定圖片解析度為 300 DPI（較高解析度）
mermadoc example.md -d 300

# 組合選項：高解析度 + 儲存圖片
mermadoc example.md -d 300 -i ./images
```

> **提示：** 若未全域安裝，可使用 `npx mermadoc` 執行。

### 程式碼 API

```typescript
import { MdToDocxConverter } from "mermadoc";

const converter = new MdToDocxConverter();

// 轉換字串
const buffer = await converter.convert(markdownContent, {
  enableMermaid: true,
  saveImagesDir: "./images",  // 儲存圖片到資料夾
  imageDpi: 300,              // 圖片解析度 DPI（預設：150，範圍：72-600）
});

// 轉換檔案
await converter.convertFile("input.md", "output.docx", {
  enableMermaid: true,
  saveImagesDir: "./images",
  imageDpi: 300,
});

// 合併目錄
await converter.convertDirectory("./docs", "merged.docx", {
  enableMermaid: true,
  separator: "pagebreak", // 'pagebreak' | 'hr' | 'none'
  saveImagesDir: "./images",
  imageDpi: 300,
});

// 合併指定檔案
await converter.convertFiles(
  ["01-intro.md", "02-chapter.md"],
  "book.docx",
  { enableMermaid: true, imageDpi: 300 }
);
```

## CLI 選項

| 選項 | 說明 |
|------|------|
| `-o, --output <檔案>` | 指定輸出檔案路徑 |
| `-s, --separator <類型>` | 章節分隔方式：`pagebreak`（分頁）、`hr`（分隔線）、`none`（無） |
| `-i, --save-images <資料夾>` | 儲存圖片到指定資料夾 |
| `-d, --dpi <數值>` | 圖片解析度 DPI（預設：150，範圍：72-600） |
| `-l, --lang <語言>` | 語言：`en`（英文）、`zh-TW`（繁體中文） |
| `--no-mermaid` | 停用 Mermaid 圖表渲染（預設自動偵測） |
| `-h, --help` | 顯示說明 |

## 程式碼語法高亮

使用 [Shiki](https://shiki.matsu.io/) 提供程式碼語法高亮，支援以下語言：

- **Web**: JavaScript, TypeScript, HTML, CSS, JSON
- **後端**: Python, Java, Go, Rust, Ruby, PHP, C#
- **系統**: C, C++, Swift, Kotlin
- **腳本**: Bash, Shell, PowerShell
- **其他**: SQL, YAML, XML, Markdown, Dockerfile

程式碼區塊會以淺灰背景 + 等寬字體呈現，關鍵字、字串、註解等有不同顏色。

## 支援的 Mermaid 圖表

- flowchart（流程圖）
- sequenceDiagram（時序圖）
- classDiagram（類別圖）
- erDiagram（ER 圖）
- gantt（甘特圖）
- pie（圓餅圖）
- 其他 Mermaid 支援的圖表類型

## 範例

`example/` 資料夾包含範例 Markdown 檔案：

```bash
# 轉換範例檔案
mermadoc example/example.md
```

範例內容包含：
- 基本格式（粗體、斜體、行內程式碼）
- 表格
- 程式碼區塊（含語法高亮）
- Mermaid 流程圖與時序圖
- 巢狀清單
