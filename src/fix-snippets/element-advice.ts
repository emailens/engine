import type { CodeFix } from "../types";

/**
 * Advice that depends on the element, not only the property: a rounded button,
 * a rounded picture and a rounded card are three different fixes in Outlook
 * Classic, and the property-level entry can only name one. Keyed
 * `property::client::tag`, where client is `outlook` (Outlook Classic), a
 * client id, or `*`, and tag is the element or `*`.
 */
type Advice = { suggestion: string; fix?: CodeFix };

const button: Advice = {
  suggestion:
    "Make it a bulletproof button: a VML <v:roundrect href> sized to the button for Outlook Classic, the <a> for everyone else. arcsize is the radius over half the height (8px on 52px = 31%).",
  fix: {
    language: "html",
    description: "Bulletproof rounded button for Outlook Classic",
    before: `<a href="https://example.com" style="background:#1a1a1a;color:#fff;border-radius:8px;padding:14px 28px;display:inline-block;text-decoration:none">Open your dashboard</a>`,
    after: `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://example.com" style="height:52px;v-text-anchor:middle;width:214px;" arcsize="31%" stroke="f" fillcolor="#1a1a1a"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;">Open your dashboard</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="https://example.com" style="background:#1a1a1a;color:#fff;border-radius:8px;padding:14px 28px;display:inline-block"><span style="display:inline-block">Open your dashboard</span></a><!--<![endif]-->`,
  },
};

const picture: Advice = {
  suggestion:
    "Give Outlook Classic a VML copy: a <v:roundrect> holding <v:imagedata src> (not a v:fill, which real Outlook 2016 and 2019 leave blank) at the picture's rendered width and height, in a font-size:0;line-height:0 wrapper. arcsize is the radius over half the shorter side.",
  fix: {
    language: "html",
    description: "Rounded picture in Outlook Classic",
    before: `<img src="https://example.com/hero.png" width="536" style="width:100%;border-radius:12px" alt="">`,
    after: `<!--[if mso]><div style="font-size:0;line-height:0;"><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" arcsize="9%" stroke="f" style="width:536px;height:268px;"><v:imagedata src="https://example.com/hero.png" /></v:roundrect></div><![endif]-->
<!--[if !mso]><!--><img src="https://example.com/hero.png" width="536" style="width:100%;border-radius:12px" alt=""><!--<![endif]-->`,
  },
};

const container: Advice = {
  suggestion:
    "Round it in Outlook Classic without wrapping it in a shape if it holds a VML button or picture (Word would hide them): corner cells, a three-row table with a VML quarter disc in each corner and the content in the middle row. With no VML inside, a <v:roundrect> + <v:textbox style=\"mso-fit-shape-to-text:true\"> around it works.",
  fix: {
    language: "html",
    description: "Rounded card in Outlook Classic with corner cells",
    before: `<table width="100%" style="background:#f3f0e8;border-radius:10px"><tr><td style="padding:30px 32px">…content, buttons…</td></tr></table>`,
    after: `<!--[if mso]><table width="576" cellpadding="0" cellspacing="0" border="0"><tr><td width="10" height="10"><v:shape xmlns:v="urn:schemas-microsoft-com:vml" coordsize="10,10" path="m 0,10 qy 10,0 l 10,10 x e" fillcolor="#f3f0e8" stroked="f" style="width:10px;height:10px;"></v:shape></td><td height="10" bgcolor="#f3f0e8"></td><td width="10"><v:shape xmlns:v="urn:schemas-microsoft-com:vml" coordsize="10,10" path="m 0,0 qx 10,10 l 0,10 x e" fillcolor="#f3f0e8" stroked="f" style="width:10px;height:10px;"></v:shape></td></tr><tr><td colspan="3" bgcolor="#f3f0e8"><![endif]-->
<!--[if !mso]><!--><table width="100%" style="background:#f3f0e8;border-radius:10px"><tr><td style="padding:10px 0"><!--<![endif]-->
<table width="100%"><tr><td style="padding:20px 32px">…content, buttons…</td></tr></table>
<!--[if !mso]><!--></td></tr></table><!--<![endif]-->
<!--[if mso]></td></tr><tr><td width="10"><v:shape xmlns:v="urn:schemas-microsoft-com:vml" coordsize="10,10" path="m 10,10 qx 0,0 l 10,0 x e" fillcolor="#f3f0e8" stroked="f" style="width:10px;height:10px;"></v:shape></td><td height="10" bgcolor="#f3f0e8"></td><td width="10"><v:shape xmlns:v="urn:schemas-microsoft-com:vml" coordsize="10,10" path="m 10,0 qy 0,10 l 0,0 x e" fillcolor="#f3f0e8" stroked="f" style="width:10px;height:10px;"></v:shape></td></tr></table><![endif]-->`,
  },
};

const breakLong: Advice = {
  suggestion:
    "Put <wbr> after / ? & = and every ~16 characters of the long text instead. It holds in Yahoo, AOL, Gmail and Apple Mail, and unlike &#8203; it is not copied into the URL a reader pastes.",
  fix: {
    language: "html",
    description: "Break a long URL with <wbr>",
    before: `<td style="word-break:break-all">https://example.com/verify?token=abcdef0123456789</td>`,
    after: `<td>https://<wbr>example.<wbr>com/<wbr>verify?<wbr>token=<wbr>abcdef0123456789</td>`,
  },
};

const ADVICE: Record<string, Advice> = {
  "border-radius::outlook::a": button,
  "border-radius::outlook::img": picture,
  "border-radius::outlook::table": container,
  "border-radius::outlook::td": container,
  "border-radius::outlook::div": container,
  "padding::outlook::a": button,
  "max-width::outlook::img": {
    suggestion:
      "Outlook Classic ignores max-width: give the picture a width attribute equal to its column (not wider) and keep width:100% for the other clients.",
  },
  "padding::outlook::table": {
    suggestion:
      "Outlook Classic drops padding on a <table> (React Email's <Section> and <Container> put it there). Move it to the <td>.",
  },
  "padding::outlook::div": {
    suggestion: "Outlook Classic drops padding on a <div>. Put it on a <td>.",
  },
  "word-break::*::*": breakLong,
  "overflow-wrap::*::*": breakLong,
  "text-decoration::protonmail::a": {
    suggestion:
      "Put the label in a <span style=\"display:inline-block\"> and drop text-decoration:none: a link's underline does not reach inside an inline-block, so the label is not underlined even where text-decoration is stripped.",
  },
  "height::*::img": {
    suggestion:
      "Drop the CSS height (height:auto included): with a width attribute and width:100%, the picture keeps its ratio everywhere.",
  },
};

function clientKey(clientId: string): string {
  return clientId === "outlook-windows-legacy" ? "outlook" : clientId;
}

/** Element-specific advice for a warning, if there is any. */
export function getElementAdvice(
  property: string,
  clientId: string,
  selector: string | undefined,
): Advice | undefined {
  const tag = /^[a-z][a-z0-9]*/i.exec(selector ?? "")?.[0]?.toLowerCase() ?? "*";
  const client = clientKey(clientId);
  return (
    ADVICE[`${property}::${client}::${tag}`] ??
    ADVICE[`${property}::*::${tag}`] ??
    ADVICE[`${property}::${client}::*`] ??
    ADVICE[`${property}::*::*`]
  );
}
