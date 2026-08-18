/**
 * `NfcProvisionCard` — the operator-facing half of sticker provisioning.
 *
 * The single most important assertion in this file is that the FIRST press of
 * the lock control does not lock anything. An NTAG215 lock is irreversible on
 * real hardware: there is no undo, no admin override, and no second chance —
 * the sticker becomes scrap and the equipment needs a new one. A one-press lock
 * button is one mis-tap away from that, so the arm → confirm transition is
 * tested as behaviour, not left to the fact that a dialog happens to be on
 * screen.
 *
 * The provisioning module and the API are mocked here; their own suites cover
 * the native ordering and the wire shape. What this file covers is the state
 * machine an operator drives and the error → copy mapping.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ApiCodedError } from "@/lib/api/coded-error";
import { NfcProvisionError } from "@/lib/nfc-provision";
import type { EquipmentDetail } from "@/types/api";

import { NfcProvisionCard } from "../NfcProvisionCard";

jest.mock("@/components/PressableScale", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "dark" }) }));
// Identity-ish `t`: renders the KEY plus its interpolation values, so an
// assertion can prove a value actually reached i18next's options rather than
// being dropped on the floor by a key-only stub.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${Object.values(opts).join(" ")}` : key,
  }),
}));
jest.mock("@/lib/haptics", () => ({
  haptics: { scanSuccess: jest.fn(), error: jest.fn(), tap: jest.fn() },
}));

const mockWrite = jest.fn();
const mockLock = jest.fn();
jest.mock("@/lib/nfc-provision", () => {
  const actual = jest.requireActual<typeof import("@/lib/nfc-provision")>("@/lib/nfc-provision");
  return {
    ...actual,
    writeEquipmentStickerTag: (...args: unknown[]) => mockWrite(...args),
    lockEquipmentStickerTag: (...args: unknown[]) => mockLock(...args),
  };
});

const mockBindNfcTag = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { equipment: { bindNfcTag: (...args: unknown[]) => mockBindNfcTag(...args) } },
  };
});

const mockUseIdentity = jest.fn();
jest.mock("@/app/useIdentity", () => ({ useIdentity: () => mockUseIdentity() }));

const mockUseNfcSupported = jest.fn();
jest.mock("@/hooks/useNfcSupported", () => ({ useNfcSupported: () => mockUseNfcSupported() }));

const DETAIL = { id: "eq1", name: "Ultrasound", status: "ok" } as EquipmentDetail;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** React 19 concurrent: render and every press flush through async act. */
async function renderCard(detail: EquipmentDetail = DETAIL) {
  return render(<NfcProvisionCard detail={detail} />, { wrapper });
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

beforeEach(() => {
  mockWrite.mockReset().mockResolvedValue({ tagId: "04a2b3" });
  mockLock.mockReset().mockResolvedValue({ alreadyLocked: false });
  mockBindNfcTag.mockReset().mockResolvedValue({ id: "eq1" });
  mockUseIdentity.mockReturnValue({ data: { id: "u1", role: "admin", effectiveRole: "admin" } });
  mockUseNfcSupported.mockReturnValue(true);
});

describe("visibility gate", () => {
  it("renders for an admin on NFC-capable hardware", async () => {
    await renderCard();
    expect(screen.getByTestId("nfc-provision-card")).toBeTruthy();
  });

  it("renders nothing for a non-admin — provisioning is an admin affordance", async () => {
    mockUseIdentity.mockReturnValue({ data: { id: "u1", role: "technician", effectiveRole: "technician" } });
    await renderCard();
    expect(screen.queryByTestId("nfc-provision-card")).toBeNull();
  });

  it("renders nothing while support is still unknown", async () => {
    mockUseNfcSupported.mockReturnValue(null);
    await renderCard();
    expect(screen.queryByTestId("nfc-provision-card")).toBeNull();
  });

  it("renders nothing on hardware with no NFC", async () => {
    mockUseNfcSupported.mockReturnValue(false);
    await renderCard();
    expect(screen.queryByTestId("nfc-provision-card")).toBeNull();
  });
});

describe("write → bind", () => {
  it("programs the sticker and binds the returned UID to this equipment", async () => {
    await renderCard();

    await press("nfc-write-button");

    await waitFor(() => expect(mockBindNfcTag).toHaveBeenCalledWith("eq1", "04a2b3"));
    expect(mockWrite.mock.calls[0]![0]).toBe("eq1");
    expect(await screen.findByTestId("nfc-provision-success")).toBeTruthy();
  });

  it("reports success and SKIPS the bind when the tag exposes no UID", async () => {
    mockWrite.mockResolvedValue({ tagId: null });
    await renderCard();

    await press("nfc-write-button");

    expect(await screen.findByTestId("nfc-provision-success")).toBeTruthy();
    expect(mockBindNfcTag).not.toHaveBeenCalled();
  });

  it("shows the write failure and never attempts a bind", async () => {
    mockWrite.mockRejectedValue(new NfcProvisionError("write_failed"));
    await renderCard();

    await press("nfc-write-button");

    expect(await screen.findByTestId("nfc-provision-error")).toHaveTextContent(
      "equipmentDetail.nfc.errors.write_failed",
    );
    expect(mockBindNfcTag).not.toHaveBeenCalled();
  });

  it("distinguishes a BIND conflict from a write failure — the tag is fine, re-writing it fixes nothing", async () => {
    mockBindNfcTag.mockRejectedValue(
      new ApiCodedError(409, "CONFLICT", "NFC_TAG_ALREADY_BOUND"),
    );
    await renderCard();

    await press("nfc-write-button");

    expect(await screen.findByTestId("nfc-provision-error")).toHaveTextContent(
      "equipmentDetail.nfc.errors.bindConflict",
    );
  });

  it("maps a non-conflict bind failure to its own copy", async () => {
    mockBindNfcTag.mockRejectedValue(new ApiCodedError(500, "INTERNAL_ERROR"));
    await renderCard();

    await press("nfc-write-button");

    expect(await screen.findByTestId("nfc-provision-error")).toHaveTextContent(
      "equipmentDetail.nfc.errors.bindFailed",
    );
  });
});

describe("lock is a TWO-STEP confirm", () => {
  it("the first press does NOT lock — it only arms the confirm", async () => {
    await renderCard();

    await press("nfc-lock-arm");

    expect(mockLock).not.toHaveBeenCalled();
    expect(screen.getByTestId("nfc-lock-confirm")).toBeTruthy();
  });

  it("shows the irreversibility warning only once armed", async () => {
    await renderCard();
    expect(screen.queryByTestId("nfc-lock-warning")).toBeNull();

    await press("nfc-lock-arm");

    expect(screen.getByTestId("nfc-lock-warning")).toBeTruthy();
  });

  it("the SECOND press — the explicit confirm — is what locks", async () => {
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    await waitFor(() => expect(mockLock).toHaveBeenCalledTimes(1));
  });

  it("cancelling disarms without locking, and the confirm can be re-armed", async () => {
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-cancel");

    expect(mockLock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("nfc-lock-confirm")).toBeNull();
    expect(screen.getByTestId("nfc-lock-arm")).toBeTruthy();
  });

  it("disarms after a successful lock so the confirm is never left hot", async () => {
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    await waitFor(() => expect(screen.queryByTestId("nfc-lock-confirm")).toBeNull());
  });
});

describe("lock outcomes", () => {
  it("treats an already-locked sticker as success with its own copy", async () => {
    mockLock.mockResolvedValue({ alreadyLocked: true });
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    expect(await screen.findByTestId("nfc-provision-success")).toHaveTextContent(
      "equipmentDetail.nfc.lockAlreadyLocked",
    );
  });

  it("reports a plain lock as locked, not as already-locked", async () => {
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    expect(await screen.findByTestId("nfc-provision-success")).toHaveTextContent(
      "equipmentDetail.nfc.lockSuccess",
    );
  });

  it.each([
    ["lock_failed", "equipmentDetail.nfc.errors.lock_failed"],
    ["not_lockable", "equipmentDetail.nfc.errors.not_lockable"],
    ["timeout", "equipmentDetail.nfc.errors.timeout"],
    ["session_failed", "equipmentDetail.nfc.errors.session_failed"],
    ["busy", "equipmentDetail.nfc.errors.busy"],
  ])("maps the %s code to its own copy", async (code, key) => {
    mockLock.mockRejectedValue(new NfcProvisionError(code as never));
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    expect(await screen.findByTestId("nfc-provision-error")).toHaveTextContent(key);
  });

  it("falls back to generic copy for an error that is not a provisioning error", async () => {
    mockLock.mockRejectedValue(new Error("boom"));
    await renderCard();

    await press("nfc-lock-arm");
    await press("nfc-lock-confirm");

    expect(await screen.findByTestId("nfc-provision-error")).toHaveTextContent(
      "equipmentDetail.nfc.errors.lock_failed",
    );
  });
});

describe("bound-tag state", () => {
  it("shows the currently bound UID when the row already carries one", async () => {
    await renderCard({ ...DETAIL, nfcTagId: "04a2b3" } as EquipmentDetail);
    expect(screen.getByTestId("nfc-bound-state")).toHaveTextContent(
      "equipmentDetail.nfc.bound 04a2b3",
    );
  });

  it("says no sticker is bound when the row has none", async () => {
    await renderCard();
    expect(screen.getByTestId("nfc-bound-state")).toHaveTextContent(
      "equipmentDetail.nfc.notBound",
    );
  });
});
