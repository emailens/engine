/**
 * Support levels observed in real email clients, applied on top of caniemail.
 *
 * caniemail is the base and stays the base. An entry here exists only where a
 * real-device screenshot contradicted it: the same probe email was rendered in
 * the real client and the cell below records what the screenshot showed. Each
 * entry carries its date and the device it was seen on, and becomes the cell's
 * note, so the support tables say where the answer came from.
 *
 * One probe run is one observation. Gmail in particular can differ by account
 * type (Google vs third-party accounts) and by app, so a webmail observation
 * says nothing about gmail-android or gmail-ios.
 *
 * Probes: emailens.dev apps/app/fidelity/out/acq-probes.ts, screenshots in
 * apps/app/fidelity/out/acq-v2 (run 2026-10-14).
 */
import type { SupportLevel } from "../src/types";

export interface Observation {
  level: SupportLevel;
  /** ISO date of the real-device run. */
  observed: string;
  /** The real client the screenshot came from. */
  source: string;
  /** What the screenshot showed. */
  note: string;
}

const RUN = "2026-10-14";
const GMAIL = "Emailens real-device probe, Gmail web (Firefox, Google account)";
const seen = (level: SupportLevel, source: string, note: string): Observation => ({
  level,
  observed: RUN,
  source,
  note,
});

// The 2026-10-14 Gmail rows came from one rendering path, Gmail web in
// Firefox. On 2026-10-24 caniemail's own test files, sent unchanged, were
// stripped of the same CSS by Gmail web in Chrome on two Google accounts,
// while the Firefox path rendered them again. Until the cause is known
// (browser or account), these cells are partial, not supported.
const SPLIT = "Emailens real-device probe (Gmail web, Firefox) and Gmail web in Chrome (two Google accounts)";
const split = (what: string): Observation => ({
  level: "partial",
  observed: "2026-10-24",
  source: SPLIT,
  note: `${what} rendered in Gmail web in Firefox (2026-10-14 and 2026-10-24) but was stripped in Gmail web in Chrome on two Google accounts (2026-10-24), so support depends on the browser or the account.`,
});

export const OBSERVED_OVERRIDES: Record<string, Record<string, Observation>> = {
  "box-shadow": {
    "gmail-web": split("box-shadow"),
    "yahoo-mail": seen(
      "supported",
      "Emailens real-device probe, Yahoo Mail (Chrome)",
      "A box-shadow on a table cell rendered with its offset and colour.",
    ),
  },
  "text-shadow": {
    "gmail-web": split("text-shadow"),
    "outlook-web": seen(
      "supported",
      "Emailens real-device probe, Outlook.com (Chrome)",
      "A red text-shadow rendered behind bold text.",
    ),
  },
  visibility: {
    "gmail-web": split("visibility:hidden"),
  },
  "align-items": {
    "gmail-web": split("align-items"),
  },
  "display:grid": {
    "gmail-web": seen("supported", GMAIL, "A three-column grid rendered as three boxes in a row, gaps included."),
  },
  gap: {
    "gmail-web": seen("supported", GMAIL, "gap:8px spaced flex and grid items."),
  },
  animation: {
    "gmail-web": split("An animation defined with @keyframes in a <style> block"),
  },
  "text-decoration": {
    "apple-mail-macos": seen(
      "partial",
      "Emailens real-device probe, Apple Mail (macOS)",
      "The multi-value shorthand `text-decoration: underline wavy #d33` was dropped whole: no line at all. A single line value works; style and colour need -webkit-text-decoration.",
    ),
    "apple-mail-ios": seen(
      "partial",
      "Emailens real-device probe, Apple Mail (iPhone 13)",
      "The multi-value shorthand `text-decoration: underline wavy #d33` was dropped whole: no line at all. A single line value works; style and colour need -webkit-text-decoration.",
    ),
    "outlook-macos": seen(
      "partial",
      "Emailens real-device probe, Outlook 2019 for Mac",
      "The multi-value shorthand `text-decoration: underline wavy #d33` was dropped whole: no line at all. A single line value works; style and colour need -webkit-text-decoration.",
    ),
  },
};

/** The note an overridden cell carries. */
export function observationNote(o: Observation): string {
  return `Observed ${o.observed} (${o.source}): ${o.note}`;
}
