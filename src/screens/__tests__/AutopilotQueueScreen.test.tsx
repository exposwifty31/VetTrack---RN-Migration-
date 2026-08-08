/**
 * Global decision lock (Slice 11, CodeRabbit #33): approve/edit/reject are
 * screen-wide singleton mutations, so a pending decision is queue-global. While
 * ANY decision is in flight EVERY proposal card must disable — not only the one
 * being acted on — or a sibling card could race a second decision against the
 * first. These tests drive `useProposalDecisions` into a pending state and
 * assert every rendered card (including the ones NOT being decided) is busy.
 */
import { render, screen } from "@testing-library/react-native";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { AutopilotQueueScreen } from "../AutopilotQueueScreen";
import { useProposalDecisions } from "@/components/autopilot/useProposalDecisions";
import type { ActionProposal } from "@/types/action-proposals";

// The only reanimated importer in this screen's graph is PressableScale (via
// ErrorNote). Stub it so reanimated's native worklets init never loads under jest.
jest.mock("@/components/PressableScale", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("@/components/home/AuroraBackground", () => ({ AuroraBackground: () => null }));
jest.mock("@/components/autopilot/ProposalReasonSheet", () => ({ ProposalReasonSheet: () => null }));
jest.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => undefined }));
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "dark" }) }));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// FlashList → render every item through renderItem so the cards actually mount.
// Factory types stay inline (no out-of-scope refs — babel-jest-hoist forbids them).
jest.mock("@shopify/flash-list", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    FlashList: ({
      data,
      renderItem,
    }: {
      data: readonly { id: string }[];
      renderItem: (info: {
        item: { id: string };
        index: number;
      }) => ReturnType<typeof React.createElement>;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        data.map((item, index) =>
          React.createElement(React.Fragment, { key: item.id }, renderItem({ item, index })),
        ),
      ),
  };
});

// Card stub: expose the `busy` prop through a testID + accessibilityState so a
// test can read each card's disabled state without rendering the real controls.
jest.mock("@/components/autopilot/ProposalCard", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ProposalCard: ({ proposal, busy }: { proposal: { id: string }; busy: boolean }) =>
      React.createElement(
        Text,
        { testID: `card-${proposal.id}`, accessibilityState: { disabled: busy } },
        busy ? "busy" : "idle",
      ),
  };
});

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: jest.fn(),
}));

jest.mock("@/components/autopilot/useProposalDecisions", () => ({
  useProposalDecisions: jest.fn(),
}));

function makeProposal(id: string): ActionProposal {
  return {
    id,
    clinicId: "c1",
    kind: "restock_po_on_burn",
    status: "staged",
    sourceSessionId: "s1",
    summary: `proposal ${id}`,
    citedFacts: [],
    draftContent: {},
    sourceRef: {},
    editedContent: null,
    rejectionReason: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

type PendingFlags = Readonly<{ approve?: boolean; edit?: boolean; reject?: boolean }>;

function mockDecisions({ approve = false, edit = false, reject = false }: PendingFlags) {
  const decisions = {
    approve: { isPending: approve, mutate: jest.fn() },
    edit: { isPending: edit, mutate: jest.fn() },
    reject: { isPending: reject, mutate: jest.fn() },
  };
  jest.mocked(useProposalDecisions).mockReturnValue(
    decisions as unknown as ReturnType<typeof useProposalDecisions>,
  );
}

function mockStagedQuery(proposals: ActionProposal[]) {
  jest.mocked(useQuery).mockReturnValue({
    data: proposals,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as UseQueryResult<ActionProposal[], Error>);
}

const PROPOSALS = [makeProposal("p1"), makeProposal("p2"), makeProposal("p3")];

describe("AutopilotQueueScreen decision lock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStagedQuery(PROPOSALS);
  });

  it("disables every card — not just the one being decided — while a decision is pending", async () => {
    mockDecisions({ approve: true });

    await render(<AutopilotQueueScreen />);

    for (const id of ["p1", "p2", "p3"]) {
      expect(screen.getByTestId(`card-${id}`).props.accessibilityState.disabled).toBe(true);
    }
  });

  it("locks the whole queue when a reject is pending (sibling-race guard)", async () => {
    mockDecisions({ reject: true });

    await render(<AutopilotQueueScreen />);

    // p2/p3 are NOT the proposal being rejected, yet they must still be disabled.
    expect(screen.getByTestId("card-p2").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("card-p3").props.accessibilityState.disabled).toBe(true);
  });

  it("leaves every card actionable when no decision is pending", async () => {
    mockDecisions({});

    await render(<AutopilotQueueScreen />);

    for (const id of ["p1", "p2", "p3"]) {
      expect(screen.getByTestId(`card-${id}`).props.accessibilityState.disabled).toBe(false);
    }
  });
});
