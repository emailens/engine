/**
 * Server-only exports that depend on Node.js builtins (dns, child_process).
 * Import from "@emailens/engine/server" — never from the main entry point
 * in client-side / browser code.
 */
export { checkDeliverability } from "./deliverability-checker";
export { checkSpamAssassin } from "./spamassassin";
export type { SpamAssassinResult, SpamAssassinOptions } from "./spamassassin";
