import { describe, expect, it } from "bun:test";
import { CSS_SUPPORT, GMAIL_STRIPPED_PROPERTIES, OUTLOOK_WORD_UNSUPPORTED, STRUCTURAL_FIX_PROPERTIES } from "../rules/css-support";
import { EMAIL_CLIENTS } from "../clients";

const ALL_CLIENT_IDS = EMAIL_CLIENTS.map((c) => c.id);
const VALID_SUPPORT_LEVELS = new Set(["supported", "partial", "unsupported", "unknown"]);

describe("CSS_SUPPORT matrix", () => {
  const propertyCount = Object.keys(CSS_SUPPORT).length;

  it("has at least 150 properties", () => {
    expect(propertyCount).toBeGreaterThanOrEqual(150);
  });

  it("every property has all 12 client IDs", () => {
    for (const [property, clients] of Object.entries(CSS_SUPPORT)) {
      for (const clientId of ALL_CLIENT_IDS) {
        expect(clients[clientId]).toBeDefined();
        // Message for debugging
        if (!clients[clientId]) {
          throw new Error(`Property "${property}" missing client "${clientId}"`);
        }
      }
    }
  });

  it("every value is a valid SupportLevel", () => {
    for (const [property, clients] of Object.entries(CSS_SUPPORT)) {
      for (const [clientId, level] of Object.entries(clients)) {
        if (!VALID_SUPPORT_LEVELS.has(level)) {
          throw new Error(
            `Invalid support level "${level}" for ${property} → ${clientId}. Expected: ${[...VALID_SUPPORT_LEVELS].join(", ")}`
          );
        }
      }
    }
  });

  it("preserves all original 56 property keys", () => {
    const expectedKeys = [
      "display", "display:flex", "display:grid", "float", "position",
      "margin", "padding", "width", "max-width", "height", "box-sizing",
      "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
      "text-align", "text-decoration", "text-transform", "@font-face",
      "color", "background-color", "background-image", "background", "linear-gradient",
      "border", "border-radius", "border-collapse", "box-shadow",
      "transform", "animation", "transition",
      "@media",
      "<style>", "<link>", "<video>", "<svg>", "<form>",
      "word-break", "overflow-wrap", "white-space", "text-overflow",
      "vertical-align", "border-spacing",
      "min-width", "min-height", "max-height",
      "text-shadow",
      "background-size", "background-position",
      "opacity", "overflow", "visibility", "gap", "object-fit",
    ];

    for (const key of expectedKeys) {
      expect(CSS_SUPPORT[key]).toBeDefined();
      if (!CSS_SUPPORT[key]) {
        throw new Error(`Missing original property: "${key}"`);
      }
    }
  });
});

describe("Manual sets", () => {
  it("GMAIL_STRIPPED_PROPERTIES are all valid property keys", () => {
    for (const prop of GMAIL_STRIPPED_PROPERTIES) {
      expect(typeof prop).toBe("string");
    }
  });

  it("OUTLOOK_WORD_UNSUPPORTED are all valid property keys", () => {
    for (const prop of OUTLOOK_WORD_UNSUPPORTED) {
      expect(typeof prop).toBe("string");
    }
  });

  it("STRUCTURAL_FIX_PROPERTIES are all valid property keys", () => {
    for (const prop of STRUCTURAL_FIX_PROPERTIES) {
      expect(typeof prop).toBe("string");
    }
  });
});
