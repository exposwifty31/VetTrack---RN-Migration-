/**
 * Pure accumulation tests (Slice 8) — the after-cursor merge is the correctness
 * spine of the poll: append + dedupe, chronological order, fresh presence/pin on
 * every poll (even an empty batch), window-rollover replace, and the optimistic
 * own-action patches. No React, no i18n, no timers.
 */
import type { ShiftChatSnapshot, ShiftMessage } from "@/lib/api/shift-chat";
import {
  applyOwnAck,
  applyOwnMessage,
  applyOwnReaction,
  cursorFor,
  latestCursor,
  mergeMessages,
  mergeSnapshot,
} from "../message-accumulator";

function msg(id: string, createdAt: string, over: Partial<ShiftMessage> = {}): ShiftMessage {
  return {
    id,
    senderId: "u1",
    senderName: "Dana",
    senderRole: "technician",
    body: id,
    type: "regular",
    broadcastKey: null,
    systemEventType: null,
    isUrgent: false,
    pinnedAt: null,
    createdAt,
    acks: [],
    reactions: [],
    ...over,
  };
}

function snapshot(over: Partial<ShiftChatSnapshot> = {}): ShiftChatSnapshot {
  return {
    messages: [],
    pinnedMessage: null,
    typing: [],
    onlineUserIds: [],
    shiftSessionId: "win-A",
    ...over,
  };
}

describe("mergeMessages", () => {
  it("appends new rows and keeps chronological order", () => {
    const prev = [msg("a", "2026-08-07T06:00:00.000Z")];
    const incoming = [msg("b", "2026-08-07T06:01:00.000Z")];
    expect(mergeMessages(prev, incoming).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("dedupes by id, letting the incoming (fresher) row win", () => {
    const prev = [msg("a", "2026-08-07T06:00:00.000Z", { body: "old" })];
    const incoming = [msg("a", "2026-08-07T06:00:00.000Z", { body: "new" })];
    const merged = mergeMessages(prev, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.body).toBe("new");
  });

  it("sorts out-of-order timestamps, tiebreaking on id", () => {
    const merged = mergeMessages(
      [msg("b", "2026-08-07T06:00:00.000Z"), msg("a", "2026-08-07T06:00:00.000Z")],
      [msg("c", "2026-08-07T05:00:00.000Z")],
    );
    expect(merged.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });
});

describe("latestCursor", () => {
  it("returns the newest createdAt", () => {
    expect(
      latestCursor([msg("a", "2026-08-07T06:00:00.000Z"), msg("b", "2026-08-07T06:05:00.000Z")]),
    ).toBe("2026-08-07T06:05:00.000Z");
  });

  it("is undefined for an empty list (→ full-window refetch next poll)", () => {
    expect(latestCursor([])).toBeUndefined();
  });
});

describe("mergeSnapshot", () => {
  it("takes the incoming snapshot wholesale on the first fold", () => {
    const incoming = snapshot({ messages: [msg("a", "2026-08-07T06:00:00.000Z")] });
    expect(mergeSnapshot(undefined, incoming)).toEqual(incoming);
  });

  it("accumulates messages and REPLACES presence/pin within the same window", () => {
    const prev = snapshot({
      messages: [msg("a", "2026-08-07T06:00:00.000Z")],
      onlineUserIds: ["u1"],
      typing: ["Dana"],
    });
    const pinned = msg("p", "2026-08-07T06:02:00.000Z", { pinnedAt: "2026-08-07T06:03:00.000Z" });
    const incoming = snapshot({
      messages: [msg("b", "2026-08-07T06:01:00.000Z")],
      onlineUserIds: ["u1", "u2"],
      typing: [],
      pinnedMessage: pinned,
    });

    const merged = mergeSnapshot(prev, incoming);
    expect(merged.messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged.onlineUserIds).toEqual(["u1", "u2"]);
    expect(merged.typing).toEqual([]);
    expect(merged.pinnedMessage?.id).toBe("p");
  });

  it("refreshes presence/pin even when the incremental batch is empty", () => {
    const prev = snapshot({
      messages: [msg("a", "2026-08-07T06:00:00.000Z")],
      onlineUserIds: ["u1"],
    });
    const incoming = snapshot({ messages: [], onlineUserIds: ["u1", "u2", "u3"] });

    const merged = mergeSnapshot(prev, incoming);
    expect(merged.messages.map((m) => m.id)).toEqual(["a"]); // unchanged
    expect(merged.onlineUserIds).toEqual(["u1", "u2", "u3"]); // fresh
  });

  it("REPLACES wholesale when the window id rolls over", () => {
    const prev = snapshot({ shiftSessionId: "win-A", messages: [msg("a", "2026-08-07T06:00:00.000Z")] });
    const incoming = snapshot({ shiftSessionId: "win-B", messages: [msg("z", "2026-08-07T14:00:00.000Z")] });
    expect(mergeSnapshot(prev, incoming).messages.map((m) => m.id)).toEqual(["z"]);
  });
});

describe("cursorFor", () => {
  it("is the latest message cursor for an active window", () => {
    const snap = snapshot({ messages: [msg("a", "2026-08-07T06:00:00.000Z")] });
    expect(cursorFor(snap)).toBe("2026-08-07T06:00:00.000Z");
  });

  it("is undefined for a null-window snapshot (off-window → full refetch)", () => {
    expect(cursorFor(snapshot({ shiftSessionId: null, messages: [] }))).toBeUndefined();
    expect(cursorFor(undefined)).toBeUndefined();
  });
});

describe("optimistic own-action patches", () => {
  it("applyOwnMessage inserts the caller's message dedupe-safe", () => {
    const snap = snapshot({ messages: [msg("a", "2026-08-07T06:00:00.000Z")] });
    const sent = msg("b", "2026-08-07T06:01:00.000Z");
    const next = applyOwnMessage(snap, sent);
    expect(next.messages.map((m) => m.id)).toEqual(["a", "b"]);
    // re-applying the same message does not duplicate it
    expect(applyOwnMessage(next, sent).messages).toHaveLength(2);
  });

  it("applyOwnAck sets the caller's ack once (idempotent per user)", () => {
    const snap = snapshot({
      messages: [msg("bc", "2026-08-07T06:00:00.000Z", { type: "broadcast" })],
    });
    const once = applyOwnAck(snap, "bc", "u9", "acknowledged");
    const twice = applyOwnAck(once, "bc", "u9", "acknowledged");
    expect(twice.messages[0]!.acks).toEqual([{ userId: "u9", status: "acknowledged" }]);
  });

  it("applyOwnReaction toggles the caller's reaction per the action", () => {
    const snap = snapshot({ messages: [msg("a", "2026-08-07T06:00:00.000Z")] });
    const added = applyOwnReaction(snap, "a", "u9", "👍", "added");
    expect(added.messages[0]!.reactions).toEqual([{ userId: "u9", emoji: "👍" }]);

    const removed = applyOwnReaction(added, "a", "u9", "👍", "removed");
    expect(removed.messages[0]!.reactions).toEqual([]);
  });

  it("patches the pinnedMessage copy too, not just the list row", () => {
    const pinned = msg("a", "2026-08-07T06:00:00.000Z");
    const snap = snapshot({ messages: [pinned], pinnedMessage: pinned });
    const next = applyOwnReaction(snap, "a", "u9", "✅", "added");
    expect(next.pinnedMessage?.reactions).toEqual([{ userId: "u9", emoji: "✅" }]);
  });
});
