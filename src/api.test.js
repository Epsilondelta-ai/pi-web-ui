import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession, getWorkspaces, postPrompt, sessionEvents } from "./api.js";

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

  it("escapes session ids in paths", async () => {
    const result = await getSession("a/b");
    expect(result.url).toBe("http://backend.test/api/sessions/a%2Fb");
  });

  it("posts prompts as json", async () => {
    const result = await postPrompt("s1", "hello");
    expect(result.options.method).toBe("POST");
    expect(JSON.parse(result.options.body)).toEqual({ text: "hello", attachments: [] });
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
