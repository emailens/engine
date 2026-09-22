import * as csstree from "css-tree";
import type { CSSWarning, TargetingPolicy } from "./types";
import {
  ATRULE_MATCHERS,
  HTML_MATCHERS,
  SELECTOR_MATCHERS,
  targetingHackForMatcher,
  type TargetingMatcher,
} from "./rules/targeting-matchers";
import type { TargetingHack } from "./rules/targeting-hacks.generated";

export interface DetectedHack {
  hack: TargetingHack;
  foundIn: "style-block" | "inline-style" | "conditional-comment";
  selector?: string;
  matchedText: string;
}

export interface TargetingReport {
  detectedHacks: DetectedHack[];
  /** Policy-flagged targeting findings (deprecated warnings and strict-mode info). */
  warnings: CSSWarning[];
  /** @deprecated Use `warnings`. Same array. */
  deprecatedWarnings: CSSWarning[];
}

export function emptyTargetingReport(): TargetingReport {
  const warnings: CSSWarning[] = [];
  return { detectedHacks: [], warnings, deprecatedWarnings: warnings };
}

function applyLint(
  matcher: TargetingMatcher,
  hack: TargetingHack,
  policy: TargetingPolicy,
  extra: Pick<CSSWarning, "selector"> & { matchedText: string },
): CSSWarning | undefined {
  if (matcher.lint === "none") return undefined;
  const client = matcher.clientIds[0] || "unknown";
  const label = hack.client;
  if (matcher.lint === "deprecated") {
    if (policy === "lenient") return undefined;
    return {
      severity: "warning",
      client,
      property: "css-hack",
      selector: extra.selector,
      message: `Deprecated email client hack detected (${label}): "${extra.matchedText}". ${hack.notes}`.trim(),
      suggestion: `Remove or update this hack. Modern versions of ${label} no longer support or require it.`,
    };
  }
  if (policy !== "strict") return undefined;
  return {
    severity: "info",
    client,
    property: "css-hack",
    selector: extra.selector,
    message: `Client targeting hack detected (${label}): "${extra.matchedText}". Strict policy flags all client targeting.`,
    suggestion: "Avoid client-specific hacks in strict mode, or switch to progressive targeting policy.",
  };
}

function recordMatch(
  report: TargetingReport,
  seen: Set<string>,
  matcher: TargetingMatcher,
  policy: TargetingPolicy,
  matchedText: string,
  selector?: string,
): void {
  if (seen.has(matcher.id)) return;
  const hack = targetingHackForMatcher(matcher);
  if (!hack) return;
  seen.add(matcher.id);

  report.detectedHacks.push({
    hack,
    foundIn: matcher.foundIn,
    selector,
    matchedText,
  });
  const warning = applyLint(matcher, hack, policy, { matchedText, selector });
  if (warning) report.warnings.push(warning);
}

export function scanHtmlForTargeting(
  html: string,
  report: TargetingReport,
  seen: Set<string>,
  policy: TargetingPolicy,
): void {
  for (const matcher of HTML_MATCHERS) {
    const match = html.match(matcher.pattern);
    if (!match) continue;
    recordMatch(report, seen, matcher, policy, match[0]);
  }
}

export function scanCssAstForTargeting(
  ast: csstree.CssNode,
  report: TargetingReport,
  seen: Set<string>,
  policy: TargetingPolicy,
): void {
  csstree.walk(ast, {
    visit: "Rule",
    enter(node: csstree.CssNode) {
      if (node.type !== "Rule" || node.prelude.type !== "SelectorList") return;
      node.prelude.children.forEach((child) => {
        const selectorText = csstree.generate(child).trim();
        for (const matcher of SELECTOR_MATCHERS) {
          if (matcher.pattern.test(selectorText)) {
            recordMatch(report, seen, matcher, policy, selectorText, selectorText);
          }
        }
      });
    },
  });

  csstree.walk(ast, {
    visit: "Atrule",
    enter(node: csstree.CssNode) {
      if (node.type !== "Atrule") return;
      const atRulePrelude = node.prelude ? csstree.generate(node.prelude).trim() : "";
      const haystack = `@${node.name} ${atRulePrelude}`;
      for (const matcher of ATRULE_MATCHERS) {
        if (matcher.pattern.test(atRulePrelude) || matcher.pattern.test(haystack)) {
          recordMatch(report, seen, matcher, policy, haystack);
        }
      }
    },
  });
}

function scanStyleBlocks(
  html: string,
  report: TargetingReport,
  seen: Set<string>,
  policy: TargetingPolicy,
): void {
  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(styleMatch[1]);
    } catch {
      continue;
    }
    scanCssAstForTargeting(ast, report, seen, policy);
  }
}

/**
 * Scan an email HTML template for known client targeting hacks,
 * identifying active targeting techniques and warning on deprecated ones.
 */
export function checkTargetingHacks(
  html: string,
  policy: TargetingPolicy = "progressive",
): TargetingReport {
  const report = emptyTargetingReport();
  const seen = new Set<string>();
  scanHtmlForTargeting(html, report, seen, policy);
  scanStyleBlocks(html, report, seen, policy);
  return report;
}

