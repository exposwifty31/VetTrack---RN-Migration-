/**
 * npm cannot install a git monorepo subdirectory (`#ref:path` is ignored).
 * Pin vettrack @ SHA into .vendor/ and consume via file: deps (Slice 7).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vendorRoot = path.join(root, ".vendor");
const repoDir = path.join(vendorRoot, "vettrack");

/** Pin — bump when intentionally refreshing contracts/shared from vettrack main. */
const VETTRACK_SHA = "8d379facce797f77a814a556c4f4fd7dc374f055";
const VETTRACK_REMOTE = "https://github.com/exposwifty31/vettrack.git";
const SPARSE_PATHS = ["packages/contracts", "shared"];

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

const pinFile = path.join(repoDir, ".vettrack-pin");
const alreadyPinned =
  existsSync(pinFile) &&
  existsSync(path.join(repoDir, "packages/contracts/package.json")) &&
  existsSync(path.join(repoDir, "shared/package.json"));

if (alreadyPinned) {
  const current = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();
  if (current === VETTRACK_SHA) {
    process.exit(0);
  }
}

rmSync(repoDir, { recursive: true, force: true });
mkdirSync(vendorRoot, { recursive: true });

run("git", ["clone", "--filter=blob:none", "--sparse", VETTRACK_REMOTE, repoDir], root);
run("git", ["sparse-checkout", "set", ...SPARSE_PATHS], repoDir);
run("git", ["fetch", "--depth", "1", "origin", VETTRACK_SHA], repoDir);
run("git", ["checkout", "--force", VETTRACK_SHA], repoDir);
writeFileSync(pinFile, `${VETTRACK_SHA}\n`, "utf8");

console.log(`[vendor-vettrack] pinned ${VETTRACK_SHA} → ${repoDir}`);
