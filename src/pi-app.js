import { sessionEvents } from "./api.js";
import { SPINNER_FRAMES } from "./pi-app/constants.js";
import { filePreviewMethods } from "./pi-app/file-preview-methods.js";
import { inputMethods } from "./pi-app/input-methods.js";
import { layoutMethods } from "./pi-app/layout-methods.js";
import { messageMethods } from "./pi-app/message-methods.js";
import { sessionMethods } from "./pi-app/session-methods.js";
import { workspaceMethods } from "./pi-app/workspace-methods.js";

class PiApp extends HTMLElement {
  connectedCallback() {
    if (this.bound) return;
    this.bound = true;
    this.prompt = this.querySelector(".prompt-textarea");
    this.send = this.querySelector(".send-btn");
    this.attach = this.querySelector(".attach-btn");
    this.file = this.querySelector("[data-file-input]");
    this.attachments = this.querySelector(".attach-chips");
    this.slash = this.querySelector(".slash-pop");
    this.termInner = this.querySelector(".term-inner");
    this.eventSource = null;
    this.apiConnected = false;
    this.currentFolder = "~";
    this.running = false;
    this.attachmentContents = [];
    this.spinnerIndex = 0;
    this.piDeltaBuffer = "";
    this.runtimeStatus = {};
    this.bind();
    this.restoreSidebar();
    this.updatePrompt();
    this.updatePromptMeta();
    this.scrollTerm();
    this.startSpinners();
    this.startRuntimeStatusPolling();
    this.bootstrapAPI();
  }

  disconnectedCallback() {
    this.eventSource?.close();
    if (this.spinnerTimer) clearInterval(this.spinnerTimer);
    if (this.runtimeStatusTimer) clearInterval(this.runtimeStatusTimer);
  }

  startRuntimeStatusPolling() {
    if (this.runtimeStatusTimer) return;
    this.runtimeStatusTimer = setInterval(() => this.loadRuntimeStatus?.(), 15000);
  }

  startSpinners() {
    if (this.spinnerTimer) return;
    this.spinnerTimer = setInterval(() => this.tickSpinners(), 100);
  }

  tickSpinners() {
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
    this.querySelectorAll(".spinner").forEach((spinner) => {
      spinner.textContent = SPINNER_FRAMES[this.spinnerIndex];
    });
  }

  bind() {
    this.addEventListener("click", (event) => this.click(event));
    this.querySelector("[data-path-form]")?.addEventListener("submit", (event) => this.submitWorkspacePath(event));
    this.querySelector("[data-clone-form]")?.addEventListener("submit", (event) => this.submitCloneWorkspace(event));
    this.querySelector("[data-shell-form]")?.addEventListener("submit", (event) => this.submitShellCommand(event));
    this.send?.addEventListener("click", () => this.running ? this.cancelActiveSession() : this.submitPrompt());
    this.prompt?.addEventListener("input", () => this.updatePrompt());
    this.prompt?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.submitPrompt();
      if (this.slash && !this.slash.hidden && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) this.navigateList(event, ".slash-item", (item) => this.pickSlash(item.dataset.slash));
    });
    this.attach?.addEventListener("click", () => this.file?.click());
    this.file?.addEventListener("change", () => this.addFiles(this.file.files));
    this.querySelector(".sb-resizer")?.addEventListener("pointerdown", (event) => this.startResize(event));
    window.addEventListener("keydown", (event) => this.shortcut(event));
    window.addEventListener("click", (event) => {
      if (!event.target.closest?.(".session-menu, .session-menu-button")) this.closeSessionMenus();
    });
    window.addEventListener("message", (event) => {
      if (event.data?.type === "__activate_edit_mode") this.querySelector("[data-tweaks]")?.removeAttribute("hidden");
      if (event.data?.type === "__deactivate_edit_mode") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    });
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
  }

  connectEvents(sessionId) {
    this.eventSource?.close();
    this.eventSource = sessionEvents(sessionId, {
      onOpen: () => this.setConnection("ok"),
      onError: () => this.setConnection("err"),
      onEvent: (event) => this.applyEvent(event),
    });
  }

  applyEvent(event) {
    if (event.type === "heartbeat") return;
    if (event.type === "session.status") {
      const mode = event.payload?.status || "auto-accept";
      this.setMode(mode);
      if (mode === "idle" || mode === "cancelled") this.finalizeStreamingMessages();
      return;
    }
    if (event.type === "session.message") {
      this.appendMessage(event.payload);
      return;
    }
    if (event.type === "session.delta") {
      this.appendDelta(event.payload);
      return;
    }
    if (event.type === "session.renamed") {
      this.updateSessionTitle(event.payload);
      return;
    }
    if (event.type === "tool.started") {
      this.appendMessage(event.payload);
      return;
    }
    if (event.type === "tool.output") {
      this.appendToolOutput(event.payload);
      return;
    }
    if (event.type === "tool.finished") this.finishTool(event.payload);
  }

  setConnection(status) {
    const indicator = this.querySelector(".statusbtn");
    if (!indicator) return;
    indicator.style.color = status === "ok" ? "var(--accent)" : "var(--danger)";
    indicator.title = status === "ok" ? "connected" : "backend disconnected";
  }

  setMode(mode) {
    this.running = ["running", "thinking"].includes(mode);
    if (this.send) {
      this.send.textContent = this.running ? "stop" : "send";
      if (this.running) this.send.disabled = false;
      else this.updatePrompt();
    }
    if (!this.running) void this.loadRuntimeStatus?.();
  }

  updatePromptMeta(status = {}) {
    const meta = this.querySelector("[data-prompt-meta]");
    if (!meta) return;
    this.runtimeStatus = {
      ...this.runtimeStatus,
      ...status,
      currentBranch: status.currentBranch || status.branch || this.runtimeStatus?.currentBranch,
    };
    const model = this.runtimeStatus.model || "—";
    const currentBranch = this.runtimeStatus.currentBranch || "—";
    meta.textContent = `${model} | ${this.quotaLabel("5h", this.runtimeStatus.fiveHourQuota)} | ${this.quotaLabel("Week", this.runtimeStatus.weeklyQuota)} |  ${currentBranch}`;
  }

  quotaLabel(label, quota) {
    if (!Number.isFinite(quota)) return `${label} 🪫(—)`;
    const percent = Math.max(0, Math.min(100, Math.round(quota)));
    return `${label} ${percent > 20 ? "🔋" : "🪫"}(${percent}%)`;
  }
}

Object.assign(
  PiApp.prototype,
  workspaceMethods,
  sessionMethods,
  messageMethods,
  inputMethods,
  filePreviewMethods,
  layoutMethods,
);

if (!customElements.get("pi-app")) customElements.define("pi-app", PiApp);

export { PiApp };
