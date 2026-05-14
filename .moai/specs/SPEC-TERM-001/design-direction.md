# Design Direction: SPEC-TERM-001 Real Terminal Rendering

## Intent Statement

Pi Web terminal rendering is for a solo developer controlling a local coding agent from a browser. The UI must feel like a real terminal inside the existing PiFrame, not a chat transcript pretending to be a terminal. It should preserve trust: what appears in browser equals what `pi` emits in a local terminal.

## Human, Goal, Feeling

- Human: developer already comfortable with terminals, but using a phone-first/browser control shell.
- Goal: view and control a live `pi` session without losing terminal fidelity.
- Feeling: direct, dense, local, safe, and reversible.

## Domain Concepts

1. **Live terminal surface**: xterm.js area is the source of truth for `pi` output.
2. **Session boundary**: each terminal belongs to one workspace/session.
3. **Input path**: keyboard, paste, and mobile keypad all become terminal input.
4. **Resize contract**: visible terminal size and PTY size stay synchronized.
5. **Safety rail**: connection, workspace, and command constraints are visible in status UI.
6. **Local trust**: UI communicates localhost/local-agent context clearly.
7. **No transcript illusion**: chat-like demo rows must not replace live terminal rendering.

## Color World

Use existing tokens from `.moai/design/tokens.json` and `src/styles/tokens.css`:

- Background: black base `#000000`, surface `#0a0a0a`, raised `#111111`.
- Primary accent: ANSI green `#00ff88` for live/ready/connected.
- Tool/activity accent: amber `#ffb86c` for tool execution or command status.
- Info accent: cyan `#5af2ff` for connection and resize metadata.
- Danger accent: red `#ff6b6b` for rejected connection, invalid workspace, or blocked command.

## Typography and Density

- Use monospace stack already defined in `src/styles/tokens.css`.
- xterm.js font settings must visually align with the existing terminal shell.
- Preserve compact density. Terminal text should not be enlarged into card-like chat UI.
- Mobile frame must prioritize terminal rows over decorative chrome.

## Signature Element

**Live PiFrame Terminal**: the existing 375×812 phone shell contains a real terminal emulator whose cursor, colors, input, and resize behavior match a local `pi` terminal. Connection state appears in the run HUD; terminal bytes appear only inside the xterm surface.

## Defaults to Avoid

- Avoid hand-written ANSI parsing.
- Avoid rendering terminal output through `innerHTML` or markdown.
- Avoid chat-message cards as the primary live output.
- Avoid global page scroll stealing terminal scroll.
- Avoid hidden connection failure; terminal must show connected, reconnecting, closed, or rejected state.
- Avoid exposing a network-reachable command runner by default.

## UX Rules

1. The terminal screen must mount xterm.js where static demo rows currently appear.
2. The run HUD must reflect session state: connecting, live, closed, rejected, or error.
3. Keyboard input while terminal is focused must go to the terminal, not the page shell.
4. Mobile keypad controls may remain, but they must forward terminal control input rather than append demo messages.
5. On disconnect, the terminal must show a non-HTML status overlay or plain terminal-safe message.
6. Resize must preserve the PiFrame visual boundary and avoid double scrollbars where possible.

## Accessibility Direction

- Provide accessible label for terminal region and connection state.
- Preserve existing dialog focus trap and background inert behavior.
- Keep 44px minimum touch targets for keypad/settings/session controls.
- Provide non-color status text for connected/rejected/closed states.
- Do not compromise screen reader navigation for workspace/session dialogs.

## Design Memory Note

`.moai/design/system.md` exists but remains mostly `_TBD_`. This SPEC should use existing tokens and this design direction locally rather than overwriting project-level design memory.
