/**
 * The caniemail page for each feature in the matrix.
 *
 * VS Code renders a diagnostic's `codeDescription` as a link on the rule name,
 * which is where every other linter sends people to read about a rule. Ours
 * had nowhere to point: the code was a dead string, and someone wanting to
 * know *why* Outlook drops `border-radius` had to go and search for it.
 *
 * The URL cannot be derived from the key. `border-radius` is
 * `/features/css-border-radius/`, `<abbr>` is `/features/html-abbr/`,
 * `:hover` is `/features/css-pseudo-class-hover/`, and there are enough
 * exceptions that guessing means shipping 404s, which is worse than no link.
 * So the real URL comes from the same API the matrix does.
 *
 * Separate from `sync:caniemail` on purpose: that regenerates the support data
 * and moves reported output, and a link map should not need a release that
 * does.
 *
 * Regenerate with: bun run sync:feature-urls
 */
import { CSS_SUPPORT } from "../src/rules/css-support";
import { featureToPropertyKey, type CanIEmailFeature } from "./sync-caniemail";

const API_URL = "https://www.caniemail.com/api/data.json";

/**
 * The API, or a copy of it.
 *
 * `bun run sync:feature-urls path/to/data.json` reads a local snapshot, for a
 * network that will not let the process out, the same file
 * `curl https://www.caniemail.com/api/data.json` produces.
 */
async function load(): Promise<{ data: CanIEmailFeature[] }> {
  const local = process.argv[2];
  if (local) return JSON.parse(await Bun.file(local).text());
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`caniemail returned ${response.status}`);
  return response.json();
}

async function main() {
  const data = await load();

  const urls: Record<string, string> = {};
  for (const feature of data.data) {
    const key = featureToPropertyKey(feature);
    // Only features the matrix actually carries. A link for a key nothing can
    // report is dead weight in the bundle.
    if (!key || !(key in CSS_SUPPORT) || !feature.url) continue;
    urls[key] = feature.url;
  }

  const keys = Object.keys(urls).sort();
  const known = Object.keys(CSS_SUPPORT).length;
  if (keys.length < known * 0.9) {
    throw new Error(`only ${keys.length} of ${known} features got a URL; the mapping has drifted`);
  }

  const lines = [
    `/**`,
    ` * caniemail's page for each feature, for a diagnostic's \`codeDescription\`.`,
    ` *`,
    ` * ${keys.length} of ${known} features. The rest have no caniemail entry of`,
    ` * their own and get no link, which is the honest outcome; a link to a 404`,
    ` * is worse than none.`,
    ` *`,
    ` * DO NOT EDIT; regenerate with: bun run sync:feature-urls`,
    ` */`,
    `export const FEATURE_URLS: Record<string, string> = {`,
    ...keys.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(urls[key])},`),
    `};`,
    ``,
    `/** Where to read about a rule, when there is somewhere. */`,
    `export function featureUrl(code: string): string | undefined {`,
    `  return FEATURE_URLS[code];`,
    `}`,
    ``,
  ];

  const out = new URL("../src/rules/feature-urls.ts", import.meta.url).pathname;
  await Bun.write(out.replace(/^\/([A-Z]:)/, "$1"), lines.join("\n"));
  console.log(`Wrote ${keys.length} feature URLs (of ${known} features).`);
}

main();
