import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type TerminalEventName =
  | "terminal.started"
  | "terminal.resized"
  | "terminal.closed"
  | "terminal.rejected"
  | "terminal.error";

type ServerMessage =
  | { type: "output"; data: string }
  | { type: "event"; event: TerminalEventName; code?: string };

const shell = document.querySelector<HTMLElement>("[data-terminal-shell]");
const mount = document.querySelector<HTMLElement>("[data-terminal-mount]");
const statusText = document.querySelector<HTMLElement>(
  "[data-terminal-status]",
);
const errorText = document.querySelector<HTMLElement>("[data-terminal-error]");
const agentState = document.querySelector<HTMLElement>("[data-terminal-state]");

if (shell && mount && statusText && errorText && agentState) {
  let socket: WebSocket | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const fitAddon = new FitAddon();
  const term = new Terminal({
    allowProposedApi: false,
    convertEol: false,
    cursorBlink: true,
    fontFamily:
      '"JetBrains Mono", "Monaspace Neon", "SF Mono", "Cascadia Code", "Fira Code", Menlo, Consolas, ui-monospace, monospace',
    fontSize: 12,
    lineHeight: 1.25,
    scrollback: 4000,
    theme: {
      background: "#0a0a0a",
      foreground: "#d4d4d4",
      cursor: "#00ff88",
      black: "#000000",
      green: "#00ff88",
      brightGreen: "#00ff88",
      cyan: "#5af2ff",
      yellow: "#ffb86c",
      red: "#ff6b6b",
    },
  });

  term.loadAddon(fitAddon);
  mount.replaceChildren();
  term.open(mount);
  fitAddon.fit();

  const setState = (state: string, detail = "") => {
    shell.dataset.connectionState = state;
    statusText.textContent = state;
    agentState.textContent = state;
    errorText.textContent = detail;
  };

  const terminalURL = () => {
    const workspaceId = encodeURIComponent(
      shell.dataset.workspaceId ?? "pi-web-ui",
    );
    const sessionId = encodeURIComponent(
      shell.dataset.sessionId ?? "frontend-first",
    );
    const workspace = encodeURIComponent(shell.dataset.workspacePath ?? ".");
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}/api/terminals/${workspaceId}/sessions/${sessionId}?workspace=${workspace}`;
  };

  const sendJSON = (value: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(value));
    }
  };

  const sendResize = () => {
    const { cols, rows } = term;
    if (cols > 0 && rows > 0) {
      sendJSON({ type: "resize", cols, rows });
    }
  };

  // @MX:NOTE: [AUTO] xterm.js owns ANSI interpretation; terminal bytes are passed to term.write only.
  const handleServerMessage = (message: ServerMessage) => {
    if (message.type === "output") {
      term.write(message.data);
      return;
    }

    if (message.type !== "event") return;

    switch (message.event) {
      case "terminal.started":
        setState("live", "connected to local pi process");
        sendResize();
        break;
      case "terminal.resized":
        setState("live", "terminal resized");
        break;
      case "terminal.closed":
        setState("closed", "terminal session closed");
        break;
      case "terminal.rejected":
        setState("rejected", message.code ?? "session rejected");
        break;
      case "terminal.error":
        setState("error", message.code ?? "terminal protocol error");
        break;
    }
  };

  const connect = () => {
    if (socket) {
      socket.close();
      socket = null;
    }
    term.reset();
    setState("connecting", "connecting to local Go backend");
    socket = new WebSocket(terminalURL());
    const currentSocket = socket;

    socket.addEventListener("open", () => {
      fitAddon.fit();
      sendResize();
    });

    socket.addEventListener("message", (event) => {
      if (socket !== currentSocket) return;
      try {
        const data = JSON.parse(String(event.data)) as ServerMessage;
        handleServerMessage(data);
      } catch {
        setState("error", "malformed backend message");
      }
    });

    socket.addEventListener("close", () => {
      if (socket !== currentSocket) return;
      if (shell.dataset.connectionState !== "closed") {
        setState("closed", "terminal websocket closed");
      }
    });

    socket.addEventListener("error", () => {
      if (socket !== currentSocket) return;
      setState("error", "local Go backend unreachable or rejected connection");
    });
  };

  term.onData((data) => sendJSON({ type: "input", data }));
  term.onResize(({ cols, rows }) => sendJSON({ type: "resize", cols, rows }));

  resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    sendResize();
  });
  resizeObserver.observe(mount);

  window.addEventListener("pi-terminal:send", (event) => {
    const detail = (event as CustomEvent<{ data: string }>).detail;
    if (detail?.data) {
      sendJSON({ type: "input", data: detail.data });
      term.focus();
    }
  });

  window.addEventListener("pi-terminal:reconnect", () => connect());
  window.addEventListener("beforeunload", () => {
    resizeObserver?.disconnect();
    socket?.close();
  });

  connect();
}
