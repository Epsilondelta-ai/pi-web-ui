import { readFileSync } from "node:fs";

const html = readFileSync("src/components/AppShell.astro", "utf8");
const appShell = readFileSync("src/scripts/app-shell.ts", "utf8");
const terminalClient = readFileSync("src/scripts/terminal-client.ts", "utf8");

const checks = [
  [
    html.includes("data-tmux-detached-state"),
    "detached state DOM marker exists",
  ],
  [
    html.includes("data-tmux-attach-action") &&
      appShell.includes("pi-terminal:attach"),
    "attach action dispatch exists",
  ],
  [
    html.includes("data-tmux-kill-action") &&
      appShell.includes("pi-terminal:kill"),
    "kill action dispatch exists",
  ],
  [
    terminalClient.includes('terminalState !== "detached"') &&
      terminalClient.includes(
        'setState("detached", "persistent tmux session detached")',
      ),
    "tmux reconnect close path stays detached without error",
  ],
  [
    terminalClient.includes("term.write(message.data)") &&
      !terminalClient.includes("innerHTML"),
    "terminal output uses xterm without innerHTML",
  ],
  [
    terminalClient.includes("dataset.tmuxAttachIdentity = session.identity") &&
      appShell.includes("sessionId: button.dataset.tmuxAttachIdentity") &&
      terminalClient.includes("identity.startsWith(`${workspaceId}-`)") &&
      !terminalClient.includes('startsWith("piweb-")'),
    "attach strips workspace identity without hardcoded managed prefix",
  ],
  [
    terminalClient.includes("const boot = async () =>") &&
      terminalClient.includes(
        'setState("detached", "existing tmux session available to attach")',
      ) &&
      terminalClient.includes("void boot();") &&
      !terminalClient.includes("\n  connect();\n}"),
    "boot offers existing tmux sessions before starting new one",
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, label]) => label);
if (failures.length > 0) {
  console.error(`Frontend contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Frontend contract passed (${checks.length} checks).`);
