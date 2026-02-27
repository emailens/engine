import { extname } from "node:path";
import type { InputFormat } from "../types.js";

export { CompileError } from "./errors.js";
export { compileReactEmail } from "./react-email.js";
export type { SandboxStrategy, CompileReactEmailOptions } from "./react-email.js";
export { compileMjml } from "./mjml.js";
export { compileMaizzle } from "./maizzle.js";

/**
 * Compile source to HTML based on format.
 * Returns the HTML unchanged if format is "html".
 * Lazily imports per-format compilers to avoid loading unnecessary deps.
 */
export async function compile(
  source: string,
  format: InputFormat,
  filePath?: string,
): Promise<string> {
  switch (format) {
    case "html":
      return source;

    case "jsx": {
      const { compileReactEmail } = await import("./react-email.js");
      return compileReactEmail(source);
    }

    case "mjml": {
      const { compileMjml } = await import("./mjml.js");
      return compileMjml(source);
    }

    case "maizzle": {
      const { compileMaizzle } = await import("./maizzle.js");
      return compileMaizzle(source);
    }

    default:
      throw new Error(`Unknown format: "${format}". Use html, jsx, mjml, or maizzle.`);
  }
}

/**
 * Auto-detect input format from file extension.
 */
export function detectFormat(filePath: string): InputFormat {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".tsx":
    case ".jsx":
      return "jsx";
    case ".mjml":
      return "mjml";
    case ".html":
    case ".htm":
      return "html";
    default:
      return "html";
  }
}
