export function buildAiAssistedByTrailer(model: unknown): string | undefined {
  const record = typeof model === "object" && model !== null ? model as Record<string, unknown> : {};
  const provider = sanitizeAttributionPart(record.provider);
  const modelId = sanitizeAttributionPart(record.id ?? record.name ?? record.displayName ?? record.display_name);
  if (!provider || !modelId) return undefined;
  return `AI-Assisted-By: ${provider}/${modelId}`;
}

export function buildAiAttributionGuidance(model: unknown): string {
  const trailer = buildAiAssistedByTrailer(model);
  return [
    "AI attribution policy for Git commits:",
    "- Do not add Co-Authored-By for AI models automatically.",
    trailer
      ? `- Current runtime model is known; if AI attribution is appropriate, use exactly: ${trailer}`
      : "- Current runtime provider/model is unknown; omit AI attribution.",
    "- Never invent provider email addresses.",
  ].join("\n");
}

function sanitizeAttributionPart(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
