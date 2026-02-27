import type { InputFormat } from "../types.js";

/**
 * Unified error class for all email compilation failures.
 *
 * Replaces the per-format error classes (ReactEmailCompileError,
 * MjmlCompileError, MaizzleCompileError) with a single class that
 * carries the source format and failure phase.
 */
export class CompileError extends Error {
  override name = "CompileError";
  readonly format: Exclude<InputFormat, "html">;
  readonly phase: "validation" | "transpile" | "execution" | "render" | "compile";

  constructor(
    message: string,
    format: CompileError["format"],
    phase: CompileError["phase"],
  ) {
    super(message);
    this.format = format;
    this.phase = phase;
  }
}
