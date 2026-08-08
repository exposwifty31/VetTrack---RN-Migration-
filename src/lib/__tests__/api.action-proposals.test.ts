/**
 * Shape tests for the action-proposals API module (Slice 11). `authFetch` is
 * mocked with crafted Responses to lock: the `?status=staged` queue filter, the
 * approve empty-body + JSON content-type contract, the edit/reject body shapes,
 * path encoding (CWE-29), and coded-error normalization against the verified
 * routes (`server/routes/action-proposals.ts`). No idempotency header: those
 * routes carry no idempotency middleware.
 */
import {
  actionProposalsApi,
  ApiCodedError,
  PROPOSAL_AUDIT_ACTION_TYPES,
  proposalKeys,
} from "../api/action-proposals";

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

const PROPOSAL = {
  id: "p1",
  clinicId: "c1",
  kind: "crash_cart_drift",
  status: "staged",
  sourceSessionId: "2026-08-08",
  summary: "Crash cart drift detected",
  citedFacts: [{ sourceId: "x", sourceTable: "vt_crash_cart_checks", kind: "stale_check", at: "t" }],
  draftContent: { driftType: "stale_check" },
  sourceRef: {},
  editedContent: null,
  rejectionReason: null,
  decidedByUserId: null,
  decidedAt: null,
  createdAt: "2026-08-08T06:00:00.000Z",
  updatedAt: "2026-08-08T06:00:00.000Z",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("proposalKeys", () => {
  it("nests staged under the canonical root", () => {
    expect(proposalKeys.all).toEqual(["action-proposals"]);
    expect(proposalKeys.staged()).toEqual(["action-proposals", "staged"]);
  });
});

describe("realtime invalidation vocabulary", () => {
  it("locks the four action_proposal audit actionTypes (server/lib/audit.ts)", () => {
    expect([...PROPOSAL_AUDIT_ACTION_TYPES].sort()).toEqual([
      "action_proposal_approved",
      "action_proposal_edited",
      "action_proposal_rejected",
      "action_proposal_staged",
    ]);
  });
});

describe("actionProposalsApi.listStaged", () => {
  it("requests the staged filter and unwraps {proposals}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { proposals: [PROPOSAL] }));

    const proposals = await actionProposalsApi.listStaged();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/action-proposals?status=staged", undefined);
    expect(proposals).toEqual([PROPOSAL]);
  });

  it("throws a coded ApiCodedError on a non-OK response", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403, { code: "INSUFFICIENT_ROLE" }));

    await expect(actionProposalsApi.listStaged()).rejects.toMatchObject({
      status: 403,
      code: "INSUFFICIENT_ROLE",
      name: "ApiCodedError",
    });
  });
});

describe("actionProposalsApi.approve", () => {
  it("POSTs an empty JSON body to the approve path and unwraps {proposal}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { proposal: { ...PROPOSAL, status: "approved" } }));

    const proposal = await actionProposalsApi.approve("p1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/action-proposals/p1/approve");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({});
    expect(proposal.status).toBe("approved");
  });

  it("encodes the id into the path (CWE-29 idiom)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { proposal: PROPOSAL }));

    await actionProposalsApi.approve("a/b?c");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/action-proposals/a%2Fb%3Fc/approve");
  });

  it("surfaces the 409 already-decided conflict as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409, { code: "errors.conflict" }));

    await expect(actionProposalsApi.approve("p1")).rejects.toMatchObject({
      status: 409,
      code: "errors.conflict",
    });
  });
});

describe("actionProposalsApi.edit", () => {
  it("POSTs {editedContent} and unwraps {proposal}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { proposal: { ...PROPOSAL, status: "edited" } }));

    const editedContent = { driftType: "stale_check", note: "restocked manually" };
    const proposal = await actionProposalsApi.edit("p1", editedContent);

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/action-proposals/p1/edit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ editedContent });
    expect(proposal.status).toBe("edited");
  });

  it("surfaces the 400 edit-shape rejection as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(400, { code: "errors.validation" }));

    await expect(actionProposalsApi.edit("p1", { note: "x" })).rejects.toMatchObject({
      status: 400,
      code: "errors.validation",
    });
  });
});

describe("actionProposalsApi.reject", () => {
  it("POSTs {rejectionReason} and unwraps {proposal}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { proposal: { ...PROPOSAL, status: "rejected" } }));

    const proposal = await actionProposalsApi.reject("p1", "not needed");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/action-proposals/p1/reject");
    expect(JSON.parse(init.body as string)).toEqual({ rejectionReason: "not needed" });
    expect(proposal.status).toBe("rejected");
  });

  it("survives a JSON null error body (coded error, never a TypeError)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, null));

    await expect(actionProposalsApi.reject("p1", "x")).rejects.toBeInstanceOf(ApiCodedError);
  });
});
