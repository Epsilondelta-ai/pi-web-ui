package terminal

import (
	"context"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

const processGroupShutdownTimeout = 2 * time.Second

type StartRequest struct {
	WorkspaceID string
	SessionID   string
	Workspace   string
	Command     string
	Cols        uint16
	Rows        uint16
}

type Session interface {
	io.Reader
	io.Writer
	io.Closer
	Resize(cols, rows uint16) error
	Wait() error
	Kill() error
}

type Runner interface {
	Start(ctx context.Context, request StartRequest) (Session, error)
}

type PTYRunner struct{}

func (PTYRunner) Start(ctx context.Context, request StartRequest) (Session, error) {
	cmd, cols, rows := newPTYCommand(request)
	file, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: rows, Cols: cols})
	if err != nil {
		return nil, err
	}
	session := newPTYSession(cmd, file)
	go func() {
		<-ctx.Done()
		_ = session.Kill()
	}()
	return session, nil
}

func newPTYCommand(request StartRequest) (*exec.Cmd, uint16, uint16) {
	cmd := exec.Command(request.Command)
	cmd.Dir = request.Workspace
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	configureProcessGroup(cmd)

	rows := request.Rows
	cols := request.Cols
	if rows == 0 {
		rows = 24
	}
	if cols == 0 {
		cols = 80
	}
	return cmd, cols, rows
}

type ptySession struct {
	cmd      *exec.Cmd
	file     *os.File
	waitOnce sync.Once
	waitDone chan struct{}
	waitErr  error
}

func newPTYSession(cmd *exec.Cmd, file *os.File) *ptySession {
	return &ptySession{cmd: cmd, file: file, waitDone: make(chan struct{})}
}

func (s *ptySession) Read(p []byte) (int, error)  { return s.file.Read(p) }
func (s *ptySession) Write(p []byte) (int, error) { return s.file.Write(p) }
func (s *ptySession) Close() error                { return s.file.Close() }
func (s *ptySession) Wait() error {
	s.waitOnce.Do(func() {
		s.waitErr = s.cmd.Wait()
		close(s.waitDone)
	})
	return s.waitErr
}
func (s *ptySession) Resize(cols, rows uint16) error {
	return pty.Setsize(s.file, &pty.Winsize{Rows: rows, Cols: cols})
}
func (s *ptySession) Kill() error {
	if s.cmd.Process == nil {
		return nil
	}
	go func() { _ = s.Wait() }()
	_ = terminateProcessGroup(s.cmd, softSignal)
	select {
	case <-s.waitDone:
		return s.waitErr
	case <-time.After(processGroupShutdownTimeout):
		_ = terminateProcessGroup(s.cmd, hardSignal)
		return s.Wait()
	}
}
