import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  clamp,
  formatQuotaSnapshot,
  safeReadText,
  sanitizeNumber,
  truncateInline,
  type QuotaSnapshot,
  type QuotaWindow,
} from "./quota-common";

const POLL_INTERVAL_MS = 60_000;
const MIN_EVENT_REFRESH_MS = 15_000;
const STALE_THRESHOLD_MS = 15 * 60_000;
const OPENAI_CODEX_PROVIDER = "openai-codex";
const DEFAULT_CHATGPT_BASE_URL = "https://chatgpt.com/backend-api/";

type CodexCredential = {
  type: "oauth";
  access?: string;
  accountId?: string;
};

type UsagePayloadWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
};

type UsagePayload = {
  rate_limit?: {
    primary_window?: UsagePayloadWindow | null;
    secondary_window?: UsagePayloadWindow | null;
  } | null;
};

let latestSnapshot: QuotaSnapshot | undefined;
let refreshInFlight: Promise<void> | undefined;
let refreshInFlightKey = "";
let refreshGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeCtx: ExtensionContext | undefined;
let lastRefreshStartedAt = 0;
let shutdownRequested = false;

export function registerCodexQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
    activeCtx = ctx;
    if (!isCodexModel(ctx)) {
      latestSnapshot = undefined;
      refreshGeneration++;
      onUpdate(ctx);
      return;
    }

    const now = Date.now();
    const requestKey = modelContextKey(ctx);
    if (!force && now - lastRefreshStartedAt < 2_000) return refreshInFlight;
    if (!force && refreshInFlight && refreshInFlightKey === requestKey)
      return refreshInFlight;

    const generation = ++refreshGeneration;
    lastRefreshStartedAt = now;
    refreshInFlightKey = requestKey;
    const currentRefresh = (async () => {
      let nextSnapshot: QuotaSnapshot | undefined;
      try {
        nextSnapshot = await fetchLiveSnapshot(ctx);
      } catch (error) {
        nextSnapshot = fallbackSnapshot(error, latestSnapshot);
      } finally {
        if (refreshInFlight === currentRefresh) refreshInFlight = undefined;
        if (isCurrentRefresh(ctx, generation, requestKey)) {
          latestSnapshot = nextSnapshot;
          onUpdate(ctx);
        }
      }
    })();
    refreshInFlight = currentRefresh;
    return currentRefresh;
  }

  const refreshInBackground = (ctx: ExtensionContext, force = false) => {
    void refresh(ctx, force);
  };

  pi.on("session_start", async (_event, ctx) => {
    shutdownRequested = false;
    activeCtx = ctx;
    stopPolling();
    pollTimer = setInterval(() => activeCtx && refreshInBackground(activeCtx), POLL_INTERVAL_MS);
    refreshInBackground(ctx, true);
  });

  pi.on("model_select", async (_event, ctx) => refreshInBackground(ctx, true));
  pi.on("turn_end", async (_event, ctx) => {
    if (Date.now() - lastRefreshStartedAt < MIN_EVENT_REFRESH_MS) return onUpdate(ctx);
    refreshInBackground(ctx);
  });

  pi.on("session_shutdown", async () => {
    shutdownRequested = true;
    refreshGeneration++;
    stopPolling();
    activeCtx = undefined;
  });
}

export function getCodexQuotaFooterText(_width: number): string | undefined {
  return latestSnapshot ? formatQuotaSnapshot(latestSnapshot) : undefined;
}

export function hasActiveCodexQuotaContext(): boolean {
  return Boolean(activeCtx && isCodexModel(activeCtx));
}

async function fetchLiveSnapshot(ctx: ExtensionContext): Promise<QuotaSnapshot> {
  const credential = ctx.modelRegistry.authStorage.get(OPENAI_CODEX_PROVIDER) as
    | CodexCredential
    | undefined;
  if (!credential?.access || !credential.accountId) {
    throw new Error("Missing OpenAI Codex OAuth credentials. Run /login.");
  }

  const usageUrl = new URL(
    "wham/usage",
    ensureTrailingSlash(process.env.PI_CODEX_CHATGPT_BASE_URL ?? DEFAULT_CHATGPT_BASE_URL),
  ).toString();
  const response = await fetch(usageUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credential.access}`,
      "chatgpt-account-id": credential.accountId,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(`Usage request failed (${response.status}): ${truncateInline(body, 200)}`);
  }

  const payload = (await response.json()) as UsagePayload;
  const snapshot: QuotaSnapshot = {
    source: "live",
    capturedAtMs: Date.now(),
    stale: false,
    primary: mapWindow(payload.rate_limit?.primary_window, "5H:"),
    secondary: mapWindow(payload.rate_limit?.secondary_window, "7D:"),
  };
  if (!snapshot.primary && !snapshot.secondary) {
    throw new Error("Usage response did not contain 5h/weekly windows");
  }
  return snapshot;
}

function mapWindow(
  window: UsagePayloadWindow | null | undefined,
  label: QuotaWindow["label"],
): QuotaWindow | undefined {
  if (!window) return undefined;

  const usedPercent = sanitizeNumber(window.used_percent);
  const windowMinutes = secondsToMinutes(window.limit_window_seconds);
  if (usedPercent === undefined && windowMinutes === undefined) return undefined;

  return {
    label: windowMinutes === 300 ? "5H:" : windowMinutes === 10_080 ? "7D:" : label,
    usedPercent: clamp(usedPercent ?? 0, 0, 100),
    resetsAtMs: secondsToMs(window.reset_at),
  };
}

function isCodexModel(ctx: ExtensionContext): boolean {
  return Boolean(
    ctx.hasUI &&
      ctx.model?.provider === OPENAI_CODEX_PROVIDER &&
      ctx.modelRegistry.isUsingOAuth(ctx.model),
  );
}

function isCurrentRefresh(
  ctx: ExtensionContext,
  generation: number,
  requestKey: string,
): boolean {
  return (
    !shutdownRequested &&
    generation === refreshGeneration &&
    activeCtx === ctx &&
    modelContextKey(ctx) === requestKey &&
    isCodexModel(ctx)
  );
}

function fallbackSnapshot(
  error: unknown,
  previousSnapshot: QuotaSnapshot | undefined,
): QuotaSnapshot {
  const message = error instanceof Error ? error.message : String(error);
  if (!previousSnapshot) {
    return { source: "cached", capturedAtMs: Date.now(), stale: true, error: message };
  }
  return {
    ...previousSnapshot,
    source: "cached",
    stale: Date.now() - previousSnapshot.capturedAtMs > STALE_THRESHOLD_MS,
    error: message,
  };
}

function modelContextKey(ctx: ExtensionContext): string {
  const model = ctx.model;
  const oauth = model ? ctx.modelRegistry.isUsingOAuth(model) : false;
  return `${model?.provider ?? "none"}:${model?.id ?? "none"}:${oauth ? "oauth" : "api-key"}`;
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
}

function secondsToMinutes(value: number | undefined): number | undefined {
  const seconds = sanitizeNumber(value);
  return seconds === undefined || seconds <= 0 ? undefined : Math.ceil(seconds / 60);
}

function secondsToMs(value: number | undefined): number | undefined {
  const seconds = sanitizeNumber(value);
  return seconds === undefined || seconds <= 0 ? undefined : seconds * 1000;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
