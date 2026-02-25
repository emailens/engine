import type { CSSWarning, DiffResult } from "./types";
import { EMAIL_CLIENTS } from "./clients";

/**
 * Compare two sets of analysis results to show what improved,
 * what regressed, and what stayed the same.
 */
export function diffResults(
  before: {
    scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
    warnings: CSSWarning[];
  },
  after: {
    scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
    warnings: CSSWarning[];
  }
): DiffResult[] {
  const results: DiffResult[] = [];

  for (const client of EMAIL_CLIENTS) {
    const scoreBefore = before.scores[client.id]?.score ?? 100;
    const scoreAfter = after.scores[client.id]?.score ?? 100;

    const beforeWarnings = before.warnings.filter((w) => w.client === client.id);
    const afterWarnings = after.warnings.filter((w) => w.client === client.id);

    // Key warnings by property+severity for comparison
    const beforeKeys = new Set(beforeWarnings.map(warningKey));
    const afterKeys = new Set(afterWarnings.map(warningKey));

    const fixed = beforeWarnings.filter((w) => !afterKeys.has(warningKey(w)));
    const introduced = afterWarnings.filter((w) => !beforeKeys.has(warningKey(w)));
    const unchanged = afterWarnings.filter((w) => beforeKeys.has(warningKey(w)));

    results.push({
      clientId: client.id,
      scoreBefore,
      scoreAfter,
      scoreDelta: scoreAfter - scoreBefore,
      fixed,
      introduced,
      unchanged,
    });
  }

  return results;
}

function warningKey(w: CSSWarning): string {
  return `${w.property}:${w.severity}`;
}
