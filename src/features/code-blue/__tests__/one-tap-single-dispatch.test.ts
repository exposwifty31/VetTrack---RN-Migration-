/**
 * RECONCILE GUARD (J1 one-tap x manager picker).
 *
 * The two slices were built in parallel and each was green alone. J1 moved the
 * start onto POST /api/code-blue/one-tap, where `idempotencyToken` is REQUIRED
 * (`oneTapStartSchema`, `.strict()`), and minted the token at what was then the
 * single call site. The picker slice split that site in two — self-manage, and
 * nominate-a-vet. Merged naively, both picker paths would have posted with no
 * token and 400'd mid-arrest, including the nominate path the picker exists for.
 *
 * The fix was structural: one `startCodeBlue` callback owns the token and is
 * passed down, so a call site that cannot see the mutation cannot forget the
 * fence. This test is what keeps it structural. A second `start.mutate(` in
 * this file is the exact regression — reachable, green under every behavioural
 * test that does not happen to press that particular button, and only visible
 * on a real arrest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync(join(__dirname, "..", "CodeBlueActions.tsx"), "utf8");

/**
 * Comments and string literals stripped before counting.
 *
 * The first version of this guard counted `start.mutate(` in the RAW file, so a
 * future comment quoting the call would have failed it — and the sibling PR hit
 * exactly that trap twice, with guards that forbade *mentioning* `npx` rather
 * than *calling* it. A source-text guard has to look at code, not vocabulary.
 */
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");

describe("Code Blue start has exactly one dispatch point", () => {
  it("calls start.mutate in exactly one place — the token minter", () => {
    const calls = source.match(/start\.mutate\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("that one call site sends the idempotency fence", () => {
    const dispatch = source.slice(source.indexOf("start.mutate("));
    expect(dispatch).toContain("idempotencyToken");
  });

  it("mints through resolveOneTapStartToken, never a bare randomUUID per press", () => {
    // Shape, not one exact expression: pinning the literal argument list made
    // any reformatting — or a legitimate change to how the token ref is scoped —
    // fail with a message that named neither cause.
    // The resolver being CALLED proves nothing on its own — a future change
    // could keep the call and dispatch a freshly minted token through another
    // variable. So bind the ASSIGNED identifier to the dispatched payload.
    //
    // Written as code rather than one regex because the payload uses ES
    // shorthand (`{ idempotencyToken, ... }`), and a single pattern that also
    // covers `idempotencyToken: name` is unreadable. The reviewer's proposed
    // regex assumed the explicit form and did not match this file.
    const assignment = /const\s+([A-Za-z_$][\w$]*)\s*=\s*resolveOneTapStartToken\s*\([^;]*\bCrypto\.randomUUID\b[^;]*\)/.exec(
      source,
    );
    expect(assignment).not.toBeNull();
    const tokenName = assignment?.[1] ?? "";

    const payload = source.slice(source.indexOf("start.mutate("));
    const explicit = new RegExp(`\\bidempotencyToken\\s*:\\s*${tokenName}\\b`).test(payload);
    const shorthand = tokenName === "idempotencyToken" && /\bidempotencyToken\s*[,}]/.test(payload);
    expect(explicit || shorthand).toBe(true);
    expect(source).not.toMatch(/idempotencyToken:\s*Crypto\.randomUUID\(\)/);
  });
});
