import {
  commitRestockCounts,
  RestockCommitError,
  restockCommitErrorKey,
  type RestockCommitApi,
} from "../restock-commit";
import type { ContainerInventoryLine } from "@/types/containers";

function line(itemId: string, held: number): ContainerInventoryLine {
  return {
    itemId,
    label: itemId,
    expected: held,
    actual: held,
    sessionObservedQuantity: null,
  } as unknown as ContainerInventoryLine;
}

describe("commitRestockCounts", () => {
  it("scans only touched, changed lines and then finishes", async () => {
    const scan = jest.fn(async () => undefined);
    const finish = jest.fn(async () => undefined);
    const api: RestockCommitApi = { scan, finish };
    const lines = [line("a", 5), line("b", 3), line("c", 1)];
    // a: changed (5→7), b: untouched (no count), c: unchanged edit (equals held).
    await commitRestockCounts(api, "s1", lines, { a: 7, c: 1 });

    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith("s1", "a", 7);
    expect(finish).toHaveBeenCalledWith("s1");
  });

  it("finishes even when no line was touched", async () => {
    const scan = jest.fn(async () => undefined);
    const finish = jest.fn(async () => undefined);
    await commitRestockCounts({ scan, finish }, "s1", [line("a", 5)], {});
    expect(scan).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith("s1");
  });

  it("throws a scan-phase error with committedCount 0 when the FIRST scan fails", async () => {
    const scan = jest.fn(async () => {
      throw new Error("network");
    });
    const finish = jest.fn(async () => undefined);
    const err = await commitRestockCounts({ scan, finish }, "s1", [line("a", 5)], { a: 9 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RestockCommitError);
    expect((err as RestockCommitError).phase).toBe("scan");
    expect((err as RestockCommitError).committedCount).toBe(0);
    expect(finish).not.toHaveBeenCalled();
  });

  it("reports a PARTIAL commit: first scan lands, second rejects mid-loop", async () => {
    let attempt = 0;
    const scan = jest.fn(async () => {
      attempt += 1;
      if (attempt === 2) throw new Error("network");
    });
    const finish = jest.fn(async () => undefined);
    const lines = [line("a", 5), line("b", 3)];
    const err = await commitRestockCounts({ scan, finish }, "s1", lines, { a: 7, b: 9 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RestockCommitError);
    expect((err as RestockCommitError).phase).toBe("scan");
    expect((err as RestockCommitError).committedCount).toBe(1);
    expect(finish).not.toHaveBeenCalled();
  });

  it("distinguishes a finish-phase failure after all scans landed", async () => {
    const scan = jest.fn(async () => undefined);
    const finish = jest.fn(async () => {
      throw new Error("finish failed");
    });
    const err = await commitRestockCounts({ scan, finish }, "s1", [line("a", 5)], { a: 7 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RestockCommitError);
    expect((err as RestockCommitError).phase).toBe("finish");
    expect((err as RestockCommitError).committedCount).toBe(1);
  });
});

describe("restockCommitErrorKey", () => {
  it("maps a first-scan failure (nothing saved) to the plain scan error", () => {
    expect(restockCommitErrorKey(new RestockCommitError("scan", 0))).toBe("restock.scanError");
  });

  it("maps a mid-loop scan failure with prior commits to the partial error", () => {
    expect(restockCommitErrorKey(new RestockCommitError("scan", 2))).toBe("restock.partialError");
  });

  it("maps a finish-phase failure to the partial error (counts saved, not finalized)", () => {
    expect(restockCommitErrorKey(new RestockCommitError("finish", 3))).toBe("restock.partialError");
  });

  it("maps an unknown error to the generic error", () => {
    expect(restockCommitErrorKey(new Error("boom"))).toBe("restock.error");
    expect(restockCommitErrorKey(null)).toBe("restock.error");
  });
});
