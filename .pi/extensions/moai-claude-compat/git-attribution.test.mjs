import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCommitAttribution, applyCommitAttribution, captureCommitAttributionSnapshot, MOAI_COMMIT_SIGNATURE, resolveGitCommandCwd, shouldApplyCommitAttribution } from "./src/git-attribution.ts";

const model = { provider: "openai", id: "gpt-5.5" };

assert.equal(
  appendCommitAttribution("fix(pi): test\n", model),
  `fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n\nAI-Assisted-By: openai/gpt-5.5\n`,
);

assert.equal(
  appendCommitAttribution(`fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n`, model),
  `fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n\nAI-Assisted-By: openai/gpt-5.5\n`,
);

assert.equal(
  appendCommitAttribution("fix(pi): test\n", undefined),
  `fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n`,
);

assert.equal(
  appendCommitAttribution(`fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n\nAI-Assisted-By: openai/gpt-5.5\n`, model),
  `fix(pi): test\n\n${MOAI_COMMIT_SIGNATURE}\n\nAI-Assisted-By: openai/gpt-5.5\n`,
);

assert.equal(shouldApplyCommitAttribution("bash", { command: "git commit -m test" }, false), true);
assert.equal(shouldApplyCommitAttribution("bash", { command: "git -C ../repo commit -m test" }, false), true);
assert.equal(shouldApplyCommitAttribution("bash", { command: "git commit --amend -m test" }, false), false);
assert.equal(shouldApplyCommitAttribution("bash", { command: "git status" }, false), false);
assert.equal(shouldApplyCommitAttribution("bash", { command: "git commit -m test" }, true), false);
assert.equal(shouldApplyCommitAttribution("read", { command: "git commit -m test" }, false), false);

assert.equal(resolveGitCommandCwd({ command: "git commit -m test" }, "/tmp/work"), "/tmp/work");
assert.equal(resolveGitCommandCwd({ command: "git -C ../repo commit -m test" }, "/tmp/work"), "/tmp/repo");
assert.equal(resolveGitCommandCwd({ command: "cd ../repo && git commit -m test" }, "/tmp/work"), "/tmp/repo");

const repo = mkdtempSync(join(tmpdir(), "moai-git-attribution-"));
run(repo, "git init");
run(repo, "git config user.email test@example.com");
run(repo, "git config user.name Tester");
writeFileSync(join(repo, "a.txt"), "a");
run(repo, "git add a.txt");
const firstSnapshot = captureCommitAttributionSnapshot({ command: "git commit -m initial" }, repo);
run(repo, "git commit -m initial");
assert.equal(applyCommitAttribution({ command: "git commit -m initial" }, repo, model, firstSnapshot).amended, true);
let message = run(repo, "git log -1 --format=%B");
assert.match(message, new RegExp(MOAI_COMMIT_SIGNATURE));
assert.match(message, /AI-Assisted-By: openai\/gpt-5\.5/);

const beforeMaskedFailure = run(repo, "git rev-parse HEAD").trim();
const maskedSnapshot = captureCommitAttributionSnapshot({ command: "git commit -m nochange || true" }, repo);
run(repo, "git commit -m nochange || true");
const maskedResult = applyCommitAttribution({ command: "git commit -m nochange || true" }, repo, model, maskedSnapshot);
assert.equal(maskedResult.amended, false);
assert.equal(maskedResult.reason, "no new commit detected");
assert.equal(run(repo, "git rev-parse HEAD").trim(), beforeMaskedFailure);

writeFileSync(join(repo, "staged.txt"), "staged");
run(repo, "git add staged.txt");
const stagedSnapshot = { gitCwd: repo, head: beforeMaskedFailure };
assert.equal(applyCommitAttribution({ command: "git commit -m second" }, repo, model, stagedSnapshot).amended, false);
assert.match(run(repo, "git diff --cached --name-only"), /staged\.txt/);

function run(cwd, command) {
  return execFileSync("bash", ["-lc", command], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

console.log("git-attribution tests passed");
