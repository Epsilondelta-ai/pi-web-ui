import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const settings = JSON.parse(readFileSync("settings.json", "utf8"));
const npmPackage = JSON.parse(readFileSync("npm/package.json", "utf8"));
const npmLock = JSON.parse(readFileSync("npm/package-lock.json", "utf8"));

function packageSpecSource(spec) {
  return typeof spec === "string" ? spec : spec?.source ?? "";
}

function normalizePackageName(spec) {
  let value = packageSpecSource(spec).replace(/^npm:/, "").replace(/^git:/, "");
  value = value.split("#")[0].split("?")[0];
  if (value.startsWith("@")) {
    const parts = value.split("@");
    return parts.length > 2 ? `@${parts[1]}` : value;
  }
  return value.split("@")[0];
}

function isDisabledPackage(spec) {
  return typeof spec === "object" && spec !== null
    && Array.isArray(spec.extensions) && spec.extensions.length === 0
    && Array.isArray(spec.skills) && spec.skills.length === 0
    && Array.isArray(spec.prompts) && spec.prompts.length === 0
    && Array.isArray(spec.themes) && spec.themes.length === 0;
}

const runtimeOnly = new Set(["moai-claude-compat", "pi-notify-glass.ts"]);
const activePackageSpecs = (settings.packages ?? []).filter((spec) => !isDisabledPackage(spec));
const configuredNames = new Set(activePackageSpecs.map(normalizePackageName));
const contextMode = (settings.packages ?? []).find((spec) => normalizePackageName(spec) === "context-mode");
assert.deepEqual(contextMode?.extensions, [], "context-mode extension must stay disabled to avoid hook overlap");
assert.deepEqual(contextMode?.skills, ["./skills"], "context-mode skills must remain available");
const defaultNames = (settings.moaiCompat?.defaultPackages ?? [])
  .map(normalizePackageName)
  .filter((name) => !runtimeOnly.has(name));

assert.ok(defaultNames.length > 0, "moaiCompat.defaultPackages must list package defaults");
for (const name of defaultNames) {
  assert.ok(configuredNames.has(name), `default package ${name} must be active in settings.packages`);
}

const dependencyNames = new Set(Object.keys(npmPackage.dependencies ?? {}));
for (const spec of activePackageSpecs) {
  const source = packageSpecSource(spec);
  const name = normalizePackageName(spec);
  if (source.startsWith("./") || source.startsWith("/")) continue;
  assert.ok(dependencyNames.has(name), `active package ${name} must be pinned in .pi/npm/package.json`);
}

const lockRootDeps = npmLock.packages?.[""]?.dependencies ?? {};
for (const name of dependencyNames) {
  assert.ok(lockRootDeps[name], `dependency ${name} must be present in .pi/npm/package-lock.json root dependencies`);
}

console.log("package defaults regression ok");
