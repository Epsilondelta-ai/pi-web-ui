export type QuotaWindow = {
  label: "5H:" | "7D:";
  usedPercent: number;
  resetsAtMs?: number;
};

export type QuotaSnapshot = {
  source: "live" | "cached";
  capturedAtMs: number;
  stale: boolean;
  primary?: QuotaWindow;
  secondary?: QuotaWindow;
  error?: string;
};

export function formatQuotaSnapshot(snapshot: QuotaSnapshot): string | undefined {
  const windows = [snapshot.primary, snapshot.secondary]
    .filter((window): window is QuotaWindow => Boolean(window))
    .map(formatQuotaWindow);
  if (windows.length === 0) return undefined;

  const text = windows.join(" | ");
  return snapshot.stale || snapshot.source === "cached" ? `${text} (cached)` : text;
}

export function formatQuotaWindow(window: QuotaWindow): string {
  const remainingPercent = Math.round(clamp(100 - window.usedPercent, 0, 100));
  return `${windowLabel(window.label)} ${batteryIcon(remainingPercent)}(${remainingPercent}%)`;
}

export function windowLabel(label: QuotaWindow["label"]): string {
  return label === "5H:" ? "5h" : "Week";
}

export function batteryIcon(remainingPercent: number): string {
  return remainingPercent <= 20 ? "🪫" : "🔋";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function parseResetTime(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function sanitizeSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function extractBearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return sanitizeSecret(match?.[1]);
}

export function sanitizeHeaderRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};

  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") headers[key] = raw;
  }
  return headers;
}

export async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function truncateInline(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function parseURL(rawURL: string): URL | undefined {
  try {
    return new URL(rawURL);
  } catch {
    return undefined;
  }
}
