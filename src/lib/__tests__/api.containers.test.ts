/**
 * Shape + error-mapping tests for the containers/dispense/restock API module
 * (Slice 10). `authFetch` is mocked with crafted Responses to lock:
 *   - the REQUIRED `Idempotency-Key` header on dispense (caller-supplied, stable)
 *   - the dual orphan-block surface (400 legacy code + 422 clinical-invariant
 *     reason) — both must map to `isOrphanDispenseBlocked`
 *   - the `?nfcTagId=` 404 → `null` (feeds the scan-fallback resolver)
 *   - the verified container audit actionTypes (SSE invalidation vocabulary)
 */
import {
  CONTAINER_AUDIT_ACTION_TYPES,
  containerKeys,
  containersApi,
  dispenseErrorMessageKey,
  isInsufficientStock,
  isOffShiftError,
  isOrphanDispenseBlocked,
  isSessionAlreadyActive,
  restockApi,
} from "../api/containers";
import { ApiCodedError } from "../api/coded-error";

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

/** Await a promise expected to reject and return the thrown error. */
async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject, but it resolved");
}

const CONTAINER = {
  id: "11111111-1111-1111-1111-111111111111",
  clinicId: "clinic-1",
  name: "Crash Cart A",
  department: "ICU",
  targetQuantity: 100,
  currentQuantity: 42,
  roomId: null,
  nfcTagId: "TAG-123",
  supplyTargets: [{ code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 }],
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("containerKeys", () => {
  it("nests everything under the canonical root", () => {
    expect(containerKeys.all).toEqual(["containers"]);
    expect(containerKeys.list()).toEqual(["containers", "list"]);
    expect(containerKeys.items("c1")).toEqual(["containers", "items", "c1"]);
  });
});

describe("CONTAINER_AUDIT_ACTION_TYPES", () => {
  it("locks the verified members of the closed AuditActionType union", () => {
    // Verified against vettrack server/lib/audit.ts — every entry is a real
    // union member; none are restock (the restock session emits no audit rows).
    expect([...CONTAINER_AUDIT_ACTION_TYPES].sort()).toEqual([
      "container_created",
      "containers_defaults_seeded",
      "dispense_confirmed",
      "dispense_emergency_created",
      "emergency_dispense_reconciled",
      "inventory_dispensed",
    ]);
  });
});

describe("containersApi.list", () => {
  it("returns the bare container array from GET /api/containers", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, [CONTAINER]));

    const rows = await containersApi.list();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/containers", undefined);
    expect(rows).toEqual([CONTAINER]);
  });

  it("maps a 403 INSUFFICIENT_ROLE to the off-shift signal", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403, { code: "INSUFFICIENT_ROLE" }));

    expect(isOffShiftError(await captureError(containersApi.list()))).toBe(true);
  });
});

describe("containersApi.getByNfcTag", () => {
  it("encodes the tag and returns the container-with-items", async () => {
    const withItems = { ...CONTAINER, items: [{ id: "ci1", itemId: "i1", quantity: 5, label: "Syringe", code: "SYRINGE_5ML" }] };
    mockAuthFetch.mockResolvedValue(makeResponse(200, withItems));

    const result = await containersApi.getByNfcTag("TAG 123&x=1");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/containers?nfcTagId=TAG%20123%26x%3D1");
    expect(result).toEqual(withItems);
  });

  it("resolves to null on a 404 (no container for that tag)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(404, { code: "NOT_FOUND", reason: "CONTAINER_NOT_FOUND" }),
    );

    await expect(containersApi.getByNfcTag("TAG-404")).resolves.toBeNull();
  });

  it("rethrows a non-404 failure (a genuine error is not a miss)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, { code: "INTERNAL_ERROR" }));

    await expect(containersApi.getByNfcTag("TAG-500")).rejects.toBeInstanceOf(ApiCodedError);
  });
});

describe("containersApi.dispense", () => {
  const OK_BODY = {
    success: true,
    dispensed: [{ itemId: "i1", label: "Syringe", quantity: 2, newStock: 3 }],
    takenBy: { userId: "u1", displayName: "Dr Smith" },
    takenAt: "2026-08-08T10:00:00.000Z",
    billingIds: [],
    autoBilledCents: 0,
  };

  it("POSTs the body with the caller-supplied Idempotency-Key + x-request-id headers", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, OK_BODY));

    const result = await containersApi.dispense(
      "cid-1",
      { items: [{ itemId: "i1", quantity: 2 }], isEmergency: false },
      "stable-key-abc",
    );

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/containers/cid-1/dispense");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("stable-key-abc");
    expect(headers["x-request-id"]).toBe("stable-key-abc");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      items: [{ itemId: "i1", quantity: 2 }],
      isEmergency: false,
    });
    expect(result).toEqual(OK_BODY);
  });

  it("encodes the container id into the path (CWE-29 idiom)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, OK_BODY));

    await containersApi.dispense("a/b?c", { items: [{ itemId: "i", quantity: 1 }], isEmergency: false }, "k");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/containers/a%2Fb%3Fc/dispense");
  });

  it("maps the 422 clinical-invariant deny (reason ORPHAN_DISPENSE_BLOCKED) to isOrphanDispenseBlocked", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(422, {
        code: "CLINICAL_INVARIANT_VIOLATION",
        reason: "ORPHAN_DISPENSE_BLOCKED",
        clinical: true,
        cop: { kind: "orphan_dispense", orphanLines: [] },
      }),
    );

    const error = await captureError(
      containersApi.dispense("cid", { items: [{ itemId: "i", quantity: 1 }], isEmergency: false }, "k"),
    );
    expect(isOrphanDispenseBlocked(error)).toBe(true);
    expect((error as ApiCodedError).status).toBe(422);
  });

  it("ALSO maps the legacy 400 orphan block (code ORPHAN_DISPENSE_BLOCKED)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(400, { code: "ORPHAN_DISPENSE_BLOCKED", reason: "ORPHAN_DISPENSE_BLOCKED" }),
    );

    const error = await captureError(
      containersApi.dispense("cid", { items: [{ itemId: "i", quantity: 1 }], isEmergency: false }, "k"),
    );
    expect(isOrphanDispenseBlocked(error)).toBe(true);
    expect((error as ApiCodedError).status).toBe(400);
  });

  it("maps a 409 INSUFFICIENT_STOCK", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409, { code: "INSUFFICIENT_STOCK" }));

    expect(
      isInsufficientStock(
        await captureError(
          containersApi.dispense("cid", { items: [{ itemId: "i", quantity: 99 }], isEmergency: false }, "k"),
        ),
      ),
    ).toBe(true);
  });
});

describe("containersApi.completeEmergency", () => {
  it("PATCHes the emergency-complete path with the items body", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { success: true, dispensed: [], takenBy: { userId: "u", displayName: "x" }, takenAt: "t", billingIds: [] }));

    await containersApi.completeEmergency("ev1", [{ itemId: "i1", quantity: 1 }]);

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/containers/emergency/ev1/complete");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ items: [{ itemId: "i1", quantity: 1 }] });
  });
});

describe("dispenseErrorMessageKey", () => {
  it("maps each dispense failure class to its loud translated key", () => {
    expect(dispenseErrorMessageKey(new ApiCodedError(422, "CLINICAL_INVARIANT_VIOLATION", "ORPHAN_DISPENSE_BLOCKED"))).toBe("dispense.blocked");
    expect(dispenseErrorMessageKey(new ApiCodedError(400, "ORPHAN_DISPENSE_BLOCKED"))).toBe("dispense.blocked");
    expect(dispenseErrorMessageKey(new ApiCodedError(409, "INSUFFICIENT_STOCK"))).toBe("dispense.insufficientStock");
    expect(dispenseErrorMessageKey(new ApiCodedError(409, "IDEMPOTENCY_CONFLICT"))).toBe("dispense.conflict");
    expect(dispenseErrorMessageKey(new ApiCodedError(500, "INTERNAL_ERROR"))).toBe("dispense.error");
    expect(dispenseErrorMessageKey(new Error("network"))).toBe("dispense.error");
  });
});

describe("restockApi (session program — the working restock/blind-audit path)", () => {
  it("containerItems POSTs the containerId to /api/restock/container-items", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { container: CONTAINER, lines: [], activeSession: null, sessionProgress: null }));

    await restockApi.containerItems("cid-1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/restock/container-items");
    expect(JSON.parse(init.body as string)).toEqual({ containerId: "cid-1" });
  });

  it("start POSTs the containerId and surfaces SESSION_ALREADY_ACTIVE", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409, { code: "SESSION_ALREADY_ACTIVE" }));

    expect(isSessionAlreadyActive(await captureError(restockApi.start("cid-1")))).toBe(true);
  });

  it("scan POSTs sessionId + itemId + observedQuantity (the blind physical count)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, {}));

    await restockApi.scan("sess-1", "item-1", 7);

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/restock/scan");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "sess-1", itemId: "item-1", observedQuantity: 7 });
  });

  it("finish and cancel POST the sessionId", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, {}));
    await restockApi.finish("sess-1");
    expect((mockAuthFetch.mock.calls[0] as [string])[0]).toBe("/api/restock/finish");

    mockAuthFetch.mockResolvedValue(makeResponse(200, {}));
    await restockApi.cancel("sess-1");
    expect((mockAuthFetch.mock.calls[1] as [string])[0]).toBe("/api/restock/cancel");
  });
});
