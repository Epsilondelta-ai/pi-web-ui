import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { buildAiAssistedByTrailer } from "./ai-attribution.ts";

export const MOAI_COMMIT_SIGNATURE = "https://adk.mo.ai.kr";

export interface CommitAttributionResult {
  attempted: boolean;
  amended: boolean;
  reason?: string;
}

export interface CommitAttributionSnapshot {
  gitCwd: string;
  head?: string;
}

export function shouldObserveCommitAttribution(toolName: unknown, input: unknown): boolean {
  if (toolName !== "bash") return false;
  const command = getBashCommand(input);
  if (!command) return false;
  if (!/(^|[;&|]\s*|&&\s*)git(?:\s+-C\s+\S+)?\s+commit\b|(^|[;&|]\s*|&&\s*)cd\s+(?:['"][^'"]+['"]|\S+)\s*&&\s*git\s+commit\b/i.test(command)) return false;
  if (/\bgit(?:\s+-C\s+\S+)?\s+commit\b[^\n;|&]*\s--amend\b/i.test(command)) return false;
  return true;
}

export function shouldApplyCommitAttribution(toolName: unknown, input: unknown, isError: unknown): boolean {
  return !isError && shouldObserveCommitAttribution(toolName, input);
}

export function appendCommitAttribution(message: string, model: unknown): string {
  const normalized = message.replace(/\s+$/g, "");
  const blocks: string[] = [normalized];

  if (!hasLine(normalized, MOAI_COMMIT_SIGNATURE)) {
    blocks.push(MOAI_COMMIT_SIGNATURE);
  }

  const trailer = buildAiAssistedByTrailer(model);
  if (trailer && !/^AI-Assisted-By:\s*\S+/im.test(normalized)) {
    blocks.push(trailer);
  }

  return `${blocks.filter(Boolean).join("\n\n")}\n`;
}

export function resolveGitCommandCwd(input: unknown, cwd: string): string {
  const command = getBashCommand(input);
  const gitCMatch = command.match(/\bgit\s+-C\s+(?:(['"])(.*?)\1|(\S+))\s+commit\b/i);
  if (gitCMatch) return resolve(cwd, gitCMatch[2] || gitCMatch[3] || ".");

  const cdMatch = command.match(/(?:^|[;&|]\s*|&&\s*)cd\s+(?:(['"])(.*?)\1|(\S+))\s*&&\s*git\s+commit\b/i);
  if (cdMatch) return resolve(cwd, cdMatch[2] || cdMatch[3] || ".");

  return cwd;
}

export function captureCommitAttributionSnapshot(input: unknown, cwd: string): CommitAttributionSnapshot | undefined {
  const gitCwd = resolveGitCommandCwd(input, cwd);
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: gitCwd, stdio: "ignore" });
  } catch {
    return undefined;
  }

  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: gitCwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { gitCwd, head };
  } catch {
    return { gitCwd };
  }
}

export function applyCommitAttribution(input: unknown, cwd: string, model: unknown, snapshot?: CommitAttributionSnapshot): CommitAttributionResult {
  if (!snapshot) return { attempted: true, amended: false, reason: "missing pre-commit snapshot" };
  const gitCwd = resolveGitCommandCwd(input, cwd);
  if (gitCwd !== snapshot.gitCwd) return { attempted: true, amended: false, reason: "git cwd changed" };

  let currentHead: string;
  try {
    currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: gitCwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return { attempted: true, amended: false, reason: "no commit created" };
  }
  if (currentHead === snapshot.head) return { attempted: true, amended: false, reason: "no new commit detected" };

  let currentMessage: string;
  try {
    currentMessage = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: gitCwd, encoding: "utf8" });
  } catch (error) {
    return { attempted: true, amended: false, reason: error instanceof Error ? error.message : "unable to read HEAD" };
  }

  const nextMessage = appendCommitAttribution(currentMessage, model);
  if (nextMessage === currentMessage) return { attempted: true, amended: false, reason: "already attributed" };

  try {
    execFileSync("git", ["commit", "--amend", "--only", "--no-verify", "-F", "-"], {
      cwd: gitCwd,
      input: nextMessage,
      stdio: ["pipe", "ignore", "pipe"],
      encoding: "utf8",
    });
    return { attempted: true, amended: true };
  } catch (error) {
    return { attempted: true, amended: false, reason: error instanceof Error ? error.message : "unable to amend HEAD" };
  }
}

function getBashCommand(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const command = (input as Record<string, unknown>).command;
  return typeof command === "string" ? command : "";
}

function hasLine(text: string, line: string): boolean {
  return text.split(/\r?\n/).some((candidate) => candidate.trim() === line);
}
