import { resolveContainerScan } from "../container-scan-resolve";
import type { ContainerWithItems } from "@/types/containers";

const CONTAINER = {
  id: "c1",
  clinicId: "clinic",
  name: "Crash Cart",
  department: "",
  targetQuantity: 0,
  currentQuantity: 0,
  roomId: null,
  nfcTagId: "TAG-1",
  supplyTargets: [],
  items: [],
} satisfies ContainerWithItems;

describe("resolveContainerScan", () => {
  it("returns the container when the lookup hits", async () => {
    const outcome = await resolveContainerScan("TAG-1", async () => CONTAINER);
    expect(outcome).toEqual({ kind: "container", container: CONTAINER });
  });

  it("falls through to an equipment search when the lookup 404s (returns null)", async () => {
    const outcome = await resolveContainerScan("TAG-404", async () => null);
    expect(outcome).toEqual({ kind: "equipment_search", query: "TAG-404" });
  });

  it("falls through to an equipment search when the lookup THROWS (flaky network never blocks)", async () => {
    const outcome = await resolveContainerScan("TAG-x", async () => {
      throw new Error("network down");
    });
    expect(outcome).toEqual({ kind: "equipment_search", query: "TAG-x" });
  });

  it("does not attempt a lookup for an empty payload", async () => {
    const lookup = jest.fn(async () => CONTAINER);
    const outcome = await resolveContainerScan("   ", lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "equipment_search", query: "   " });
  });

  it("does not attempt a lookup for a payload past the 200-char nfcTagId bound", async () => {
    const lookup = jest.fn(async () => CONTAINER);
    const long = "x".repeat(201);
    const outcome = await resolveContainerScan(long, lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "equipment_search", query: long });
  });

  it("trims the tag before lookup but preserves the raw payload for the search fallback", async () => {
    const lookup = jest.fn(async () => null);
    await resolveContainerScan("  TAG-9  ", lookup);
    expect(lookup).toHaveBeenCalledWith("TAG-9");
  });
});
