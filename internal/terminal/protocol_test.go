package terminal

import (
	"context"
	"errors"
	"testing"

	"github.com/gorilla/websocket"
)

func TestParseTerminalRoute(t *testing.T) {
	tests := []struct {
		path      string
		workspace string
		session   string
		ok        bool
	}{
		{"/api/terminals/workspace/sessions/session", "workspace", "session", true},
		{"api/terminals/w/sessions/s", "w", "s", true},
		{"/api/terminals//sessions/s", "", "", false},
		{"/api/terminal/w/sessions/s", "", "", false},
		{"/api/terminals/w/session/s", "", "", false},
		{"/api/terminals/w/sessions", "", "", false},
	}
	for _, tt := range tests {
		workspace, session, ok := parseTerminalRoute(tt.path)
		if ok != tt.ok || workspace != tt.workspace || session != tt.session {
			t.Fatalf("parseTerminalRoute(%q) = (%q,%q,%v), want (%q,%q,%v)", tt.path, workspace, session, ok, tt.workspace, tt.session, tt.ok)
		}
	}
}

func TestHandlerEventsDefaultsToNoop(t *testing.T) {
	if _, ok := (Handler{}).events().(NoopEventSink); !ok {
		t.Fatalf("nil event sink did not default to NoopEventSink")
	}
}

func TestMessageFromEvent(t *testing.T) {
	msg := messageFromEvent(Event{Name: EventRejected, WorkspaceID: "w", SessionID: "s", Code: "invalid_origin"})
	if msg.Type != "event" || msg.Event != EventRejected || msg.WorkspaceID != "w" || msg.SessionID != "s" || msg.Code != "invalid_origin" {
		t.Fatalf("unexpected message: %+v", msg)
	}
}

func TestIsExpectedClose(t *testing.T) {
	if !isExpectedClose(context.Canceled) {
		t.Fatalf("context.Canceled should be expected")
	}
	if !isExpectedClose(&websocket.CloseError{Code: websocket.CloseGoingAway}) {
		t.Fatalf("websocket going away should be expected")
	}
	if isExpectedClose(errors.New("boom")) {
		t.Fatalf("plain error should not be expected close")
	}
}
