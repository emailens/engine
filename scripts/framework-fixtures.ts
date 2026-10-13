import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileMjml } from "../src/compile/mjml";
import { compileReactEmail } from "../src/compile/react-email";

const FIXTURE_DIR = join(import.meta.dir, "..", "src", "__tests__", "fixtures");
const OPEN_SOURCE_DIR = join(FIXTURE_DIR, "open-source");

const REACT_EMAIL_SOURCES = [
  "resend--react-email/react-email-arcane-cart.tsx",
  "resend--react-email/react-email-arcane-newsletter.tsx",
  "resend--react-email/react-email-arcane-order.tsx",
  "resend--react-email/react-email-studio-newsletter.tsx",
  "resend--react-email/react-email-studio-welcome.tsx",
];

const MJML_SOURCES = [
  "Mailteorite--mjml-email-templates/mjml-abandoned-cart.mjml",
  "Mailteorite--mjml-email-templates/mjml-verification.mjml",
  "Mailteorite--mjml-email-templates/mjml-feedback.mjml",
  "Mailteorite--mjml-email-templates/mjml-newsletter.mjml",
  "Mailteorite--mjml-email-templates/mjml-product-launch.mjml",
  "Mailteorite--mjml-email-templates/mjml-post-delivery.mjml",
  "Mailteorite--mjml-email-templates/mjml-winback.mjml",
  "Mailteorite--mjml-email-templates/mjml-shipping.mjml",
  "Mailteorite--mjml-email-templates/mjml-upsell.mjml",
];

function standaloneReactEmail(source: string): string {
  return source
    .replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]react-email['"];?/g, "import {$1} from \"@react-email/components\";")
    .replace(/^import\s+.*from\s+['"]\.\/(?:theme|theme-fonts|skin-fonts|tech-fonts)['"];?\s*$/gm, "")
    .replace(/<\w*Fonts\s*\/>/g, "")
    .replace(/<Tailwind\s+config=\{[^}]+\}>/g, "<Tailwind>")
    .replace(/const baseUrl = process\.env\.VERCEL_URL[\s\S]*?\n\s*:\s*'';/, 'const baseUrl = "https://example.com";');
}

/** Compile pinned framework sources once; benchmark the generated HTML stages. */
export async function loadFrameworkFixtures(): Promise<Array<{ name: string; html: string }>> {
  const react = await Promise.all(REACT_EMAIL_SOURCES.map(async (file) => ({
    name: `compiled:${file}`,
    html: await compileReactEmail(
      standaloneReactEmail(readFileSync(join(OPEN_SOURCE_DIR, file), "utf8")),
      { sandbox: "vm" },
    ),
  })));
  const mjml = await Promise.all(MJML_SOURCES.map(async (file) => ({
    name: `compiled:${file}`,
    html: await compileMjml(readFileSync(join(OPEN_SOURCE_DIR, file), "utf8")),
  })));
  return [...react, ...mjml];
}
