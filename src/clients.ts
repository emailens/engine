import type { EmailClient } from "./types";

export const EMAIL_CLIENTS: EmailClient[] = [
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
    name: "Outlook Windows",
    category: "desktop",
    engine: "Microsoft Word",
    darkModeSupport: false,
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
    darkModeSupport: false,
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
    id: "superhuman",
    name: "Superhuman",
    category: "desktop",
    engine: "Blink",
    darkModeSupport: true,
    icon: "monitor",
  },
];

export function getClient(id: string): EmailClient | undefined {
  return EMAIL_CLIENTS.find((c) => c.id === id);
}
