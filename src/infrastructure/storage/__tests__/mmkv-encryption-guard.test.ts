import * as ts from "typescript";

/**
 * MMKV encryption guard — audit finding §5/H5.
 *
 * WHAT THIS BLOCKS AND WHY IT IS A TEST RATHER THAN A CODE CHANGE
 * `vt.local` (the persistent MMKV instance created in `../defaultStorage.ts`)
 * holds the offline mutation queue (`vt.offline_queue.v1`), preferences and
 * doctor-gate shift state in PLAIN TEXT on the device. The finding is real —
 * `encryptionKey` appears nowhere in src/. The obvious remedy, adding
 * `encryptionKey` to that existing `createMMKV({ id: "vt.local" })` call, is
 * SILENT CLINICAL DATA LOSS on upgrade, and this guard exists to stop it
 * landing while the safe migration is unbuilt.
 *
 * THE MECHANISM, READ OUT OF THE COMPILED SOURCE — NOT ASSUMED
 * Versions: react-native-mmkv 4.3.2 (package.json), MMKVCore 2.4.0
 * (ios/Podfile.lock in the app repo — the C++ actually linked into the binary).
 *
 *  1. `HybridMMKV.cpp` passes `encryptionKey` straight through as
 *     `MMKVConfig.cryptKey` to `MMKV::mmkvWithID`.
 *  2. On open, `MMKV::checkFileCRCValid` (MMKV.cpp:438) computes
 *     `CRC32(0, ptr + Fixed32Size, actualSize)` over the RAW ON-DISK BYTES.
 *     The crypter is not involved, so the CRC of a plaintext file still
 *     matches when a key is supplied — the integrity check does NOT catch a
 *     key/file mismatch.
 *  3. The CRC therefore passes and `MMKV::loadFromFile` (MMKV_IO.cpp:100-120)
 *     takes the `m_crypter` branch: `MiniPBCoder::decodeMap(*m_dicCrypt, ...)`
 *     AES-decrypts data that was never encrypted. The result is garbage —
 *     no throw, no CRC error, no log an operator would ever see.
 *  4. `readQueue()` in `src/lib/offline-queue/offline-queue-store.ts` then
 *     fails safe to `[]`. Queued clinical mutations the user believes are
 *     pending are simply gone from the UI, and the FIRST subsequent write
 *     rewrites the file under the new key, making it permanent.
 *
 * WHY NO JEST TEST CAN EVER CLEAR THIS — the reason the fix is not attempted
 * `node_modules/react-native-mmkv/src/createMMKV/createMMKV.ts:11-14` returns
 * `createMockMMKV(configuration)` whenever `isTest()` is true, and `isTest()`
 * (src/isTest.ts) is exactly `process.env.JEST_WORKER_ID != null`. The mock
 * (src/createMMKV/createMockMMKV.ts) is a plain `Map`: it ignores
 * `encryptionKey` entirely, hardcodes `isEncrypted: false`, and implements
 * `encrypt()`/`recrypt()`/`decrypt()` as `console.warn` no-ops. Under Jest a
 * wrong key can never fail a read, so a green suite is not evidence that any
 * encryption or migration works. Only an on-device upgrade-install can settle
 * it. Shipping storage encryption over a clinical queue on the strength of
 * mock-backed tests is the failure this guard refuses.
 *
 * THE SANCTIONED MIGRATION, when it is built and device-verified
 * Do NOT key the existing instance in place. Two-instance copy-then-delete:
 * open plaintext `vt.local` unkeyed, `importAllFrom` it into a NEW keyed
 * instance `vt.local.enc`, then `deleteMMKV("vt.local")`; treat
 * `existsMMKV("vt.local")` as "migration still owed". Every step is an
 * idempotent overwrite, so a crash at any point re-runs harmlessly and no
 * window exists in which the data is unreadable. In-place `encrypt()` (native
 * `MMKV::reKey`, MMKV_IO.cpp:1413) does preserve data via `fullWriteback`, but
 * pairing it with a "is it encrypted yet?" marker has an unavoidable crash
 * window in BOTH orderings — marker-before-encrypt opens a plaintext file
 * with a key, marker-after-encrypt loses the key to an encrypted file. The key
 * itself must come from expo-secure-store (sync `getItem`, keychain
 * accessibility `AFTER_FIRST_UNLOCK`), never a bundle literal; and a null read
 * must be disambiguated against `existsMMKV("vt.local.enc")` and FAIL LOUD
 * rather than mint a fresh key over an existing store.
 *
 * DETECTION IS SYNTAX, NOT VOCABULARY
 * Every fact below comes from the TypeScript AST, following the convention
 * already set by `src/__tests__/manifest-vs-code.test.ts`: per-extension
 * `ScriptKind`, `setParentNodes`, and a hard failure on any file whose parse
 * was not clean. A substring search for "encryptionKey" would flag this
 * file's own documentation and every comment that discusses the finding; a
 * PropertyAssignment in an argument to `createMMKV` is a fact about the
 * program. The parse-failure check is not decoration — a file that fails to
 * parse recovers by discarding the rest of itself, and the call sites after
 * that point are never produced rather than reported missing.
 */

declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

type Dirent = { name: string; isDirectory(): boolean };
const fs = require("node:fs") as {
  readFileSync(file: string, encoding: "utf8"): string;
  readdirSync(dir: string, options: { withFileTypes: true }): Dirent[];
  existsSync(file: string): boolean;
};
const path = require("node:path") as {
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
  readonly sep: string;
};

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const MMKV_MODULE = "react-native-mmkv";
const FACTORY = "createMMKV";

/** The one call site this guard is known to cover; pinned so a walk that stops finding it fails. */
const KNOWN_CALL_SITE = path.join("src", "infrastructure", "storage", "defaultStorage.ts");

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const isTestFile = (file: string) =>
  file.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.tsx?$/.test(file);

const shippedFiles: string[] = [
  ...collectSourceFiles(path.join(ROOT, "src")).filter((f) => !isTestFile(f)),
  ...["App.tsx", "index.ts"]
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f)),
];

/**
 * `parseDiagnostics` is `@internal` in TypeScript and absent from the public
 * `ts.SourceFile` type, so it is read through a narrow cast — same technique
 * and same justification as manifest-vs-code.test.ts. If a future TypeScript
 * drops the field this degrades to "no failures"; the call-site pin below is
 * what still catches a walk that has quietly stopped seeing the program.
 */
const parseDiagnosticsOf = (sourceFile: ts.SourceFile): readonly ts.Diagnostic[] =>
  (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics ?? [];

type CallSite = {
  /** Repo-relative file. */
  file: string;
  /** 1-based line of the call. */
  line: number;
  /** `encryptionKey` (or an alias-resolved equivalent) is present in the config literal. */
  hasEncryptionKey: boolean;
  /**
   * The config could not be read as an object literal (identifier, spread,
   * conditional...). The guard cannot see inside it, so it cannot clear it.
   */
  opaqueConfig: boolean;
};

type Facts = { callSites: CallSite[]; parseFailures: string[] };

/** Resolves the local binding names for `createMMKV`, and any namespace import of the module. */
function resolveBindings(sourceFile: ts.SourceFile): {
  direct: Set<string>;
  namespaces: Set<string>;
} {
  const direct = new Set<string>();
  const namespaces = new Set<string>();

  const visit = (node: ts.Node): void => {
    // import { createMMKV [as local] } / import * as ns  from "react-native-mmkv"
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.moduleSpecifier.text === MMKV_MODULE &&
      node.importClause
    ) {
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (imported === FACTORY) direct.add(element.name.text);
        }
      }
    }
    // const { createMMKV [: local] } = require("react-native-mmkv")
    // const ns = require("react-native-mmkv")
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "require" &&
      node.initializer.arguments.length > 0 &&
      ts.isStringLiteralLike(node.initializer.arguments[0]!) &&
      (node.initializer.arguments[0] as ts.StringLiteralLike).text === MMKV_MODULE
    ) {
      if (ts.isIdentifier(node.name)) {
        namespaces.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const imported =
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : ts.isIdentifier(element.name)
                ? element.name.text
                : undefined;
          if (imported === FACTORY && ts.isIdentifier(element.name)) {
            direct.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { direct, namespaces };
}

/** True when the object literal assigns `encryptionKey`, written in any syntactic form. */
function assignsEncryptionKey(config: ts.ObjectLiteralExpression): boolean {
  return config.properties.some((property) => {
    if (ts.isShorthandPropertyAssignment(property)) {
      return property.name.text === "encryptionKey";
    }
    if (!ts.isPropertyAssignment(property)) return false;
    const name = property.name;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
      return name.text === "encryptionKey";
    }
    // ["encryptionKey"]: k  — a computed name with a literal inside
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
      return name.expression.text === "encryptionKey";
    }
    return false;
  });
}

function analyze(files: string[]): Facts {
  const callSites: CallSite[] = [];
  const parseFailures: string[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    // A .ts file is not TSX and the grammars genuinely disagree — see the
    // manifest-vs-code precedent. Picking the wrong one silently truncates the walk.
    const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind,
    );

    const { direct, namespaces } = resolveBindings(sourceFile);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isFactoryCall =
          (ts.isIdentifier(callee) && direct.has(callee.text)) ||
          (ts.isPropertyAccessExpression(callee) &&
            callee.name.text === FACTORY &&
            ts.isIdentifier(callee.expression) &&
            namespaces.has(callee.expression.text));

        if (isFactoryCall) {
          const config = node.arguments[0];
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          callSites.push({
            file: rel,
            line: line + 1,
            hasEncryptionKey:
              config != null &&
              ts.isObjectLiteralExpression(config) &&
              assignsEncryptionKey(config),
            // No argument at all is the documented default-instance form and is
            // readable; anything that is not an inline object literal is not.
            opaqueConfig: config != null && !ts.isObjectLiteralExpression(config),
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    const diagnostics = parseDiagnosticsOf(sourceFile);
    if (diagnostics.length > 0) {
      const first = ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ");
      const more = diagnostics.length > 1 ? ` (+${diagnostics.length - 1} more)` : "";
      parseFailures.push(`${rel}: ${first}${more}`);
    }
  }

  return { callSites, parseFailures };
}

const facts = analyze(shippedFiles);

const WHY = [
  "Keying the EXISTING `vt.local` instance is silent clinical data loss on upgrade:",
  "MMKV's CRC is computed over the raw on-disk bytes (MMKVCore 2.4.0, MMKV.cpp:438),",
  "so a plaintext file opened WITH a key passes the integrity check and is then",
  "AES-decrypted into garbage (MMKV_IO.cpp:100-120). readQueue() fails safe to [],",
  "the pending offline mutation queue silently empties, and the next write makes it",
  "permanent. No throw, no log.",
  "",
  "Jest cannot clear this change: createMMKV returns createMockMMKV under",
  "JEST_WORKER_ID (react-native-mmkv/src/createMMKV/createMMKV.ts:11-14); the mock",
  "ignores encryptionKey, hardcodes isEncrypted:false and no-ops encrypt(). A green",
  "suite proves nothing about encryption.",
  "",
  "Ship the two-instance migration instead — import `vt.local` into a NEW keyed",
  "`vt.local.enc`, then deleteMMKV('vt.local') — with the key from expo-secure-store,",
  "and verify it by upgrade-installing over a build that has a populated queue.",
  "See the header of this file for the full design. Do not delete this assertion.",
].join("\n");

describe("MMKV encryption guard (audit §5/H5)", () => {
  // Non-vacuity: an AST query that matches nothing passes every "no violations"
  // assertion below forever. These two pin the walk to the program.
  it("scanned shipped source and found the known createMMKV call site", () => {
    expect(shippedFiles.length).toBeGreaterThan(0);
    expect(facts.callSites.length).toBeGreaterThanOrEqual(1);
    expect(facts.callSites.map((site) => site.file)).toContain(KNOWN_CALL_SITE);
  });

  it("parsed every shipped file cleanly", () => {
    expect(facts.parseFailures).toEqual([]);
  });

  it("no createMMKV call passes an encryptionKey", () => {
    const violations = facts.callSites
      .filter((site) => site.hasEncryptionKey)
      .map((site) => `${site.file}:${site.line}`);

    expect(violations.length === 0 ? "" : `${violations.join(", ")}\n\n${WHY}`).toBe("");
  });

  it("every createMMKV config is an inline object literal the guard can read", () => {
    const opaque = facts.callSites
      .filter((site) => site.opaqueConfig)
      .map((site) => `${site.file}:${site.line}`);

    expect(
      opaque.length === 0
        ? ""
        : `${opaque.join(", ")} — config is not an inline object literal, so this guard cannot see whether it carries an encryptionKey. Inline it.\n\n${WHY}`,
    ).toBe("");
  });
});
