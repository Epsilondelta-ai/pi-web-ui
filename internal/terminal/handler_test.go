package terminal

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/gorilla/websocket"
)

type recordingSink struct {
	mu     sync.Mutex
	events []Event
}

func (s *recordingSink) Emit(event Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
}

func (s *recordingSink) has(name, code string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, event := range s.events {
		if event.Name == name && (code == "" || event.Code == code) {
			return true
		}
	}
	return false
}

type fakeRunner struct {
	mu       sync.Mutex
	starts   int
	session  *fakeSession
	startErr error
	request  StartRequest
}

func (r *fakeRunner) Start(_ context.Context, request StartRequest) (Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.starts++
	r.request = request
	if r.startErr != nil {
		return nil, r.startErr
	}
	r.session = newFakeSession()
	return r.session, nil
}

func (r *fakeRunner) startCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.starts
}

type fakeSession struct {
	mu      sync.Mutex
	closed  chan struct{}
	writes  []string
	resizes [][2]uint16
	killed  bool
}

func newFakeSession() *fakeSession {
	return &fakeSession{closed: make(chan struct{})}
}

func (s *fakeSession) Read([]byte) (int, error) {
	<-s.closed
	return 0, io.EOF
}
func (s *fakeSession) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.writes = append(s.writes, string(p))
	return len(p), nil
}
func (s *fakeSession) Close() error {
	select {
	case <-s.closed:
	default:
		close(s.closed)
	}
	return nil
}
func (s *fakeSession) Resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resizes = append(s.resizes, [2]uint16{cols, rows})
	return nil
}
func (s *fakeSession) Wait() error { return nil }
func (s *fakeSession) Kill() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.killed = true
	return nil
}
func (s *fakeSession) killedState() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.killed
}
func (s *fakeSession) hasWrite(value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, write := range s.writes {
		if write == value {
			return true
		}
	}
	return false
}
func (s *fakeSession) hasResize(cols, rows uint16) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, resize := range s.resizes {
		if resize == [2]uint16{cols, rows} {
			return true
		}
	}
	return false
}

func testConfig(t *testing.T) config.Config {
	t.Helper()
	root := t.TempDir()
	workspace := filepath.Join(root, "workspace")
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg, err := (config.Config{
		Host:           "127.0.0.1",
		Port:           "8787",
		ServedOrigin:   "http://pi-web.test",
		WorkspaceRoots: []string{root},
		Command:        "pi",
	}).Normalized()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestNotFoundForInvalidTerminalRoute(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	handler := Handler{Config: cfg, Runner: runner, Events: &recordingSink{}}

	req := httptest.NewRequest(http.MethodGet, "/api/terminals/ws/not-sessions/s1", nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.Code)
	}
	if runner.startCount() != 0 {
		t.Fatalf("runner started for invalid route")
	}
}

func TestRejectsInvalidOriginBeforeRunnerStarts(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}

	req := httptest.NewRequest(http.MethodGet, "/api/terminals/ws/sessions/s1?workspace="+url.QueryEscape(cfg.WorkspaceRoots[0]), nil)
	req.Header.Set("Origin", "http://evil.test")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.Code)
	}
	if runner.startCount() != 0 {
		t.Fatalf("runner started for invalid origin")
	}
	if !sink.has(EventRejected, string(config.RejectInvalidOrigin)) {
		t.Fatalf("missing rejected invalid_origin event")
	}
}

func TestRejectsInvalidWorkspaceBeforeRunnerStarts(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}
	outside := t.TempDir()

	req := httptest.NewRequest(http.MethodGet, "/api/terminals/ws/sessions/s1?workspace="+url.QueryEscape(outside), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.Code)
	}
	if runner.startCount() != 0 {
		t.Fatalf("runner started for invalid workspace")
	}
	if !sink.has(EventRejected, string(config.RejectInvalidWorkspace)) {
		t.Fatalf("missing rejected invalid_workspace event")
	}
}

func TestRejectsInvalidCommandBeforeRunnerStarts(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}

	req := httptest.NewRequest(http.MethodGet, "/api/terminals/ws/sessions/s1?workspace="+url.QueryEscape(cfg.WorkspaceRoots[0])+"&command=bash", nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.Code)
	}
	if runner.startCount() != 0 {
		t.Fatalf("runner started for invalid command")
	}
	if !sink.has(EventRejected, string(config.RejectInvalidCommand)) {
		t.Fatalf("missing rejected invalid_command event")
	}
}

func TestStartFailureEmitsRejectedEvent(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{startErr: errors.New("missing pi")}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/terminals/ws/sessions/s1?workspace=" + url.QueryEscape(cfg.WorkspaceRoots[0])
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Origin": []string{cfg.ServedOrigin}})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read rejection: %v", err)
	}
	if !strings.Contains(string(payload), EventRejected) || !strings.Contains(string(payload), "start_failed") {
		t.Fatalf("payload = %s", payload)
	}
	if !sink.has(EventRejected, "start_failed") {
		t.Fatalf("missing start_failed event")
	}
}

func TestProtocolHandlesInputResizeMalformedAndDisconnectCleanup(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/terminals/ws/sessions/s1?workspace=" + url.QueryEscape(cfg.WorkspaceRoots[0])
	headers := http.Header{"Origin": []string{cfg.ServedOrigin}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read started event: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`not json`)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read malformed error event: %v", err)
	}
	if !sink.has(EventError, "malformed_json") {
		t.Fatalf("missing malformed_json event")
	}
	if err := conn.WriteJSON(clientMessage{Type: "resize", Cols: -1, Rows: 40}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read invalid resize error event: %v", err)
	}
	if !sink.has(EventError, "invalid_resize") {
		t.Fatalf("missing invalid_resize event")
	}
	if err := conn.WriteJSON(clientMessage{Type: "resize", Cols: 120, Rows: 40}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read resized event: %v", err)
	}
	if err := conn.WriteJSON(clientMessage{Type: "input", Data: "hello\r"}); err != nil {
		t.Fatal(err)
	}

	sess := runner.session
	if sess == nil {
		t.Fatalf("session not started")
	}
	if !eventually(func() bool { return sess.hasResize(120, 40) }) {
		t.Fatalf("resize not recorded")
	}
	if !eventually(func() bool { return sess.hasWrite("hello\r") }) {
		t.Fatalf("input not written")
	}
	_ = conn.Close()
	if !eventually(sess.killedState) {
		t.Fatalf("session was not killed on disconnect")
	}
	if !eventually(func() bool { return sink.has(EventClosed, "") }) {
		t.Fatalf("missing terminal.closed event")
	}
}

func TestProtocolReportsUnknownMessageType(t *testing.T) {
	cfg := testConfig(t)
	runner := &fakeRunner{}
	sink := &recordingSink{}
	handler := Handler{Config: cfg, Runner: runner, Events: sink}
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/terminals/ws/sessions/s1?workspace=" + url.QueryEscape(cfg.WorkspaceRoots[0])
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Origin": []string{cfg.ServedOrigin}})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read started: %v", err)
	}
	if err := conn.WriteJSON(clientMessage{Type: "unknown"}); err != nil {
		t.Fatal(err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read unknown type event: %v", err)
	}
	if !strings.Contains(string(payload), "unknown_message_type") {
		t.Fatalf("payload = %s", payload)
	}
}

func eventually(fn func() bool) bool {
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if fn() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}
