import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_MOAI_PROFILE_MAPPINGS, teamMoaiProfileMappingStatus } from "./src/team-runtime.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");

function collectMarkdownFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return collectMarkdownFiles(child);
    return entry.isFile() && entry.name.endsWith(".md") ? [child] : [];
  });
}

const runtimeFacingRoots = [
  join(repoRoot, ".pi/generated/source/skills"),
  join(repoRoot, ".pi/generated/source/rules"),
  join(repoRoot, ".pi/prompts"),
  join(repoRoot, ".claude/skills"),
  join(repoRoot, ".claude/rules"),
  join(repoRoot, ".claude/commands"),
];
const docs = runtimeFacingRoots.flatMap((root) => collectMarkdownFiles(root));
const docText = docs.map((path) => readFileSync(path, "utf8")).join("\n");
const planDoc = readFileSync(join(repoRoot, ".pi/generated/source/skills/moai/team/plan.md"), "utf8");
const runDoc = readFileSync(join(repoRoot, ".pi/generated/source/skills/moai/team/run.md"), "utf8");
const reviewDoc = readFileSync(join(repoRoot, ".pi/generated/source/skills/moai/team/review.md"), "utf8");
const claudePlanDoc = readFileSync(join(repoRoot, ".claude/skills/moai/team/plan.md"), "utf8");
const claudeRunDoc = readFileSync(join(repoRoot, ".claude/skills/moai/team/run.md"), "utf8");
const claudeReviewDoc = readFileSync(join(repoRoot, ".claude/skills/moai/team/review.md"), "utf8");
const removedPseudoAgents = ["team-reader", "team-validator", "team-coder", "team-tester", "team-designer"];

for (const pseudoAgent of removedPseudoAgents) {
  assert.doesNotMatch(docText, new RegExp(pseudoAgent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const doc of [planDoc, claudePlanDoc]) {
  assert.doesNotMatch(doc, /\.pi\/agents\/moai\/researcher\.md/);
  assert.doesNotMatch(doc, /scout \/ Explore-compatible/);
  assert.match(doc, /Adopt MoAI profile: codebase-researcher/);
  assert.match(doc, /\.pi\/agents\/moai\/codebase-researcher\.md/);
  assert.match(doc, /\.pi\/generated\/source\/agents\/moai\/codebase-researcher\.md/);
}

if (/name:\s*"quality"/.test(runDoc)) {
  assert.match(runDoc, /recipient:\s*"quality"/);
  assert.match(runDoc, /including backend-dev, frontend-dev, tester, and quality/);
}

const expected = {
  plan: {
    researcher: "codebase-researcher",
    analyst: "manager-spec",
    architect: "manager-strategy",
  },
  run: {
    "backend-dev": "expert-backend",
    "frontend-dev": "expert-frontend",
    tester: "expert-testing",
    quality: "manager-quality",
    reviewer: "manager-quality",
  },
  review: {
    "security-reviewer": "expert-security",
    "perf-reviewer": "expert-performance",
    "quality-reviewer": "manager-quality",
    "ux-reviewer": "expert-frontend",
  },
};
assert.deepEqual(TEAM_MOAI_PROFILE_MAPPINGS, expected);

const docsByPhase = { plan: planDoc, run: runDoc, review: reviewDoc };
const claudeDocsByPhase = { plan: claudePlanDoc, run: claudeRunDoc, review: claudeReviewDoc };
for (const [phase, roles] of Object.entries(expected)) {
  const phaseDocs = [docsByPhase[phase], claudeDocsByPhase[phase]];
  for (const phaseDoc of phaseDocs) {
    for (const [role, profile] of Object.entries(roles)) {
      assert.match(phaseDoc, new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(phaseDoc, new RegExp(`Adopt MoAI profile: ${profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  }
}

for (const roles of Object.values(expected)) {
  for (const [role, profile] of Object.entries(roles)) {
    assert.match(docText, new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(docText, new RegExp(profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(
      existsSync(join(repoRoot, ".pi/agents/moai", `${profile}.md`))
        || existsSync(join(repoRoot, ".pi/generated/source/agents/moai", `${profile}.md`)),
      `missing MoAI profile file for ${profile}`,
    );
  }
}

const workflowYaml = readFileSync(join(repoRoot, ".moai/config/sections/workflow.yaml"), "utf8");
assert.match(workflowYaml, /moai_profile_mappings:/);
assert.match(workflowYaml, /researcher:\s*codebase-researcher/);
assert.doesNotMatch(workflowYaml, /researcher:\s*scout/);
assert.doesNotMatch(workflowYaml, /scout\s+is\s+the\s+Explore-compatible/);
assert.match(workflowYaml, /backend-dev:\s*expert-backend/);
assert.match(workflowYaml, /security-reviewer:\s*expert-security/);

const status = teamMoaiProfileMappingStatus(repoRoot).join("\n");
assert.match(status, /runtime-facing docs avoid removed team pseudo-agents/);
assert.match(status, /team MoAI profile mappings/);
assert.match(status, /team MoAI profiles resolve/);
assert.doesNotMatch(status, /^missing:/m);

console.log("team-profile-mapping tests passed");
