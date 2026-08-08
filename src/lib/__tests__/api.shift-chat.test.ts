/**
 * Shape tests for the shift-chat API module (Slice 8). `authFetch` is mocked with
 * crafted Responses to lock: after-cursor param building + URL-encoding, response
 * unwrapping, the send/ack/reaction/typing/pin bodies + paths, and the
 * 403 `INSUFFICIENT_ROLE` → off-window mapping (envelope
 * `{code:"ACCESS_DENIED", reason:"INSUFFICIENT_ROLE"}`).
 */
import { ApiCodedError } from "../api/coded-error";
import {
  isOffWindowError,
  shiftChatApi,
  shiftChatKeys,
  type ShiftChatSnapshot,
} from "../api/shift-chat";

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

const SNAPSHOT: ShiftChatSnapshot = {
  messages: [
    {
      id: "m1",
      senderId: "u1",
      senderName: "Dana",
      senderRole: "technician",
      body: "hi",
      type: "regular",
      broadcastKey: null,
      systemEventType: null,
      isUrgent: false,
      pinnedAt: null,
      createdAt: "2026-08-07T06:00:00.000Z",
      acks: [],
      reactions: [],
    },
  ],
  pinnedMessage: null,
  typing: [],
  onlineUserIds: ["u1"],
  shiftSessionId: "win:c1:2026-08-07:06:00",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("shiftChatKeys", () => {
  it("nests the messages key under the canonical root", () => {
    expect(shiftChatKeys.all).toEqual(["shiftChat"]);
    expect(shiftChatKeys.messages()).toEqual(["shiftChat", "messages"]);
  });
});

describe("shiftChatApi.getMessages", () => {
  it("omits ?after= on the full-window fetch and unwraps the snapshot", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, SNAPSHOT));

    const snap = await shiftChatApi.getMessages();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shift-chat/messages", undefined);
    expect(snap).toEqual(SNAPSHOT);
  });

  it("appends and URL-encodes the after cursor", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, SNAPSHOT));

    await shiftChatApi.getMessages("2026-08-07T06:00:00.000Z");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/shift-chat/messages?after=2026-08-07T06%3A00%3A00.000Z");
  });

  it("maps the off-window 403 to a coded error isOffWindowError recognizes", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, {
        code: "ACCESS_DENIED",
        error: "ACCESS_DENIED",
        reason: "INSUFFICIENT_ROLE",
        message: "Insufficient permissions",
      }),
    );

    expect.assertions(3);
    try {
      await shiftChatApi.getMessages();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiCodedError);
      expect((err as ApiCodedError).status).toBe(403);
      expect(isOffWindowError(err)).toBe(true);
    }
  });
});

describe("shiftChatApi.sendMessage", () => {
  it("POSTs {body,type:'regular'} and unwraps {message}", async () => {
    const message = { ...SNAPSHOT.messages[0], id: "m2", body: "hello" };
    mockAuthFetch.mockResolvedValue(makeResponse(201, { message }));

    const result = await shiftChatApi.sendMessage("hello");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-chat/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "hello", type: "regular" });
    expect(result).toEqual(message);
  });
});

describe("shiftChatApi.ackMessage", () => {
  it("POSTs {status} to the ack path and encodes the id", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ok: true }));

    const res = await shiftChatApi.ackMessage("a/b?c");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-chat/messages/a%2Fb%3Fc/ack");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ status: "acknowledged" });
    expect(res).toEqual({ ok: true });
  });
});

describe("shiftChatApi.react", () => {
  it("POSTs {messageId,emoji} and returns the toggle action", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { action: "added" }));

    const res = await shiftChatApi.react("m1", "👍");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-chat/reactions");
    expect(JSON.parse(init.body as string)).toEqual({ messageId: "m1", emoji: "👍" });
    expect(res.action).toBe("added");
  });
});

describe("shiftChatApi.sendTyping", () => {
  it("POSTs to /typing with no body", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ok: true }));

    await shiftChatApi.sendTyping();

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-chat/typing");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("shiftChatApi.pin", () => {
  it("POSTs to the pin path, encodes the id, and returns {ok,pinnedAt}", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, { ok: true, pinnedAt: "2026-08-07T06:05:00.000Z" }),
    );

    const res = await shiftChatApi.pin("m 1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-chat/messages/m%201/pin");
    expect(init.method).toBe("POST");
    expect(res.pinnedAt).toBe("2026-08-07T06:05:00.000Z");
  });
});

describe("isOffWindowError", () => {
  it("maps ONLY a 403 whose code or reason is INSUFFICIENT_ROLE", () => {
    expect(isOffWindowError(new ApiCodedError(403, "ACCESS_DENIED", "INSUFFICIENT_ROLE"))).toBe(true);
    expect(isOffWindowError(new ApiCodedError(403, "INSUFFICIENT_ROLE"))).toBe(true);
    // A different 403 reason is a different state, not off-window.
    expect(isOffWindowError(new ApiCodedError(403, "ACCESS_DENIED", "BROADCAST_FORBIDDEN"))).toBe(
      false,
    );
    expect(isOffWindowError(new ApiCodedError(401, "UNAUTHORIZED"))).toBe(false);
    expect(isOffWindowError(new Error("INSUFFICIENT_ROLE"))).toBe(false);
    expect(isOffWindowError(null)).toBe(false);
  });
});
