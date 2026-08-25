import { describe, expect, it } from "bun:test";
import pkg from "../../package.json";

/**
 * The compilers are optional peer dependencies: the consumer installs them, we
 * declare which versions we work with. Two things can drift apart without
 * anything failing, and both did.
 *
 * A peer range can grow past what the code supports. `@maizzle/framework` was
 * declared `>=5.0.0` when Maizzle 6 moved to Vue single-file components,
 * `render()` takes an SFC source or a file path where `compileMaizzle()`
 * passes template text, so a consumer could install 6, satisfy the range, and
 * get `Failed to load url <their whole template>` at runtime.
 *
 * And the version CI exercises can fall behind the version consumers install.
 * All three of the others were a major behind: mjml pinned to 4.x while 5.4
 * shipped, `@react-email/render` to 1.x against 2.1, `@react-email/components`
 * to 0.0.x against 1.0. They happened to still work. Nothing was checking.
 *
 * These tests are cheap and they pin the only two invariants that matter:
 * we test inside the range we advertise, and the range stops where support
 * stops.
 */

const COMPILERS = [
  "mjml",
  "@maizzle/framework",
  "@react-email/render",
  "@react-email/components",
] as const;

const peers = pkg.peerDependencies as Record<string, string>;
const devs = pkg.devDependencies as Record<string, string>;

/** The version actually installed, read off disk. */
function installed(name: string): string | undefined {
  try {
    // Not `require(name + "/package.json")`: an ESM-only package with an
    // exports map does not export it, which is how `@maizzle/framework`
    // reports "absent" to anyone who asks that way.
    return require(`../../node_modules/${name}/package.json`).version;
  } catch {
    return undefined;
  }
}

describe("optional peer compilers", () => {
  it("declares every compiler as an optional peer", () => {
    for (const name of COMPILERS) {
      expect([name, peers[name]]).toEqual([name, expect.any(String)]);
      expect([name, pkg.peerDependenciesMeta?.[name]?.optional]).toEqual([name, true]);
    }
  });

  it("tests inside the range it advertises", () => {
    // A devDependency outside the peer range means CI proves nothing about
    // what a consumer will actually install.
    for (const name of COMPILERS) {
      const version = installed(name);
      expect([name, version]).toEqual([name, expect.any(String)]);
      expect([name, version, Bun.semver.satisfies(version!, peers[name])]).toEqual([
        name,
        version,
        true,
      ]);
    }
  });

  it("tests the current major of each compiler it supports", () => {
    // Not "the latest version", that would fail on every upstream release.
    // The devDependency range and the installed version have to agree, so a
    // bump is a deliberate act with the suite run against it.
    for (const name of COMPILERS) {
      const version = installed(name)!;
      expect([name, Bun.semver.satisfies(version, devs[name])]).toEqual([name, true]);
    }
  });

  it("stops the Maizzle range short of 6, which does not work", () => {
    // The specific thing this file exists for. Maizzle 6's render() takes a
    // Vue SFC source or a path; compileMaizzle() passes template text. Six of
    // the compile-maizzle tests fail against it, two of them the ones
    // asserting `{{ process.env.SECRET }}` cannot leak; they fail because
    // nothing compiles rather than because anything leaked, but the guarantee
    // is unverified there either way.
    //
    // Widening this range is not a version bump. It means teaching
    // compileMaizzle to hand Maizzle an SFC, and deciding whether rendering
    // one raises the same execute-the-user's-code question as React Email.
    const range = peers["@maizzle/framework"];
    expect(Bun.semver.satisfies("5.5.0", range)).toBe(true);
    expect(Bun.semver.satisfies("5.0.0", range)).toBe(true);
    expect(Bun.semver.satisfies("6.0.0", range)).toBe(false);
    expect(Bun.semver.satisfies("6.1.0", range)).toBe(false);
  });

  it("keeps the type packages on the same major as what they describe", () => {
    // mjml ships no types of its own, so `@types/mjml` is the only thing
    // telling TypeScript what `await import("mjml")` returns. Left on 4 while
    // mjml moved to 5, it describes an API that is not the one installed:
    // the same drift as the versions above, and quieter, because a wrong type
    // fails nothing until it lets a real mistake through.
    const pairs: Array<[string, string]> = [["@types/mjml", "mjml"]];
    for (const [types, runtime] of pairs) {
      const typesMajor = installed(types)?.split(".")[0];
      const runtimeMajor = installed(runtime)?.split(".")[0];
      expect([types, typesMajor]).toEqual([types, runtimeMajor]);
    }
  });

  it("keeps the other three open above their tested major", () => {
    // These are open-ended on purpose: mjml 4 and 5 both work, and so do both
    // React Email majors. An upper bound would break consumers for no reason.
    // If one of them ships a breaking major, the test above starts failing on
    // the bump, which is when to decide.
    for (const name of ["mjml", "@react-email/render", "@react-email/components"] as const) {
      expect([name, peers[name]]).toEqual([name, expect.stringMatching(/^>=/)]);
      expect([name, peers[name].includes("<")]).toEqual([name, false]);
    }
  });
});
