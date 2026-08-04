import "i18next";

import type en from "./locales/en.json";

// react-i18next derives its TypeOptions from i18next's CustomTypeOptions, so the
// augmentation must target the "i18next" module — augmenting "react-i18next"
// leaves i18n.t / useTranslation untyped. Keep these fields in sync with the
// runtime init in ./config.ts (defaultNS, returnNull).
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    returnNull: false;
    resources: {
      translation: typeof en;
    };
  }
}
