import { cancelSession, createSession, deleteSession as deleteSessionRequest, deleteWorkspace as deleteWorkspaceRequest, getGitStatus, getSession, getWorkspaceFile, getWorkspaceFiles, getWorkspaces, listFolders, openWorkspace, postPrompt, renameSession as renameSessionRequest, sessionEvents } from "./api.js";
import { escapeHtml, renderAnsiBody, renderBannerBody, renderPiBody, renderTree } from "./renderers.js";

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
    this.bind();
    this.restoreSidebar();
    this.updatePrompt();
    this.scrollTerm();
    this.bootstrapAPI();
  }

  disconnectedCallback() {
    this.eventSource?.close();
  }

  bind() {
    this.addEventListener("click", (event) => this.click(event));
    this.querySelector("[data-path-form]")?.addEventListener("submit", (event) => this.submitWorkspacePath(event));
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

  async bootstrapAPI() {
    try {
      const [{ workspaces }] = await Promise.all([getWorkspaces()]);
      this.apiConnected = true;
      this.setConnection("ok");
      const activeWorkspace = workspaces?.[0];
      const activeSession = activeWorkspace?.sessions?.[0];
      if (activeWorkspace) {
        this.dataset.activeWorkspaceId = activeWorkspace.id;
        const label = this.querySelector("[data-active-workspace]");
        if (label) label.textContent = activeWorkspace.name;
      }
      if (activeSession) {
        this.dataset.activeSessionId = activeSession.id;
        const title = this.querySelector("[data-active-session-title]");
        if (title) {
          title.textContent = activeSession.title;
          title.title = `${activeSession.title} · ${activeSession.id}`;
        }
      }
      this.renderWorkspaces(workspaces || []);
      if (activeWorkspace) await this.loadWorkspaceMeta(activeWorkspace.id);
      if (activeSession) await this.loadSession(activeSession.id);
    } catch {
      this.apiConnected = false;
      this.setConnection("err");
    }
  }

  async loadWorkspaceMeta(workspaceId) {
    try {
      const [{ files }, git] = await Promise.all([getWorkspaceFiles(workspaceId), getGitStatus(workspaceId)]);
      const list = this.querySelector(".tree-list");
      if (list && files) {
        list.innerHTML = `${renderTree(files)}<div style="padding:8px 16px;color:var(--fg-4);font-size:11px;font-style:italic">tip: pi watches the tree · changes appear here.</div>`;
      }
      const status = this.querySelector("[data-git-status]");
      if (status && git) status.textContent = `${git.branch} · ${git.dirty} ✱`;
    } catch {}
  }

  async loadSession(sessionId) {
    try {
      const { session, messages } = await getSession(sessionId);
      this.dataset.activeSessionId = session.id;
      const title = this.querySelector("[data-active-session-title]");
      if (title) {
        title.textContent = session.title;
        title.title = `${session.title} · ${session.id}`;
      }
      this.renderMessages(messages || []);
      this.connectEvents(session.id);
    } catch {
      this.setConnection("err");
    }
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
    if (event.type === "tool.finished") {
      this.finishTool(event.payload);
    }
  }

  setConnection(status) {
    const indicator = this.querySelector(".statusbtn");
    if (!indicator) return;
    indicator.style.color = status === "ok" ? "var(--accent)" : "var(--danger)";
    indicator.title = status === "ok" ? "connected" : "backend disconnected";
  }

  setMode(mode) {
    this.running = ["running", "thinking"].includes(mode);
    this.querySelectorAll(".context-strip .chip").forEach((chip) => {
      if (chip.querySelector(".lbl")?.textContent === "mode") chip.querySelector(".val").textContent = mode;
    });
    const promptMode = this.querySelector(".prompt-meta .dim:nth-of-type(2)");
    if (promptMode) promptMode.textContent = mode;
    if (this.send) {
      this.send.textContent = this.running ? "stop" : "send";
      if (this.running) this.send.disabled = false;
      else this.updatePrompt();
    }
  }

  renderWorkspaces(workspaces) {
    const count = this.querySelector("[data-workspace-count]");
    if (count) count.textContent = `${workspaces.length} known`;
    const recentCard = this.querySelector(".picker-card:nth-of-type(2)");
    if (recentCard) {
      recentCard.querySelectorAll(".recent-row").forEach((row) => row.remove());
      for (const workspace of workspaces.slice(0, 4)) recentCard.append(this.createRecentWorkspace(workspace));
    }
    const section = this.querySelector(".sidebar .sb-section");
    if (section) {
      section.querySelectorAll(".workspace-group").forEach((group) => group.remove());
      const head = section.querySelector(".sb-head");
      let anchor = head;
      for (const workspace of workspaces) {
        const group = this.createWorkspaceGroup(workspace);
        anchor.insertAdjacentElement("afterend", group);
        anchor = group;
      }
    }
  }

  createRecentWorkspace(workspace) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "recent-row";
    row.dataset.workspace = workspace.id;
    row.setAttribute("aria-label", `open ${workspace.name}`);
    row.innerHTML = `<span class="glyph">▸</span><span class="ws-info"><span class="name"></span><span class="path"></span></span><span class="ws-stat"></span><span class="open-cta">open ↵</span>`;
    row.querySelector(".name").textContent = workspace.name;
    row.querySelector(".path").textContent = workspace.path;
    row.querySelector(".ws-stat").innerHTML = workspace.live ? `<span class="live">● live</span><span class="lbl">${workspace.sessionCount} sessions</span>` : `<span>${escapeHtml(workspace.lastUsed || "—")}</span><span class="lbl">${workspace.sessionCount} sessions</span>`;
    return row;
  }

  createWorkspaceGroup(workspace) {
    const group = document.createElement("div");
    group.className = "workspace-group";
    group.dataset.workspaceGroup = workspace.id;
    const open = workspace.id === this.dataset.activeWorkspaceId;
    group.innerHTML = `<div class="workspace-shell"><button type="button" class="ws-row ${open ? "open" : ""}" data-action="toggle-workspace" data-workspace="${escapeHtml(workspace.id)}" aria-expanded="${open}"><span class="caret">${open ? "▾" : "▸"}</span><span class="ws-stack"><span class="ws-name"><span class="dot"></span><span class="label"></span></span><span class="ws-path"></span></span><span class="ws-meta">${workspace.sessionCount}</span></button><button type="button" class="row-action danger" data-action="delete-workspace" data-workspace="${escapeHtml(workspace.id)}" title="remove workspace">×</button></div><div class="sessions"${open ? "" : " hidden"}><button type="button" class="session-row new-session-row" data-action="new-session" data-workspace="${escapeHtml(workspace.id)}"><span class="gutter">+</span><span class="title">new session</span><span class="meta">N</span></button></div>`;
    group.querySelector(".label").textContent = workspace.name;
    group.querySelector(".ws-path").textContent = workspace.path;
    group.querySelector(".dot").classList.toggle("live", !!workspace.live);
    const sessions = group.querySelector(".sessions");
    for (const session of workspace.sessions || []) sessions.append(this.createSessionRow(workspace.id, session));
    return group;
  }

  createSessionRow(workspaceId, session) {
    const row = document.createElement("div");
    const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    row.className = "session-row";
    row.dataset.session = session.id;
    row.dataset.workspace = workspaceId;
    row.dataset.title = session.title;
    row.innerHTML = `<button type="button" class="session-main" data-session="${escapeHtml(session.id)}" data-workspace="${escapeHtml(workspaceId)}" data-title="${escapeHtml(session.title)}"><span class="gutter"></span><span class="title"></span><span class="meta"></span></button><button type="button" class="session-menu-button" data-action="session-menu-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" aria-label="session actions">…</button><div class="session-menu" id="${menuId}" role="menu" hidden><button type="button" role="menuitem" data-action="rename-session">rename</button><button type="button" role="menuitem" class="danger" data-action="delete-session">delete</button></div>`;
    row.querySelector(".title").textContent = session.title;
    row.querySelector(".meta").textContent = session.lastUsed;
    row.querySelector(".meta").classList.toggle("live", !!session.live);
    row.classList.toggle("active", session.active || session.id === this.dataset.activeSessionId);
    return row;
  }

  renderMessages(messages) {
    if (!this.termInner) return;
    this.termInner.replaceChildren();
    for (const msg of messages) this.appendMessage(msg);
    this.scrollTerm();
  }

  appendMessage(msg) {
    if (!this.termInner || !msg) return;
    if (this.isDuplicateMessage(msg)) return;
    if (msg.kind !== "user") this.removeLoadingMessage();
    if (msg.kind === "tool") this.finalizeStreamingMessages();
    this.termInner.querySelector(`.msg.streaming[data-kind='${msg.kind}']`)?.remove();
    this.termInner.append(this.messageNode(msg));
    this.scrollTerm();
  }

  isDuplicateMessage(msg) {
    if (!["user", "pi", "think"].includes(msg.kind)) return false;
    const messages = [...this.termInner.querySelectorAll(".msg:not(.loading)")];
    const last = messages.at(-1);
    return last?.dataset.kind === msg.kind && last.querySelector(".body")?.textContent === msg.text;
  }

  appendDelta(payload) {
    if (!this.termInner || !payload?.delta) return;
    this.removeLoadingMessage();
    const kind = payload.kind === "think" ? "think" : "pi";
    let row = this.termInner.lastElementChild?.matches?.(`.msg.streaming[data-kind='${kind}']`) ? this.termInner.lastElementChild : null;
    if (!row) {
      row = this.simpleMessage(`${kind} streaming`, kind === "think" ? "…" : "pi >", "");
      row.classList.add("streaming");
      row.dataset.kind = kind;
      this.termInner.append(row);
    }
    const body = row.querySelector(".body");
    if (body) body.textContent += payload.delta;
    this.scrollTerm();
  }

  appendLoadingMessage() {
    if (!this.termInner || this.termInner.querySelector(".msg.loading")) return;
    const row = this.simpleMessage("pi loading", "pi >", "");
    row.querySelector(".body").innerHTML = `<span class="spinner">⠋</span><span>waiting for response…</span>`;
    row.classList.add("loading");
    row.dataset.kind = "loading";
    this.termInner.append(row);
    this.scrollTerm();
  }

  removeLoadingMessage() {
    this.termInner?.querySelector(".msg.loading")?.remove();
  }

  finalizeStreamingMessages() {
    this.termInner?.querySelectorAll(".msg.streaming").forEach((row) => row.classList.remove("streaming"));
  }

  messageNode(msg) {
    if (msg.kind === "banner") {
      const pre = document.createElement("pre");
      pre.className = "ascii-banner";
      pre.innerHTML = renderBannerBody(msg.text);
      return pre;
    }
    if (msg.kind === "user") return this.simpleMessage("user", "you >", msg.text);
    if (msg.kind === "think") {
      const row = this.simpleMessage("think", "…", "");
      row.querySelector(".body").innerHTML = `<div class="thinking-block"><span class="label">thinking</span>${escapeHtml(msg.text)}</div>`;
      return row;
    }
    if (msg.kind === "pi") {
      const row = this.simpleMessage("pi", "pi >", "");
      row.querySelector(".body").innerHTML = renderPiBody(msg.text);
      return row;
    }
    if (msg.kind === "tool") return this.toolCard(msg);
    return this.simpleMessage("pi", "pi >", JSON.stringify(msg));
  }

  simpleMessage(kind, prefix, text) {
    const row = document.createElement("div");
    row.className = "msg";
    row.dataset.kind = kind.split(" ")[0];
    row.innerHTML = `<div class="prefix ${kind}"></div><div class="body"></div>`;
    row.querySelector(".prefix").textContent = prefix;
    row.querySelector(".body").textContent = text;
    return row;
  }

  toolCard(msg) {
    const card = document.createElement("div");
    card.className = `tool-card ${msg.collapsedByDefault ? "collapsed" : ""}`.trim();
    card.dataset.tool = msg.tool || "tool";
    const collapsed = !!msg.collapsedByDefault;
    card.innerHTML = `<button type="button" class="tc-head" aria-expanded="${!collapsed}" data-action="toggle-tool"><span class="tc-glyph">●</span><span class="tc-name"></span><span class="tc-args"></span><span class="tc-meta"></span></button><div class="tc-body"${collapsed || !msg.body ? " hidden" : ""}></div>`;
    card.querySelector(".tc-name").textContent = msg.tool || "tool";
    card.querySelector(".tc-args").textContent = msg.args || "";
    card.querySelector(".tc-meta").innerHTML = this.toolStatus(msg);
    if (msg.body) card.querySelector(".tc-body").innerHTML = renderAnsiBody(msg.body);
    return card;
  }

  toolStatus(msg) {
    if (msg.status === "running") return `<span class="spinner">⠋</span><span style="color:var(--accent)">running</span><span class="tc-caret">▾</span>`;
    if (msg.status === "err") return `<span class="err">✗</span>${escapeHtml(msg.resultMeta || "failed")}<span class="tc-caret">▾</span>`;
    return `<span class="ok">✓</span>${msg.durationMs ? `${msg.durationMs} ms` : ""}${msg.resultMeta ? ` · ${escapeHtml(msg.resultMeta)}` : ""}<span class="tc-caret">▾</span>`;
  }

  appendToolOutput(payload) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === payload?.tool);
    const body = card?.querySelector(".tc-body");
    if (!body) return;
    body.hidden = false;
    body.textContent += `${body.textContent ? "\n" : ""}${payload.chunk || ""}`;
  }

  finishTool(msg) {
    const card = [...this.querySelectorAll(".tool-card")].reverse().find((item) => item.dataset.tool === msg?.tool);
    if (!card) {
      this.appendMessage(msg);
      return;
    }
    const next = this.toolCard(msg);
    card.replaceWith(next);
  }

  async browseFolder() {
    this.querySelector("[data-folder-browser]")?.removeAttribute("hidden");
    await this.loadFolder(this.currentFolder || "~");
  }

  async loadFolder(path = "~") {
    if (!this.apiConnected) {
      this.setConnection("err");
      return;
    }
    try {
      const listing = await listFolders(path || "~");
      this.currentFolder = listing.path;
      this.currentFolderParent = listing.parent || listing.path;
      const input = this.querySelector('[data-path-form] input[name="path"]');
      if (input) input.value = listing.path;
      const label = this.querySelector("[data-folder-path]");
      if (label) label.textContent = listing.displayPath || listing.path;
      const list = this.querySelector("[data-folder-list]");
      if (list) {
        list.replaceChildren();
        for (const folder of listing.folders || []) list.append(this.folderRow(folder));
        if (!listing.folders?.length) {
          const empty = document.createElement("div");
          empty.className = "folder-empty";
          empty.textContent = "no folders";
          list.append(empty);
        }
      }
    } catch {
      this.setConnection("err");
    }
  }

  folderRow(folder) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "folder-row";
    row.dataset.action = "folder-enter";
    row.dataset.path = folder.path;
    row.innerHTML = `<span>▸</span><span class="folder-name"></span><span class="folder-path"></span>`;
    row.querySelector(".folder-name").textContent = folder.name;
    row.querySelector(".folder-path").textContent = folder.displayPath || folder.path;
    return row;
  }

  async openWorkspacePath(path) {
    if (!path) return;
    await openWorkspace(path);
    const { workspaces } = await getWorkspaces();
    this.renderWorkspaces(workspaces || []);
    const workspace = (workspaces || []).find((item) => item.path === path) || workspaces?.[0];
    if (workspace) await this.openWorkspace(workspace.id);
  }

  async submitWorkspacePath(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input[name='path']");
    const path = input?.value.trim();
    if (!path) return;
    if (this.apiConnected) {
      try {
        await this.openWorkspacePath(path);
        return;
      } catch {
        this.setConnection("err");
      }
    }
    this.route("workspace");
  }

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
  }

  async cancelActiveSession() {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !this.apiConnected) return;
    try {
      await cancelSession(sessionId);
      this.setMode("cancelled");
    } catch {
      this.setConnection("err");
    }
  }

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
    if (action === "toggle-tree-node") this.toggleTreeNode(button);
    if (action === "open-file") this.openFile(button);
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
    if (action === "close-tweaks") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    if (!actionTarget?.closest(".session-menu") && action !== "session-menu-toggle" && button?.dataset.session) this.pickSession(button.closest(".session-row") || button);
    if (button?.dataset.workspace && button.classList.contains("recent-row")) this.openWorkspace(button.dataset.workspace);
    if (button?.dataset.seed) this.seed(button.dataset.seed);
    if (button?.dataset.skill) this.seed(`/skill ${button.dataset.skill}\n\n`);
    if (button?.dataset.slash) this.pickSlash(button.dataset.slash);
  }

  updateSessionTitle(session) {
    if (!session?.id) return;
    const row = this.querySelector(`[data-session='${session.id}']`);
    if (row) {
      row.dataset.title = session.title;
      const main = row.querySelector(".session-main");
      if (main) main.dataset.title = session.title;
      const title = row.querySelector(".title");
      if (title) title.textContent = session.title;
    }
    const activeTitle = this.querySelector("[data-active-session-title]");
    if (activeTitle && this.dataset.activeSessionId === session.id) {
      activeTitle.textContent = session.title;
      activeTitle.title = `${session.title} · ${session.id}`;
    }
  }

  autonameActiveSession(text) {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !text.trim()) return;
    const row = this.querySelector(`[data-session='${sessionId}']`);
    const current = row?.dataset.title?.trim();
    if (current && current !== "new session" && current !== "no session") return;
    const title = text.trim().replace(/\s+/g, " ").slice(0, 48) + (text.trim().length > 48 ? "…" : "");
    this.updateSessionTitle({ id: sessionId, title });
  }

  async deleteWorkspace(workspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    if (!confirm(`Remove workspace ${workspaceId} from this view?`)) return;
    try {
      await deleteWorkspaceRequest(workspaceId);
      const { workspaces } = await getWorkspaces();
      this.renderWorkspaces(workspaces || []);
    } catch {
      this.setConnection("err");
    }
  }

  async openWorkspace(workspaceId) {
    this.dataset.activeWorkspaceId = workspaceId;
    const workspaceName = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent || workspaceId;
    const activeWorkspace = this.querySelector("[data-active-workspace]");
    if (activeWorkspace) activeWorkspace.textContent = workspaceName;
    await this.loadWorkspaceMeta(workspaceId);
    this.route("workspace");
  }

  shortcut(event) {
    if (event.key === "Escape") this.closeModals();
  }

  route(route) {
    this.dataset.route = route;
    this.querySelector('[data-view="picker"]')?.toggleAttribute("hidden", route !== "picker");
    this.querySelector('[data-view="workspace"]')?.toggleAttribute("hidden", route !== "workspace");
    this.querySelector('[data-action="toggle-tree"]')?.toggleAttribute("hidden", route !== "workspace");
    if (route === "picker") this.querySelector('.picker-shell input[name="path"]')?.focus();
  }

  toggleTree() {
    const body = this.querySelector(".app-body");
    const tree = this.querySelector(".tree");
    const on = this.dataset.tree !== "on";
    this.dataset.tree = on ? "on" : "off";
    body?.classList.toggle("with-tree", on);
    body?.classList.toggle("tree-open", on);
    this.querySelector('[data-action="toggle-tree"]')?.classList.toggle("on", on);
    tree?.toggleAttribute("hidden", !on);
    this.applyGrid();
  }

  toggleTreeNode(button) {
    const branch = button.closest(".tree-branch");
    const children = branch?.querySelector(":scope > [data-tree-children]");
    if (!children) return;
    const open = children.hidden;
    children.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.querySelector(".caret").textContent = open ? "▾" : "▸";
    button.querySelector(".glyph").textContent = open ? "▾" : "▸";
  }

  collapseSidebar(collapsed) {
    this.dataset.sidebar = collapsed ? "collapsed" : "open";
    this.querySelector(".sidebar-wrap")?.toggleAttribute("hidden", collapsed);
    const expand = this.querySelector(".sb-expand-btn");
    if (expand) expand.style.display = collapsed ? "inline-flex" : "none";
    try { localStorage.setItem("pi.sb.collapsed", collapsed ? "1" : "0"); } catch {}
    this.applyGrid();
  }

  restoreSidebar() {
    if (this.dataset.sidebar === "collapsed") {
      this.collapseSidebar(true);
      return;
    }
    try { this.collapseSidebar(localStorage.getItem("pi.sb.collapsed") === "1"); } catch { this.applyGrid(); }
  }

  applyGrid(width = Number(this.dataset.sidebarWidth || 280)) {
    const body = this.querySelector(".app-body");
    if (!body) return;
    const tree = this.dataset.tree === "on";
    const collapsed = this.dataset.sidebar === "collapsed";
    body.style.gridTemplateColumns = collapsed ? (tree ? "1fr 260px" : "1fr") : (tree ? `${width}px 1fr 260px` : `${width}px 1fr`);
  }

  startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const start = Number(this.dataset.sidebarWidth || 280);
    const move = (moveEvent) => {
      const width = Math.min(480, Math.max(200, start + moveEvent.clientX - startX));
      this.dataset.sidebarWidth = String(width);
      this.applyGrid(width);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  toggleWorkspace(id) {
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      const open = group.dataset.workspaceGroup === id && sessions?.hidden;
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
      const caret = row?.querySelector(".caret");
      if (caret) caret.textContent = open ? "▾" : "▸";
    });
  }

  async openFile(button) {
    const path = button?.dataset.filePath;
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!path || !workspaceId || !this.apiConnected) return;
    try {
      const file = await getWorkspaceFile(workspaceId, path);
      this.attachmentContents.push(`File: ${file.path}\n\n${file.content}${file.truncated ? "\n\n[truncated]" : ""}`);
      this.addAttachmentChip(file.path, file.content.length);
    } catch {
      this.setConnection("err");
    }
  }

  async pickSession(row) {
    this.querySelectorAll(".session-row.active").forEach((item) => item.classList.remove("active"));
    row.classList.add("active");
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = row.dataset.title;
      title.title = `${row.dataset.title} · ${row.dataset.session}`;
    }
    this.showSessionMain();
    this.querySelector(".app-body")?.classList.remove("drawer-open");
    if (this.apiConnected) await this.loadSession(row.dataset.session);
    else this.dataset.activeSessionId = row.dataset.session;
    this.scrollTerm();
  }

  async renameSession(sessionId) {
    this.closeSessionMenus();
    if (!sessionId || !this.apiConnected) return;
    const current = this.querySelector(`[data-session='${sessionId}']`)?.dataset.title || "";
    const title = prompt("Rename session", current)?.trim();
    if (!title) return;
    try {
      const { session } = await renameSessionRequest(sessionId, title);
      const row = this.querySelector(`[data-session='${sessionId}']`);
      if (row) {
        row.dataset.title = session.title;
        const main = row.querySelector(".session-main");
        if (main) main.dataset.title = session.title;
        if (row.querySelector(".title")) row.querySelector(".title").textContent = session.title;
      }
      const activeTitle = this.querySelector("[data-active-session-title]");
      if (activeTitle && this.dataset.activeSessionId === sessionId) activeTitle.textContent = session.title;
    } catch {
      this.setConnection("err");
    }
  }

  async deleteSession(sessionId) {
    this.closeSessionMenus();
    if (!sessionId || !this.apiConnected) return;
    if (!confirm(`Delete session ${sessionId}? This removes the local JSONL file.`)) return;
    try {
      await deleteSessionRequest(sessionId);
      this.querySelector(`[data-session='${sessionId}']`)?.remove();
      if (this.dataset.activeSessionId === sessionId) {
        this.dataset.activeSessionId = "";
        this.renderMessages([]);
        this.showEmptyMain();
        this.querySelector("[data-active-session-title]").textContent = "no session";
      }
    } catch {
      this.setConnection("err");
    }
  }

  async newSession(workspace) {
    const workspaceId = workspace || this.dataset.activeWorkspaceId;
    if (this.apiConnected && workspaceId) {
      try {
        const { session } = await createSession(workspaceId);
        this.activateCreatedSession(workspaceId, session);
      } catch {
        this.setConnection("err");
      }
    }
    this.showEmptyMain();
    const label = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent || workspaceId || "workspace";
    const empty = this.querySelector("[data-empty-workspace]");
    const title = this.querySelector("[data-active-session-title]");
    if (empty) empty.textContent = label;
    if (title && !this.dataset.activeSessionId) title.textContent = "new session";
  }

  activateCreatedSession(workspaceId, session) {
    this.dataset.activeSessionId = session.id;
    this.querySelectorAll(".session-row.active").forEach((row) => row.classList.remove("active"));
    const group = this.querySelector(`[data-workspace-group='${workspaceId}'] .sessions`);
    if (group && !group.querySelector(`[data-session='${session.id}']`)) group.append(this.createSessionRow(workspaceId, session));
    group?.querySelector(`[data-session='${session.id}']`)?.classList.add("active");
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = session.title;
      title.title = `${session.title} · ${session.id}`;
    }
    this.renderMessages([]);
    this.connectEvents(session.id);
  }

  showSessionMain() {
    this.dataset.session = "active";
    this.querySelector("[data-main='session']")?.removeAttribute("hidden");
    this.querySelector("[data-main='empty']")?.setAttribute("hidden", "");
  }

  showEmptyMain() {
    this.dataset.session = "empty";
    this.querySelector("[data-main='session']")?.setAttribute("hidden", "");
    this.querySelector("[data-main='empty']")?.removeAttribute("hidden");
  }

  toggleSessionMenu(row) {
    if (!row) return;
    const menu = row.querySelector(".session-menu");
    const button = row.querySelector(".session-menu-button");
    const open = menu?.hidden;
    this.closeSessionMenus(row);
    menu?.toggleAttribute("hidden", !open);
    button?.setAttribute("aria-expanded", String(!!open));
  }

  closeSessionMenus(except) {
    this.querySelectorAll(".session-row").forEach((row) => {
      if (except && row === except) return;
      row.querySelector(".session-menu")?.setAttribute("hidden", "");
      row.querySelector(".session-menu-button")?.setAttribute("aria-expanded", "false");
    });
  }

  closeModals() {
    this.closeSessionMenus();
  }

  toggleTool(button) {
    const card = button.closest(".tool-card");
    const body = card?.querySelector(".tc-body");
    if (!card || !body) return;
    card.classList.toggle("collapsed", !body.hidden);
    body.hidden = !body.hidden;
    button.setAttribute("aria-expanded", String(!body.hidden));
    button.querySelector(".tc-caret").textContent = body.hidden ? "▸" : "▾";
  }

  updatePrompt() {
    if (!this.prompt || !this.send) return;
    const value = this.prompt.value;
    const hasAttachments = !!this.attachments?.children.length;
    this.send.disabled = !value.trim() && !hasAttachments;
    this.slash?.toggleAttribute("hidden", !(value.startsWith("/") && !value.includes("\n")));
    this.filterSlash(value);
    this.prompt.style.height = "auto";
    this.prompt.style.height = Math.min(180, this.prompt.scrollHeight) + "px";
  }

  seed(value) {
    if (!this.prompt) return;
    this.prompt.value = value;
    this.updatePrompt();
    this.prompt.focus();
  }

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
  }

  pickSlash(command) {
    this.seed(command + " ");
    this.slash?.setAttribute("hidden", "");
  }

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
  }

  async addFiles(files) {
    if (!this.attachments) return;
    for (const file of files || []) {
      const text = file.size <= 256 * 1024 ? await file.text() : "[file too large to inline]";
      this.attachmentContents.push(`File: ${file.name}\n\n${text}`);
      this.addAttachmentChip(file.name, file.size, file);
    }
    this.attachments.hidden = !this.attachments.children.length;
    this.updatePrompt();
  }

  addAttachmentChip(name, size, file) {
    const chip = document.createElement("span");
    chip.className = "attach-chip";
    chip.dataset.attachmentIndex = String(this.attachmentContents.length - 1);
    chip.innerHTML = `<span class="ac-glyph">${file ? this.kindGlyph(file) : "file"}</span><span class="ac-name"></span><span class="ac-size">${this.formatBytes(size)}</span><button class="ac-remove" type="button" data-remove-attachment aria-label="remove">×</button>`;
    chip.querySelector(".ac-name").textContent = name;
    this.attachments.append(chip);
  }

  kindGlyph(file) {
    if (file.type?.startsWith("image")) return "img";
    if (file.name.endsWith(".pdf")) return "pdf";
    if (/\.(js|ts|jsx|tsx|astro|py|go|rs)$/.test(file.name)) return "&lt;/&gt;";
    return "txt";
  }

  formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  scrollTerm() {
    requestAnimationFrame(() => {
      const term = this.querySelector(".term");
      if (term) term.scrollTop = term.scrollHeight;
    });
  }
}

if (!customElements.get("pi-app")) customElements.define("pi-app", PiApp);

export { PiApp };
