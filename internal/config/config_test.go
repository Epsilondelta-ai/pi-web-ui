package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDefaultConfigUsesLocalhostOnly(t *testing.T) {
	t.Setenv("PI_WEB_HOST", "")
	t.Setenv("PI_WEB_PORT", "")
	t.Setenv("PI_WEB_ORIGIN", "")
	t.Setenv("PI_WEB_EXTRA_ORIGINS", "")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", t.TempDir())
	t.Setenv("PI_WEB_COMMAND", "")
	t.Setenv("PI_WEB_TMUX_ENABLED", "")
	t.Setenv("PI_WEB_TMUX_BINARY", "")
	t.Setenv("PI_WEB_TMUX_PREFIX", "")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv() error = %v", err)
	}
	if cfg.Host != "127.0.0.1" {
		t.Fatalf("Host = %q, want 127.0.0.1", cfg.Host)
	}
	if cfg.Port != "8787" || cfg.Command != "pi" {
		t.Fatalf("defaults = port %q command %q", cfg.Port, cfg.Command)
	}
	if cfg.ServedOrigin != "http://127.0.0.1:8787" {
		t.Fatalf("ServedOrigin = %q", cfg.ServedOrigin)
	}
	if !cfg.TmuxEnabled || cfg.TmuxBinaryPath != "tmux" || cfg.TmuxManagedPrefix != "piweb-" {
		t.Fatalf("tmux defaults = enabled %v binary %q prefix %q", cfg.TmuxEnabled, cfg.TmuxBinaryPath, cfg.TmuxManagedPrefix)
	}
	if cfg.ValidateOrigin("http://localhost:8787") {
		t.Fatalf("localhost origin must not match 127.0.0.1 same-origin default")
	}
}

func TestLoadFromEnvParsesTmuxFields(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PI_WEB_HOST", "127.0.0.1")
	t.Setenv("PI_WEB_PORT", "8787")
	t.Setenv("PI_WEB_ORIGIN", "http://127.0.0.1:8787")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", root)
	t.Setenv("PI_WEB_TMUX_ENABLED", "false")
	t.Setenv("PI_WEB_TMUX_BINARY", "/bin/echo")
	t.Setenv("PI_WEB_TMUX_PREFIX", "managed-")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv() error = %v", err)
	}
	if cfg.TmuxEnabled || cfg.TmuxBinaryPath != "/bin/echo" || cfg.TmuxManagedPrefix != "managed-" {
		t.Fatalf("tmux env fields = enabled %v binary %q prefix %q", cfg.TmuxEnabled, cfg.TmuxBinaryPath, cfg.TmuxManagedPrefix)
	}
}

func TestValidateTmuxBinaryRejectsMissingBinary(t *testing.T) {
	cfg := Config{TmuxEnabled: true, TmuxBinaryPath: "definitely-missing-pi-web-tmux", TmuxManagedPrefix: "piweb-"}
	if err := cfg.ValidateTmuxBinary(); err == nil {
		t.Fatalf("missing tmux binary accepted")
	}
}

func TestValidateTmuxBinaryRejectsDisabledMode(t *testing.T) {
	cfg := Config{TmuxEnabled: false, TmuxBinaryPath: "tmux", TmuxManagedPrefix: "piweb-"}
	if err := cfg.ValidateTmuxBinary(); err == nil {
		t.Fatalf("disabled tmux mode accepted")
	}
}

func TestLoadFromEnvParsesListsAndOrigin(t *testing.T) {
	rootA := t.TempDir()
	rootB := t.TempDir()
	t.Setenv("PI_WEB_HOST", "localhost")
	t.Setenv("PI_WEB_PORT", "9000")
	t.Setenv("PI_WEB_ORIGIN", "http://localhost:9000")
	t.Setenv("PI_WEB_EXTRA_ORIGINS", "http://127.0.0.1:9000, http://localhost:4321")
	t.Setenv("PI_WEB_WORKSPACE_ROOTS", rootA+","+rootB)
	t.Setenv("PI_WEB_COMMAND", "/usr/local/bin/pi")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv() error = %v", err)
	}
	if cfg.Addr() != "localhost:9000" {
		t.Fatalf("Addr() = %q", cfg.Addr())
	}
	if !cfg.ValidateOrigin("http://127.0.0.1:9000") || !cfg.ValidateOrigin("http://localhost:4321") {
		t.Fatalf("extra origins not accepted: %#v", cfg.ExtraOrigins)
	}
	if len(cfg.WorkspaceRoots) != 2 {
		t.Fatalf("WorkspaceRoots = %#v", cfg.WorkspaceRoots)
	}
}

func TestNormalizedRejectsUnsafeHostsAndOrigins(t *testing.T) {
	tests := []Config{
		{Host: "0.0.0.0", Port: "8787", ServedOrigin: "http://127.0.0.1:8787", WorkspaceRoots: []string{t.TempDir()}, Command: "pi"},
		{Host: "127.0.0.1", Port: "8787", ServedOrigin: "ws://127.0.0.1:8787", WorkspaceRoots: []string{t.TempDir()}, Command: "pi"},
		{Host: "127.0.0.1", Port: "8787", ServedOrigin: "http://127.0.0.1:8787/path", WorkspaceRoots: []string{t.TempDir()}, Command: "pi"},
		{Host: "127.0.0.1", Port: "8787", ServedOrigin: "http://127.0.0.1:8787", ExtraOrigins: []string{"http://localhost:*"}, WorkspaceRoots: []string{t.TempDir()}, Command: "pi"},
	}
	for _, cfg := range tests {
		if _, err := cfg.Normalized(); err == nil {
			t.Fatalf("Normalized(%+v) expected error", cfg)
		}
	}
}

func TestWildcardOriginRejected(t *testing.T) {
	_, err := (Config{
		Host:           "127.0.0.1",
		Port:           "8787",
		ServedOrigin:   "http://127.0.0.1:8787",
		ExtraOrigins:   []string{"http://localhost:*"},
		WorkspaceRoots: []string{t.TempDir()},
		Command:        "pi",
	}).Normalized()
	if err == nil {
		t.Fatalf("expected wildcard origin error")
	}
}

func TestWorkspaceMustStayInsideAllowedRoot(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "project")
	if err := os.Mkdir(inside, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()

	cfg, err := (Config{
		Host:           "127.0.0.1",
		Port:           "8787",
		ServedOrigin:   "http://127.0.0.1:8787",
		WorkspaceRoots: []string{root},
		Command:        "pi",
	}).Normalized()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cfg.ValidateWorkspace(inside); !ok {
		t.Fatalf("inside workspace rejected")
	}
	if _, ok := cfg.ValidateWorkspace(outside); ok {
		t.Fatalf("outside workspace accepted")
	}
	if _, ok := cfg.ValidateWorkspace(""); ok {
		t.Fatalf("empty workspace accepted")
	}
}

func TestWorkspaceSymlinkTraversalRejected(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink setup requires elevated privileges on some Windows installs")
	}
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "link-outside")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	cfg, err := (Config{Host: "127.0.0.1", Port: "8787", ServedOrigin: "http://127.0.0.1:8787", WorkspaceRoots: []string{root}, Command: "pi"}).Normalized()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cfg.ValidateWorkspace(link); ok {
		t.Fatalf("symlink escaping root accepted")
	}
}

func TestCommandValidation(t *testing.T) {
	cfg := Config{Command: "pi"}
	if cmd, ok := cfg.ValidateCommand(""); !ok || cmd != "pi" {
		t.Fatalf("empty request should use configured command, got %q ok=%v", cmd, ok)
	}
	if _, ok := cfg.ValidateCommand("pi"); !ok {
		t.Fatalf("configured command rejected")
	}
	if _, ok := cfg.ValidateCommand("bash"); ok {
		t.Fatalf("non-allowed command accepted")
	}

	pathCfg := Config{Command: "/usr/local/bin/pi"}
	if cmd, ok := pathCfg.ValidateCommand("pi"); !ok || cmd != "/usr/local/bin/pi" {
		t.Fatalf("basename request should resolve configured path, got %q ok=%v", cmd, ok)
	}
	if _, ok := pathCfg.ValidateCommand("/tmp/pi"); ok {
		t.Fatalf("different absolute command accepted")
	}
}

func TestCanonicalPathExpandsHomeAndRejectsEmpty(t *testing.T) {
	if _, err := CanonicalPath(""); err == nil {
		t.Fatalf("empty path accepted")
	}
	got, err := CanonicalPath("~")
	if err != nil {
		t.Fatalf("CanonicalPath(~): %v", err)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean(home) {
		t.Fatalf("CanonicalPath(~) = %q, want %q", got, filepath.Clean(home))
	}
}

func TestValidateOriginRequiresExactConfiguredOrigin(t *testing.T) {
	cfg := Config{ServedOrigin: "http://127.0.0.1:8787", ExtraOrigins: []string{"http://localhost:8787"}}
	if !cfg.ValidateOrigin("http://127.0.0.1:8787") {
		t.Fatalf("served origin rejected")
	}
	if !cfg.ValidateOrigin("http://localhost:8787") {
		t.Fatalf("extra origin rejected")
	}
	if cfg.ValidateOrigin("") || cfg.ValidateOrigin("http://localhost:9999") {
		t.Fatalf("unexpected origin accepted")
	}
}

func TestPathWithinRejectsSiblingsAndAcceptsRoot(t *testing.T) {
	root := filepath.Join(t.TempDir(), "root")
	child := filepath.Join(root, "child")
	sibling := root + "-sibling"
	if !pathWithin(root, root) {
		t.Fatalf("root should be within itself")
	}
	if !pathWithin(root, child) {
		t.Fatalf("child should be within root")
	}
	if pathWithin(root, sibling) {
		t.Fatalf("sibling path accepted as child")
	}
}

func TestSplitList(t *testing.T) {
	parts := splitList(" a, b\n c ,, ")
	if strings.Join(parts, "|") != "a|b|c" {
		t.Fatalf("splitList = %#v", parts)
	}
}

func TestValidateTmuxBinaryRejectsExistingAbsoluteNonExecutableFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows executable permission semantics differ")
	}
	path := filepath.Join(t.TempDir(), "tmux")
	if err := os.WriteFile(path, []byte("not executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := Config{TmuxEnabled: true, TmuxBinaryPath: path, TmuxManagedPrefix: "piweb-"}
	if err := cfg.ValidateTmuxBinary(); err == nil {
		t.Fatalf("non-executable tmux binary accepted")
	}
}

func TestValidateTmuxBinaryAcceptsExistingExecutablePath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows executable permission semantics differ")
	}
	path := filepath.Join(t.TempDir(), "tmux")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	cfg := Config{TmuxEnabled: true, TmuxBinaryPath: path, TmuxManagedPrefix: "piweb-"}
	if err := cfg.ValidateTmuxBinary(); err != nil {
		t.Fatalf("executable tmux binary rejected: %v", err)
	}
}

func TestNormalizedRejectsMalformedTmuxPrefix(t *testing.T) {
	_, err := (Config{
		Host:              "127.0.0.1",
		Port:              "8787",
		ServedOrigin:      "http://127.0.0.1:8787",
		WorkspaceRoots:    []string{t.TempDir()},
		Command:           "pi",
		TmuxManagedPrefix: " piweb- ",
	}).Normalized()
	if err == nil {
		t.Fatalf("malformed tmux prefix accepted")
	}
}
