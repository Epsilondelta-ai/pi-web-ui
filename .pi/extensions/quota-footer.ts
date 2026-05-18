import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { getQuotaFooterText, registerQuota } from "./src/quota";

export default function (pi: ExtensionAPI): void {
  registerQuota(pi, setModelQuotaFooter);
}

function setModelQuotaFooter(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubscribeFromBranchChange = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsubscribeFromBranchChange,
      invalidate() {},
      render(width: number): string[] {
        const parts = [
          getModelDisplayName(ctx),
          getQuotaFooterText(width),
          getGitBranchText(footerData),
        ].filter(Boolean);
        return [theme.fg("accent", truncateToWidth(parts.join(" | "), width))];
      },
    };
  });
}

function getGitBranchText(footerData: { getGitBranch(): string | undefined }): string | undefined {
  const branch = footerData.getGitBranch();
  return branch ? ` ${branch}` : undefined;
}

function getModelDisplayName(ctx: ExtensionContext): string {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  const raw = String(
    model?.displayName ?? model?.display_name ?? model?.name ?? model?.id ?? "Pi",
  );
  return normalizeModelName(raw);
}

function normalizeModelName(raw: string): string {
  const name = raw.split("/").pop()?.trim() || raw.trim() || "Pi";
  return name
    .replace(/^openai[-_ ]codex[-_ ]/i, "")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bglm\b/gi, "GLM")
    .replace(/\bkimi\b/gi, "Kimi")
    .replace(/\bclaude\b/gi, "Claude")
    .replace(/\bcodex\b/gi, "Codex");
}

function truncateToWidth(value: string, width: number): string {
  if (width <= 0) return "";
  const chars = Array.from(value);
  if (chars.length <= width) return value;
  return width === 1 ? "…" : `${chars.slice(0, width - 1).join("")}…`;
}
