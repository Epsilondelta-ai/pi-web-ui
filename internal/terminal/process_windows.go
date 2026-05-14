//go:build windows

package terminal

import (
	"os"
	"os/exec"
)

type processSignal int

const (
	softSignal processSignal = iota
	hardSignal
)

func configureProcessGroup(*exec.Cmd) {}

func processGroupID(cmd *exec.Cmd) (int, error) {
	if cmd.Process == nil {
		return 0, os.ErrProcessDone
	}
	return cmd.Process.Pid, nil
}

func terminateProcessGroup(cmd *exec.Cmd, _ processSignal) error {
	if cmd.Process == nil {
		return os.ErrProcessDone
	}
	return cmd.Process.Kill()
}

func processGroupConfigured(*exec.Cmd) bool { return true }
