import { EMPTY_VML, MAX_WARNING_LOCATIONS } from "./constants";
import { positionOf } from "./source-location";
import type { SourceLocation, VmlIssue, VmlReport } from "./types";

/**
 * A conditional comment block, with the offset its inner content starts at in
 * the original HTML so issues can point back at the source.
 */
interface MsoBlock {
  inner: string;
  offset: number;
}

/**
 * VML elements that are *shapes*: they occupy a box and are positioned. These
 * are the ones Outlook refuses to nest. Non-shape VML (`fill`, `textbox`,
 * `stroke`, `shadow`, `imagedata`) are child properties of a shape and nest
 * normally, so they never count as a nesting parent.
 */
const SHAPE_TAGS = new Set([
  "rect", "roundrect", "oval", "line", "polyline", "curve", "arc",
  "shape", "image", "background",
]);

/**
 * `v:group` is the one container VML defines for holding other shapes, so a
 * shape inside a group is intentional, not the Outlook-breaking nesting.
 */
const GROUP_TAGS = new Set(["group"]);

/**
 * Pull out the Outlook-only conditional comment blocks.
 *
 * Downlevel-revealed blocks (`<!--[if !mso]><!-->`) are the *non*-Outlook
 * branch: their content is live HTML that every other client renders, and the
 * DOM analyzers already cover it. Only the hidden, Outlook-only branches carry
 * VML, so a negated condition is skipped.
 */
function msoBlocks(html: string): MsoBlock[] {
  const blocks: MsoBlock[] = [];
  const re = /<!--\[if([^\]]*)\]>([\s\S]*?)<!\[endif\]-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const condition = m[1];
    if (/!\s*(mso|vml)/i.test(condition)) continue;
    if (!/mso|vml/i.test(condition)) continue;
    blocks.push({ inner: m[2], offset: m.index + m[0].length - m[2].length - "<![endif]-->".length });
  }
  return blocks;
}

/** A VML tag found in document order, with its global source offset. */
interface VmlTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: string;
  offset: number;
  length: number;
}

/**
 * Tokenise the VML tags across every Outlook block, in document order.
 *
 * Scanning tags rather than building a DOM is deliberate: a single VML shape
 * routinely opens in one conditional block and closes in another, with
 * ordinary HTML in between. There is no single fragment to hand a parser, but
 * the open/close *sequence* is exactly what the nesting and balance rules need.
 */
function vmlTags(blocks: MsoBlock[]): VmlTag[] {
  const tags: VmlTag[] = [];
  const re = /<(\/?)v:([a-z]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
  for (const block of blocks) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(block.inner)) !== null) {
      tags.push({
        name: m[2].toLowerCase(),
        closing: m[1] === "/",
        selfClosing: m[4] === "/",
        attrs: m[3],
        offset: block.offset + m.index,
        length: m[0].length,
      });
    }
  }
  return tags;
}

/** Build a source location from a raw offset into the original HTML. */
function locAt(source: string | undefined, offset: number, length: number): SourceLocation | undefined {
  if (source === undefined) return undefined;
  const start = positionOf(source, offset);
  const end = positionOf(source, offset + length);
  return {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    offset,
    length,
  };
}

/** Read one attribute out of a raw attribute string. */
function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"|(?:^|\\s)${name}\\s*=\\s*'([^']*)'`, "i"),
  );
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Record an issue, folding repeats of the same rule+shape into one entry. */
function add(issues: VmlIssue[], seen: Map<string, VmlIssue>, key: string, issue: VmlIssue): void {
  const existing = seen.get(key);
  if (existing) {
    if (!issue.loc || !existing.locs) return;
    if (existing.locs.some((l) => l.offset === issue.loc!.offset)) return;
    if (existing.locs.length >= MAX_WARNING_LOCATIONS) {
      existing.locsTruncated = true;
      return;
    }
    existing.locs.push(issue.loc);
    return;
  }
  seen.set(key, issue);
  issues.push(issue);
}

/** Attach a location to an issue in both the `loc` and `locs` shapes. */
function withLoc(issue: VmlIssue, loc: SourceLocation | undefined): VmlIssue {
  return loc ? { ...issue, loc, locs: [loc] } : issue;
}

/**
 * Elements that give text somewhere to sit inside a VML shape. `<center>` is
 * the one the bulletproof-button pattern uses; `<v:textbox>` is the one VML
 * defines. Any ordinary block will do as well.
 */
const TEXT_HOSTS = /<\s*(center|v:textbox|div|p|table|h[1-6]|span|font|a)\b/i;

/**
 * Flag a shape whose label is a bare text node with no element around it.
 *
 * Verified in Outlook Classic: such a shape draws its fill and geometry
 * correctly and renders no text at all, so a button ships as a blank coloured
 * pill. Wrapping the same text in `<center>` or `<v:textbox>` renders it.
 *
 * ponytail: only flagged when the shape contains visible text and *no* element
 * whatsoever. A shape that already has a wrapper plus some stray text is left
 * alone rather than guessed at, which keeps this at zero false positives on the
 * patterns people actually copy.
 */
function checkLooseText(
  issues: VmlIssue[],
  seen: Map<string, VmlIssue>,
  open: VmlTag,
  inner: string,
  source: string | undefined,
): void {
  if (TEXT_HOSTS.test(inner)) return;
  const text = inner
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\s/g, "");
  if (text === "") return;

  add(issues, seen, `loosetext:${open.name}`, withLoc({
    rule: "vml-unrendered-text",
    severity: "error",
    message: `<v:${open.name}> has label text with no element around it, which Outlook does not draw.`,
    detail:
      `Verified in Outlook Classic: the shape renders its fill and shape correctly and shows no text at ` +
      `all, so the reader gets a blank coloured block where the label should be. Nothing errors and the ` +
      `HTML fallback still reads correctly in every other client, so this ships unnoticed. Wrap the text ` +
      `in <center> (what the bulletproof-button pattern uses) or in <v:textbox>.`,
  }, locAt(source, open.offset, open.length)));
}


/**
 * The table tags a ghost wrapper is built from. Outlook ignores `max-width`, so
 * the standard way to constrain a layout for it is a plain HTML table opened in
 * one conditional block and closed in another, with ordinary markup between:
 *
 *   <!--[if mso]><table width="600"><tr><td><![endif]-->
 *   ...the email...
 *   <!--[if mso]></td></tr></table><![endif]-->
 *
 * Balanced across the two blocks, and invisible to a DOM parser, which sees
 * only comment nodes. Losing the closing block leaves Outlook a table that
 * never ends.
 */
const GHOST_TAGS = new Set(["table", "tr", "td", "th", "tbody", "thead", "tfoot"]);

/** Ghost-table tags across the Outlook-only blocks, in document order. */
function ghostTags(blocks: MsoBlock[]): VmlTag[] {
  const tags: VmlTag[] = [];
  const re = /<(\/?)(table|tr|td|th|tbody|thead|tfoot)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
  for (const block of blocks) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(block.inner)) !== null) {
      tags.push({
        name: m[2].toLowerCase(),
        closing: m[1] === "/",
        selfClosing: m[4] === "/",
        attrs: m[3],
        offset: block.offset + m.index,
        length: m[0].length,
      });
    }
  }
  return tags;
}

/**
 * Report a ghost wrapper that never closes, or closes without opening.
 *
 * Deliberately only reports *unbalanced* wrappers, never the pattern itself:
 * a correctly paired ghost table is the recommended technique, not a fault.
 * Balance is counted per tag name rather than as a strict stack, because the
 * two halves are written by hand in separate blocks and `</td></tr></table>`
 * against `<table><tr><td>` is the normal, correct shape.
 */
function checkGhostTables(
  issues: VmlIssue[],
  seen: Map<string, VmlIssue>,
  blocks: MsoBlock[],
  source: string | undefined,
): void {
  const tags = ghostTags(blocks);
  if (tags.length === 0) return;

  const opens = new Map<string, VmlTag[]>();
  const strays: VmlTag[] = [];
  for (const tag of tags) {
    if (tag.selfClosing) continue;
    const list = opens.get(tag.name) ?? [];
    if (tag.closing) {
      if (list.length === 0) strays.push(tag);
      else list.pop();
    } else list.push(tag);
    opens.set(tag.name, list);
  }

  for (const [name, list] of opens) {
    if (!GHOST_TAGS.has(name)) continue;
    for (const tag of list.slice(0, 1)) {
      add(issues, seen, `ghost-open:${name}`, withLoc({
        rule: "ghost-table-unbalanced",
        severity: "error",
        message: `<${name}> is opened inside an Outlook conditional comment and never closed.`,
        detail:
          `The closing half of a ghost wrapper lives in its own <!--[if mso]> block, usually much further ` +
          `down the file, and is easy to lose in an edit. Outlook is left with a table that never ends, so ` +
          `it swallows the rest of the email; every other client sees only comment nodes and renders ` +
          `normally, which is why this survives review. Add the matching </${name}> in a closing ` +
          `conditional block.`,
      }, locAt(source, tag.offset, tag.length)));
    }
  }

  for (const tag of strays.slice(0, 1)) {
    add(issues, seen, `ghost-stray:${tag.name}`, withLoc({
      rule: "ghost-table-unbalanced",
      severity: "error",
      message: `Closing </${tag.name}> inside an Outlook conditional comment has no matching opening tag.`,
      detail:
        `The opening half of the ghost wrapper is missing or was removed. Outlook receives a stray closing ` +
        `tag, which ends a table it never started and can truncate the layout from that point.`,
    }, locAt(source, tag.offset, tag.length)));
  }
}

/**
 * Check hand-written VML for the mistakes Outlook punishes.
 *
 * This is the one part of an email the DOM analyzers structurally cannot see:
 * VML lives inside `<!--[if mso]>` conditional comments, so to every HTML
 * parser it is a comment node, and to a headless-Chromium screenshot it does
 * not exist at all. An email can therefore lint clean and preview perfectly
 * while the branch Outlook actually renders is broken.
 *
 * ponytail: a tag-sequence checker, not a VML renderer. It validates structure
 * and attribute values, which is where the reported breakages cluster. It does
 * not resolve geometry, so it can say Outlook will misplace a nested shape but
 * not where the shape lands.
 */
export function checkVml(html: string, options?: { positions?: boolean }): VmlReport {
  if (!html || !html.trim()) return EMPTY_VML;
  const source = options?.positions ? html : undefined;

  const blocks = msoBlocks(html);
  const tags = vmlTags(blocks);

  const issues: VmlIssue[] = [];
  const seen = new Map<string, VmlIssue>();

  // Ghost tables are plain HTML, so they are checked whether or not the email
  // contains any VML at all.
  checkGhostTables(issues, seen, blocks, source);

  if (tags.length === 0) return { hasVml: false, issues };

  // A shape stays "open" until its closing tag; `groupDepth` tracks the one
  // container VML legitimately allows shapes inside.
  const openShapes: VmlTag[] = [];
  let groupDepth = 0;

  for (const tag of tags) {
    const { name } = tag;
    const isShape = SHAPE_TAGS.has(name);
    const isGroup = GROUP_TAGS.has(name);
    const loc = locAt(source, tag.offset, tag.length);

    if (tag.closing) {
      if (isGroup) groupDepth = Math.max(0, groupDepth - 1);
      if (isShape) {
        const idx = openShapes.map((t) => t.name).lastIndexOf(name);
        if (idx !== -1) {
          // ── Text sitting loose in a shape, with nothing to lay it out ────
          const open = openShapes[idx];
          const inner = html.slice(open.offset + open.length, tag.offset);
          checkLooseText(issues, seen, open, inner, source);
        }
        if (idx === -1) {
          add(issues, seen, `stray:${name}`, withLoc({
            rule: "vml-unbalanced-tag",
            severity: "error",
            message: `Closing </v:${name}> has no matching opening tag.`,
            detail:
              `Outlook stops rendering the shape when VML tags do not balance. Check that every ` +
              `conditional-comment block opens and closes the tags it is responsible for.`,
          }, loc));
        } else {
          openShapes.splice(idx, 1);
        }
      }
      continue;
    }

    if (isGroup && !tag.selfClosing) groupDepth++;

    if (isShape) {
      // ── The Outlook breaker: a shape inside another shape ────────────────
      const parent = openShapes[openShapes.length - 1];
      if (parent && groupDepth === 0) {
        add(issues, seen, `nested:${parent.name}>${name}`, withLoc({
          rule: "vml-nested-shape",
          severity: "error",
          message:
            `<v:${name}> is nested inside <v:${parent.name}>. Outlook does not support nesting one ` +
            `VML shape inside another.`,
          // Two effects, not the three this used to claim. The withdrawn one
          // said the table structure terminates early so content after the
          // shape falls outside the email frame. It had no methodology behind
          // it, and `T1c-blast-radius.html`, the fixture built to measure
          // exactly this, contradicts it: the block after the nested shape
          // rendered in place inside the same table with its background and
          // borders intact, and only the VML labels were missing. The likely
          // origin is over-reading "layout breaks after it" from a run where a
          // 600px hero band vanished and everything below shifted up.
          //
          // Kept as a warning to whoever edits this next: the probe sentence
          // below covers the downstream text suppression only. Do not let it
          // lend its authority to a neighbouring clause again.
          detail:
            `Verified in Outlook Classic, and the damage is not local. Two things happen: the containing ` +
            `<v:${parent.name}> does not render at all (its fill and everything inside it disappear, leaving ` +
            `the inner shape stranded); and every VML shape further down the email stops drawing its text, ` +
            `so buttons and headings after this point ship as blank coloured blocks. That second effect was ` +
            `confirmed with byte-identical probes either side of one nested shape: the one before it renders ` +
            `its labels, the one after it does not. Every other client renders the HTML fallback correctly, ` +
            `which is why none of this is visible outside the Word engine. Fix: lift the inner shape out of ` +
            `<v:${parent.name}>, or drop the container shape and keep the inner one (a framed background can ` +
            `degrade to a solid fill colour on the <td> instead).`,
        }, loc));
      }
      if (!tag.selfClosing) openShapes.push(tag);
    }

    // ── Attribute checks ───────────────────────────────────────────────────
    const style = attr(tag.attrs, "style");
    if (style && (isShape || isGroup)) {
      for (const prop of ["width", "height"] as const) {
        const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]*)`, "i"));
        if (!m) continue;
        const value = m[1].trim();
        // Empty, or a bare unit with no number in front of it ("px", "%").
        if (value === "" || /^[a-z%]+$/i.test(value)) {
          add(issues, seen, `dim:${name}:${prop}:${value}`, withLoc({
            rule: "vml-invalid-dimension",
            severity: "error",
            message: `<v:${name}> has an invalid ${prop}: "${prop}:${value}" is missing its number.`,
            detail:
              `Verified in Outlook Classic: the shape still draws, but at a size Outlook picks rather than ` +
              `the one you meant, and the content inside is clipped to it — roughly half the intended height ` +
              `in the case measured, with the text inside cut off. It fails quietly: there is no gap or ` +
              `broken image to notice, just content that is silently missing. Usually a template variable ` +
              `that resolved to an empty string. Set an explicit value in pixels, e.g. ${prop}:400px.`,
          }, loc));
        }
      }
    }

    // arcsize is a VgFraction: 0% is square, 100% is fully circular. Anything
    // outside that is out of range and left to the renderer to clamp.
    if (name === "roundrect") {
      const arcsize = attr(tag.attrs, "arcsize");
      if (arcsize !== undefined) {
        const raw = arcsize.trim();
        const pct = raw.endsWith("%") ? parseFloat(raw) : parseFloat(raw) * 100;
        if (Number.isFinite(pct) && (pct < 0 || pct > 100)) {
          add(issues, seen, `arcsize:${raw}`, withLoc({
            rule: "vml-arcsize-range",
            severity: "warning",
            message: `<v:roundrect> has arcsize="${raw}", outside the valid 0%–100% range.`,
            detail:
              `arcsize is a fraction of half the shape's smaller side: 0% is square, 100% is fully circular. ` +
              `Verified in Outlook Classic: out-of-range values are clamped, so 120% draws exactly the same ` +
              `corner as 100%. Nothing visibly breaks today, which is why this is a warning and not an error ` +
              `— but the radius you get is the renderer's clamp rather than a value you chose, and it is not ` +
              `guaranteed across clients. For a fully rounded button, say arcsize="100%".`,
          }, loc));
        }
      }
    }
  }

  // Anything still on the stack never closed.
  for (const tag of openShapes) {
    add(issues, seen, `unclosed:${tag.name}`, withLoc({
      rule: "vml-unbalanced-tag",
      severity: "error",
      message: `<v:${tag.name}> is never closed.`,
      detail:
        `Outlook needs the matching </v:${tag.name}>, usually in a later conditional-comment block. ` +
        `Without it the shape swallows the rest of the email.`,
    }, locAt(source, tag.offset, tag.length)));
  }

  return { hasVml: true, issues };
}
