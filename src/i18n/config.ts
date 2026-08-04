import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { FALLBACK_LOCALE, resolveInitialLocale } from "./locale-resolver";
import en from "./locales/en.json";
import he from "./locales/he.json";

// Single default namespace keeps key access flat: t("common.save").
export const DEFAULT_NS = "translation" as const;

if (!i18n.isInitialized) {
  // Resources are inlined, so init resolves synchronously — no async backend,
  // no Suspense boundary required.
  void i18n.use(initReactI18next).init({
    resources: {
      he: { translation: he },
      en: { translation: en },
    },
    lng: resolveInitialLocale(),
    fallbackLng: FALLBACK_LOCALE,
    defaultNS: DEFAULT_NS,
    ns: [DEFAULT_NS],
    interpolation: { escapeValue: false }, // RN has no HTML injection surface
    returnNull: false,
    react: { useSuspense: false },
  });
}

export { i18n };
export default i18n;
