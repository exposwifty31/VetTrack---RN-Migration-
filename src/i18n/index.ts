export { default as i18n, DEFAULT_NS } from "./config";
export {
  FALLBACK_LOCALE,
  INITIAL_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  persistLocale,
  resolveInitialLocale,
  type Locale,
} from "./locale-resolver";
export { applyRtlDirection, isRtlLocale, isRtlReloadPending } from "./rtl";
