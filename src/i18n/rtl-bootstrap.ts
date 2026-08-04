import { resolveInitialLocale } from "./locale-resolver";
import { applyRtlDirection } from "./rtl";

// Run at module load — imported ahead of ./App in index.ts so I18nManager.forceRTL
// is set before the first render. Shares the memoized initial-locale value with the
// i18next config, so direction and active language can never disagree at boot.
applyRtlDirection(resolveInitialLocale());
