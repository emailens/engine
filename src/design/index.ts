// Whether an email still looks like its design once a client has drawn it,
// and whether its images load: the rule the Emailens app scores by
// (score-from-render). The caller supplies the browser and the network (an
// image fetcher); this builds the two pages to draw (the client's live
// preview and the design itself) and the functions that read them.

export { type DomNode, dumpDom, markPictures, matchNodes, sameValue } from "./dom";
export { type Explained, explainDesign } from "./explain";
export { deadImages, type ImageAnswer, type ImageFetcher, imageUrls } from "./images";
export {
  type Aspect,
  COLUMNS,
  type Component,
  CONTENT,
  hasDesign,
  isEmail,
  type Kept,
  keptOf,
  type Verdict,
  verdictOf,
  WIDTH,
} from "./kept";
export { DEAD_IMAGE, PROVEN, renderScores } from "./score";
export { designDoc, emailWidth, frameOf, releaseImages, viewOf } from "./page";
export {
  CLIENT_VIEWPORTS,
  type ClientViewport,
  mobileShrink,
  prepareIframeHtml,
  prepareWordSource,
  shrinkToFitStyle,
} from "./shell";
