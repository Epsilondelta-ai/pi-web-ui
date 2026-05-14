package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/gorilla/websocket"
)

type Handler struct {
	Config config.Config
	Runner Runner
	Events EventSink
}

type clientMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

type serverMessage struct {
	Type        string `json:"type"`
	Event       string `json:"event,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	SessionID   string `json:"sessionId,omitempty"`
	Code        string `json:"code,omitempty"`
	Data        string `json:"data,omitempty"`
}

// @MX:ANCHOR: [AUTO] terminal websocket handler owns validation, PTY lifecycle, and browser protocol.
// @MX:REASON: Frontend terminal client, server routes, and tests all depend on this lifecycle boundary.
func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	events := h.events()
	workspaceID, sessionID, ok := parseTerminalRoute(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	if !h.Config.ValidateOrigin(r.Header.Get("Origin")) {
		h.rejectHTTP(w, http.StatusForbidden, Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventRejected, Code: string(config.RejectInvalidOrigin)})
		return
	}

	workspace, ok := h.Config.ValidateWorkspace(r.URL.Query().Get("workspace"))
	if !ok {
		h.rejectHTTP(w, http.StatusForbidden, Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventRejected, Code: string(config.RejectInvalidWorkspace)})
		return
	}

	command, ok := h.Config.ValidateCommand(r.URL.Query().Get("command"))
	if !ok {
		h.rejectHTTP(w, http.StatusForbidden, Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventRejected, Code: string(config.RejectInvalidCommand)})
		return
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(req *http.Request) bool {
			return h.Config.ValidateOrigin(req.Header.Get("Origin"))
		},
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		events.Emit(Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventRejected, Code: "upgrade_failed"})
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	runner := h.Runner
	if runner == nil {
		runner = PTYRunner{}
	}
	session, err := runner.Start(ctx, StartRequest{WorkspaceID: workspaceID, SessionID: sessionID, Workspace: workspace, Command: command, Cols: 80, Rows: 24})
	if err != nil {
		event := Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventRejected, Code: "start_failed"}
		events.Emit(event)
		_ = conn.WriteJSON(messageFromEvent(event))
		return
	}

	var writeMu sync.Mutex
	var closedOnce sync.Once
	writeJSON := func(message serverMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		return conn.WriteJSON(message)
	}

	emit := func(event Event) {
		if event.WorkspaceID == "" {
			event.WorkspaceID = workspaceID
		}
		if event.SessionID == "" {
			event.SessionID = sessionID
		}
		events.Emit(event)
		_ = writeJSON(messageFromEvent(event))
	}
	emitClosed := func() {
		closedOnce.Do(func() {
			emit(Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventClosed})
		})
	}

	emit(Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventStarted})

	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := session.Read(buf)
			if n > 0 {
				if writeJSON(serverMessage{Type: "output", Data: string(buf[:n])}) != nil {
					return
				}
			}
			if err != nil {
				emitClosed()
				_ = conn.Close()
				return
			}
		}
	}()

	readErr := h.readClientMessages(conn, session, emit)
	if readErr != nil && !isExpectedClose(readErr) {
		emit(Event{WorkspaceID: workspaceID, SessionID: sessionID, Name: EventError, Code: "websocket_read_failed"})
	}

	cancel()
	_ = session.Close()
	_ = session.Kill()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
	}
	_ = session.Wait()
	emitClosed()
}

func (h Handler) readClientMessages(conn *websocket.Conn, session Session, emit func(Event)) error {
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		var msg clientMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			emit(Event{Name: EventError, Code: "malformed_json"})
			continue
		}
		switch msg.Type {
		case "input":
			if _, err := session.Write([]byte(msg.Data)); err != nil {
				emit(Event{Name: EventError, Code: "input_write_failed"})
			}
		case "resize":
			if msg.Cols <= 0 || msg.Rows <= 0 || msg.Cols > 500 || msg.Rows > 500 {
				emit(Event{Name: EventError, Code: "invalid_resize"})
				continue
			}
			if err := session.Resize(uint16(msg.Cols), uint16(msg.Rows)); err != nil {
				emit(Event{Name: EventError, Code: "resize_failed"})
				continue
			}
			emit(Event{Name: EventResized})
		default:
			emit(Event{Name: EventError, Code: "unknown_message_type"})
		}
	}
}

// @MX:WARN: [AUTO] Origin, workspace, and command rejection must happen before PTY launch.
// @MX:REASON: A bypass turns this local web UI into arbitrary local command execution.
func (h Handler) rejectHTTP(w http.ResponseWriter, status int, event Event) {
	h.events().Emit(event)
	http.Error(w, "terminal session rejected", status)
}

func (h Handler) events() EventSink {
	if h.Events == nil {
		return NoopEventSink{}
	}
	return h.Events
}

func messageFromEvent(event Event) serverMessage {
	return serverMessage{Type: "event", Event: event.Name, WorkspaceID: event.WorkspaceID, SessionID: event.SessionID, Code: event.Code}
}

func parseTerminalRoute(path string) (string, string, bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 5 || parts[0] != "api" || parts[1] != "terminals" || parts[3] != "sessions" {
		return "", "", false
	}
	if parts[2] == "" || parts[4] == "" {
		return "", "", false
	}
	return parts[2], parts[4], true
}

func isExpectedClose(err error) bool {
	return errors.Is(err, context.Canceled) || websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure)
}
