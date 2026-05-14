package server

import (
	"net/http"
	"net/http/httptest"
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
		Host:           "127.0.0.1",
		Port:           "8787",
		ServedOrigin:   "http://127.0.0.1:8787",
		WorkspaceRoots: []string{root},
		Command:        "pi",
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

func TestServerHandlerReturnsMux(t *testing.T) {
	srv := New(testServerConfig(t), nil, nil)
	if srv.Handler() == nil {
		t.Fatalf("Handler() returned nil")
	}
	if srv.Mux == nil {
		t.Fatalf("Mux not initialized")
	}
}
