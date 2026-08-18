/**
 * The ONE declaration of `env-contract.js`'s surface.
 *
 * The module is CommonJS with no types of its own, so each consuming test suite
 * used to write its own `require(...) as { ... }` cast. Two hand-written shapes
 * for one module is the duplication this package's own header warns about for
 * the registries: change a signature and neither cast updates, both suites keep
 * compiling, and both assert against a stale shape while reporting green.
 *
 * Declared once here and imported by both. A signature change now breaks
 * compilation at the point of the lie.
 */
/** name -> the files that read it. */
export type EnvReads = {
  reads: Map<string, string[]>;
  parseFailures: string[];
};

export type ExpectedEnvEntry = {
  environments: string[];
  knownGapEnvironments?: string[];
  why: string;
  gap?: string;
};

export const EAS_ENVIRONMENTS: string[];
export const EXPECTED_IN_EAS_ENVIRONMENT: Record<string, ExpectedEnvEntry>;
export const INTENTIONALLY_UNSET: Record<string, string>;

export function requiredNamesFor(environment: string): string[];
export function knownGapsFor(environment: string): { name: string; gap: string }[];

/** EXPO_PUBLIC_-only projections, for the suite whose scan cannot see the rest. */
export function expoPublicEasEnvironmentRegistry(): Record<string, string>;
export function expoPublicIntentionallyUnset(): Record<string, string>;

export function deriveShippedPublicEnvReads(): EnvReads;
export function deriveConfigEnvReads(): EnvReads;
