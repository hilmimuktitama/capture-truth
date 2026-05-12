import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const roots = ["bin", "src", "scripts", "test"];
const files = roots.flatMap((root) => listJs(root));
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || result.error?.message || `Syntax check failed for ${file}`);
    process.stderr.write("\n");
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  process.stdout.write(`Syntax check passed for ${files.length} files.\n`);
}

function listJs(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listJs(path);
    }
    return path.endsWith(".js") ? [path] : [];
  });
}
