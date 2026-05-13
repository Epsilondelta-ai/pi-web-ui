import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const POLL_INTERVAL_MS = 60_000;
const MIN_EVENT_REFRESH_MS = 15_000;
const STALE_THRESHOLD_MS = 15 * 60_000;
const DEFAULT_KIMI_BALANCE_URL = "https://api.moonshot.ai/v1/users/me/balance";
const DEFAULT_KIMI_CODE_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const CLOUDFLARE_WORKERS_AI_PROVIDER = "cloudflare-workers-ai";
const KIMI_CODE_PROVIDER = "kimi-coding";
const KIMI_CODE_MODEL = "kimi-for-coding";

type KimiProviderKind = "moonshot" | "kimi-code";

type KimiQuotaWindow = {
  label: "5H:" | "7D:";
  usedPercent: number;
  resetsAtMs?: number;
};

export type KimiQuotaSnapshot = {
  kind: KimiProviderKind;
  source: "live" | "cached";
  capturedAtMs: number;
  stale: boolean;
  availableBalance?: number;
  voucherBalance?: number;
  cashBalance?: number;
  primary?: KimiQuotaWindow;
  secondary?: KimiQuotaWindow;
  error?: string;
};

type KimiBalancePayload = {
  data?: {
    available_balance?: number | string;
    voucher_balance?: number | string;
    cash_balance?: number | string;
  } | null;
};

type KimiCodeLimitLike = {
  limit?: number | string;
  used?: number | string;
  remaining?: number | string;
  used_percent?: number | string;
  usedPercentage?: number | string;
  resetTime?: number | string;
  reset_time?: number | string;
  resetsAt?: number | string;
  resets_at?: number | string;
};

type KimiCodeLimit = KimiCodeLimitLike & {
  label?: string;
  name?: string;
  type?: string;
  window?: {
    duration?: number | string;
    minutes?: number | string;
    unit?: string;
  } | null;
  detail?: KimiCodeLimitLike | null;
  details?: KimiCodeLimitLike | null;
};

type KimiCodeUsagePayload = {
  usage?: (KimiCodeLimitLike & { window?: KimiCodeLimit["window"] }) | null;
  limits?: KimiCodeLimit[] | null;
};

let latestSnapshot: KimiQuotaSnapshot | undefined;
let refreshInFlight: Promise<void> | undefined;
let refreshInFlightKey = "";
let refreshGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeCtx: ExtensionContext | undefined;
let lastRefreshStartedAt = 0;
let shutdownRequested = false;

export function registerKimiQuota(pi: ExtensionAPI, onUpdate: (ctx: ExtensionContext) => void): void {
  async function refresh(ctx: ExtensionContext, options?: { force?: boolean }): Promise<void> {
    activeCtx = ctx;
    if (!detectKimiProviderKind(ctx)) {
      latestSnapshot = undefined;
      refreshGeneration++;
      onUpdate(ctx);
      return;
    }

    const now = Date.now();
    const requestKey = modelContextKey(ctx);
    if (!options?.force && now - lastRefreshStartedAt < 2_000) return refreshInFlight;
    if (!options?.force && refreshInFlight && refreshInFlightKey === requestKey) return refreshInFlight;

    const generation = ++refreshGeneration;
    lastRefreshStartedAt = now;
    refreshInFlightKey = requestKey;
    const currentRefresh = (async () => {
      let nextSnapshot: KimiQuotaSnapshot | undefined;
      try {
        nextSnapshot = await loadBestSnapshot(ctx, latestSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextSnapshot = latestSnapshot
          ? { ...latestSnapshot, source: "cached", stale: true, error: message }
          : { kind: detectKimiProviderKind(ctx) ?? "moonshot", source: "cached", capturedAtMs: Date.now(), stale: true, error: message };
      } finally {
        if (refreshInFlight === currentRefresh) refreshInFlight = undefined;
        const stillCurrent = !shutdownRequested
          && generation === refreshGeneration
          && activeCtx === ctx
          && modelContextKey(ctx) === requestKey
          && Boolean(detectKimiProviderKind(ctx));
        if (stillCurrent) {
          latestSnapshot = nextSnapshot;
          onUpdate(ctx);
        }
      }
    })();
    refreshInFlight = currentRefresh;
    return currentRefresh;
  }

  function refreshInBackground(ctx: ExtensionContext, options?: { force?: boolean }): void {
    void refresh(ctx, options);
  }

  function startPolling(ctx: ExtensionContext): void {
    activeCtx = ctx;
    stopPolling();
    pollTimer = setInterval(() => {
      if (activeCtx) refreshInBackground(activeCtx);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function refreshIfDue(ctx: ExtensionContext): void {
    activeCtx = ctx;
    if (!detectKimiProviderKind(ctx)) {
      latestSnapshot = undefined;
      onUpdate(ctx);
      return;
    }
    if (Date.now() - lastRefreshStartedAt < MIN_EVENT_REFRESH_MS) {
      onUpdate(ctx);
      return;
    }
    refreshInBackground(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    shutdownRequested = false;
    activeCtx = ctx;
    startPolling(ctx);
    refreshInBackground(ctx, { force: true });
  });

  pi.on("model_select", async (_event, ctx) => {
    activeCtx = ctx;
    refreshInBackground(ctx, { force: true });
  });

  pi.on("turn_end", async (_event, ctx) => {
    refreshIfDue(ctx);
  });

  pi.on("session_shutdown", async () => {
    shutdownRequested = true;
    refreshGeneration++;
    stopPolling();
    activeCtx = undefined;
  });
}

export function getKimiQuotaFooterText(_width: number): string | undefined {
  if (!latestSnapshot) return undefined;
  return formatKimiQuotaFooterText(latestSnapshot);
}

export function hasActiveKimiQuotaContext(): boolean {
  return Boolean(activeCtx && detectKimiProviderKind(activeCtx));
}

async function loadBestSnapshot(ctx: ExtensionContext, previousSnapshot: KimiQuotaSnapshot | undefined): Promise<KimiQuotaSnapshot> {
  try {
    return await fetchLiveSnapshot(ctx);
  } catch (error) {
    if (!previousSnapshot) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...previousSnapshot,
      source: "cached",
      stale: Date.now() - previousSnapshot.capturedAtMs > STALE_THRESHOLD_MS,
      error: message,
    };
  }
}

async function fetchLiveSnapshot(ctx: ExtensionContext): Promise<KimiQuotaSnapshot> {
  return fetchLiveSnapshotWithDeps(ctx, { fetchFn: fetch });
}

type KimiFetchFn = typeof fetch;

type KimiFetchDeps = {
  fetchFn: KimiFetchFn;
};

async function fetchLiveSnapshotWithDeps(ctx: ExtensionContext, deps: KimiFetchDeps): Promise<KimiQuotaSnapshot> {
  const kind = detectKimiProviderKind(ctx);
  if (!kind) throw new Error("Active Pi model is not a Kimi/Moonshot model");

  const auth = await resolveKimiAuth(ctx, kind);
  if (!auth?.token) throw new Error("Missing Kimi/Moonshot API key. Set MOONSHOT_API_KEY or configure the active Pi model provider.");

  const response = await deps.fetchFn(kind === "kimi-code" ? DEFAULT_KIMI_CODE_USAGE_URL : DEFAULT_KIMI_BALANCE_URL, {
    method: "GET",
    headers: buildKimiRequestHeaders(auth),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(`Kimi ${kind === "kimi-code" ? "usage" : "balance"} request failed (${response.status}): ${truncateInline(body, 200)}`);
  }

  const payload = await response.json();
  return kind === "kimi-code"
    ? mapKimiCodeUsagePayload(payload as KimiCodeUsagePayload, Date.now())
    : mapKimiBalancePayload(payload as KimiBalancePayload, Date.now());
}

type KimiResolvedAuth = {
  token: string;
  headers: Record<string, string>;
};

async function resolveKimiAuth(ctx: ExtensionContext, kind: KimiProviderKind): Promise<KimiResolvedAuth | undefined> {
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

  const fallback = kind === "kimi-code"
    ? sanitizeSecret(process.env.KIMI_API_KEY)
    : sanitizeSecret(process.env.MOONSHOT_API_KEY);
  return fallback ? { token: fallback, headers: {} } : undefined;
}

function buildKimiRequestHeaders(auth: KimiResolvedAuth): Record<string, string> {
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

function sanitizeHeaderRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") headers[key] = raw;
  }
  return headers;
}

function detectKimiProviderKind(ctx: Pick<ExtensionContext, "hasUI" | "model">): KimiProviderKind | undefined {
  if (!ctx.hasUI) return undefined;
  const model = ctx.model as Record<string, unknown> | undefined;
  if (!model) return undefined;

  const provider = String(model.provider ?? "").toLowerCase();
  if (provider === CLOUDFLARE_WORKERS_AI_PROVIDER) return undefined;

  const id = String(model.id ?? "").toLowerCase();
  const baseUrl = String(model.baseUrl ?? "");
  const hasBaseUrl = baseUrl.trim() !== "";

  if (hasBaseUrl) {
    if (isAllowedKimiCodeBaseURL(baseUrl)) return "kimi-code";
    if (provider === KIMI_CODE_PROVIDER || id === KIMI_CODE_MODEL) return undefined;
    if (isAllowedMoonshotBaseURL(baseUrl)) return "moonshot";
    if (provider === "kimi" || provider === "moonshot") return undefined;
    return undefined;
  }

  if (provider === KIMI_CODE_PROVIDER || id === KIMI_CODE_MODEL) return "kimi-code";
  if (provider === "kimi" || provider === "moonshot") return "moonshot";
  return undefined;
}

function isAllowedMoonshotBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  if (!url) return false;
  return hostMatchesDomain(url.hostname.toLowerCase(), "moonshot.ai") || hostMatchesDomain(url.hostname.toLowerCase(), "kimi.ai");
}

function isAllowedKimiCodeBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "api.kimi.com") return false;
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/coding" || normalizedPath === "/coding/v1";
}

function parseURL(rawURL: string): URL | undefined {
  try {
    return new URL(rawURL);
  } catch {
    return undefined;
  }
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function modelContextKey(ctx: ExtensionContext): string {
  const model = ctx.model as Record<string, unknown> | undefined;
  return `${String(model?.provider ?? "none")}:${String(model?.id ?? "none")}:${String(model?.baseUrl ?? "")}`;
}

function mapKimiBalancePayload(payload: KimiBalancePayload, capturedAtMs: number): KimiQuotaSnapshot {
  const availableBalance = sanitizeNumber(payload.data?.available_balance);
  const voucherBalance = sanitizeNumber(payload.data?.voucher_balance);
  const cashBalance = sanitizeNumber(payload.data?.cash_balance);
  if (availableBalance === undefined && voucherBalance === undefined && cashBalance === undefined) {
    throw new Error("Kimi balance response did not contain balance fields");
  }
  return {
    kind: "moonshot",
    source: "live",
    capturedAtMs,
    stale: false,
    availableBalance,
    voucherBalance,
    cashBalance,
  };
}

function mapKimiCodeUsagePayload(payload: KimiCodeUsagePayload, capturedAtMs: number): KimiQuotaSnapshot {
  let primary = findLimitUsageWindow(payload, "5H:");
  let secondary = findLimitUsageWindow(payload, "7D:");

  if (payload.usage) {
    const topLevelLabel = inferTopLevelUsageLabel(payload.usage, Boolean(primary), Boolean(secondary));
    const topLevelWindow = topLevelLabel ? buildUsageWindow(payload.usage, topLevelLabel) : undefined;
    if (topLevelLabel === "5H:" && !primary) primary = topLevelWindow;
    if (topLevelLabel === "7D:" && !secondary) secondary = topLevelWindow;
  }

  if (!primary && !secondary) throw new Error("Kimi Code usage response did not contain quota windows");
  return {
    kind: "kimi-code",
    source: "live",
    capturedAtMs,
    stale: false,
    primary,
    secondary,
  };
}

function findLimitUsageWindow(payload: KimiCodeUsagePayload, label: KimiQuotaWindow["label"]): KimiQuotaWindow | undefined {
  for (const rawLimit of payload.limits ?? []) {
    const duration = windowDurationMinutes(rawLimit.window);
    const text = `${rawLimit.label ?? ""} ${rawLimit.name ?? ""} ${rawLimit.type ?? ""}`.toLowerCase();
    const isFiveHour = label === "5H:" && (duration === 300 || text.includes("5h") || text.includes("5 h") || text.includes("five"));
    const isWeekly = label === "7D:" && (duration === 10_080 || text.includes("week") || text.includes("7d") || text.includes("7 d"));
    if (isFiveHour || isWeekly) return buildUsageWindow(rawLimit, label);
  }
  return undefined;
}

function inferTopLevelUsageLabel(usage: KimiCodeUsagePayload["usage"], hasPrimary: boolean, hasSecondary: boolean): KimiQuotaWindow["label"] | undefined {
  if (!usage) return undefined;
  const duration = windowDurationMinutes(usage.window);
  if (duration === 300) return "5H:";
  if (duration === 10_080) return "7D:";
  if (hasPrimary && !hasSecondary) return "7D:";
  if (!hasPrimary) return "5H:";
  return undefined;
}

function buildUsageWindow(raw: KimiCodeLimit | KimiCodeUsagePayload["usage"], label: KimiQuotaWindow["label"]): KimiQuotaWindow | undefined {
  if (!raw) return undefined;
  const detail = "detail" in raw ? raw.detail : undefined;
  const details = "details" in raw ? raw.details : undefined;
  const source = { ...raw, ...(details ?? {}), ...(detail ?? {}) };
  const usedPercent = resolveUsedPercent(source);
  if (usedPercent === undefined) return undefined;
  return {
    label,
    usedPercent: clamp(usedPercent, 0, 100),
    resetsAtMs: parseResetTime(source.resetTime ?? source.reset_time ?? source.resetsAt ?? source.resets_at),
  };
}

function windowDurationMinutes(window: KimiCodeLimit["window"]): number | undefined {
  if (!window) return undefined;
  const direct = sanitizeNumber(window.duration) ?? sanitizeNumber(window.minutes);
  if (direct === undefined) return undefined;
  const unit = String(window.unit ?? "minutes").toLowerCase();
  if (unit.startsWith("hour")) return direct * 60;
  if (unit.startsWith("day")) return direct * 1_440;
  if (unit.startsWith("second")) return Math.ceil(direct / 60);
  return direct;
}

function resolveUsedPercent(source: KimiCodeLimitLike): number | undefined {
  const explicitPercent = sanitizeNumber(source.used_percent) ?? sanitizeNumber(source.usedPercentage);
  if (explicitPercent !== undefined) return explicitPercent > 1 ? explicitPercent : explicitPercent * 100;

  const limit = sanitizeNumber(source.limit);
  const used = sanitizeNumber(source.used);
  const remaining = sanitizeNumber(source.remaining);
  if (limit === undefined || limit <= 0) return undefined;
  if (used !== undefined) return (used / limit) * 100;
  if (remaining !== undefined) return ((limit - remaining) / limit) * 100;
  return undefined;
}

function parseResetTime(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function formatKimiQuotaFooterText(snapshot: KimiQuotaSnapshot): string | undefined {
  if (snapshot.kind === "kimi-code") return formatKimiCodeUsageFooterText(snapshot);
  return formatKimiBalanceFooterText(snapshot);
}

function formatKimiBalanceFooterText(snapshot: KimiQuotaSnapshot): string | undefined {
  if (snapshot.availableBalance === undefined) return undefined;
  const parts = [`Kimi: ${formatCurrency(snapshot.availableBalance)} left`];
  if (snapshot.voucherBalance !== undefined) parts.push(`voucher ${formatCurrency(snapshot.voucherBalance)}`);
  if (snapshot.cashBalance !== undefined) parts.push(`cash ${formatCurrency(snapshot.cashBalance)}`);
  const text = parts.join(" · ");
  return snapshot.stale || snapshot.source === "cached" ? `${text} (cached)` : text;
}

function formatKimiCodeUsageFooterText(snapshot: KimiQuotaSnapshot): string | undefined {
  const windows = [snapshot.primary, snapshot.secondary]
    .filter((window): window is KimiQuotaWindow => Boolean(window))
    .map((window) => formatNativeWindow(window));
  if (windows.length === 0) return undefined;
  const text = windows.join(" │ ");
  return snapshot.stale || snapshot.source === "cached" ? `${text} (cached)` : text;
}

function formatNativeWindow(window: KimiQuotaWindow): string {
  const pct = Math.round(clamp(window.usedPercent, 0, 100));
  const resetText = window.resetsAtMs ? formatResetDuration(window.resetsAtMs) : "";
  const base = `${window.label} ${batteryIcon(pct)} ${renderNativeBar(pct, 10)} ${pct}%`;
  return resetText ? `${base} (${resetText})` : base;
}

function renderNativeBar(usedPercent: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((clamp(usedPercent, 0, 100) / 100) * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function batteryIcon(usedPercent: number): string {
  return usedPercent > 70 ? "🪫" : "🔋";
}

function formatResetDuration(timestampMs: number, nowMs = Date.now()): string {
  const remaining = timestampMs - nowMs;
  if (remaining <= 0) return "";
  const totalMinutes = Math.max(1, Math.round(remaining / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function sanitizeNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizeSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractBearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return sanitizeSecret(match?.[1]);
}

function truncateInline(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isKimiMoonshotModelForTest(ctx: Pick<ExtensionContext, "hasUI" | "model">): boolean {
  return Boolean(detectKimiProviderKind(ctx));
}

export function kimiProviderKindForTest(ctx: Pick<ExtensionContext, "hasUI" | "model">): KimiProviderKind | undefined {
  return detectKimiProviderKind(ctx);
}

export function mapKimiBalancePayloadForTest(payload: KimiBalancePayload, capturedAtMs: number): KimiQuotaSnapshot {
  return mapKimiBalancePayload(payload, capturedAtMs);
}

export function mapKimiCodeUsagePayloadForTest(payload: KimiCodeUsagePayload, capturedAtMs: number): KimiQuotaSnapshot {
  return mapKimiCodeUsagePayload(payload, capturedAtMs);
}

export function formatKimiBalanceFooterTextForTest(snapshot: KimiQuotaSnapshot): string | undefined {
  return formatKimiBalanceFooterText(snapshot);
}

export function formatKimiQuotaFooterTextForTest(snapshot: KimiQuotaSnapshot): string | undefined {
  return formatKimiQuotaFooterText(snapshot);
}

export async function fetchLiveSnapshotForTest(ctx: ExtensionContext, fetchFn: KimiFetchFn): Promise<KimiQuotaSnapshot> {
  return fetchLiveSnapshotWithDeps(ctx, { fetchFn });
}

export function kimiBalanceURLForTest(): string {
  return DEFAULT_KIMI_BALANCE_URL;
}

export function kimiCodeUsageURLForTest(): string {
  return DEFAULT_KIMI_CODE_USAGE_URL;
}
