const qs = <T extends Element>(selector: string) => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
};

const qsa = <T extends Element>(selector: string) =>
  Array.from(document.querySelectorAll<T>(selector));

const shell = qs<HTMLElement>("[data-app-shell]");
const phone = qs<HTMLElement>(".phone-frame");
const terminalShell = qs<HTMLElement>("[data-terminal-shell]");
const terminalIdentity = qs<HTMLElement>("[data-terminal-identity]");
const title = qs<HTMLElement>("[data-active-title]");
const eyebrow = qs<HTMLElement>("[data-header-eyebrow]");
const state = qs<HTMLElement>("[data-agent-state]");
const scrim = qs<HTMLElement>("[data-scrim]");
const settings = qs<HTMLElement>("[data-settings-panel]");
const approval = qs<HTMLElement>("[data-approval-dialog]");
const workspaceDialog = qs<HTMLElement>("[data-workspace-dialog]");
const stateBox = qs<HTMLElement>("[data-state-box]");
const modelSelect = qs<HTMLSelectElement>("[data-model-select]");
const approvalSelect = qs<HTMLSelectElement>("[data-approval-select]");
const densitySelect = qs<HTMLSelectElement>("[data-density-select]");
const promptInput = qs<HTMLTextAreaElement>("[data-prompt-input]");
const promptForm = qs<HTMLFormElement>("[data-prompt-form]");
const pathInput = qs<HTMLInputElement>("[data-workspace-path]");
const settingsButtons = qsa<HTMLButtonElement>(
  '[data-action="toggle-settings"]',
);
const homeButtons = qsa<HTMLButtonElement>('[data-action="show-home"]');
const viewButtons = qsa<HTMLButtonElement>("[data-view-target]");

let activeDialog: HTMLElement | null = null;
let previouslyFocused: HTMLElement | null = null;

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const getFocusableControls = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (control) =>
      !control.hasAttribute("disabled") &&
      control.getAttribute("aria-hidden") !== "true" &&
      getComputedStyle(control).display !== "none" &&
      getComputedStyle(control).visibility !== "hidden",
  );

const setBackgroundInert = (dialog: HTMLElement | null) => {
  Array.from(phone.children).forEach((child) => {
    if (
      !(child instanceof HTMLElement) ||
      child === scrim ||
      child === dialog
    ) {
      return;
    }

    const inert = Boolean(dialog);
    (child as HTMLElement & { inert: boolean }).inert = inert;
    if (inert) {
      child.setAttribute("aria-hidden", "true");
    } else {
      child.removeAttribute("aria-hidden");
    }
  });
};

const sendTerminalInput = (data: string) => {
  window.dispatchEvent(
    new CustomEvent("pi-terminal:send", { detail: { data } }),
  );
};

const reconnectTerminal = (action = "start") => {
  window.dispatchEvent(
    new CustomEvent("pi-terminal:reconnect", { detail: { action } }),
  );
};

const setView = (view: string) => {
  phone.dataset.view = view;
  qsa<HTMLElement>("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== view;
  });
  viewButtons.forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  homeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(view === "home"));
  });
};

const setExclusiveActive = (
  selector: string,
  target: HTMLElement,
  attribute: "aria-pressed" | "aria-current",
) => {
  qsa<HTMLElement>(selector).forEach((item) => {
    item.classList.toggle("active", item === target);
    if (item === target) {
      item.setAttribute(attribute, "true");
    } else {
      item.removeAttribute(attribute);
      if (attribute === "aria-pressed") item.setAttribute(attribute, "false");
    }
  });
};

const openDialog = (dialog: HTMLElement) => {
  if (!activeDialog) {
    previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }
  if (activeDialog && activeDialog !== dialog) activeDialog.hidden = true;
  activeDialog = dialog;
  dialog.hidden = false;
  dialog.setAttribute("tabindex", "-1");
  scrim.hidden = false;
  setBackgroundInert(dialog);
  settingsButtons.forEach((button) => {
    button.setAttribute("aria-expanded", String(dialog === settings));
  });
  const firstControl = getFocusableControls(dialog)[0];
  (firstControl ?? dialog).focus();
};

const closeDialog = (dialog?: HTMLElement) => {
  const target = dialog ?? activeDialog;
  if (target) target.hidden = true;
  activeDialog = null;
  scrim.hidden = true;
  setBackgroundInert(null);
  settingsButtons.forEach((button) =>
    button.setAttribute("aria-expanded", "false"),
  );
  if (previouslyFocused?.isConnected) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
};

const updateSettings = () => {
  stateBox.textContent = `${modelSelect.value} · ${approvalSelect.value} · ${densitySelect.value} density`;
  eyebrow.textContent = `live · ${modelSelect.value}:high · 12.3k ctx`;
};

const flashKey = (button: HTMLButtonElement) => {
  button.classList.add("pressed");
  window.setTimeout(() => button.classList.remove("pressed"), 180);
};

// @MX:WARN: [AUTO] Central event delegation still owns compact shell controls around live terminal.
// @MX:REASON: Shell buttons, dialogs, and terminal CustomEvents share one mobile frame; backend integration must not reintroduce mock transcript writes.
shell.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("button");
  if (!button) return;

  if (button.dataset.viewTarget) {
    setView(button.dataset.viewTarget);
  }

  if (button.dataset.action === "show-home") {
    setView("home");
    title.textContent = "Pi Web / workspace home";
    state.textContent = "ready";
  }

  if (button.dataset.workspace) {
    setExclusiveActive("[data-workspace]", button, "aria-pressed");
    title.textContent = `${button.dataset.name} / sessions`;
    state.textContent = "workspace";
    terminalShell.dataset.workspaceId = button.dataset.workspace;
    terminalShell.dataset.workspacePath = button.dataset.path ?? ".";
    terminalIdentity.textContent = `${button.dataset.name} / sessions`;
    setView("sessions");
  }

  if (button.dataset.tmuxAttachAction) {
    terminalShell.dataset.terminalMode = "tmux";
    terminalShell.dataset.tmuxAction = "attach";
    window.dispatchEvent(
      new CustomEvent("pi-terminal:attach", {
        detail: {
          name: button.dataset.tmuxAttachAction,
          sessionId: button.dataset.tmuxAttachIdentity,
        },
      }),
    );
    state.textContent = "attaching";
    setView("terminal");
  }

  if (button.dataset.tmuxKillAction) {
    window.dispatchEvent(
      new CustomEvent("pi-terminal:kill", {
        detail: { name: button.dataset.tmuxKillAction },
      }),
    );
    state.textContent = "killing";
  }

  if (button.dataset.session) {
    setExclusiveActive("[data-session]", button, "aria-current");
    const activeWorkspace = qs<HTMLElement>("[data-workspace].active");
    title.textContent = `${activeWorkspace.dataset.name} / ${button.dataset.session}`;
    state.textContent = button.dataset.state ?? "ready";
    terminalShell.dataset.sessionId = button.dataset.session;
    terminalShell.dataset.terminalMode = "tmux";
    terminalShell.dataset.tmuxAction = "start";
    terminalIdentity.textContent = `${activeWorkspace.dataset.name} / ${button.dataset.session}`;
    setView("terminal");
    reconnectTerminal();
  }

  if (button.dataset.action === "toggle-settings") {
    settings.hidden ? openDialog(settings) : closeDialog(settings);
  }

  if (button.dataset.action === "new-workspace") {
    openDialog(workspaceDialog);
  }

  if (button.dataset.recentPath) {
    pathInput.value = button.dataset.recentPath;
  }

  if (button.dataset.action === "open-workspace") {
    closeDialog(workspaceDialog);
    title.textContent = "new workspace / sessions";
    state.textContent = "workspace";
    terminalShell.dataset.workspacePath = pathInput.value;
    terminalIdentity.textContent = "new workspace / sessions";
    setView("sessions");
  }

  if (button.dataset.action === "close-workspace") {
    closeDialog(workspaceDialog);
  }

  if (button.dataset.action === "run-tool") {
    openDialog(approval);
    state.textContent = "approval";
  }

  if (button.dataset.action === "close-approval") {
    closeDialog(approval);
  }

  if (button.dataset.action === "approve-change") {
    closeDialog(approval);
    state.textContent = "approved";
  }

  if (button.dataset.action === "reject-change") {
    closeDialog(approval);
    state.textContent = "rejected";
  }

  if (button.dataset.key) {
    flashKey(button);
    const keyMap: Record<string, string> = {
      left: "\u001b[D",
      down: "\u001b[B",
      up: "\u001b[A",
      right: "\u001b[C",
      escape: "\u001b",
      enter: "\r",
    };
    sendTerminalInput(keyMap[button.dataset.key] ?? "");
    if (button.dataset.key === "escape") closeDialog();
  }
});

scrim.addEventListener("click", () => closeDialog());

document.addEventListener("keydown", (event) => {
  if (!activeDialog) return;

  if (event.key === "Escape") {
    closeDialog();
    return;
  }

  if (event.key !== "Tab") return;

  const controls = getFocusableControls(activeDialog);
  if (controls.length === 0) {
    event.preventDefault();
    activeDialog.focus();
    return;
  }

  const firstControl = controls[0];
  const lastControl = controls[controls.length - 1];
  const current = document.activeElement;

  if (!activeDialog.contains(current)) {
    event.preventDefault();
    firstControl.focus();
    return;
  }

  if (event.shiftKey && current === firstControl) {
    event.preventDefault();
    lastControl.focus();
  } else if (!event.shiftKey && current === lastControl) {
    event.preventDefault();
    firstControl.focus();
  }
});

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = promptInput.value.trim();
  if (!value) return;
  sendTerminalInput(`${value}\r`);
  promptInput.value = "";
  state.textContent = "live";
  setView("terminal");
});

[modelSelect, approvalSelect, densitySelect].forEach((select) => {
  select.addEventListener("change", updateSettings);
});

setView("terminal");
