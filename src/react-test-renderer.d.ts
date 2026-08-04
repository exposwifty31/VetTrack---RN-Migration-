// react-test-renderer ships no bundled types and @types/react-test-renderer is not
// installed for this React 19 / RN 0.86 line. Minimal ambient declaration so test
// files can import it typed-any without adding a devDependency.
declare module "react-test-renderer";
