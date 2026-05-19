package piweb

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type RuntimeStatus struct {
	Model         string `json:"model"`
	FiveHourQuota *int   `json:"fiveHourQuota,omitempty"`
	WeeklyQuota   *int   `json:"weeklyQuota,omitempty"`
	CurrentBranch string `json:"currentBranch"`
}

func MockRuntimeStatus() RuntimeStatus {
	fiveHour := 84
	weekly := 14
	return RuntimeStatus{Model: "GPT-5.5", FiveHourQuota: &fiveHour, WeeklyQuota: &weekly, CurrentBranch: "main"}
}

func WorkspaceRuntimeStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	status := RuntimeStatus{}
	if model, err := CurrentPiModel(ctx, root); err == nil {
		status.Model = model
	}
	if git, err := RealGitStatus(root); err == nil {
		status.CurrentBranch = git.Branch
	}
	fiveHour, weekly := RuntimeQuota(root)
	status.FiveHourQuota = fiveHour
	status.WeeklyQuota = weekly
	return status, nil
}

func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}
	defer func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"state","type":"get_state"}`+"\n"); err != nil {
		return "", err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		model, matched, err := parseStateModelRPCLine(scanner.Text())
		if err != nil {
			return "", err
		}
		if matched {
			return model, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return "", fmt.Errorf("pi get_state failed: %s", output)
	}
	return "", fmt.Errorf("pi get_state returned no response")
}

func parseStateModelRPCLine(line string) (string, bool, error) {
	var response struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Command string `json:"command"`
		Success bool   `json:"success"`
		Error   string `json:"error"`
		Data    struct {
			Model *struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Provider string `json:"provider"`
			} `json:"model"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return "", false, nil
	}
	if response.ID != "state" || response.Type != "response" || response.Command != "get_state" {
		return "", false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = "pi get_state failed"
		}
		return "", true, fmt.Errorf("%s", response.Error)
	}
	if response.Data.Model == nil {
		return "", true, nil
	}
	if strings.TrimSpace(response.Data.Model.Name) != "" {
		return response.Data.Model.Name, true, nil
	}
	if strings.TrimSpace(response.Data.Model.ID) != "" {
		return response.Data.Model.ID, true, nil
	}
	return response.Data.Model.Provider, true, nil
}

func RuntimeQuota(root string) (*int, *int) {
	fiveHour, weekly := quotaFromFile(root)
	if fiveHour == nil {
		fiveHour = quotaFromEnv("PI_WEB_5H_QUOTA_PERCENT", "PI_WEB_5H_QUOTA")
	}
	if weekly == nil {
		weekly = quotaFromEnv("PI_WEB_WEEKLY_QUOTA_PERCENT", "PI_WEB_WEEKLY_QUOTA")
	}
	return fiveHour, weekly
}

func quotaFromFile(root string) (*int, *int) {
	paths := []string{filepath.Join(root, ".pi", "web-status.json")}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, ".pi", "agent", "web-status.json"))
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var payload struct {
			FiveHourQuota *int `json:"fiveHourQuota"`
			WeeklyQuota   *int `json:"weeklyQuota"`
		}
		if json.Unmarshal(data, &payload) == nil {
			return normalizePercent(payload.FiveHourQuota), normalizePercent(payload.WeeklyQuota)
		}
	}
	return nil, nil
}

func quotaFromEnv(names ...string) *int {
	for _, name := range names {
		if value, ok := os.LookupEnv(name); ok {
			parsed, err := strconv.Atoi(strings.TrimSpace(value))
			if err == nil {
				return normalizePercent(&parsed)
			}
		}
	}
	return nil
}

func normalizePercent(value *int) *int {
	if value == nil {
		return nil
	}
	v := *value
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return &v
}
