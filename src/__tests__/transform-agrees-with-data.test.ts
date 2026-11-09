/**
 * The preview must reproduce every real-device observation, and the support
 * data must carry it. Analysis reads
 * CSS_SUPPORT; the preview reads CLIENT_CONFIGS. When they disagree, a user
 * is warned about something the preview still draws, or sees a preview that
 * dropped what the client keeps. Found 2026-11-09 by the fidelity bench's DOM
 * judge on a real Calendly email: Yahoo web kept `opacity:0` (the preview
 * stripped it) and dropped `visibility:hidden` (the preview kept it), both as
 * the worker's probe sheets of 2026-11-08 had already measured.
 *
 * Checked on plain properties only (a key that is a bare property name) with
 * a full verdict. caniemail's own rows are checked for ten common strips in
 * engine.test.ts ("transform strip-sets stay consistent with CSS_SUPPORT").
 */
import { describe, expect, test } from "bun:test";
import { CSS_SUPPORT } from "../rules/css-support";
import { OBSERVED_OVERRIDES } from "../rules/observed-overrides";
import { applyObservations, transformForClient } from "../transform";

const PROPERTY = /^[a-z][a-z-]*$/;
// Kept means some declaration survived on the element: a logical property
// rewritten to physical ones (border-inline -> border-left/right) is kept.
const kept = (property: string, client: string) =>
  /style="[^"]*inherit/.test(
    transformForClient(
      `<html><body><div style="${property}: inherit">x</div></body></html>`,
      client,
    ).html,
  );

describe("the preview follows every real-device observation", () => {
  // caniemail's "unsupported" rows are mostly not plain properties, and a
  // browser ignores most of the rest without help; a real device's verdict
  // is the one the preview must reproduce.
  const observed = Object.entries(OBSERVED_OVERRIDES)
    .filter(([key]) => PROPERTY.test(key))
    .flatMap(([property, byClient]) =>
      Object.entries(byClient).map(([client, o]) => ({
        property,
        client,
        level: o.level,
      })),
    );
  test("an observed drop is dropped", () => {
    const wrong = observed
      .filter((v) => v.level === "unsupported" && kept(v.property, v.client))
      .map((v) => `${v.client}: ${v.property}`);
    expect(wrong).toEqual([]);
  });
  test("an observed render is kept", () => {
    const wrong = observed
      .filter((v) => v.level === "supported" && !kept(v.property, v.client))
      .map((v) => `${v.client}: ${v.property}`);
    expect(wrong).toEqual([]);
  });
  test("a partial verdict, or a client the preview lacks, changes nothing", () => {
    const configs = { gmail: { strippedProperties: new Set(["gap"]) } };
    const seen = (level: string) => ({ level, date: "", source: "", note: "" });
    applyObservations(
      {
        gap: { gmail: seen("partial") },
        color: { "no-such-client": seen("unsupported") },
      } as unknown as typeof OBSERVED_OVERRIDES,
      configs,
    );
    expect([...configs.gmail.strippedProperties]).toEqual(["gap"]);
  });
  test("the support data carries every observation (sync was run)", () => {
    const stale = observed
      .filter((v) => CSS_SUPPORT[v.property]?.[v.client] !== v.level)
      .map((v) => `${v.client}: ${v.property}`);
    expect(stale).toEqual([]);
  });
});
