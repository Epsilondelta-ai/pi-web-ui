import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAiAssistedByTrailer, buildAiAttributionGuidance } from "./src/ai-attribution.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");

function collectFiles(path, extensions) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return collectFiles(child, extensions);
    return entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)) ? [child] : [];
  });
}

assert.equal(
  buildAiAssistedByTrailer({ provider: "openai", id: "gpt-5.5" }),
  "AI-Assisted-By: openai/gpt-5.5",
);
assert.equal(
  buildAiAssistedByTrailer({ provider: "OpenAI Codex", id: "GPT 5.5" }),
  "AI-Assisted-By: openai-codex/gpt-5.5",
);
assert.equal(
  buildAiAssistedByTrailer({ provider: "z.ai", id: "GLM 4.6" }),
  "AI-Assisted-By: z.ai/glm-4.6",
);
assert.equal(
  buildAiAssistedByTrailer({ provider: "anthropic", id: "claude-opus-4.7" }),
  "AI-Assisted-By: anthropic/claude-opus-4.7",
);
assert.equal(buildAiAssistedByTrailer({ provider: "openai" }), undefined);
assert.equal(buildAiAssistedByTrailer({ id: "gpt-5.5" }), undefined);
assert.match(buildAiAttributionGuidance({ provider: "openai", id: "gpt-5.5" }), /AI-Assisted-By: openai\/gpt-5\.5/);
assert.match(buildAiAttributionGuidance(undefined), /omit AI attribution/);
assert.doesNotMatch(buildAiAttributionGuidance({ provider: "anthropic", id: "claude-opus-4-7" }), /noreply@/);

const runtimeFacingFiles = [
  ...collectFiles(join(repoRoot, ".pi/generated/source"), [".md"]),
  ...collectFiles(join(repoRoot, ".pi/agents"), [".md"]),
  ...collectFiles(join(repoRoot, ".pi/extensions/moai-claude-compat"), [".ts", ".mjs"]),
].filter((path) => existsSync(path));

const runtimeFacingText = runtimeFacingFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const extensionIndex = readFileSync(join(repoRoot, ".pi/extensions/moai-claude-compat/index.ts"), "utf8");
assert.match(extensionIndex, /buildPromptHints\(text, "", ctx\?\.model\)/);
assert.doesNotMatch(runtimeFacingText, new RegExp("Co-Authored-By:\\s*" + "Claude", "i"));
assert.doesNotMatch(runtimeFacingText, new RegExp("Co-authored-by:\\s*" + "Claude", "i"));
assert.doesNotMatch(runtimeFacingText, new RegExp("noreply@" + "anthropic\\.com", "i"));
assert.doesNotMatch(runtimeFacingText, new RegExp("Claude " + "Opus 4\\.6", "i"));
assert.doesNotMatch(runtimeFacingText, /AI-Assisted-By: <provider>\/<model>/);
assert.match(runtimeFacingText, /AI-Assisted-By: provider\/model/);
assert.match(runtimeFacingText, /Never invent provider email addresses\./);

console.log("ai-attribution tests passed");
