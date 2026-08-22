/**
 * A failed alerts load must never render as "no open alerts".
 *
 * `deriveAlertsView` over an absent equipment list yields zero rows, which is
 * byte-identical to a genuinely quiet clinic. So during an API outage the bell
 * dropdown would have reported all-clear while equipment was actually overdue —
 * the exact failure `AlertsScreen`'s fetcher throws on a non-200 to avoid
 * ("never a misleading All clear over an outage"). The ordering of the two
 * branches is the whole fix, so it is what this pins.
 *
 * Expected labels are resolved through `i18n`, never written as literals: this
 * repo forbids Hebrew in `.ts`/`.tsx`, and a literal would silently drift from
 * `he.json` — the assertion would then pass against copy the app no longer
 * shows. (The vettrack guard `i18n-no-hebrew-in-source` has no counterpart
 * here, so nothing in CI would have caught the literals.)
 */
import { render, screen } from "@testing-library/react-native";

import { i18n } from "@/i18n";
import type { AlertViewRow } from "@/lib/alerts-derive";

import { AlertsDropdownList } from "../AlertsDropdownList";

const NO_ROWS: readonly AlertViewRow[] = [];


describe("AlertsDropdownList failure handling", () => {
  it("shows the load failure, NOT the empty state, when the query errored with zero rows", async () => {
    await render(
      <AlertsDropdownList
        rows={NO_ROWS}
        isLoading={false}
        isError
        onRetry={jest.fn()}
        onRowPress={jest.fn()}
      />,
    );

    // The all-clear copy must be absent — it would be a lie here.
    expect(screen.queryByText(i18n.t("aurora.alertsDropdownEmpty"))).toBeNull();
    expect(screen.getByText(i18n.t("aurora.alertsDropdownError"))).toBeTruthy();
  });

  it("offers a retry on failure, so the dropdown is not a dead end", async () => {
    const onRetry = jest.fn();
    await render(
      <AlertsDropdownList
        rows={NO_ROWS}
        isLoading={false}
        isError
        onRetry={onRetry}
        onRowPress={jest.fn()}
      />,
    );

    expect(screen.getByText(i18n.t("aurora.alertsDropdownRetry"))).toBeTruthy();
  });

  it("still shows the empty state when the query SUCCEEDED with zero rows", async () => {
    await render(
      <AlertsDropdownList
        rows={NO_ROWS}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        onRowPress={jest.fn()}
      />,
    );

    expect(screen.getByText(i18n.t("aurora.alertsDropdownEmpty"))).toBeTruthy();
  });
});
