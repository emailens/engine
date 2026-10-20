/**
 * How to keep a design intact in Outlook Classic (the Word engine), as rules
 * an author or a model can apply. One list, used by the AI fix system prompt
 * and by the fix prompt, so every consumer (CLI, MCP, app) gives the same
 * advice.
 *
 * Each rule was applied to a set of 24 production React Email templates until
 * every client scored 100 and the Outlook branch, drawn, matched the other
 * clients within 2px (2026-10-17).
 */
export const OUTLOOK_CLASSIC_RULES = [
  "Every visual property the author wrote is intended in Outlook Classic too: rebuild it there rather than dropping it.",
  "Rounded button: a bulletproof button. <!--[if mso]><v:roundrect href=… style=\"width:Wpx;height:Hpx;v-text-anchor:middle\" arcsize=… fillcolor=… stroke=\"f\"><w:anchorlock/><center style=\"color:…;font-family:…;font-size:…\">Label</center></v:roundrect><![endif]--> then the HTML <a> inside <!--[if !mso]><!-->…<!--<![endif]-->. W and H are the <a>'s rendered size. Put the label in a <span style=\"display:inline-block\">: a link's underline does not reach inside an inline-block, so no client underlines it, including those that strip text-decoration.",
  "Rounded picture: <v:roundrect arcsize=… stroke=\"f\" style=\"width:Wpx;height:Hpx\"><v:imagedata src=…/></v:roundrect> in Outlook, the <img> elsewhere. Use v:imagedata, not <v:fill type=\"frame\">: on real Outlook 2016 and 2019 the fill shows only its fallback colour, never the picture. Use the picture's real rendered size (width of its column, height from the file's ratio), and wrap the shape in <div style=\"font-size:0;line-height:0\"> so it does not sit on a text baseline with a gap under it.",
  "Rounded container (card, panel) that holds no VML: wrap its content in <v:roundrect … style=\"width:Wpx\"><v:textbox style=\"mso-fit-shape-to-text:true\" inset=\"0,0,0,0\">.",
  "Rounded container that holds VML (a VML button or picture): never put it in a v:roundrect. Word draws no VML inside another shape's text box, so the button or picture disappears. Build corner cells instead, in Outlook only: a three-row table of the container's px width; top and bottom rows are [corner][edge cell][corner], the middle row is one cell holding the content. Each corner is an r×r <v:shape coordsize=\"r,r\" path=…> quarter disc of the fill (top-left: \"m 0,r qy r,0 l r,r x e\"; top-right: \"m 0,0 qx r,r l 0,r x e\"; bottom-right: \"m r,0 qy 0,r l 0,0 x e\"; bottom-left: \"m r,r qx 0,0 l r,0 x e\"); for a bordered box stroke only the curve with \"<fill path> ns e <curve> nf e\" and give the edge cells matching borders. Other clients keep their table with background and border-radius, inside <!--[if !mso]><!-->. Keep the fill off any table both branches share: Word would paint it square over the corners.",
  "arcsize is the radius as a fraction of HALF the shape's shorter side: 8px on a 52px-tall button is 31%, 12px on a 268px-tall picture is 9%.",
  "Width: Outlook ignores max-width. Wrap the 600px sheet in <!--[if mso]><table width=\"600\" align=\"center\"><tr><td><![endif]-->…<!--[if mso]></td></tr></table><![endif]-->, and give every picture a width attribute no wider than its column.",
  "Padding goes on <td>. Padding on a <table> (React Email's <Section>, <Container>) or on a <div> is dropped.",
  "Spacing: Word adds adjacent vertical margins where browsers collapse them. Never stack one block's margin-bottom on the next block's margin-top, and count spacer paragraphs inside conditionals as margins.",
  "Long URLs and keys: put <wbr> after / ? & = and every ~16 characters. Not &#8203;, which is copied into the URL a reader pastes. word-break and overflow-wrap are dropped by Yahoo, AOL and Gmail.",
  "Hidden preheader: display:none plus mso-hide:all.",
] as const;

export const OUTLOOK_CLASSIC_RULES_TEXT = OUTLOOK_CLASSIC_RULES.map((r) => `  - ${r}`).join("\n");
