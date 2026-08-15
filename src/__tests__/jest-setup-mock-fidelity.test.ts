/**
 * Pins the FIDELITY of the global mocks in `jest.setup.js`.
 *
 * A global mock that returns the wrong shape or the wrong value is worse than no
 * mock: every suite that touches it goes green on data the real module would
 * never produce. Mocks drift silently — nothing else in the tree asserts on
 * them, so this file is the only thing standing between a stub and a false
 * green. Same genre as `manifest-vs-code.test.ts`: a repo invariant, not a
 * feature test.
 *
 * Two surfaces are pinned here because production code depends on their exact
 * semantics:
 *
 *   1. `useSharedValue().modify(fn)` — `useDualFrameSampler` accumulates UI-thread
 *      frame deltas exclusively through `modify`. A stub carrying only `value`
 *      throws the moment a test drives a frame.
 *   2. `Ndef.uri/text.decodePayload` — NDEF payloads are NOT raw strings. The URI
 *      record's first byte is a protocol-prefix index; the text record's first
 *      byte packs an encoding bit plus the language-code length. A decoder that
 *      returns the bytes as code units invents equipment URLs that no tag emits.
 *
 * WHAT THE TWO KINDS OF NDEF CASE ACTUALLY DO — they are not interchangeable:
 *
 *   - DIFFERENTIAL cases compare mock output against the real `ndef-lib` helper
 *     on the same input. Today the mock DELEGATES to those helpers and jest
 *     resolves the subpath to the same module-registry entry, so the two sides
 *     are the SAME FUNCTION OBJECT. These cases assert exactly one thing:
 *     "still delegating". They detect nothing about decode semantics, and they
 *     add zero marginal detection over the anchors below — verified by swapping
 *     in a hand-rolled spec-correct-`TextDecoder` decoder, under which all nine
 *     stayed green.
 *   - ANCHOR cases hardcode values derived by running the REAL `ndef-lib` in
 *     plain node (no jest, no mocks). These are the only cases that catch a
 *     hand-rolled decoder, because they assert what the library DOES rather than
 *     what the UTF-8 spec says — and on three inputs the library disagrees with
 *     the spec:
 *       * malformed UTF-8 -> `bytesToString` returns `null`, so a text record
 *         decodes to the VALUE `null` and a URI record to the STRING
 *         `"https://null"` (prefix + null concatenation). Not U+FFFD, not a throw.
 *       * astral codepoints truncate: util.js ends in `String.fromCharCode(ch)`,
 *         so U+1F600 lands as the single BMP unit U+F600, never a surrogate pair.
 *         A spec-correct decoder is MORE correct here and therefore LESS faithful.
 *       * a prefix byte >= 36 is outside `RTD_URI_PROTOCOLS` (length exactly 36)
 *         and decodes with no prefix at all.
 *     The prefix-table anchor is COVERAGE of a boundary, not detection of the
 *     drift above: a hand-roll with an ordinary out-of-table fallback satisfies
 *     it. The malformed-UTF-8 and astral anchors are what fail such a decoder.
 *
 * BMP multibyte is NOT a discriminator and nothing here claims it is — the
 * library decodes 2- and 3-byte sequences identically to the spec.
 */
import { renderHook } from "@testing-library/react-native";
import { Ndef } from "react-native-nfc-manager";

import { getFrameSample, resetFrameSamples } from "@/lib/instrumentation/perf";

import { useDualFrameSampler } from "../hooks/useDualFrameSampler";

// The real helpers are plain JS (`./util` + `./constants`, no native imports) and
// load fine under jest. Only the package ROOT is mocked — this subpath is a
// different specifier, so it resolves to the genuine implementation.
const realUri = require("react-native-nfc-manager/ndef-lib/ndef-uri");
const realText = require("react-native-nfc-manager/ndef-lib/ndef-text");

// Bound through `require` so the `useFrameCallback` swap below does not fight the
// module's read-only ES-namespace typing under `tsc --noEmit`.
const reanimated = require("react-native-reanimated");

type FrameInfo = { timeSincePreviousFrame: number | null };

describe("jest.setup.js mock fidelity — react-native-reanimated useSharedValue", () => {
  it("supports .modify(): applies the modifier's return value to .value", async () => {
    const { result } = await renderHook(() =>
      reanimated.useSharedValue([] as number[]),
    );

    result.current.modify((arr: number[]) => {
      arr.push(7);
      return arr;
    });

    expect(result.current.value).toEqual([7]);
  });

  it("supports .modify() with no modifier: keeps the current value", async () => {
    const { result } = await renderHook(() =>
      reanimated.useSharedValue([1, 2] as number[]),
    );

    result.current.modify();

    expect(result.current.value).toEqual([1, 2]);
  });

  it("keeps the initial value on .value before any write", async () => {
    const { result } = await renderHook(() =>
      reanimated.useSharedValue("idle"),
    );

    expect(result.current.value).toBe("idle");
  });

  it("lets useDualFrameSampler accumulate UI-thread frame deltas end-to-end", async () => {
    resetFrameSamples();
    const original = reanimated.useFrameCallback;
    let frameWorklet: ((frame: FrameInfo) => void) | null = null;
    reanimated.useFrameCallback = (callback: (frame: FrameInfo) => void) => {
      frameWorklet = callback;
      return { setActive: jest.fn(), isActive: false };
    };

    try {
      // Single render only: the mocked useSharedValue returns a FRESH object per
      // render, so a rerender would hand `stop()` a different accumulator.
      const { result } = await renderHook(() => useDualFrameSampler());

      // start/stop only touch refs — no React state update, so no act() needed.
      result.current.start();
      // A null delta is the first-frame case and must not be recorded.
      frameWorklet!({ timeSincePreviousFrame: null });
      frameWorklet!({ timeSincePreviousFrame: 16.4 });
      frameWorklet!({ timeSincePreviousFrame: 33.1 });
      result.current.stop();

      // `runOnUI`/`scheduleOnRN` are synchronous under the global mocks, so the
      // published sample is readable immediately after stop().
      expect(getFrameSample("ui")?.deltasMs).toEqual([16.4, 33.1]);
    } finally {
      reanimated.useFrameCallback = original;
      resetFrameSamples();
    }
  });
});

describe("jest.setup.js mock fidelity — react-native-nfc-manager Ndef", () => {
  // [protocol index, ...UTF-8 bytes]
  const uriCases: Record<string, number[]> = {
    // 4 = "https://"  ->  https://vet.app/e/EQ-1  (the canonical equipment sticker)
    "prefix index 4 (https://)": [
      4, 118, 101, 116, 46, 97, 112, 112, 47, 101, 47, 69, 81, 45, 49,
    ],
    // 0 = "" (no prefix) — a fully spelled-out URI
    "prefix index 0 (none)": [
      0, 104, 116, 116, 112, 115, 58, 47, 47, 118, 101, 116, 46, 97, 112, 112,
    ],
    // 5 = "tel:"
    "prefix index 5 (tel:)": [5, 49, 50, 51],
    // >= 36 is outside the RTD table and decodes with no prefix
    "prefix index 200 (out of table)": [200, 97, 98, 99],
    // multibyte: "é" = 0xC3 0xA9 under prefix 4
    "multibyte body": [4, 118, 101, 116, 46, 195, 169],
  };

  it.each(Object.entries(uriCases))(
    "uri.decodePayload still delegates to the real ndef-lib helper — %s",
    (_label, bytes) => {
      expect(Ndef.uri.decodePayload(new Uint8Array(bytes))).toBe(
        realUri.decodePayload(new Uint8Array(bytes)),
      );
    },
  );

  it("uri.decodePayload consumes the identifier byte and prepends its protocol", () => {
    const bytes = new Uint8Array([
      4, 118, 101, 116, 46, 97, 112, 112, 47, 101, 47, 69, 81, 45, 49,
    ]);
    expect(Ndef.uri.decodePayload(bytes)).toBe("https://vet.app/e/EQ-1");
  });

  // [status byte, ...language code, ...UTF-8 text]
  const textCases: Record<string, number[]> = {
    // 0x02 -> UTF-8, 2-byte language code "en"
    "utf-8, lang en": [0x02, 101, 110, 72, 101, 108, 108, 111],
    // 5-byte language code "en-GB"
    "utf-8, lang en-GB": [0x05, 101, 110, 45, 71, 66, 79, 75],
    // multibyte body: "café" -> 63 61 66 C3 A9
    "utf-8 multibyte body": [0x02, 101, 110, 99, 97, 102, 195, 169],
    // status bit 7 set (UTF-16 flag) with a 2-byte language code: the real helper
    // masks with 0x3f for the length and decodes UTF-8 REGARDLESS (its own TODO).
    "utf-16 status bit set": [0x82, 101, 110, 72, 105],
  };

  it.each(Object.entries(textCases))(
    "text.decodePayload still delegates to the real ndef-lib helper — %s",
    (_label, bytes) => {
      expect(Ndef.text.decodePayload(new Uint8Array(bytes))).toBe(
        realText.decodePayload(new Uint8Array(bytes)),
      );
    },
  );

  it("text.decodePayload consumes the status + language bytes and UTF-8 decodes", () => {
    expect(
      Ndef.text.decodePayload(
        new Uint8Array([0x02, 101, 110, 72, 101, 108, 108, 111]),
      ),
    ).toBe("Hello");
  });
});

/**
 * ANCHORS — every expectation below is the literal output of running the REAL
 * `ndef-lib` helpers in plain node against these exact bytes (no jest, no mocks).
 * They assert what the LIBRARY does, not what the UTF-8 spec says; where the two
 * disagree the spec-correct value is given in a comment. That disagreement is the
 * whole point: it is what makes a hand-rolled decoder detectable.
 */
describe("jest.setup.js mock fidelity — Ndef anchors pinned to real ndef-lib behaviour", () => {
  describe("malformed UTF-8 — bytesToString returns null (util.js:15-24)", () => {
    // A lone 0xFF: extraByteMap[(0xff >> 3) & 7] === 0, so _utf8ArrayToStr bails.
    // The URI helper concatenates that null onto the prefix, producing the literal
    // string "https://null". Spec-correct decoder: "https://vet.�".
    it("uri.decodePayload yields the STRING 'https://null' on an invalid lead byte", () => {
      expect(
        Ndef.uri.decodePayload(new Uint8Array([4, 118, 101, 116, 46, 0xff])),
      ).toBe("https://null");
    });

    // Truncated 2-byte sequence: 0xC3 with no continuation byte (index + extra > count).
    it("uri.decodePayload yields 'https://null' on a truncated multibyte sequence", () => {
      expect(
        Ndef.uri.decodePayload(new Uint8Array([4, 118, 101, 116, 46, 0xc3])),
      ).toBe("https://null");
    });

    // 0xC3 0x28: the continuation byte fails the (chx & 0xc0) !== 0x80 check.
    it("uri.decodePayload yields 'https://null' on a bad continuation byte", () => {
      expect(Ndef.uri.decodePayload(new Uint8Array([4, 0xc3, 0x28]))).toBe(
        "https://null",
      );
    });

    // The text helper returns bytesToString's result directly, so the caller gets
    // the VALUE null — not a string, not U+FFFD, and not a throw. Any decoder that
    // returns a string here is a different decoder. Spec-correct value: "�".
    it("text.decodePayload returns the VALUE null on an invalid lead byte", () => {
      expect(
        Ndef.text.decodePayload(new Uint8Array([0x02, 101, 110, 0xff])),
      ).toBeNull();
    });
  });

  describe("astral codepoints truncate through String.fromCharCode (util.js:30)", () => {
    // U+1F600 GRINNING FACE = F0 9F 98 80. util.js decodes ch === 0x1f600 correctly
    // but emits it via String.fromCharCode, which truncates mod 0x10000 -> U+F600
    // (a single Private Use Area unit). Spec-correct: "😀", length 2.
    it("uri.decodePayload truncates U+1F600 to the single unit U+F600", () => {
      const decoded = Ndef.uri.decodePayload(
        new Uint8Array([
          4, 118, 101, 116, 46, 97, 112, 112, 47, 0xf0, 0x9f, 0x98, 0x80,
        ]),
      );
      expect(decoded).toBe("https://vet.app/\uF600");
      // Length pins the truncation itself: a surrogate pair would make this 18.
      expect(decoded).toHaveLength(17);
    });

    it("text.decodePayload truncates U+1F600 to the single unit U+F600", () => {
      const decoded = Ndef.text.decodePayload(
        new Uint8Array([0x02, 101, 110, 0xf0, 0x9f, 0x98, 0x80]),
      );
      expect(decoded).toBe("\uF600");
      expect(decoded).toHaveLength(1);
    });

    // Contrast case: BMP multibyte is NOT truncated, so the pair above is pinning
    // the astral boundary specifically rather than "multibyte is broken".
    it("text.decodePayload decodes 3-byte BMP (U+6F22) intact", () => {
      expect(
        Ndef.text.decodePayload(
          new Uint8Array([0x02, 101, 110, 0xe6, 0xbc, 0xa2]),
        ),
      ).toBe("\u6F22");
    });
  });

  describe("URI prefix byte outside RTD_URI_PROTOCOLS (table length is exactly 36)", () => {
    // COVERAGE of the boundary, not detection: a hand-roll with an ordinary
    // out-of-table fallback satisfies these. Index 36 is the first invalid value.
    it("uri.decodePayload prepends nothing for index 36 (first out of table)", () => {
      expect(Ndef.uri.decodePayload(new Uint8Array([36, 97, 98, 99]))).toBe(
        "abc",
      );
    });

    it("uri.decodePayload prepends nothing for index 200 (far out of table)", () => {
      expect(Ndef.uri.decodePayload(new Uint8Array([200, 97, 98, 99]))).toBe(
        "abc",
      );
    });

    // Index 0 maps to the empty prefix, which is falsy and takes the same branch.
    it("uri.decodePayload prepends nothing for index 0 (empty prefix)", () => {
      expect(Ndef.uri.decodePayload(new Uint8Array([0, 104, 105]))).toBe("hi");
    });
  });
});
