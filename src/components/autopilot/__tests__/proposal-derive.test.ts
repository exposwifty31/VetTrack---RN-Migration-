/**
 * Pure derivation tests (Slice 11) — the meat of the edit-scope decision. Locks
 * which kinds are note-editable and that every produced `editedContent` matches
 * the server's per-kind Zod schema (verified against
 * `server/lib/autopilot/action-proposal-types.ts`, read-only): crash_cart
 * `{driftType, note}` and coordinator `{note}`; restock + handover are NOT
 * note-editable (strict shapes / side effects) → null.
 */
import {
  buildEditedContent,
  extractDriftType,
  isNoteEditable,
  NOTE_MAX_LENGTH,
  PROPOSAL_KIND_LABEL_KEY,
  proposalKindLabelKey,
} from "../proposal-derive";

describe("proposalKindLabelKey", () => {
  it("maps every kind to an autopilot.kind.* key", () => {
    expect(proposalKindLabelKey("shift_handover_draft")).toBe("autopilot.kind.shiftHandoverDraft");
    expect(proposalKindLabelKey("coordinator_reassign_off_roster")).toBe(
      "autopilot.kind.coordinatorReassign",
    );
    expect(proposalKindLabelKey("restock_po_on_burn")).toBe("autopilot.kind.restockPo");
    expect(proposalKindLabelKey("crash_cart_drift")).toBe("autopilot.kind.crashCartDrift");
    expect(Object.keys(PROPOSAL_KIND_LABEL_KEY)).toHaveLength(4);
  });
});

describe("extractDriftType", () => {
  it("reads a valid driftType from the draft", () => {
    expect(extractDriftType({ driftType: "missing_items" })).toBe("missing_items");
    expect(extractDriftType({ driftType: "stale_check" })).toBe("stale_check");
  });

  it("returns null for an absent, invalid, or non-object draft", () => {
    expect(extractDriftType({ driftType: "bogus" })).toBeNull();
    expect(extractDriftType({})).toBeNull();
    expect(extractDriftType(null)).toBeNull();
    expect(extractDriftType("stale_check")).toBeNull();
  });
});

describe("isNoteEditable", () => {
  it("is true for coordinator (schema accepts any plain object)", () => {
    expect(isNoteEditable("coordinator_reassign_off_roster", { anything: true })).toBe(true);
  });

  it("is true for crash_cart only when the draft carries a driftType", () => {
    expect(isNoteEditable("crash_cart_drift", { driftType: "missing_items" })).toBe(true);
    expect(isNoteEditable("crash_cart_drift", {})).toBe(false);
  });

  it("is false for restock and handover (not note-editable in G3)", () => {
    expect(isNoteEditable("restock_po_on_burn", {})).toBe(false);
    expect(isNoteEditable("shift_handover_draft", {})).toBe(false);
  });
});

describe("buildEditedContent", () => {
  it("builds the coordinator note-only body", () => {
    expect(buildEditedContent("coordinator_reassign_off_roster", {}, "  moved to Dana  ")).toEqual({
      note: "moved to Dana",
    });
  });

  it("builds the crash_cart body with driftType read from the draft", () => {
    expect(
      buildEditedContent("crash_cart_drift", { driftType: "stale_check" }, "restocked manually"),
    ).toEqual({ driftType: "stale_check", note: "restocked manually" });
  });

  it("returns null for a blank note", () => {
    expect(buildEditedContent("coordinator_reassign_off_roster", {}, "   ")).toBeNull();
  });

  it("returns null for crash_cart when the draft has no driftType", () => {
    expect(buildEditedContent("crash_cart_drift", {}, "note")).toBeNull();
  });

  it("returns null for kinds that are not note-editable", () => {
    expect(buildEditedContent("restock_po_on_burn", {}, "note")).toBeNull();
    expect(buildEditedContent("shift_handover_draft", {}, "note")).toBeNull();
  });

  it("caps at the server crash-cart note max", () => {
    expect(NOTE_MAX_LENGTH).toBe(1000);
  });
});
