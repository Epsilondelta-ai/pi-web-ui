package main

import (
	"errors"
	"net/http"
	"testing"
)

func TestNewHTTPServerFromEnv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PI_WEB_HOST", "127.0.0.1")
	t.Setenv("PI_WEB_PORT", "8989")
	t.Setenv("PI_WEB_ORIGIN", "http://127.0.0.1:8989")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", root)
	t.Setenv("PI_WEB_COMMAND", "pi")

	srv, err := newHTTPServer()
	if err != nil {
		t.Fatalf("newHTTPServer() error = %v", err)
	}
	if srv.Addr != "127.0.0.1:8989" {
		t.Fatalf("Addr = %q", srv.Addr)
	}
	if srv.Handler == nil {
		t.Fatalf("Handler is nil")
	}
}

func TestRunWithUsesBuiltServer(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PI_WEB_HOST", "127.0.0.1")
	t.Setenv("PI_WEB_PORT", "8989")
	t.Setenv("PI_WEB_ORIGIN", "http://127.0.0.1:8989")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", root)
	t.Setenv("PI_WEB_COMMAND", "pi")
	sentinel := errors.New("stop")

	err := runWith(func(srv *http.Server) error {
		if srv.Addr != "127.0.0.1:8989" || srv.Handler == nil {
			t.Fatalf("unexpected server: %#v", srv)
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("runWith() error = %v, want sentinel", err)
	}
}

func TestRunWithRejectsInvalidEnv(t *testing.T) {
	t.Setenv("PI_WEB_HOST", "0.0.0.0")
	t.Setenv("PI_WEB_PORT", "8787")
	t.Setenv("PI_WEB_ORIGIN", "http://0.0.0.0:8787")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", t.TempDir())
	t.Setenv("PI_WEB_COMMAND", "pi")

	if err := runWith(func(*http.Server) error { return nil }); err == nil {
		t.Fatalf("expected invalid host error")
	}
}

func TestNewHTTPServerRejectsInvalidEnv(t *testing.T) {
	t.Setenv("PI_WEB_HOST", "0.0.0.0")
	t.Setenv("PI_WEB_PORT", "8787")
	t.Setenv("PI_WEB_ORIGIN", "http://0.0.0.0:8787")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", t.TempDir())
	t.Setenv("PI_WEB_COMMAND", "pi")

	if _, err := newHTTPServer(); err == nil {
		t.Fatalf("expected invalid host error")
	}
}
