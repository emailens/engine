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
const seen = (level: SupportLevel, source: string, note: string): Observation => ({
  level,
  observed: RUN,
  source,
  note,
});

// The 2026-10-14 probe also showed Gmail web rendering box-shadow,
// text-shadow, visibility, align-items, @keyframes animations, gap and grid.
// On 2026-10-24 caniemail's own test files, sent unchanged, were stripped of
// them by real Gmail web in Chrome (two Google accounts) and of box-shadow and
// animation in Firefox, so that render was not real Gmail. Those rows were
// dropped; caniemail stands for Gmail web.
/** Probe sheets 20 to 22 on Preflight's new Outlook for Mac, 2026-10-27. */
const newOutlookMac = (level: SupportLevel, note: string): Observation => ({
  level,
  observed: "2026-10-27",
  source: "Emailens probe sheets 20-22, the new Outlook for Mac (Preflight)",
  note,
});

/** A flex-columns probe on Yahoo Mail web, our own seed inbox, 2026-10-27. */
const yahooWeb = (level: SupportLevel, note: string): Observation => ({
  level,
  observed: "2026-10-27",
  source: "Emailens probe, Yahoo Mail web (Chrome), real-device run E8fVpFwwLtL8",
  note,
});

export const OBSERVED_OVERRIDES: Record<string, Record<string, Observation>> = {
  // display:flex holds and so does width; the item sizing does not. A label
  // column at `flex:0 0 34%` beside a paragraph collapsed to a letter wide.
  flex: {
    "yahoo-mail": yahooWeb(
      "unsupported",
      "The `flex` shorthand is dropped: an item at `flex:0 0 34%` shrank to its narrowest, breaking words letter by letter. Size flex items with `width` (and `flex-shrink:0`), or use a table.",
    ),
  },
  "flex-basis": {
    "yahoo-mail": yahooWeb(
      "unsupported",
      "Dropped, with flex-grow and flex-shrink beside it: the item sized to its content instead of 34%. `width:34%` on the same item held.",
    ),
  },
  // caniemail 16.80 says not supported; plain track lists are kept and the
  // functions dropped, twice over two runs.
  "grid-template-columns": {
    "outlook-macos": newOutlookMac(
      "partial",
      "Plain track sizes work (`300px 300px`, `1fr 1fr`); a value with `repeat()` or `minmax()` is dropped, so the grid falls back to one column.",
    ),
  },
  "box-shadow": {
    "yahoo-mail": seen(
      "supported",
      "Emailens real-device probe, Yahoo Mail (Chrome)",
      "A box-shadow on a table cell rendered with its offset and colour.",
    ),
  },
  "text-shadow": {
    "outlook-web": seen(
      "supported",
      "Emailens real-device probe, Outlook.com (Chrome)",
      "A red text-shadow rendered behind bold text.",
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
      // The legacy app (Outlook 2019 for Mac). Not yet re-checked on the new
      // Outlook for Mac, which the outlook-macos column now describes.
      "Emailens real-device probe, Outlook 2019 for Mac (legacy app)",
      "The multi-value shorthand `text-decoration: underline wavy #d33` was dropped whole: no line at all. A single line value works; style and colour need -webkit-text-decoration.",
    ),
  },
};

/** The note an overridden cell carries. */
export function observationNote(o: Observation): string {
  return `Observed ${o.observed} (${o.source}): ${o.note}`;
}
