import { cloneWorkspace as cloneWorkspaceRequest, deleteWorkspace as deleteWorkspaceRequest, getGitStatus, getSession, getWorkspaceCommands, getWorkspaceFiles, getWorkspaceRuntimeStatus, getWorkspaces, listFolders, openWorkspace as openWorkspaceRequest } from "../api.js";
import { escapeHtml, renderTree } from "../renderers.js";

export const workspaceMethods = {
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
      if (this.dataset.route === "picker") await this.browseFolder();
      if (activeWorkspace) {
        void this.loadWorkspaceCommands(activeWorkspace.id);
        void this.loadRuntimeStatus(activeWorkspace.id);
        await this.loadWorkspaceMeta(activeWorkspace.id);
      }
      if (activeSession) await this.loadSession(activeSession.id);
    } catch {
      this.apiConnected = false;
      this.setConnection("err");
    }
  },

  async loadWorkspaceMeta(workspaceId) {
    try {
      const [{ files }, git] = await Promise.all([getWorkspaceFiles(workspaceId), getGitStatus(workspaceId)]);
      const list = this.querySelector(".tree-list");
      if (list && files) {
        list.innerHTML = `${renderTree(files)}<div style="padding:8px 16px;color:var(--fg-4);font-size:11px;font-style:italic">tip: pi watches the tree · changes appear here.</div>`;
      }
      const status = this.querySelector("[data-git-status]");
      if (status && git) status.textContent = `${git.branch} · ${git.dirty} ✱`;
      if (git?.branch) this.updatePromptMeta({ currentBranch: git.branch });
    } catch {}
  },

  async loadWorkspaceCommands(workspaceId) {
    try {
      const { commands } = await getWorkspaceCommands(workspaceId);
      this.renderSlashCommands(commands || []);
    } catch {}
  },

  async loadRuntimeStatus(workspaceId = this.dataset.activeWorkspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeStatus(workspaceId);
      if (status) this.updatePromptMeta(status);
    } catch {}
  },

  async refreshTree() {
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!workspaceId || !this.apiConnected) return;
    const button = this.querySelector("[data-action='refresh-tree']");
    if (button) button.disabled = true;
    try {
      await this.loadWorkspaceMeta(workspaceId);
    } finally {
      if (button) button.disabled = false;
    }
  },

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
  },

  renderWorkspaces(workspaces) {
    const count = this.querySelector("[data-workspace-count]");
    if (count) count.textContent = `${workspaces.length} known`;
    const recentCard = this.querySelector("[data-recent-workspaces]");
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
  },

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
  },

  createWorkspaceGroup(workspace) {
    const group = document.createElement("div");
    group.className = "workspace-group";
    group.dataset.workspaceGroup = workspace.id;
    const open = workspace.id === this.dataset.activeWorkspaceId;
    group.innerHTML = `<div class="workspace-shell"><button type="button" class="ws-row ${open ? "open" : ""}" data-action="toggle-workspace" data-workspace="${escapeHtml(workspace.id)}" aria-expanded="${open}"><span class="caret">${open ? "▾" : "▸"}</span><span class="ws-stack"><span class="ws-name"><span class="dot"></span><span class="label"></span></span><span class="ws-path"></span></span><span class="ws-meta">${workspace.sessionCount}</span></button><button type="button" class="row-action danger" data-action="delete-workspace" data-workspace="${escapeHtml(workspace.id)}" title="remove workspace">×</button></div><div class="sessions"${open ? "" : " hidden"}></div>`;
    group.querySelector(".label").textContent = workspace.name;
    group.querySelector(".ws-path").textContent = workspace.path;
    group.querySelector(".dot").classList.toggle("live", !!workspace.live);
    const sessions = group.querySelector(".sessions");
    for (const session of workspace.sessions || []) sessions.append(this.createSessionRow(workspace.id, session));
    sessions.append(this.createNewSessionRow(workspace.id));
    return group;
  },

  createNewSessionRow(workspaceId) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-row new-session-row";
    row.dataset.action = "new-session";
    row.dataset.workspace = workspaceId;
    row.innerHTML = `<span class="title">+ new session</span>`;
    return row;
  },

  async browseFolder() {
    this.querySelector("[data-folder-browser]")?.removeAttribute("hidden");
    await this.loadFolder(this.currentFolder || "~");
  },

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
  },

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
  },

  async openWorkspacePath(path) {
    if (!path) return;
    await openWorkspaceRequest(path);
    const { workspaces } = await getWorkspaces();
    this.renderWorkspaces(workspaces || []);
    const workspace = (workspaces || []).find((item) => item.path === path) || workspaces?.[0];
    if (workspace) await this.openWorkspace(workspace.id);
  },

  async submitCloneWorkspace(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const gitUrl = form.querySelector("input[name='gitUrl']")?.value.trim();
    const name = form.querySelector("input[name='name']")?.value.trim() || "";
    if (!gitUrl || !this.apiConnected) return;
    const button = form.querySelector("button[type='submit']");
    if (button) button.disabled = true;
    try {
      const cloned = await cloneWorkspaceRequest(this.currentFolder || "~", gitUrl, name);
      form.reset();
      const { workspaces } = await getWorkspaces();
      this.renderWorkspaces(workspaces || []);
      const workspace = cloned.workspace || workspaces?.[0];
      if (workspace) await this.openWorkspace(workspace.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      this.setConnection("err");
    } finally {
      if (button) button.disabled = false;
    }
  },

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
  },

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
  },

  async openWorkspace(workspaceId) {
    this.dataset.activeWorkspaceId = workspaceId;
    const workspaceName = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent || workspaceId;
    const activeWorkspace = this.querySelector("[data-active-workspace]");
    if (activeWorkspace) activeWorkspace.textContent = workspaceName;
    void this.loadWorkspaceCommands(workspaceId);
    void this.loadRuntimeStatus(workspaceId);
    await this.loadWorkspaceMeta(workspaceId);
    this.route("workspace");
  },

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
  },
};
