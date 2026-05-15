import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync("dist/index.html", "utf8");
const appShellSource = readFileSync("src/components/AppShell.astro", "utf8");
const scriptSource = readFileSync("src/scripts/app-shell.ts", "utf8");
const terminalClientSource = readFileSync(
  "src/scripts/terminal-client.ts",
  "utf8",
);
const packageSource = readFileSync("package.json", "utf8");
const tokenSource = readFileSync("src/styles/tokens.css", "utf8");
const layoutSource = readFileSync("src/layouts/BaseLayout.astro", "utf8");
const globalSource = readFileSync("src/styles/global.css", "utf8");
const appShellCssSource = readFileSync("src/styles/app-shell.css", "utf8");
const cssDir = "dist/_astro";
const css = existsSync(cssDir)
  ? readdirSync(cssDir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(cssDir, file), "utf8"))
      .join("\n")
  : "";

const checks = [
  [html.includes('lang="en"'), "document lang is en"],
  [
    layoutSource.includes("viewport-fit=cover"),
    "viewport includes viewport-fit=cover",
  ],
  [html.includes("data-app-shell"), "app shell landmark exists in build"],
  [html.includes("phone-frame"), "phone frame exists in build"],
  [html.includes("ios-status"), "iOS status bar exists in build"],
  [html.includes('data-screen="home"'), "workspace home screen exists"],
  [html.includes('data-screen="sessions"'), "sessions screen exists"],
  [html.includes('aria-label="Agent terminal"'), "terminal screen exists"],
  [html.includes("data-terminal-shell"), "live terminal shell exists"],
  [html.includes("data-terminal-mount"), "xterm mount exists"],
  [html.includes("data-terminal-status"), "terminal status label exists"],
  [html.includes("data-tmux-session-list"), "tmux session list marker exists"],
  [
    html.includes("data-tmux-detached-state"),
    "tmux detached state marker exists",
  ],
  [
    html.includes("data-tmux-attach-action"),
    "tmux attach action marker exists",
  ],
  [html.includes("data-tmux-kill-action"), "tmux kill action marker exists"],
  [
    html.includes("data-mock-transcript-disabled"),
    "live mode disables mock transcript marker",
  ],
  [html.includes("data-prompt-input"), "editable textarea prompt exists"],
  [
    appShellSource.includes("<textarea") && appShellSource.includes("&gt;"),
    "prompt uses textarea with > prefix",
  ],
  [html.includes("data-key"), "keypad controls exist"],
  [
    packageSource.includes("@xterm/xterm") &&
      packageSource.includes("@xterm/addon-fit"),
    "xterm dependencies are declared",
  ],
  [
    terminalClientSource.includes("new Terminal") &&
      terminalClientSource.includes("new FitAddon"),
    "terminal client uses xterm.js and FitAddon",
  ],
  [
    terminalClientSource.includes("term.write(message.data)") &&
      !terminalClientSource.includes("innerHTML"),
    "terminal bytes go to xterm without raw HTML injection",
  ],
  [
    terminalClientSource.includes('"terminal.detached"') &&
      terminalClientSource.includes("pi-terminal:attach") &&
      terminalClientSource.includes("/api/tmux/sessions"),
    "terminal client handles tmux detach, attach, and kill lifecycle",
  ],
  [
    !scriptSource.includes("appendMessage") &&
      scriptSource.includes("pi-terminal:send"),
    "app shell sends live terminal input instead of appending mock rows",
  ],
  [
    scriptSource.includes("tmuxAttachAction") &&
      scriptSource.includes("tmuxKillAction"),
    "app shell wires tmux attach and kill actions",
  ],
  [html.includes("data-workspace-dialog"), "workspace bottom sheet exists"],
  [html.includes("data-approval-dialog"), "approval modal exists"],
  [html.includes("diff-preview"), "approval diff preview exists"],
  [html.includes("data-settings-panel"), "settings mobile overlay exists"],
  [
    appShellSource.includes('role="dialog"') &&
      appShellSource.includes('aria-modal="true"'),
    "dialogs have accessible modal semantics",
  ],
  [
    scriptSource.includes("aria-pressed") &&
      scriptSource.includes("aria-current"),
    "script updates active ARIA states",
  ],
  [
    scriptSource.includes("previouslyFocused") &&
      scriptSource.includes("getFocusableControls") &&
      scriptSource.includes('event.key !== "Tab"'),
    "modal focus trap and restore logic exists",
  ],
  [
    scriptSource.includes("setBackgroundInert") &&
      scriptSource.includes(".inert"),
    "background inert handling exists while modal is open",
  ],
  [tokenSource.includes("--shadow-modal"), "modal shadow token exists"],
  [
    appShellCssSource.includes("max-height: 640px") &&
      appShellCssSource.includes("orientation: landscape") &&
      appShellCssSource.includes("overflow: auto"),
    "small landscape viewport fit rule exists",
  ],
  [
    globalSource.includes("select {") || globalSource.includes("select\n"),
    "select participates in font reset",
  ],
  [
    tokenSource.includes('"JetBrains Mono"') &&
      !tokenSource.includes("@import url"),
    "local/system font stack keeps JetBrains first without import",
  ],
  [
    !html.includes("fonts.googleapis.com") &&
      !css.includes("fonts.googleapis.com") &&
      !tokenSource.includes("fonts.googleapis.com") &&
      !tokenSource.includes("@import url"),
    "no external Google Fonts import in build or source",
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, label]) => label);

if (failures.length > 0) {
  console.error(`Smoke check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Smoke check passed (${checks.length} checks).`);
