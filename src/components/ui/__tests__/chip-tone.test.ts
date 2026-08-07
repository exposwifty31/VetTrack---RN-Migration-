import { chipToneClasses, type ChipTone } from "../chip-tone";

const ALL_TONES: ChipTone[] = ["success", "warning", "danger", "info", "stale", "neutral"];

describe("chipToneClasses", () => {
  it("maps every tone to non-empty container + text classes", () => {
    for (const tone of ALL_TONES) {
      const classes = chipToneClasses(tone);
      expect(classes.container.length).toBeGreaterThan(0);
      expect(classes.text.length).toBeGreaterThan(0);
    }
  });

  it("colors each status tone's text with its own semantic token", () => {
    expect(chipToneClasses("success").text).toBe("text-success");
    expect(chipToneClasses("warning").text).toBe("text-warning");
    expect(chipToneClasses("info").text).toBe("text-info");
    expect(chipToneClasses("stale").text).toBe("text-stale");
    expect(chipToneClasses("neutral").text).toBe("text-muted");
  });

  it("gives danger the solid badge fill with white content (never tinted/glassed)", () => {
    const danger = chipToneClasses("danger");
    expect(danger.container).toContain("bg-danger-solid");
    expect(danger.text).toBe("text-white");
    expect(danger.container).not.toContain("glass");
  });

  it("keeps non-danger tones on the opaque raised surface", () => {
    for (const tone of ALL_TONES.filter((t) => t !== "danger")) {
      expect(chipToneClasses(tone).container).toContain("bg-surface-raised");
    }
  });
});
