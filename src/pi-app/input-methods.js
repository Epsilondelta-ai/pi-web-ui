import { cancelSession, createSession, postPrompt, runShellCommand } from "../api.js";
import { fallbackChoicePrompt } from "./fallback-choices.js";

export const inputMethods = {
  async submitPrompt() {
    const text = this.prompt?.value.trim() || "";
    if (!text && !this.attachments?.children.length) return;
    let sessionId = this.dataset.activeSessionId;
    if (!sessionId && this.apiConnected && this.dataset.activeWorkspaceId) {
      try {
        const { session } = await createSession(this.dataset.activeWorkspaceId);
        this.activateCreatedSession(this.dataset.activeWorkspaceId, session);
        sessionId = session.id;
      } catch {
        this.setConnection("err");
        return;
      }
    }
    this.showSessionMain();
    this.finalizeStreamingMessages();
    if (text) {
      this.appendMessage({ kind: "user", text });
      this.appendLoadingMessage();
      this.autonameActiveSession(text);
    }
    if (this.prompt) this.prompt.value = "";
    const attachments = this.attachmentContents.filter(Boolean);
    this.attachmentContents = [];
    this.attachments?.replaceChildren();
    if (this.attachments) this.attachments.hidden = true;
    this.updatePrompt();
    if (this.apiConnected && sessionId) {
      try {
        await postPrompt(sessionId, text, attachments);
      } catch {
        this.removeLoadingMessage();
        this.setConnection("err");
      }
    }
  },

  async submitShellCommand(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input[name='command']");
    const command = input?.value.trim();
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!command || !workspaceId || !this.apiConnected) return;
    const button = event.currentTarget.querySelector("button[type='submit']");
    if (button) button.disabled = true;
    this.showSessionMain();
    this.finalizeStreamingMessages();
    this.appendMessage({ kind: "tool", tool: "shell", args: `$ ${command}`, status: "running", collapsedByDefault: false });
    try {
      const result = await runShellCommand(workspaceId, command);
      this.finishTool({
        kind: "tool",
        tool: "shell",
        args: `$ ${command}`,
        status: result.exitCode === 0 ? "ok" : "err",
        durationMs: result.durationMs,
        resultMeta: result.exitCode === 0 ? "done" : `exit ${result.exitCode}`,
        body: result.output || "[no output]",
      });
      if (input) input.value = "";
      void this.loadRuntimeStatus?.(workspaceId);
      void this.loadWorkspaceMeta?.(workspaceId);
    } catch (error) {
      this.finishTool({ kind: "tool", tool: "shell", args: `$ ${command}`, status: "err", resultMeta: error instanceof Error ? error.message : String(error), body: "" });
      this.setConnection("err");
    } finally {
      if (button) button.disabled = false;
    }
  },

  async cancelActiveSession() {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !this.apiConnected) return;
    try {
      await cancelSession(sessionId);
      this.setMode("cancelled");
    } catch {
      this.setConnection("err");
    }
  },

  click(event) {
    const remove = event.target.closest("[data-remove-attachment]");
    if (remove) {
      const chip = remove.closest(".attach-chip");
      const index = Number(chip?.dataset.attachmentIndex);
      if (Number.isInteger(index)) this.attachmentContents[index] = "";
      chip?.remove();
      this.updatePrompt();
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    const button = event.target.closest("button");
    if ((!button && !actionTarget) || !this.contains(button || actionTarget)) return;
    const action = actionTarget?.dataset.action || button?.dataset.action;
    if (action === "route-picker") this.route("picker");
    if (action === "route-workspace") this.route("workspace");
    if (action === "browse-folder") this.browseFolder();
    if (action === "folder-enter") this.loadFolder(actionTarget.dataset.path);
    if (action === "folder-up") this.loadFolder(this.currentFolderParent);
    if (action === "folder-open-current") this.openWorkspacePath(this.currentFolder);
    if (action === "toggle-tree") this.toggleTree();
    if (action === "refresh-tree") this.refreshTree();
    if (action === "toggle-tree-node") this.toggleTreeNode(button);
    if (action === "open-file") this.openFile(button);
    if (action === "close-file-preview") this.closeFilePreview();
    if (action === "toggle-file-preview-mode") this.toggleFilePreviewMode();
    if (action === "save-file-preview") this.saveFilePreview();
    if (action === "collapse-sidebar") this.collapseSidebar(true);
    if (action === "expand-sidebar") this.collapseSidebar(false);
    if (action === "open-drawer") this.querySelector(".app-body")?.classList.add("drawer-open");
    if (action === "close-drawer") this.querySelector(".app-body")?.classList.remove("drawer-open");
    if (action === "toggle-tool") this.toggleTool(button);
    if (action !== "session-menu-toggle") this.closeSessionMenus(actionTarget?.closest(".session-row"));
    if (action === "toggle-workspace") this.toggleWorkspace(button.dataset.workspace);
    if (action === "delete-workspace") this.deleteWorkspace(actionTarget.dataset.workspace);
    if (action === "new-session") this.newSession(button.dataset.workspace);
    if (action === "session-menu-toggle") this.toggleSessionMenu(actionTarget.closest(".session-row"));
    if (action === "rename-session") this.renameSession(actionTarget.closest(".session-row")?.dataset.session);
    if (action === "delete-session") this.deleteSession(actionTarget.closest(".session-row")?.dataset.session);
    if (action === "fallback-choice") this.submitFallbackChoice(actionTarget.dataset.choiceId, actionTarget.dataset.choiceValue, actionTarget.closest(".fallback-choice-list"));
    if (action === "fallback-choice-custom") this.submitFallbackChoice(actionTarget.dataset.choiceId, actionTarget.closest(".choice-custom")?.querySelector("[data-choice-custom-input]")?.value, actionTarget.closest(".fallback-choice-list"));
    if (action === "close-tweaks") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    if (!actionTarget?.closest(".session-menu") && action !== "session-menu-toggle" && button?.dataset.session) this.pickSession(button.closest(".session-row") || button);
    if (button?.dataset.workspace && button.classList.contains("recent-row")) this.openWorkspace(button.dataset.workspace);
    if (button?.dataset.seed) this.seed(button.dataset.seed);
    if (button?.dataset.skill) this.seed(`/skill ${button.dataset.skill}\n\n`);
    if (button?.dataset.slash) this.pickSlash(button.dataset.slash);
  },

  async submitFallbackChoice(choiceId, value, panel) {
    const prompt = fallbackChoicePrompt(choiceId, value);
    if (!prompt || !this.apiConnected || !this.dataset.activeSessionId) return;
    panel?.classList.add("answered");
    panel?.querySelectorAll("button, input").forEach((item) => item.disabled = true);
    this.finalizeStreamingMessages();
    this.appendMessage({ kind: "user", text: prompt });
    this.appendLoadingMessage();
    try {
      await postPrompt(this.dataset.activeSessionId, prompt, []);
    } catch {
      this.removeLoadingMessage();
      this.setConnection("err");
    }
  },

  updatePrompt() {
    if (!this.prompt || !this.send) return;
    const value = this.prompt.value;
    const hasAttachments = !!this.attachments?.children.length;
    this.send.disabled = !value.trim() && !hasAttachments;
    this.slash?.toggleAttribute("hidden", !(value.startsWith("/") && !value.includes("\n")));
    this.filterSlash(value);
    this.prompt.style.height = "auto";
    this.prompt.style.height = Math.min(180, this.prompt.scrollHeight) + "px";
  },

  seed(value) {
    if (!this.prompt) return;
    this.prompt.value = value;
    this.updatePrompt();
    this.prompt.focus();
  },

  renderSlashCommands(commands = []) {
    const list = this.querySelector(".slash-list");
    if (!list) return;
    list.replaceChildren();
    for (const command of commands) {
      const name = command.command || command.cmd || `/${command.name}`;
      if (!name || name === "/undefined") continue;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "slash-item";
      item.dataset.slash = name;
      const scope = command.scope || command.location || "global";
      const source = command.source || "command";
      item.innerHTML = `<span class="sl-cmd"></span><span class="sl-tags"><span class="sl-scope"></span><span class="sl-source"></span></span><span class="sl-desc"></span>`;
      item.querySelector(".sl-cmd").textContent = name;
      item.querySelector(".sl-scope").textContent = scope;
      item.querySelector(".sl-source").textContent = source;
      item.querySelector(".sl-desc").textContent = command.description || command.desc || "";
      list.append(item);
    }
    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.className = "slash-empty";
      empty.textContent = "no slash commands found";
      list.append(empty);
    }
    this.filterSlash();
  },

  filterSlash(value = this.prompt?.value || "") {
    const query = value.replace(/^\//, "").toLowerCase();
    const items = [...this.querySelectorAll(".slash-item")];
    let first = true;
    items.forEach((item) => {
      const match = !query || item.textContent.toLowerCase().includes(query);
      item.hidden = !match;
      item.classList.toggle("selected", match && first);
      if (match) first = false;
    });
  },

  pickSlash(command) {
    this.seed(command + " ");
    this.slash?.setAttribute("hidden", "");
  },

  navigateList(event, selector, run) {
    event.preventDefault();
    const items = [...this.querySelectorAll(selector)].filter((item) => !item.hidden);
    if (!items.length) return;
    let index = Math.max(0, items.findIndex((item) => item.classList.contains("selected")));
    if (event.key === "ArrowDown") index = Math.min(items.length - 1, index + 1);
    if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    items.forEach((item) => item.classList.remove("selected"));
    items[index].classList.add("selected");
    items[index].scrollIntoView({ block: "nearest" });
    if (event.key === "Enter") run(items[index]);
  },

  async addFiles(files) {
    if (!this.attachments) return;
    for (const file of files || []) {
      const text = file.size <= 256 * 1024 ? await file.text() : "[file too large to inline]";
      this.attachmentContents.push(`File: ${file.name}\n\n${text}`);
      this.addAttachmentChip(file.name, file.size, file);
    }
    this.attachments.hidden = !this.attachments.children.length;
    this.updatePrompt();
  },

  addAttachmentChip(name, size, file) {
    const chip = document.createElement("span");
    chip.className = "attach-chip";
    chip.dataset.attachmentIndex = String(this.attachmentContents.length - 1);
    chip.innerHTML = `<span class="ac-glyph">${file ? this.kindGlyph(file) : "file"}</span><span class="ac-name"></span><span class="ac-size">${this.formatBytes(size)}</span><button class="ac-remove" type="button" data-remove-attachment aria-label="remove">×</button>`;
    chip.querySelector(".ac-name").textContent = name;
    this.attachments.append(chip);
  },

  kindGlyph(file) {
    if (file.type?.startsWith("image")) return "img";
    if (file.name.endsWith(".pdf")) return "pdf";
    if (/\.(js|ts|jsx|tsx|astro|py|go|rs)$/.test(file.name)) return "&lt;/&gt;";
    return "txt";
  },

  formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  },
};
