import { beforeEach, describe, expect, it } from "vitest";
import "./pi-app.js";

describe("pi-app runtime", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <pi-app data-tree="on" data-sidebar="open">
        <section data-view="picker" hidden></section>
        <section class="app-body with-tree" data-view="workspace"><div class="sidebar-wrap"></div><main><div class="term-inner"></div></main><aside class="tree"></aside></section>
        <button class="sb-expand-btn"></button>
        <div class="prompt-region">
          <div class="slash-pop" hidden><button class="slash-item selected" data-slash="/model">/model</button></div>
          <div class="attach-chips" hidden></div>
          <textarea class="prompt-textarea"></textarea>
          <button class="send-btn" disabled>send</button>
          <button class="attach-btn">attach</button>
          <input data-file-input type="file" />
        </div>
      </pi-app>
    `;
  });

  it("enables send and shows slash commands as the prompt changes", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const prompt = app.querySelector(".prompt-textarea");
    prompt.value = "/mo";
    prompt.dispatchEvent(new Event("input"));
    expect(app.querySelector(".send-btn").disabled).toBe(false);
    expect(app.querySelector(".slash-pop").hidden).toBe(false);
  });

  it("opens session actions from an ellipsis menu", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    const row = app.createSessionRow("w1", { id: "s1", title: "demo", lastUsed: "now" });
    app.append(row);
    const toggle = row.querySelector("[data-action='session-menu-toggle']");
    toggle.click();
    expect(row.querySelector(".session-menu").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("deduplicates echoed user prompts and removes loading on response", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text: "hello" });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading")).not.toBeNull();
    app.appendMessage({ kind: "pi", text: "world" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("streams assistant deltas before the final message", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("hello");
  });

  it("switches between picker and workspace routes", async () => {
    const app = document.querySelector("pi-app");
    await customElements.whenDefined("pi-app");
    app.connectedCallback();
    app.route("picker");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(false);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(true);
    app.route("workspace");
    expect(app.querySelector('[data-view="picker"]').hidden).toBe(true);
    expect(app.querySelector('[data-view="workspace"]').hidden).toBe(false);
  });
});
