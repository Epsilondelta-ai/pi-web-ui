import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  getCodexQuotaFooterText,
  hasActiveCodexQuotaContext,
  registerCodexQuota,
} from "./codex-quota";
import {
  getGlmQuotaFooterText,
  hasActiveGlmQuotaContext,
  registerGlmQuota,
} from "./glm-quota";
import {
  getKimiQuotaFooterText,
  hasActiveKimiQuotaContext,
  registerKimiQuota,
} from "./kimi-quota";

export function registerQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  registerCodexQuota(pi, onUpdate);
  registerGlmQuota(pi, onUpdate);
  registerKimiQuota(pi, onUpdate);
}

export function getQuotaFooterText(width: number): string | undefined {
  if (hasActiveCodexQuotaContext()) return getCodexQuotaFooterText(width);
  if (hasActiveGlmQuotaContext()) return getGlmQuotaFooterText(width);
  if (hasActiveKimiQuotaContext()) return getKimiQuotaFooterText(width);
  return undefined;
}
