import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] || path.join(root, "release/watch-sbom.cdx.json"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const project = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const packageName = (installedPath, row) => {
  if (row.name) return row.name;
  const marker = "node_modules/";
  const index = installedPath.lastIndexOf(marker);
  return index >= 0 ? installedPath.slice(index + marker.length) : installedPath;
};
const purlName = (name) => name.startsWith("@")
  ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}`
  : encodeURIComponent(name);
const license = (value) => {
  if (!value) return undefined;
  if (/^[A-Za-z0-9-.+]+$/.test(value)) return [{ license: { id: value } }];
  return [{ license: { name: value } }];
};

const components = Object.entries(lock.packages ?? {})
  .filter(([installedPath, row]) => installedPath && row?.version)
  .map(([installedPath, row]) => {
    const name = packageName(installedPath, row);
    const component = {
      type: "library",
      name,
      version: row.version,
      "bom-ref": `pkg:npm/${purlName(name)}@${encodeURIComponent(row.version)}?path=${encodeURIComponent(installedPath)}`,
      purl: `pkg:npm/${purlName(name)}@${encodeURIComponent(row.version)}`,
      scope: row.dev ? "excluded" : "required",
      properties: [
        { name: "watch:installedPath", value: installedPath },
        { name: "watch:developmentDependency", value: String(Boolean(row.dev)) },
        { name: "watch:optionalDependency", value: String(Boolean(row.optional)) },
      ],
    };
    const licenses = license(row.license);
    if (licenses) component.licenses = licenses;
    if (row.resolved) component.externalReferences = [{ type: "distribution", url: row.resolved }];
    return component;
  })
  .sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: project.name,
      version: project.version,
      "bom-ref": `pkg:npm/${purlName(project.name)}@${encodeURIComponent(project.version)}`,
    },
    properties: [
      { name: "watch:packageLockSha256", value: sha256(path.join(root, "package-lock.json")) },
      { name: "watch:deterministic", value: "true" },
      { name: "watch:generatedWithoutNetwork", value: "true" },
    ],
  },
  components,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`${path.relative(root, output)} (${components.length} components)`);
