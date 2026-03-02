/**
 * Optional SpamAssassin integration.
 *
 * Shells out to `spamc` (daemon mode) or `spamassassin` (standalone mode)
 * using execFile (safe — no shell interpolation).
 * Returns null if neither is installed.
 *
 * Requires a full RFC 2822 message (headers + body), not just HTML.
 */

import { execFile as nodeExecFile } from "node:child_process";

export interface SpamAssassinResult {
  score: number;
  threshold: number;
  isSpam: boolean;
  rules: Array<{ name: string; score: number; description: string }>;
  rawOutput: string;
}

export interface SpamAssassinOptions {
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Run a raw RFC 2822 email message through SpamAssassin.
 *
 * Tries `spamc -R` (daemon mode, faster) first, then falls back to
 * `spamassassin -t` (standalone mode). Returns `null` if neither
 * binary is available.
 *
 * Uses execFile (not exec) — no shell interpolation, safe from injection.
 *
 * @example
 * ```ts
 * const result = await checkSpamAssassin(rawMessage);
 * if (result) {
 *   console.log(`Score: ${result.score}/${result.threshold}`);
 *   console.log(`Spam: ${result.isSpam}`);
 *   for (const rule of result.rules) {
 *     console.log(`  ${rule.score} ${rule.name}: ${rule.description}`);
 *   }
 * }
 * ```
 */
export async function checkSpamAssassin(
  rawMessage: string,
  options?: SpamAssassinOptions,
): Promise<SpamAssassinResult | null> {
  const timeout = options?.timeoutMs ?? 30_000;

  // Try spamc first (daemon mode — faster)
  const spamcResult = await tryExecFile("spamc", ["-R"], rawMessage, timeout);
  if (spamcResult !== null) return parseOutput(spamcResult);

  // Fall back to standalone spamassassin
  const saResult = await tryExecFile("spamassassin", ["-t"], rawMessage, timeout);
  if (saResult !== null) return parseOutput(saResult);

  // Neither available
  return null;
}

/**
 * Safe wrapper around execFile — no shell, no interpolation.
 * Returns stdout on success, null if binary not found.
 */
function tryExecFile(
  cmd: string,
  args: string[],
  input: string,
  timeout: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = nodeExecFile(cmd, args, {
        timeout,
        maxBuffer: 1024 * 1024,
        encoding: "utf-8",
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            resolve(null);
          } else {
            // SpamAssassin returns non-zero for spam — stdout is still valid
            resolve(stdout || stderr || null);
          }
        } else {
          resolve(stdout);
        }
      });

      if (child.stdin) {
        child.stdin.on("error", () => {}); // swallow EPIPE if process dies before reading
        child.stdin.write(input);
        child.stdin.end();
      }
    } catch {
      resolve(null);
    }
  });
}

function parseOutput(output: string): SpamAssassinResult {
  let score = 0;
  let threshold = 5;
  let isSpam = false;
  const rules: SpamAssassinResult["rules"] = [];

  // Parse X-Spam-Status line
  const statusMatch = output.match(/X-Spam-Status:\s*(Yes|No),\s*score=([\d.-]+)\s+required=([\d.-]+)/i);
  if (statusMatch) {
    isSpam = statusMatch[1].toLowerCase() === "yes";
    score = parseFloat(statusMatch[2]);
    threshold = parseFloat(statusMatch[3]);
  } else {
    // spamc -R format: first line is "score/threshold"
    const scoreMatch = output.match(/^([\d.-]+)\/([\d.-]+)/m);
    if (scoreMatch) {
      score = parseFloat(scoreMatch[1]);
      threshold = parseFloat(scoreMatch[2]);
      isSpam = score >= threshold;
    }
  }

  // Parse rules table
  const rulePattern = /^\s*([\d.-]+)\s+([A-Z_][A-Z0-9_]+)\s+(.+)$/gm;
  let match;
  while ((match = rulePattern.exec(output)) !== null) {
    rules.push({
      score: parseFloat(match[1]),
      name: match[2],
      description: match[3].trim(),
    });
  }

  return { score, threshold, isSpam, rules, rawOutput: output };
}
