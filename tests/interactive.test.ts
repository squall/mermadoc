import { describe, it, expect } from "vitest";
import {
  parseOutputFormatChoice,
  parseSeparatorChoice,
  parseDpiInput,
  containsMermaid,
} from "../src/interactive.js";

describe("parseOutputFormatChoice", () => {
  it("returns pdf when user picks 2", () => {
    expect(parseOutputFormatChoice("2")).toBe("pdf");
  });

  it("returns docx for the default choice 1", () => {
    expect(parseOutputFormatChoice("1")).toBe("docx");
  });

  it("returns docx for empty input (Enter accepts default)", () => {
    expect(parseOutputFormatChoice("")).toBe("docx");
  });

  it("returns docx for whitespace-only input", () => {
    expect(parseOutputFormatChoice("   ")).toBe("docx");
  });

  it("treats unknown input as docx", () => {
    expect(parseOutputFormatChoice("xyz")).toBe("docx");
  });

  it("ignores surrounding whitespace around 2", () => {
    expect(parseOutputFormatChoice("  2  ")).toBe("pdf");
  });
});

describe("parseSeparatorChoice", () => {
  it("returns pagebreak by default (empty)", () => {
    expect(parseSeparatorChoice("")).toBe("pagebreak");
  });

  it("returns pagebreak on '1'", () => {
    expect(parseSeparatorChoice("1")).toBe("pagebreak");
  });

  it("returns hr on '2'", () => {
    expect(parseSeparatorChoice("2")).toBe("hr");
  });

  it("returns none on '3'", () => {
    expect(parseSeparatorChoice("3")).toBe("none");
  });

  it("falls back to pagebreak on unknown input", () => {
    expect(parseSeparatorChoice("unknown")).toBe("pagebreak");
  });
});

describe("parseDpiInput", () => {
  it("returns the parsed integer for valid DPIs", () => {
    expect(parseDpiInput("150")).toBe(150);
    expect(parseDpiInput("300")).toBe(300);
  });

  it("accepts the lower bound 72", () => {
    expect(parseDpiInput("72")).toBe(72);
  });

  it("accepts the upper bound 600", () => {
    expect(parseDpiInput("600")).toBe(600);
  });

  it("rejects values below 72", () => {
    expect(parseDpiInput("60")).toBeUndefined();
  });

  it("rejects values above 600", () => {
    expect(parseDpiInput("601")).toBeUndefined();
  });

  it("rejects non-numeric input", () => {
    expect(parseDpiInput("abc")).toBeUndefined();
  });

  it("rejects empty input", () => {
    expect(parseDpiInput("")).toBeUndefined();
  });
});

describe("containsMermaid", () => {
  it("detects a fenced mermaid block", () => {
    const md = "# Doc\n\n```mermaid\nflowchart TD\n  A --> B\n```";
    expect(containsMermaid(md)).toBe(true);
  });

  it("returns false when there is no mermaid block", () => {
    const md = "# Doc\n\n```js\nconsole.log('hi');\n```";
    expect(containsMermaid(md)).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(containsMermaid("just text")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsMermaid("")).toBe(false);
  });
});
