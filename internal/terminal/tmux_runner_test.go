package terminal

import (
	"context"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"testing"
	"time"
)

type tmuxExecCall struct {
	binary string
	args   []string
	dir    string
}

type fakeTmuxExecutor struct {
	calls   []tmuxExecCall
	outputs map[string]string
	errors  map[string]error
}

func (e *fakeTmuxExecutor) Run(_ context.Context, binary string, args []string, dir string) ([]byte, error) {
	copied := append([]string(nil), args...)
	e.calls = append(e.calls, tmuxExecCall{binary: binary, args: copied, dir: dir})
	key := strings.Join(args, " ")
	if err := e.errors[key]; err != nil {
		return nil, err
	}
	return []byte(e.outputs[key]), nil
}

func TestSanitizeSessionNameRejectsShellMetacharactersAndLength(t *testing.T) {
	valid, err := SanitizeSessionName("workspace-123")
	if err != nil || valid != "workspace-123" {
		t.Fatalf("valid sanitize = %q err %v", valid, err)
	}
	for _, value := range []string{"", "bad;rm", "bad name", "bad$name", strings.Repeat("a", 49), "-leading", "bad--name"} {
		if _, err := SanitizeSessionName(value); err == nil {
			t.Fatalf("SanitizeSessionName(%q) accepted", value)
		}
	}
}

func TestManagedPrefixAndSessionName(t *testing.T) {
	name, err := ManagedSessionName("piweb-", "workspace", "session")
	if err != nil {
		t.Fatal(err)
	}
	if name != "piweb-workspace-session" || !HasManagedPrefix(name, "piweb-") {
		t.Fatalf("managed name = %q", name)
	}
	if HasManagedPrefix("user-session", "piweb-") {
		t.Fatalf("non-managed name accepted")
	}
}

func TestTmuxRunnerStartUsesManagedNameAndArgumentVector(t *testing.T) {
	exec := &fakeTmuxExecutor{outputs: map[string]string{}}
	attached := false
	runner := TmuxRunner{
		BinaryPath:    "/opt/bin/tmux",
		ManagedPrefix: "piweb-",
		Executor:      exec,
		AttachFactory: func(_ context.Context, binary string, args []string, dir string, cols, rows uint16, name string) (Session, error) {
			attached = true
			if binary != "/opt/bin/tmux" || name != "piweb-w-s" || cols != 100 || rows != 30 {
				t.Fatalf("attach args binary=%q args=%v dir=%q size=%dx%d name=%q", binary, args, dir, cols, rows, name)
			}
			if !reflect.DeepEqual(args, []string{"attach-session", "-t", "piweb-w-s"}) {
				t.Fatalf("attach args = %#v", args)
			}
			return newFakeSession(), nil
		},
	}
	_, err := runner.Start(context.Background(), StartRequest{WorkspaceID: "w", SessionID: "s", Workspace: "/tmp/work", Command: "pi", Cols: 100, Rows: 30})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if !attached {
		t.Fatalf("attach factory not called")
	}
	want := []string{"new-session", "-d", "-s", "piweb-w-s", "-x", "100", "-y", "30", "pi"}
	if len(exec.calls) == 0 || !reflect.DeepEqual(exec.calls[0].args, want) {
		t.Fatalf("new-session args = %#v, want %#v", exec.calls, want)
	}
}

func TestTmuxRunnerAttachRejectsNonExistentAndDetachesPreviousClient(t *testing.T) {
	exec := &fakeTmuxExecutor{outputs: map[string]string{
		"list-clients -t piweb-w-s -F #{client_tty}": "/dev/ttys001\n",
	}}
	runner := TmuxRunner{ManagedPrefix: "piweb-", Executor: exec, AttachFactory: func(_ context.Context, _ string, _ []string, _ string, _, _ uint16, _ string) (Session, error) {
		return newFakeSession(), nil
	}}
	_, err := runner.Attach(context.Background(), StartRequest{WorkspaceID: "w", SessionID: "s", Command: "pi"})
	if err != nil {
		t.Fatalf("Attach() error = %v", err)
	}
	foundDetach := false
	for _, call := range exec.calls {
		if reflect.DeepEqual(call.args, []string{"detach-client", "-s", "piweb-w-s"}) {
			foundDetach = true
		}
	}
	if !foundDetach {
		t.Fatalf("previous client not detached: %#v", exec.calls)
	}

	missing := &fakeTmuxExecutor{errors: map[string]error{"has-session -t piweb-w-missing": ErrStaleTmuxSession}}
	runner = TmuxRunner{ManagedPrefix: "piweb-", Executor: missing}
	_, err = runner.Attach(context.Background(), StartRequest{WorkspaceID: "w", SessionID: "missing"})
	if err != ErrStaleTmuxSession {
		t.Fatalf("Attach missing err = %v, want stale", err)
	}
}

func TestTmuxRunnerKillRejectsNonManagedAndHandlesDeadAsStale(t *testing.T) {
	runner := TmuxRunner{ManagedPrefix: "piweb-", Executor: &fakeTmuxExecutor{}}
	if _, err := runner.Kill(context.Background(), "other-session"); err == nil {
		t.Fatalf("non-managed kill accepted")
	}
	dead := &fakeTmuxExecutor{errors: map[string]error{"kill-session -t piweb-w-s": ErrStaleTmuxSession}}
	state, err := (TmuxRunner{ManagedPrefix: "piweb-", Executor: dead}).Kill(context.Background(), "piweb-w-s")
	if err != nil || state != LifecycleStale {
		t.Fatalf("dead kill state=%q err=%v", state, err)
	}
}

func TestTmuxRunnerDefaultsAndEmptyList(t *testing.T) {
	exec := &fakeTmuxExecutor{}
	runner := TmuxRunner{Executor: exec, AttachFactory: func(_ context.Context, binary string, _ []string, _ string, cols, rows uint16, name string) (Session, error) {
		if binary != "tmux" || name != "piweb-w-s" || cols != 80 || rows != 24 {
			t.Fatalf("defaults binary=%q name=%q size=%dx%d", binary, name, cols, rows)
		}
		return newFakeSession(), nil
	}}
	if _, err := runner.Start(context.Background(), StartRequest{WorkspaceID: "w", SessionID: "s", Command: "pi"}); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	got, err := runner.List(context.Background())
	if err != nil || len(got) != 0 {
		t.Fatalf("empty List() = %#v err=%v", got, err)
	}
}

func TestTmuxRunnerListReturnsOnlyManagedSessionsWithState(t *testing.T) {
	exec := &fakeTmuxExecutor{outputs: map[string]string{
		"list-sessions -F #{session_name}\t#{session_attached}": "piweb-live\t1\nuser\t1\npiweb-detached\t0\n",
	}}
	got, err := (TmuxRunner{ManagedPrefix: "piweb-", Executor: exec}).List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []TmuxSessionInfo{
		{Name: "piweb-live", Identity: "live", State: LifecycleLive},
		{Name: "piweb-detached", Identity: "detached", State: LifecycleDetached},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("List() = %#v, want %#v", got, want)
	}
}

func TestTmuxSessionFileOperationsAndWait(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "tmux-session-file")
	if err != nil {
		t.Fatal(err)
	}
	session := &tmuxSession{cmd: exec.Command("definitely-not-started"), file: file, name: "piweb-w-s", waitDone: make(chan struct{})}
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
	if err := session.Wait(); err == nil {
		t.Fatalf("Wait() on unstarted command unexpectedly succeeded")
	}
	if err := session.Kill(); err != nil {
		t.Fatalf("Kill() error = %v", err)
	}
}

func TestNewTmuxAttachSessionStartsPTYWithoutRealTmux(t *testing.T) {
	binary := "/bin/sh"
	if _, err := os.Stat(binary); err != nil {
		t.Skip("/bin/sh unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	session, err := newTmuxAttachSession(ctx, binary, []string{"-c", "printf attached"}, t.TempDir(), 90, 25, "piweb-w-s")
	if err != nil {
		if strings.Contains(err.Error(), "operation not permitted") {
			t.Skipf("PTY execution blocked by environment: %v", err)
		}
		t.Fatalf("newTmuxAttachSession() error = %v", err)
	}
	defer session.Close()

	buf := make([]byte, 64)
	n, err := session.Read(buf)
	if err != nil && n == 0 {
		t.Fatalf("Read() error = %v", err)
	}
	if !strings.Contains(string(buf[:n]), "attached") {
		t.Fatalf("PTY output = %q", buf[:n])
	}
	_ = session.Wait()
}

func TestExecTmuxCommandExecutorRunsArgumentVector(t *testing.T) {
	binary := "/bin/sh"
	if _, err := os.Stat(binary); err != nil {
		t.Skip("/bin/sh unavailable")
	}
	out, err := execTmuxCommandExecutor{}.Run(context.Background(), binary, []string{"-c", "printf ok"}, t.TempDir())
	if err != nil {
		if strings.Contains(err.Error(), "operation not permitted") {
			t.Skipf("process execution blocked by environment: %v", err)
		}
		t.Fatalf("Run() error = %v", err)
	}
	if string(out) != "ok" {
		t.Fatalf("Run() output = %q", out)
	}
}

func TestTmuxRunnerAttachRejectsInvalidIdentityBeforeTmuxCommand(t *testing.T) {
	exec := &fakeTmuxExecutor{}
	_, err := (TmuxRunner{ManagedPrefix: "piweb-", Executor: exec}).Attach(context.Background(), StartRequest{WorkspaceID: "bad;w", SessionID: "s"})
	if err == nil {
		t.Fatalf("invalid attach identity accepted")
	}
	if len(exec.calls) != 0 {
		t.Fatalf("tmux command executed for invalid identity: %#v", exec.calls)
	}
}
