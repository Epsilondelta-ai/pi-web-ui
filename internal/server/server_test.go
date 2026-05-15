package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/Epsilondelta-ai/pi-web-ui/internal/terminal"
)

func testServerConfig(t *testing.T) config.Config {
	t.Helper()
	root := t.TempDir()
	cfg, err := (config.Config{
		Host:              "127.0.0.1",
		Port:              "8787",
		ServedOrigin:      "http://127.0.0.1:8787",
		WorkspaceRoots:    []string{root},
		Command:           "pi",
		TmuxEnabled:       true,
		TmuxBinaryPath:    "/bin/echo",
		TmuxManagedPrefix: "piweb-",
	}).Normalized()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestNewRegistersHealthRoute(t *testing.T) {
	srv := New(testServerConfig(t), nil, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.Code)
	}
	if got := res.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	if strings.TrimSpace(res.Body.String()) != `{"ok":true}` {
		t.Fatalf("body = %q", res.Body.String())
	}
}

func TestNewServesStaticDistFallback(t *testing.T) {
	tmp := t.TempDir()
	dist := filepath.Join(tmp, "dist")
	if err := os.MkdirAll(dist, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("pi web"), 0o644); err != nil {
		t.Fatal(err)
	}
	oldwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Chdir(oldwd) }()

	srv := New(testServerConfig(t), nil, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.Code)
	}
	if !strings.Contains(res.Body.String(), "pi web") {
		t.Fatalf("static body = %q", res.Body.String())
	}
}

func TestTerminalRouteDelegatesToTerminalHandler(t *testing.T) {
	cfg := testServerConfig(t)
	srv := New(cfg, nil, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/api/terminals/w/sessions/s?workspace="+cfg.WorkspaceRoots[0], nil)
	req.Header.Set("Origin", "http://evil.test")
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want terminal handler 403", res.Code)
	}
	if !strings.Contains(res.Body.String(), "terminal session rejected") {
		t.Fatalf("body = %q", res.Body.String())
	}
}

type fakeServerTmux struct {
	list      []terminal.TmuxSessionInfo
	listCalls int
	kill      []string
}

func (f *fakeServerTmux) Start(context.Context, terminal.StartRequest) (terminal.Session, error) {
	return fakeServerSession{}, nil
}
func (f *fakeServerTmux) Attach(context.Context, terminal.StartRequest) (terminal.Session, error) {
	return fakeServerSession{}, nil
}
func (f *fakeServerTmux) Kill(_ context.Context, name string) (terminal.LifecycleState, error) {
	f.kill = append(f.kill, name)
	return terminal.LifecycleKilled, nil
}
func (f *fakeServerTmux) List(context.Context) ([]terminal.TmuxSessionInfo, error) {
	f.listCalls++
	return f.list, nil
}

type fakeServerSession struct{}

func (fakeServerSession) Read([]byte) (int, error)    { return 0, io.EOF }
func (fakeServerSession) Write(p []byte) (int, error) { return len(p), nil }
func (fakeServerSession) Close() error                { return nil }
func (fakeServerSession) Resize(uint16, uint16) error { return nil }
func (fakeServerSession) Wait() error                 { return nil }
func (fakeServerSession) Kill() error                 { return nil }

func tmuxRouteQuery(cfg config.Config) string {
	return "?workspace=" + url.QueryEscape(cfg.WorkspaceRoots[0])
}

func TestTmuxListRouteReturnsManagedSessions(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{list: []terminal.TmuxSessionInfo{{Name: "piweb-w-s", Identity: "w-s", State: terminal.LifecycleDetached}}}
	srv := New(cfg, tmux, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/api/tmux/sessions"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%q", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "piweb-w-s") || !strings.Contains(res.Body.String(), "detached") {
		t.Fatalf("body = %q", res.Body.String())
	}
}

func TestTmuxKillRouteTerminatesManagedSession(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodPost, "/api/tmux/sessions/piweb-w-s/kill"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%q", res.Code, res.Body.String())
	}
	if len(tmux.kill) != 1 || tmux.kill[0] != "piweb-w-s" {
		t.Fatalf("kill calls = %#v", tmux.kill)
	}
	if !strings.Contains(res.Body.String(), "killed") {
		t.Fatalf("body = %q", res.Body.String())
	}
}

func TestTmuxKillRouteRejectsNonManagedSession(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodPost, "/api/tmux/sessions/user-session/kill"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.Code)
	}
	if len(tmux.kill) != 0 {
		t.Fatalf("non-managed kill reached tmux: %#v", tmux.kill)
	}
}

func TestTmuxListAndKillRoutesRejectInvalidWorkspaceCommandAndSessionBeforeTmuxExecution(t *testing.T) {
	cfg := testServerConfig(t)
	outside := t.TempDir()

	cases := []struct {
		name       string
		method     string
		path       string
		wantStatus int
	}{
		{name: "list invalid workspace", method: http.MethodGet, path: "/api/tmux/sessions?workspace=" + url.QueryEscape(outside), wantStatus: http.StatusForbidden},
		{name: "list invalid command", method: http.MethodGet, path: "/api/tmux/sessions" + tmuxRouteQuery(cfg) + "&command=bash", wantStatus: http.StatusForbidden},
		{name: "kill invalid workspace", method: http.MethodPost, path: "/api/tmux/sessions/piweb-w-s/kill?workspace=" + url.QueryEscape(outside), wantStatus: http.StatusForbidden},
		{name: "kill invalid command", method: http.MethodPost, path: "/api/tmux/sessions/piweb-w-s/kill" + tmuxRouteQuery(cfg) + "&command=bash", wantStatus: http.StatusForbidden},
		{name: "kill unsanitized session", method: http.MethodPost, path: "/api/tmux/sessions/piweb-bad;name/kill" + tmuxRouteQuery(cfg), wantStatus: http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tmux := &fakeServerTmux{}
			srv := New(cfg, tmux, terminal.NoopEventSink{})
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.Header.Set("Origin", cfg.ServedOrigin)
			res := httptest.NewRecorder()

			srv.Handler().ServeHTTP(res, req)

			if res.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d body=%q", res.Code, tc.wantStatus, res.Body.String())
			}
			if tmux.listCalls != 0 || len(tmux.kill) != 0 {
				t.Fatalf("tmux called before validation: list=%d kill=%#v", tmux.listCalls, tmux.kill)
			}
		})
	}
}

func TestTmuxListRouteAcceptsSameOriginHostWhenOriginHeaderAbsent(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/api/tmux/sessions"+tmuxRouteQuery(cfg), nil)
	req.Host = "127.0.0.1:8787"
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.Code)
	}
}

func TestTmuxRoutesRejectInvalidOriginBeforeTmuxExecution(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})
	req := httptest.NewRequest(http.MethodGet, "/api/tmux/sessions"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", "http://evil.test")
	res := httptest.NewRecorder()

	srv.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.Code)
	}
	if tmux.listCalls != 0 {
		t.Fatalf("invalid origin reached tmux list")
	}
}

func TestTmuxRoutesRejectUnavailableAndUnsupportedMethods(t *testing.T) {
	cfg := testServerConfig(t)
	cfg.TmuxBinaryPath = "definitely-missing-pi-web-tmux"
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})

	req := httptest.NewRequest(http.MethodGet, "/api/tmux/sessions"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.Code)
	}

	cfg = testServerConfig(t)
	srv = New(cfg, tmux, terminal.NoopEventSink{})
	req = httptest.NewRequest(http.MethodPost, "/api/tmux/sessions", nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res = httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("POST list status = %d, want 404", res.Code)
	}
}

func TestTmuxKillRouteRejectsUnavailableInvalidPathAndWrongMethod(t *testing.T) {
	cfg := testServerConfig(t)
	tmux := &fakeServerTmux{}
	srv := New(cfg, tmux, terminal.NoopEventSink{})

	req := httptest.NewRequest(http.MethodGet, "/api/tmux/sessions/piweb-w-s/kill"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res := httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("GET kill status = %d, want 404", res.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/tmux/sessions/piweb-w-s/not-kill"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res = httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("bad kill path status = %d, want 403", res.Code)
	}

	cfg.TmuxBinaryPath = "definitely-missing-pi-web-tmux"
	srv = New(cfg, tmux, terminal.NoopEventSink{})
	req = httptest.NewRequest(http.MethodPost, "/api/tmux/sessions/piweb-w-s/kill"+tmuxRouteQuery(cfg), nil)
	req.Header.Set("Origin", cfg.ServedOrigin)
	res = httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("unavailable kill status = %d, want 503", res.Code)
	}
}

func TestServerHandlerReturnsMux(t *testing.T) {
	srv := New(testServerConfig(t), nil, nil)
	if srv.Handler() == nil {
		t.Fatalf("Handler() returned nil")
	}
	if srv.Mux == nil {
		t.Fatalf("Mux not initialized")
	}
}
