// Whether an email still looks like its design once a client has drawn it,
// and whether its images load: the rule the Emailens app scores by
// (score-from-render). The caller supplies the render (two DOM dumps, an
// optional pixel diff) and the network (an image fetcher).

export { type DomNode, matchNodes, sameValue } from "./dom";
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
