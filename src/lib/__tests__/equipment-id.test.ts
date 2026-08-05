/**
 * Locks the canonical-URL guard on `extractEquipmentId`. The NFC hook passes the
 * returned value into the custody-confirmation flow, so a URL record is trusted
 * ONLY when it is exactly `https://vettrack.uk/equipment/<id>`. Foreign origins
 * and noncanonical paths must be rejected; the bare-id pilot fallback stays.
 */
import { extractEquipmentId, UNIVERSAL_LINK_ORIGIN } from "../equipment-id";

describe("extractEquipmentId", () => {
  it("extracts the id from the canonical production URL (with query string)", () => {
    expect(extractEquipmentId(`${UNIVERSAL_LINK_ORIGIN}/equipment/eq1?nfcAction=toggle`)).toBe("eq1");
  });

  it("extracts a UUID id from the canonical URL", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(extractEquipmentId(`${UNIVERSAL_LINK_ORIGIN}/equipment/${uuid}`)).toBe(uuid);
  });

  it("rejects a foreign origin", () => {
    expect(extractEquipmentId("https://untrusted.example/equipment/eq1")).toBeNull();
  });

  it("rejects a non-canonical scheme on the right host", () => {
    expect(extractEquipmentId("http://vettrack.uk/equipment/eq1")).toBeNull();
  });

  it("rejects a noncanonical path prefix", () => {
    expect(extractEquipmentId(`${UNIVERSAL_LINK_ORIGIN}/anything/equipment/eq1`)).toBeNull();
  });

  it("rejects a canonical prefix with an extra trailing segment", () => {
    expect(extractEquipmentId(`${UNIVERSAL_LINK_ORIGIN}/equipment/eq1/extra`)).toBeNull();
  });

  it("rejects a trailing slash after the id", () => {
    expect(extractEquipmentId(`${UNIVERSAL_LINK_ORIGIN}/equipment/eq1/`)).toBeNull();
  });

  it("accepts a bare pilot id (non-URL fallback)", () => {
    expect(extractEquipmentId("eq1")).toBe("eq1");
  });

  it("returns null for empty or whitespace-containing input", () => {
    expect(extractEquipmentId("   ")).toBeNull();
    expect(extractEquipmentId("has space")).toBeNull();
  });
});
