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

export const OBSERVED_OVERRIDES: Record<string, Record<string, Observation>> = {
  "box-shadow": {
    "gmail-web": seen("supported", GMAIL, "A box-shadow on a table cell rendered with its offset and colour."),
    "yahoo-mail": seen(
      "supported",
      "Emailens real-device probe, Yahoo Mail (Chrome)",
      "A box-shadow on a table cell rendered with its offset and colour.",
    ),
  },
  "text-shadow": {
    "gmail-web": seen("supported", GMAIL, "A red text-shadow rendered behind bold text."),
    "outlook-web": seen(
      "supported",
      "Emailens real-device probe, Outlook.com (Chrome)",
      "A red text-shadow rendered behind bold text.",
    ),
  },
  visibility: {
    "gmail-web": seen("supported", GMAIL, "visibility:hidden hid the word and kept its space."),
  },
  "align-items": {
    "gmail-web": seen("supported", GMAIL, "align-items:center centred a short flex item against a tall one."),
  },
  "display:grid": {
    "gmail-web": seen("supported", GMAIL, "A three-column grid rendered as three boxes in a row, gaps included."),
  },
  gap: {
    "gmail-web": seen("supported", GMAIL, "gap:8px spaced flex and grid items."),
  },
  animation: {
    "gmail-web": seen(
      "supported",
      GMAIL,
      "An animation defined with @keyframes in a <style> block ran to its end state.",
    ),
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
