package terminal

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/creack/pty"
)

const (
	defaultTmuxBinary        = "tmux"
	defaultTmuxManagedPrefix = "piweb-"
	maxTmuxIdentityLength    = 48
)

var tmuxIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,47}$`)

var (
	ErrInvalidTmuxSession = errors.New("invalid tmux session")
	ErrStaleTmuxSession   = errors.New("stale tmux session")
)

type TmuxCommandExecutor interface {
	Run(ctx context.Context, binary string, args []string, dir string) ([]byte, error)
}

type execTmuxCommandExecutor struct{}

func (execTmuxCommandExecutor) Run(ctx context.Context, binary string, args []string, dir string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	return cmd.CombinedOutput()
}

type TmuxAttachFactory func(ctx context.Context, binary string, args []string, dir string, cols, rows uint16, name string) (Session, error)

type TmuxRunner struct {
	BinaryPath    string
	ManagedPrefix string
	Executor      TmuxCommandExecutor
	AttachFactory TmuxAttachFactory
}

type TmuxSessionInfo struct {
	Name     string         `json:"name"`
	Identity string         `json:"identity"`
	State    LifecycleState `json:"state"`
}

type TmuxManager interface {
	Runner
	Attach(ctx context.Context, request StartRequest) (Session, error)
	Kill(ctx context.Context, name string) (LifecycleState, error)
	List(ctx context.Context) ([]TmuxSessionInfo, error)
}

func NewTmuxRunner(binaryPath, managedPrefix string) TmuxRunner {
	return TmuxRunner{BinaryPath: binaryPath, ManagedPrefix: managedPrefix}
}

// @MX:WARN: [AUTO] tmux session identity accepts only bounded alphanumeric-hyphen values.
// @MX:REASON: Unsanitized names can target unmanaged tmux sessions or cross argument boundaries.
func SanitizeSessionName(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || len(trimmed) > maxTmuxIdentityLength || !tmuxIdentityPattern.MatchString(trimmed) || strings.Contains(trimmed, "--") {
		return "", ErrInvalidTmuxSession
	}
	return trimmed, nil
}

func HasManagedPrefix(name, prefix string) bool {
	if prefix == "" {
		prefix = defaultTmuxManagedPrefix
	}
	return strings.HasPrefix(name, prefix) && len(name) > len(prefix)
}

func ManagedSessionName(prefix, workspaceID, sessionID string) (string, error) {
	if prefix == "" {
		prefix = defaultTmuxManagedPrefix
	}
	workspace, err := SanitizeSessionName(workspaceID)
	if err != nil {
		return "", err
	}
	session, err := SanitizeSessionName(sessionID)
	if err != nil {
		return "", err
	}
	identity, err := SanitizeSessionName(workspace + "-" + session)
	if err != nil {
		return "", err
	}
	return prefix + identity, nil
}

func (r TmuxRunner) Start(ctx context.Context, request StartRequest) (Session, error) {
	name, err := ManagedSessionName(r.prefix(), request.WorkspaceID, request.SessionID)
	if err != nil {
		return nil, err
	}
	cols, rows := tmuxSize(request.Cols, request.Rows)
	// @MX:WARN: [AUTO] tmux execution must stay argument-vector only; never use shell-concatenated user input.
	// @MX:REASON: Session identity and command values cross local process execution boundary.
	if _, err := r.executor().Run(ctx, r.binary(), []string{"new-session", "-d", "-s", name, "-x", strconv.Itoa(int(cols)), "-y", strconv.Itoa(int(rows)), request.Command}, request.Workspace); err != nil {
		return nil, err
	}
	return r.attachManaged(ctx, request, name)
}

func (r TmuxRunner) Attach(ctx context.Context, request StartRequest) (Session, error) {
	name, err := ManagedSessionName(r.prefix(), request.WorkspaceID, request.SessionID)
	if err != nil {
		return nil, err
	}
	if err := r.ensureManagedExists(ctx, request.Workspace, name); err != nil {
		return nil, err
	}
	return r.attachManaged(ctx, request, name)
}

func (r TmuxRunner) Kill(ctx context.Context, name string) (LifecycleState, error) {
	if err := r.validateManagedName(name); err != nil {
		return LifecycleError, err
	}
	_, err := r.executor().Run(ctx, r.binary(), []string{"kill-session", "-t", name}, "")
	if err != nil {
		return LifecycleStale, nil
	}
	return LifecycleKilled, nil
}

func (r TmuxRunner) List(ctx context.Context) ([]TmuxSessionInfo, error) {
	out, err := r.executor().Run(ctx, r.binary(), []string{"list-sessions", "-F", "#{session_name}\t#{session_attached}"}, "")
	if err != nil {
		return []TmuxSessionInfo{}, nil
	}
	return parseTmuxSessionList(string(out), r.prefix()), nil
}

func (r TmuxRunner) attachManaged(ctx context.Context, request StartRequest, name string) (Session, error) {
	if err := r.detachExistingClients(ctx, request.Workspace, name); err != nil {
		return nil, err
	}
	cols, rows := tmuxSize(request.Cols, request.Rows)
	return r.attachFactory()(ctx, r.binary(), []string{"attach-session", "-t", name}, request.Workspace, cols, rows, name)
}

func (r TmuxRunner) ensureManagedExists(ctx context.Context, dir, name string) error {
	if err := r.validateManagedName(name); err != nil {
		return err
	}
	if _, err := r.executor().Run(ctx, r.binary(), []string{"has-session", "-t", name}, dir); err != nil {
		return ErrStaleTmuxSession
	}
	return nil
}

func (r TmuxRunner) detachExistingClients(ctx context.Context, dir, name string) error {
	if err := r.validateManagedName(name); err != nil {
		return err
	}
	out, err := r.executor().Run(ctx, r.binary(), []string{"list-clients", "-t", name, "-F", "#{client_tty}"}, dir)
	if err != nil {
		return nil
	}
	if strings.TrimSpace(string(out)) == "" {
		return nil
	}
	// @MX:NOTE: [AUTO] New browser attachment deterministically replaces previous tmux client.
	// @MX:REASON: Same-session policy is single attachment, preventing split input streams.
	_, err = r.executor().Run(ctx, r.binary(), []string{"detach-client", "-s", name}, dir)
	return err
}

func (r TmuxRunner) validateManagedName(name string) error {
	if !HasManagedPrefix(name, r.prefix()) {
		return ErrInvalidTmuxSession
	}
	identity := strings.TrimPrefix(name, r.prefix())
	_, err := SanitizeSessionName(identity)
	return err
}

func (r TmuxRunner) binary() string {
	if strings.TrimSpace(r.BinaryPath) == "" {
		return defaultTmuxBinary
	}
	return strings.TrimSpace(r.BinaryPath)
}

func (r TmuxRunner) prefix() string {
	if strings.TrimSpace(r.ManagedPrefix) == "" {
		return defaultTmuxManagedPrefix
	}
	return strings.TrimSpace(r.ManagedPrefix)
}

func (r TmuxRunner) executor() TmuxCommandExecutor {
	if r.Executor == nil {
		return execTmuxCommandExecutor{}
	}
	return r.Executor
}

func (r TmuxRunner) attachFactory() TmuxAttachFactory {
	if r.AttachFactory == nil {
		return newTmuxAttachSession
	}
	return r.AttachFactory
}

func tmuxSize(cols, rows uint16) (uint16, uint16) {
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}
	return cols, rows
}

func parseTmuxSessionList(output, prefix string) []TmuxSessionInfo {
	infos := []TmuxSessionInfo{}
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		name := parts[0]
		if !HasManagedPrefix(name, prefix) {
			continue
		}
		identity := strings.TrimPrefix(name, prefix)
		if _, err := SanitizeSessionName(identity); err != nil {
			continue
		}
		state := LifecycleDetached
		if len(parts) > 1 && strings.TrimSpace(parts[1]) != "0" && strings.TrimSpace(parts[1]) != "" {
			state = LifecycleLive
		}
		infos = append(infos, TmuxSessionInfo{Name: name, Identity: identity, State: state})
	}
	return infos
}

func newTmuxAttachSession(ctx context.Context, binary string, args []string, dir string, cols, rows uint16, name string) (Session, error) {
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	configureProcessGroup(cmd)
	file, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: rows, Cols: cols})
	if err != nil {
		return nil, err
	}
	return &tmuxSession{cmd: cmd, file: file, name: name, waitDone: make(chan struct{})}, nil
}

// @MX:ANCHOR: [AUTO] tmuxSession owns managed attach/detach/kill lifecycle for persistent terminal sessions.
// @MX:REASON: Handler start, attach, disconnect, route kill, and tests depend on this session boundary.
type tmuxSession struct {
	cmd      *exec.Cmd
	file     *os.File
	name     string
	waitOnce sync.Once
	waitDone chan struct{}
	waitErr  error
}

func (s *tmuxSession) Read(p []byte) (int, error)  { return s.file.Read(p) }
func (s *tmuxSession) Write(p []byte) (int, error) { return s.file.Write(p) }
func (s *tmuxSession) Resize(cols, rows uint16) error {
	return pty.Setsize(s.file, &pty.Winsize{Rows: rows, Cols: cols})
}
func (s *tmuxSession) Close() error {
	if s.file != nil {
		_ = s.file.Close()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = terminateProcessGroup(s.cmd, softSignal)
	}
	return nil
}
func (s *tmuxSession) Wait() error {
	s.waitOnce.Do(func() {
		if s.cmd == nil {
			s.waitErr = nil
		} else {
			s.waitErr = s.cmd.Wait()
		}
		close(s.waitDone)
	})
	return s.waitErr
}
func (s *tmuxSession) Kill() error {
	return s.Close()
}

var _ Session = (*tmuxSession)(nil)
