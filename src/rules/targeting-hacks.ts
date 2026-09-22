export { TARGETING_HACKS } from "./targeting-hacks.generated";
export type { TargetingHack, HackStatus } from "./targeting-hacks.generated";

export {
  TARGETING_MATCHERS,
  getTargetingHacksForClient,
  getWorkingTargetingHacks,
  detectSelectorListTargetingScope,
} from "./targeting-matchers";
export type { TargetingMatcher, TargetingSimulate } from "./targeting-matchers";
