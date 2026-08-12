// Dynamic config that extends the static app.json base ONLY to materialize the
// Android google-services file from an EAS "file"-type env var at build time.
//
// Why this exists (CodeRabbit PR #57): google-services.json is gitignored, so on
// an EAS cloud build the fixed `./google-services.json` path is absent. EAS instead
// exposes the uploaded file's real path via the GOOGLE_SERVICES_JSON env var. This
// override points `android.googleServicesFile` at that path when present, and falls
// back to the local `./google-services.json` for local `expo run:android` (where the
// owner-supplied file sits in the repo root, gitignored). Expo does NOT auto-merge
// app.json when app.config.js exists — it is imported and spread explicitly.
const appJson = require("./app.json");

module.exports = () => {
  const base = appJson.expo;
  return {
    ...base,
    android: {
      ...base.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? base.android.googleServicesFile,
    },
  };
};
