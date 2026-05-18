const DEFAULT_API_BASE = "http://127.0.0.1:8732";

function apiBase() {
  return globalThis.PI_WEB_API_BASE || DEFAULT_API_BASE;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export function health() {
  return request("/api/health");
}

export function getWorkspaces() {
  return request("/api/workspaces");
}

export function openWorkspace(path) {
  return request("/api/workspaces/open", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function getWorkspaceSessions(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`);
}

export function createSession(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`, { method: "POST" });
}

export function deleteWorkspace(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
}

export function getWorkspaceFiles(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`);
}

export function getWorkspaceFile(workspaceId, path) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`);
}

export function getGitStatus(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/git/status`);
}

export function getSession(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function renameSession(sessionId, title) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteSession(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export function cancelSession(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
}

export function postPrompt(sessionId, text, attachments = []) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: "POST",
    body: JSON.stringify({ text, attachments }),
  });
}

export function sessionEvents(sessionId, { onEvent, onOpen, onError } = {}) {
  const source = new EventSource(`${apiBase()}/api/sessions/${encodeURIComponent(sessionId)}/events`);
  source.onopen = () => onOpen?.();
  source.onerror = (event) => onError?.(event);
  const types = ["session.message", "session.status", "tool.started", "tool.output", "tool.finished", "workspace.files.changed", "error", "heartbeat"];
  for (const type of types) {
    source.addEventListener(type, (message) => {
      try {
        onEvent?.(JSON.parse(message.data));
      } catch (error) {
        onError?.(error);
      }
    });
  }
  return source;
}
