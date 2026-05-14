package terminal

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestPTYRunnerStartReturnsErrorForMissingCommand(t *testing.T) {
	_, err := (PTYRunner{}).Start(context.Background(), StartRequest{Workspace: t.TempDir(), Command: "definitely-missing-pi-web-ui-command"})
	if err == nil {
		t.Fatalf("expected missing command error")
	}
}

func TestNewPTYCommandDefaultsAndEnvironment(t *testing.T) {
	cmd, cols, rows := newPTYCommand(StartRequest{Workspace: t.TempDir(), Command: "pi"})
	if filepath.Base(cmd.Path) != "pi" {
		t.Fatalf("cmd path = %q", cmd.Path)
	}
	if cols != 80 || rows != 24 {
		t.Fatalf("size = %dx%d, want 80x24", cols, rows)
	}
	if !containsEnv(cmd.Env, "TERM=xterm-256color") || !containsEnv(cmd.Env, "COLORTERM=truecolor") {
		t.Fatalf("terminal environment missing: %v", cmd.Env)
	}
}

func TestNewPTYCommandUsesRequestedSize(t *testing.T) {
	_, cols, rows := newPTYCommand(StartRequest{Command: "pi", Cols: 132, Rows: 43})
	if cols != 132 || rows != 43 {
		t.Fatalf("size = %dx%d", cols, rows)
	}
}

func TestPTYSessionFileOperations(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "pty-session-file")
	if err != nil {
		t.Fatal(err)
	}
	session := newPTYSession(exec.Command("pi"), file)
	if _, err := session.Write([]byte("hello")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if _, err := file.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 5)
	if _, err := session.Read(buf); err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if string(buf) != "hello" {
		t.Fatalf("Read() = %q", buf)
	}
	if err := session.Resize(80, 24); err == nil {
		t.Fatalf("Resize() on non-tty unexpectedly succeeded")
	}
	if err := session.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestPTYSessionKillWithoutProcessIsNoop(t *testing.T) {
	session := newPTYSession(exec.Command("pi"), nil)
	if err := session.Kill(); err != nil {
		t.Fatalf("Kill() error = %v", err)
	}
}

func TestPTYSessionWaitCachesResult(t *testing.T) {
	cmd := exec.Command("definitely-not-started")
	session := newPTYSession(cmd, nil)
	first := session.Wait()
	second := session.Wait()
	if first == nil {
		t.Fatalf("Wait on unstarted command unexpectedly succeeded")
	}
	if first != second {
		t.Fatalf("Wait did not return cached error: %v vs %v", first, second)
	}
}

func containsEnv(env []string, value string) bool {
	for _, item := range env {
		if item == value || strings.HasPrefix(item, value+string(os.PathListSeparator)) {
			return true
		}
	}
	return false
}
