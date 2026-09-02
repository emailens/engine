import type { EmailClient } from "./types";
import type { ClientId } from "./rules/css-support";

const CLIENTS = [
  {
    id: "gmail-web",
    name: "Gmail",
    category: "webmail",
    engine: "Gmail Web",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "gmail-android",
    name: "Gmail Android",
    category: "mobile",
    engine: "Gmail Mobile",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "gmail-ios",
    name: "Gmail iOS",
    category: "mobile",
    engine: "Gmail Mobile",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "outlook-web",
    name: "Outlook 365",
    category: "webmail",
    engine: "Outlook Web",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "outlook-windows",
    name: "Outlook (New)",
    category: "desktop",
    engine: "Outlook Web",
    darkModeSupport: true,
    icon: "monitor",
  },
  {
    id: "outlook-windows-legacy",
    name: "Outlook Classic",
    category: "desktop",
    engine: "Microsoft Word",
    darkModeSupport: true,
    icon: "monitor",
    // End of support ~Q2 2029 (Microsoft: "supported until at least 2029").
    // The April 2026 date some sources cite is the opt-out phase, when classic
    // stops being the Windows default, not end of support. October 2026 was
    // wrong: the nearest real Oct date is Oct 2025, for legacy Outlook for Mac.
    deprecated: "2029-06",
  },
  {
    id: "outlook-ios",
    name: "Outlook iOS",
    category: "mobile",
    engine: "Outlook Mobile",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "outlook-android",
    name: "Outlook Android",
    category: "mobile",
    engine: "Outlook Mobile",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "outlook-macos",
    name: "Outlook for Mac",
    category: "desktop",
    engine: "WebKit",
    darkModeSupport: true,
    icon: "monitor",
  },
  {
    id: "apple-mail-macos",
    name: "Apple Mail",
    category: "desktop",
    engine: "WebKit",
    darkModeSupport: true,
    icon: "monitor",
  },
  {
    id: "apple-mail-ios",
    name: "Apple Mail iOS",
    category: "mobile",
    engine: "WebKit",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "yahoo-mail",
    name: "Yahoo Mail",
    category: "webmail",
    engine: "Yahoo",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "yahoo-mail-android",
    name: "Yahoo Mail Android",
    category: "mobile",
    engine: "Yahoo",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "yahoo-mail-ios",
    name: "Yahoo Mail iOS",
    category: "mobile",
    engine: "Yahoo",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "samsung-mail",
    name: "Samsung Mail",
    category: "mobile",
    engine: "Samsung",
    darkModeSupport: true,
    icon: "smartphone",
  },
  {
    id: "thunderbird",
    name: "Thunderbird",
    category: "desktop",
    engine: "Gecko",
    darkModeSupport: true,
    icon: "monitor",
  },
  {
    id: "hey-mail",
    name: "HEY Mail",
    category: "webmail",
    engine: "WebKit",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "protonmail",
    name: "Proton Mail",
    category: "webmail",
    engine: "Proton",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "aol",
    name: "AOL Mail",
    category: "webmail",
    engine: "AOL",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    category: "webmail",
    engine: "Fastmail",
    darkModeSupport: true,
    icon: "mail",
  },
  {
    id: "superhuman",
    name: "Superhuman",
    category: "desktop",
    engine: "Blink",
    darkModeSupport: true,
    icon: "monitor",
  },
] as const satisfies ReadonlyArray<Omit<EmailClient, "id"> & { id: ClientId }>;

/**
 * The roster and the matrix name the same clients, checked in both directions
 * at compile time and costing nothing at runtime.
 *
 * This lives here rather than in `EmailClient.id`, which stays `string`.
 * Narrowing that field reaches every consumer: `new Set(EMAIL_CLIENTS.map(c =>
 * c.id))` infers `Set<ClientId>`, and `.has(someString)` on it stops
 * compiling. 0.12.1 shipped that and broke the CLI in four places. Enforce
 * where the literals are written; stay permissive where they are read.
 */
type ShippedId = (typeof CLIENTS)[number]["id"];
type Assert<T extends never> = T;
type _EveryColumnHasAClient = Assert<Exclude<ClientId, ShippedId>>;
type _EveryClientHasAColumn = Assert<Exclude<ShippedId, ClientId>>;

export const EMAIL_CLIENTS: EmailClient[] = [...CLIENTS];

export function getClient(id: string): EmailClient | undefined {
  return EMAIL_CLIENTS.find((c) => c.id === id);
}
