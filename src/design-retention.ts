/**
 * What a revision removed from the design.
 *
 * The compatibility score rewards an email for not using what a client drops,
 * so deleting a feature scores exactly like giving it a fallback. Coding agents
 * found that: told to clear warnings, they deleted responsive CSS, dark mode
 * and rounded corners for every client to satisfy one. Comparing a revision
 * with the version before it is the only way to see that, so this does.
 *
 * Counts come from the raw source, comments included, so the VML inside an
 * MSO conditional is counted too: deleting the Outlook fallback is a removal.
 * ponytail: regex counts, not a cascade; a CSS parse is the upgrade if a
 * rename (same feature, new selector) ever shows up as a false removal.
 */

export interface DesignRemoval {
  feature: string;
  label: string;
  before: number;
  after: number;
  message: string;
}

const NON_ZERO = String.raw`(?!\s*(?:0(?:px|%|em|rem)?|none|initial|unset)\s*(?:!important)?\s*[;"'}])`;

const FEATURES: Record<string, { label: string; re: RegExp }> = {
  rounded: { label: "rounded corners", re: new RegExp(String.raw`border-radius\s*:${NON_ZERO}`, "gi") },
  responsive: { label: "responsive @media rules", re: /@media(?![^{]*prefers-color-scheme)[^{]*\{/gi },
  darkMode: { label: "dark-mode @media rules", re: /prefers-color-scheme\s*:\s*dark/gi },
  outlookDark: { label: "Outlook.com dark-mode rules ([data-ogsc], [data-ogsb])", re: /\[data-ogs[cb]\]/gi },
  gradient: { label: "gradients", re: /(?:linear|radial)-gradient\s*\(/gi },
  backgroundImage: { label: "background images", re: /background(?:-image)?\s*:[^;"'}]*url\(|\sbackground\s*=\s*["'][^"']+["']/gi },
  shadow: { label: "shadows", re: new RegExp(String.raw`(?:box|text)-shadow\s*:${NON_ZERO}`, "gi") },
  webFont: { label: "web fonts", re: /@font-face|fonts\.googleapis\.com|@import\s+url\([^)]*font/gi },
  outlookVml: { label: "Outlook VML fallbacks", re: /<v:(?:roundrect|rect|oval|shape|fill|image|imagedata|background)\b/gi },
  image: { label: "images", re: /<img\b/gi },
  link: { label: "links and buttons", re: /<a\b[^>]*\bhref\s*=/gi },
};

export function designFeatures(html: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(FEATURES).map(([key, { re }]) => [key, html.match(re)?.length ?? 0]),
  );
}

/**
 * Features the revision dropped entirely, or cut to half or less by at least
 * two. Smaller cuts are ordinary editing (one image fewer) and stay quiet.
 */
export function checkDesignRetention(before: string, after: string): DesignRemoval[] {
  const was = designFeatures(before);
  const now = designFeatures(after);
  return Object.entries(FEATURES).flatMap(([feature, { label }]) => {
    const b = was[feature];
    const a = now[feature];
    // Gone, or halved by at least two: 2 links becoming 1 is editing.
    if (!b || (a > 0 && (a > b / 2 || b - a < 2))) return [];
    return [{
      feature,
      label,
      before: b,
      after: a,
      message:
        a === 0
          ? `This revision removed all ${label} (${b} before). Clients that drop them have a fallback; removing them changes the design in every client. Restore them.`
          : `This revision cut ${label} from ${b} to ${a}. Restore what the design needs; a client that drops them falls back on its own.`,
    }];
  });
}
