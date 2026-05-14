//go:build !windows

package terminal

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

const (
	softSignal = syscall.SIGTERM
	hardSignal = syscall.SIGKILL
)

func configureProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func processGroupID(cmd *exec.Cmd) (int, error) {
	if cmd.Process == nil {
		return 0, os.ErrProcessDone
	}
	return syscall.Getpgid(cmd.Process.Pid)
}

func terminateProcessGroup(cmd *exec.Cmd, signal syscall.Signal) error {
	pgid, err := processGroupID(cmd)
	if err != nil {
		return err
	}
	if err := syscall.Kill(-pgid, signal); err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return nil
		}
		return err
	}
	return nil
}

func processGroupConfigured(cmd *exec.Cmd) bool {
	return cmd.SysProcAttr != nil && cmd.SysProcAttr.Setpgid
}
