import { describe, expect, test } from "bun:test";
import { transformForAllClients, transformForClient } from "../index";

// Word has no quirks mode. Preview guYL7gkFIgOm (a Beefree newsletter with no
// doctype, real-device run 2zHY5TVR71vV, 2026-11-06): real Outlook Classic
// spaced its 18px heading at the 27px of mso-line-height-alt, where the sim,
// laid out in quirks mode, dropped the line's floor and drew 21px.
const NO_DOCTYPE = `<html><head></head><body><h2 style="font-size:18px;line-height:1.5;mso-line-height-alt:27px">Two lines of text</h2></body></html>`;
const WORD = "outlook-windows-legacy";

describe("the Word engine's render is laid out in standards mode", () => {
  test("a source with no doctype gets one", () => {
    expect(transformForClient(NO_DOCTYPE, WORD).html).toMatch(/^<!DOCTYPE html>/i);
  });
  test("the all-clients path agrees", () => {
    const word = transformForAllClients(NO_DOCTYPE).find((t) => t.clientId === WORD)!;
    expect(word.html).toBe(transformForClient(NO_DOCTYPE, WORD).html);
  });
  test("a doctype already there is not doubled", () => {
    const out = transformForClient(`<!DOCTYPE html>${NO_DOCTYPE}`, WORD).html;
    expect(out.match(/<!doctype/gi)).toHaveLength(1);
  });
  test("other clients keep the source's mode", () => {
    expect(transformForClient(NO_DOCTYPE, "apple-mail-macos").html).not.toMatch(/<!doctype/i);
  });
});
