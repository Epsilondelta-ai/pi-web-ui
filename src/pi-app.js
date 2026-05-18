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
    this.bind();
    this.restoreSidebar();
    this.updatePrompt();
    this.scrollTerm();
  }

  bind() {
    this.addEventListener("click", (event) => this.click(event));
    this.querySelector("[data-path-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.route("workspace");
    });
    this.prompt?.addEventListener("input", () => this.updatePrompt());
    this.prompt?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") this.submitPrompt();
      if (this.slash && !this.slash.hidden && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) this.navigateList(event, ".slash-item", (item) => this.pickSlash(item.dataset.slash));
    });
    this.attach?.addEventListener("click", () => this.file?.click());
    this.file?.addEventListener("change", () => this.addFiles(this.file.files));
    this.querySelector(".sb-resizer")?.addEventListener("pointerdown", (event) => this.startResize(event));
    window.addEventListener("keydown", (event) => this.shortcut(event));
    window.addEventListener("message", (event) => {
      if (event.data?.type === "__activate_edit_mode") this.querySelector("[data-tweaks]")?.removeAttribute("hidden");
      if (event.data?.type === "__deactivate_edit_mode") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    });
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
  }

  click(event) {
    const remove = event.target.closest("[data-remove-attachment]");
    if (remove) {
      remove.closest(".attach-chip")?.remove();
      this.updatePrompt();
      return;
    }
    const button = event.target.closest("button");
    if (!button || !this.contains(button)) return;
    const action = button.dataset.action;
    if (action === "route-picker") this.route("picker");
    if (action === "route-workspace") this.route("workspace");
    if (action === "toggle-tree") this.toggleTree();
    if (action === "toggle-tree-node") this.toggleTreeNode(button);
    if (action === "collapse-sidebar") this.collapseSidebar(true);
    if (action === "expand-sidebar") this.collapseSidebar(false);
    if (action === "open-drawer") this.querySelector(".app-body")?.classList.add("drawer-open");
    if (action === "close-drawer") this.querySelector(".app-body")?.classList.remove("drawer-open");
    if (action === "toggle-tool") this.toggleTool(button);
    if (action === "toggle-workspace") this.toggleWorkspace(button.dataset.workspace);
    if (action === "new-session") this.newSession(button.dataset.workspace);
    if (action === "close-tweaks") this.querySelector("[data-tweaks]")?.setAttribute("hidden", "");
    if (button.dataset.session) this.pickSession(button);
    if (button.dataset.workspace && button.classList.contains("recent-row")) this.route("workspace");
    if (button.dataset.seed) this.seed(button.dataset.seed);
    if (button.dataset.skill) this.seed(`/skill ${button.dataset.skill}\n\n`);
    if (button.dataset.slash) this.pickSlash(button.dataset.slash);
  }

  shortcut(event) {
    const meta = event.metaKey || event.ctrlKey;
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

  pickSession(button) {
    this.querySelectorAll(".session-row.active").forEach((row) => row.classList.remove("active"));
    button.classList.add("active");
    const title = this.querySelector("[data-active-session-title]");
    if (title) title.textContent = button.dataset.title;
    this.querySelector("[data-main='session']")?.removeAttribute("hidden");
    this.querySelector("[data-main='empty']")?.setAttribute("hidden", "");
    this.querySelector(".app-body")?.classList.remove("drawer-open");
    this.scrollTerm();
  }

  newSession(workspace) {
    this.querySelector("[data-main='session']")?.setAttribute("hidden", "");
    this.querySelector("[data-main='empty']")?.removeAttribute("hidden");
    const label = this.querySelector(`[data-workspace='${workspace}'] .label`)?.textContent || workspace || "workspace";
    const empty = this.querySelector("[data-empty-workspace]");
    const title = this.querySelector("[data-active-session-title]");
    if (empty) empty.textContent = label;
    if (title) title.textContent = "new session";
  }

  closeModals() {}

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
    const items = [...this.querySelectorAll(selector)];
    if (!items.length) return;
    let index = Math.max(0, items.findIndex((item) => item.classList.contains("selected")));
    if (event.key === "ArrowDown") index = Math.min(items.length - 1, index + 1);
    if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    items.forEach((item) => item.classList.remove("selected"));
    items[index].classList.add("selected");
    items[index].scrollIntoView({ block: "nearest" });
    if (event.key === "Enter") run(items[index]);
  }

  addFiles(files) {
    if (!this.attachments) return;
    for (const file of files || []) {
      const chip = document.createElement("span");
      chip.className = "attach-chip";
      chip.innerHTML = `<span class="ac-glyph">${this.kindGlyph(file)}</span><span class="ac-name"></span><span class="ac-size">${this.formatBytes(file.size)}</span><button class="ac-remove" type="button" data-remove-attachment aria-label="remove">×</button>`;
      chip.querySelector(".ac-name").textContent = file.name;
      this.attachments.append(chip);
    }
    this.attachments.hidden = !this.attachments.children.length;
    this.updatePrompt();
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

  submitPrompt() {
    if (this.prompt) this.prompt.value = "";
    this.attachments?.replaceChildren();
    if (this.attachments) this.attachments.hidden = true;
    this.updatePrompt();
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
