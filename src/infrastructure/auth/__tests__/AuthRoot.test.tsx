/**
 * W-AUTH / PR #75 review: session-persistence wiring proven through RUNTIME
 * BEHAVIOR, not source text (a commented-out import could satisfy a regex; a
 * rendered provider cannot fake the props it received). ClerkProvider and the
 * token-cache module are mocked; the assertions are on what the provider is
 * actually GIVEN — the exact token-cache module object and the key.
 */
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { AuthRoot } from "../AuthRoot";

const mockProviderRenders: { publishableKey: unknown; tokenCache: unknown }[] = [];

jest.mock("@clerk/expo", () => {
  const React = require("react");
  return {
    ClerkProvider: ({
      children,
      publishableKey,
      tokenCache,
    }: {
      children?: unknown;
      publishableKey?: unknown;
      tokenCache?: unknown;
    }) => {
      mockProviderRenders.push({ publishableKey, tokenCache });
      return React.createElement(React.Fragment, null, children);
    },
  };
});

// The factory owns the sentinel (babel hoists the AuthRoot import above any
// test-file const, so a factory that closed over one would capture undefined).
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: { __sentinel: "token-cache-module" } }));
const tokenCacheSentinel = (jest.requireMock("@clerk/expo/token-cache") as { tokenCache: object })
  .tokenCache;

beforeEach(() => {
  mockProviderRenders.length = 0;
});

describe("AuthRoot provider wiring (behavioral)", () => {
  it("mounts ClerkProvider with the key AND the token-cache module — the session-persistence contract", async () => {
    await render(
      <AuthRoot publishableKey="pk_test_wiring">
        <Text>child-content</Text>
      </AuthRoot>,
    );

    expect(screen.getByText("child-content")).toBeTruthy();
    expect(mockProviderRenders).toHaveLength(1);
    expect(mockProviderRenders[0].publishableKey).toBe("pk_test_wiring");
    // Identity, not shape: the provider must receive THE @clerk/expo/token-cache
    // export, not a lookalike — losing it is invisible until "signed out after
    // every restart" shows up on device.
    expect(mockProviderRenders[0].tokenCache).toBe(tokenCacheSentinel);
  });

  it("renders children WITHOUT ClerkProvider when no key is configured (dev-bypass branch)", async () => {
    await render(
      <AuthRoot publishableKey="">
        <Text>keyless-child</Text>
      </AuthRoot>,
    );

    expect(screen.getByText("keyless-child")).toBeTruthy();
    expect(mockProviderRenders).toHaveLength(0);
  });
});
