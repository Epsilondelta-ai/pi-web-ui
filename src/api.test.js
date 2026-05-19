import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSession, cloneWorkspace, createSession, deleteSession, deleteWorkspace, getSession, getWorkspaceFile, getWorkspaces, listFolders, postPrompt, renameSession, runShellCommand, saveWorkspaceFile, sessionEvents } from "./api.js";

describe("api adapter", () => {
  beforeEach(() => {
    globalThis.PI_WEB_API_BASE = "http://backend.test";
    globalThis.fetch = vi.fn(async (url, options) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ url, options }),
    }));
  });

  afterEach(() => {
    delete globalThis.PI_WEB_API_BASE;
    vi.restoreAllMocks();
  });

  it("fetches workspaces from the configured backend", async () => {
    const result = await getWorkspaces();
    expect(result.url).toBe("http://backend.test/api/workspaces");
  });

  it("defaults to same-origin API paths for the embedded app", async () => {
    delete globalThis.PI_WEB_API_BASE;
    const result = await getWorkspaces();
    expect(result.url).toBe("/api/workspaces");
  });

  it("escapes session ids in paths", async () => {
    const result = await getSession("a/b");
    expect(result.url).toBe("http://backend.test/api/sessions/a%2Fb");
  });

  it("lists folders from the backend browser", async () => {
    const result = await listFolders("~");
    expect(result.url).toBe("http://backend.test/api/system/folders?path=~");
  });

  it("creates sessions in a workspace", async () => {
    const result = await createSession("w1");
    expect(result.url).toBe("http://backend.test/api/workspaces/w1/sessions");
    expect(result.options.method).toBe("POST");
  });

  it("supports workspace and session management", async () => {
    expect((await deleteWorkspace("w1")).options.method).toBe("DELETE");
    expect((await deleteSession("s1")).options.method).toBe("DELETE");
    expect((await cancelSession("s1")).options.method).toBe("POST");
    const renamed = await renameSession("s1", "next");
    expect(renamed.options.method).toBe("PATCH");
    expect(JSON.parse(renamed.options.body)).toEqual({ title: "next" });
  });

  it("reads and saves workspace files", async () => {
    const result = await getWorkspaceFile("w1", "src/main.go");
    expect(result.url).toBe("http://backend.test/api/workspaces/w1/files/read?path=src%2Fmain.go");
    const saved = await saveWorkspaceFile("w1", "src/main.go", "package main");
    expect(saved.url).toBe("http://backend.test/api/workspaces/w1/files/write?path=src%2Fmain.go");
    expect(saved.options.method).toBe("PUT");
    expect(JSON.parse(saved.options.body)).toEqual({ content: "package main" });
  });

  it("posts prompts as json", async () => {
    const result = await postPrompt("s1", "hello");
    expect(result.options.method).toBe("POST");
    expect(JSON.parse(result.options.body)).toEqual({ text: "hello", attachments: [] });
  });

  it("clones workspaces and runs shell commands", async () => {
    const cloned = await cloneWorkspace("/tmp", "https://example.test/repo.git", "repo");
    expect(cloned.url).toBe("http://backend.test/api/workspaces/clone");
    expect(JSON.parse(cloned.options.body)).toEqual({ parentPath: "/tmp", gitUrl: "https://example.test/repo.git", name: "repo" });
    const shell = await runShellCommand("w/1", "pwd");
    expect(shell.url).toBe("http://backend.test/api/workspaces/w%2F1/shell");
    expect(JSON.parse(shell.options.body)).toEqual({ command: "pwd" });
  });

  it("creates EventSource connections for session streams", () => {
    const sources = [];
    globalThis.EventSource = class {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        sources.push(this);
      }
      addEventListener(type, cb) {
        this.listeners[type] = cb;
      }
      close() {}
    };
    const source = sessionEvents("s1");
    expect(source.url).toBe("http://backend.test/api/sessions/s1/events");
    expect(sources[0].listeners["session.message"]).toBeTypeOf("function");
  });
});
