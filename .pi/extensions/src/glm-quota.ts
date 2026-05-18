import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  clamp,
  extractBearerToken,
  formatQuotaSnapshot,
  hostMatchesDomain,
  parseResetTime,
  parseURL,
  safeReadText,
  sanitizeHeaderRecord,
  sanitizeNumber,
  sanitizeSecret,
  truncateInline,
  type QuotaSnapshot,
  type QuotaWindow,
} from "./quota-common";

const POLL_INTERVAL_MS = 60_000;
const MIN_EVENT_REFRESH_MS = 15_000;
const STALE_THRESHOLD_MS = 15 * 60_000;
const DEFAULT_ZAI_QUOTA_INTL_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const DEFAULT_ZAI_QUOTA_CN_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";

type ZaiQuotaLimit = {
  type?: string;
  percentage?: number | string;
  used_percent?: number | string;
  usedPercentage?: number | string;
  nextResetTime?: number | string;
  resetTime?: number | string;
  resetsAt?: number | string;
};

type ZaiQuotaPayload = {
  data?: { limits?: ZaiQuotaLimit[] | null } | null;
  limits?: ZaiQuotaLimit[] | null;
};

type GlmAuth = {
  token: string;
  headers: Record<string, string>;
};

let latestSnapshot: QuotaSnapshot | undefined;
let refreshInFlight: Promise<void> | undefined;
let refreshInFlightKey = "";
let refreshGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeCtx: ExtensionContext | undefined;
let lastRefreshStartedAt = 0;
let shutdownRequested = false;

export function registerGlmQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
    activeCtx = ctx;
    if (!isGlmModel(ctx)) {
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

export function getGlmQuotaFooterText(_width: number): string | undefined {
  return latestSnapshot ? formatQuotaSnapshot(latestSnapshot) : undefined;
}

export function hasActiveGlmQuotaContext(): boolean {
  return Boolean(activeCtx && isGlmModel(activeCtx));
}

async function fetchLiveSnapshot(ctx: ExtensionContext): Promise<QuotaSnapshot> {
  const auth = await resolveGlmAuth(ctx);
  if (!auth?.token) {
    throw new Error("Missing GLM/Z.AI API key. Set GLM_API_KEY or ZAI_API_KEY.");
  }

  let lastError: Error | undefined;
  for (const url of quotaURLsForContext(ctx)) {
    const response = await fetch(url, {
      method: "GET",
      headers: buildGlmRequestHeaders(auth),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      lastError = new Error(
        `GLM quota request failed (${response.status}): ${truncateInline(body, 200)}`,
      );
      continue;
    }

    return mapZaiQuotaPayload((await response.json()) as ZaiQuotaPayload);
  }

  throw lastError ?? new Error("GLM quota request failed");
}

async function resolveGlmAuth(ctx: ExtensionContext): Promise<GlmAuth | undefined> {
  const model = ctx.model;
  if (model && ctx.modelRegistry?.getApiKeyAndHeaders) {
    const result = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (result.ok) {
      const headers = sanitizeHeaderRecord(result.headers);
      const apiKey = sanitizeSecret(result.apiKey);
      const bearer = extractBearerToken(headers.Authorization ?? headers.authorization);
      const token = apiKey ?? bearer;
      if (token) return { token, headers };
    }
  }

  const token = sanitizeSecret(process.env.GLM_API_KEY) ?? sanitizeSecret(process.env.ZAI_API_KEY);
  return token ? { token, headers: {} } : undefined;
}

function mapZaiQuotaPayload(payload: ZaiQuotaPayload): QuotaSnapshot {
  const limits = payload.data?.limits?.length ? payload.data.limits : (payload.limits ?? []);
  const tokenLimit = limits.find((limit) => String(limit.type ?? "").toUpperCase() === "TOKENS_LIMIT");
  const primarySource = tokenLimit ?? limits[0];
  const secondarySource = limits.find((limit) => limit !== primarySource && resolveUsedPercent(limit) !== undefined);
  const snapshot: QuotaSnapshot = {
    source: "live",
    capturedAtMs: Date.now(),
    stale: false,
    primary: buildUsageWindow(primarySource, "5H:"),
    secondary: buildUsageWindow(secondarySource, "7D:"),
  };
  if (!snapshot.primary && !snapshot.secondary) {
    throw new Error("GLM quota response did not contain quota limits");
  }
  return snapshot;
}

function buildUsageWindow(
  limit: ZaiQuotaLimit | undefined,
  label: QuotaWindow["label"],
): QuotaWindow | undefined {
  const usedPercent = resolveUsedPercent(limit);
  if (usedPercent === undefined) return undefined;

  return {
    label,
    usedPercent: clamp(usedPercent, 0, 100),
    resetsAtMs: parseResetTime(limit?.nextResetTime ?? limit?.resetTime ?? limit?.resetsAt),
  };
}

function resolveUsedPercent(limit: ZaiQuotaLimit | undefined): number | undefined {
  if (!limit) return undefined;
  return sanitizeNumber(limit.percentage) ?? sanitizeNumber(limit.used_percent) ?? sanitizeNumber(limit.usedPercentage);
}

function isGlmModel(ctx: Pick<ExtensionContext, "hasUI" | "model">): boolean {
  if (!ctx.hasUI) return false;
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  if (!model) return false;

  const baseUrl = String(model.baseUrl ?? "");
  if (baseUrl.trim() !== "") return isAllowedZaiBaseURL(baseUrl) || isAllowedBigModelBaseURL(baseUrl);

  const provider = String(model.provider ?? "").toLowerCase();
  const id = String(model.id ?? "").toLowerCase();
  const name = String(model.name ?? "").toLowerCase();
  const displayName = String(model.displayName ?? model.display_name ?? "").toLowerCase();
  return [provider, id, name, displayName].some(
    (value) => value === "glm" || value === "zai" || value === "z.ai" || value === "zhipu" || value.includes("glm-"),
  );
}

function quotaURLsForContext(ctx: Pick<ExtensionContext, "model">): string[] {
  const baseUrl = String((ctx.model as unknown as Record<string, unknown> | undefined)?.baseUrl ?? "");
  if (isAllowedBigModelBaseURL(baseUrl)) return [DEFAULT_ZAI_QUOTA_CN_URL, DEFAULT_ZAI_QUOTA_INTL_URL];
  return [DEFAULT_ZAI_QUOTA_INTL_URL, DEFAULT_ZAI_QUOTA_CN_URL];
}

function buildGlmRequestHeaders(auth: GlmAuth): Record<string, string> {
  const headers = { ...auth.headers };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization") delete headers[key];
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  headers.Authorization = `Bearer ${auth.token}`;
  return headers;
}

function isCurrentRefresh(ctx: ExtensionContext, generation: number, requestKey: string): boolean {
  return !shutdownRequested && generation === refreshGeneration && activeCtx === ctx && modelContextKey(ctx) === requestKey && isGlmModel(ctx);
}

function fallbackSnapshot(error: unknown, previousSnapshot: QuotaSnapshot | undefined): QuotaSnapshot {
  const message = error instanceof Error ? error.message : String(error);
  if (!previousSnapshot) return { source: "cached", capturedAtMs: Date.now(), stale: true, error: message };
  return { ...previousSnapshot, source: "cached", stale: Date.now() - previousSnapshot.capturedAtMs > STALE_THRESHOLD_MS, error: message };
}

function isAllowedZaiBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  return Boolean(url && hostMatchesDomain(url.hostname.toLowerCase(), "z.ai"));
}

function isAllowedBigModelBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  return Boolean(url && hostMatchesDomain(url.hostname.toLowerCase(), "bigmodel.cn"));
}

function modelContextKey(ctx: ExtensionContext): string {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  return `${String(model?.provider ?? "none")}:${String(model?.id ?? "none")}:${String(model?.baseUrl ?? "")}`;
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
}
