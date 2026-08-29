import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const files = {};
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const relative = file.replaceAll(path.sep, "/");
      const bytes = fs.readFileSync(file);
      files[relative] = {
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
    }
  }
};
walk("src");
const payload = {
  schema: "pre-phase5d-mechanical-source-authority-v1",
  sourceFiles: Object.keys(files).length,
  files,
  mechanicalClosure: "captures/pre5d-escapement-repair/final/closure-report.json",
  executablePackageAuthority: "captures/gate0-baseline-restoration/executable-runtime-reference.json",
};
fs.mkdirSync("captures/phase5d-ab", { recursive: true });
fs.writeFileSync("captures/phase5d-ab/pre-edit-source-manifest.json", `${JSON.stringify(payload, null, 2)}\n`);
