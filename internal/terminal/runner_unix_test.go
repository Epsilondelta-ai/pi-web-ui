//go:build !windows

package terminal

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestConfigureProcessGroupUsesOwnGroup(t *testing.T) {
	cmd := exec.Command("/bin/sh", "-c", "sleep 30")
	configureProcessGroup(cmd)
	if !processGroupConfigured(cmd) {
		t.Fatalf("process group was not configured")
	}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start command: %v", err)
	}
	pgid, err := processGroupID(cmd)
	if err != nil {
		_ = cmd.Process.Kill()
		t.Fatalf("processGroupID: %v", err)
	}
	if pgid != cmd.Process.Pid {
		_ = cmd.Process.Kill()
		t.Fatalf("pgid = %d, want process pid %d", pgid, cmd.Process.Pid)
	}
	if err := terminateProcessGroup(cmd, softSignal); err != nil && !errors.Is(err, os.ErrProcessDone) {
		_ = cmd.Process.Kill()
		t.Fatalf("terminateProcessGroup: %v", err)
	}
	waited := make(chan error, 1)
	go func() { waited <- cmd.Wait() }()
	select {
	case <-waited:
	case <-time.After(2 * time.Second):
		_ = terminateProcessGroup(cmd, hardSignal)
		t.Fatalf("process group did not terminate after SIGTERM")
	}
}

func TestPTYSessionKillTerminatesStartedCommandGroup(t *testing.T) {
	cmd := exec.Command("/bin/sh", "-c", "sleep 30")
	configureProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatalf("start command: %v", err)
	}
	session := newPTYSession(cmd, nil)
	_ = session.Kill()
	select {
	case <-session.waitDone:
	case <-time.After(2 * time.Second):
		t.Fatalf("Wait did not reap process after Kill")
	}
}

func TestPTYSessionKillTerminatesAndReapsProcessGroup(t *testing.T) {
	cmd := exec.CommandContext(context.Background(), "/bin/sh", "-c", "sleep 30")
	configureProcessGroup(cmd)
	file, err := pty.Start(cmd)
	if err != nil {
		if errors.Is(err, os.ErrPermission) {
			t.Skipf("pty start not permitted in this environment: %v", err)
		}
		t.Fatalf("start pty: %v", err)
	}
	session := newPTYSession(cmd, file)
	if err := session.Kill(); err != nil {
		t.Fatalf("Kill() error = %v", err)
	}
	select {
	case <-session.waitDone:
	case <-time.After(2 * time.Second):
		t.Fatalf("Wait did not reap process after Kill")
	}
	if err := session.Wait(); err != session.waitErr {
		t.Fatalf("Wait() = %v, want cached %v", err, session.waitErr)
	}
}
