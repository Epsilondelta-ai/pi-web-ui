package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const (
	DefaultHost              = "127.0.0.1"
	DefaultPort              = "8787"
	DefaultCommand           = "pi"
	DefaultTmuxBinaryPath    = "tmux"
	DefaultTmuxManagedPrefix = "piweb-"
)

type Config struct {
	Host              string
	Port              string
	ServedOrigin      string
	ExtraOrigins      []string
	WorkspaceRoots    []string
	Command           string
	TmuxEnabled       bool
	TmuxBinaryPath    string
	TmuxManagedPrefix string
}

type RejectionCode string

const (
	RejectInvalidOrigin    RejectionCode = "invalid_origin"
	RejectInvalidWorkspace RejectionCode = "invalid_workspace"
	RejectInvalidCommand   RejectionCode = "invalid_command"
	RejectInvalidSession   RejectionCode = "invalid_session"
	RejectTmuxUnavailable  RejectionCode = "tmux_unavailable"
)

func LoadFromEnv() (Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Host:              getenv("PI_WEB_HOST", DefaultHost),
		Port:              getenv("PI_WEB_PORT", DefaultPort),
		ServedOrigin:      os.Getenv("PI_WEB_ORIGIN"),
		ExtraOrigins:      splitList(os.Getenv("PI_WEB_EXTRA_ORIGINS")),
		WorkspaceRoots:    splitList(os.Getenv("PI_WEB_WORKSPACE_ROOTS")),
		Command:           getenv("PI_WEB_COMMAND", DefaultCommand),
		TmuxEnabled:       getenvBool("PI_WEB_TMUX_ENABLED", true),
		TmuxBinaryPath:    getenv("PI_WEB_TMUX_BINARY", DefaultTmuxBinaryPath),
		TmuxManagedPrefix: getenv("PI_WEB_TMUX_PREFIX", DefaultTmuxManagedPrefix),
	}
	if len(cfg.WorkspaceRoots) == 0 {
		cfg.WorkspaceRoots = []string{cwd}
	}
	if cfg.ServedOrigin == "" {
		cfg.ServedOrigin = fmt.Sprintf("http://%s:%s", cfg.Host, cfg.Port)
	}
	return cfg.Normalized()
}

func (c Config) Addr() string {
	return c.Host + ":" + c.Port
}

func (c Config) Normalized() (Config, error) {
	if c.Host == "" {
		c.Host = DefaultHost
	}
	if c.Port == "" {
		c.Port = DefaultPort
	}
	if c.Command == "" {
		c.Command = DefaultCommand
	}
	if c.TmuxBinaryPath == "" {
		c.TmuxBinaryPath = DefaultTmuxBinaryPath
	}
	if c.TmuxManagedPrefix == "" {
		c.TmuxManagedPrefix = DefaultTmuxManagedPrefix
	}
	if strings.TrimSpace(c.TmuxManagedPrefix) != c.TmuxManagedPrefix || !strings.HasSuffix(c.TmuxManagedPrefix, "-") {
		return Config{}, fmt.Errorf("tmux managed prefix must be trimmed and end with hyphen")
	}
	if c.Host != DefaultHost && c.Host != "localhost" {
		return Config{}, fmt.Errorf("host must be explicitly local, got %q", c.Host)
	}
	if c.ServedOrigin == "" {
		c.ServedOrigin = fmt.Sprintf("http://%s:%s", c.Host, c.Port)
	}
	if err := validateExactOrigin(c.ServedOrigin); err != nil {
		return Config{}, fmt.Errorf("served origin: %w", err)
	}
	for _, origin := range c.ExtraOrigins {
		if err := validateExactOrigin(origin); err != nil {
			return Config{}, fmt.Errorf("extra origin %q: %w", origin, err)
		}
	}

	roots := make([]string, 0, len(c.WorkspaceRoots))
	for _, root := range c.WorkspaceRoots {
		clean, err := CanonicalPath(root)
		if err != nil {
			return Config{}, fmt.Errorf("workspace root %q: %w", root, err)
		}
		roots = append(roots, clean)
	}
	c.WorkspaceRoots = roots
	return c, nil
}

func (c Config) ValidateOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	if origin == c.ServedOrigin {
		return true
	}
	for _, extra := range c.ExtraOrigins {
		if origin == extra {
			return true
		}
	}
	return false
}

func (c Config) ValidateWorkspace(path string) (string, bool) {
	clean, err := CanonicalPath(path)
	if err != nil {
		return "", false
	}
	for _, root := range c.WorkspaceRoots {
		if pathWithin(root, clean) {
			return clean, true
		}
	}
	return "", false
}

func (c Config) ValidateTmuxBinary() error {
	if !c.TmuxEnabled {
		return errors.New("tmux disabled")
	}
	binary := strings.TrimSpace(c.TmuxBinaryPath)
	if binary == "" {
		binary = DefaultTmuxBinaryPath
	}
	if strings.ContainsAny(binary, string(filepath.Separator)) {
		info, err := os.Stat(binary)
		if err != nil {
			return errors.New("tmux unavailable")
		}
		if info.IsDir() || (runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0) {
			return errors.New("tmux unavailable")
		}
		return nil
	}
	if _, err := exec.LookPath(binary); err != nil {
		return errors.New("tmux unavailable")
	}
	return nil
}

func (c Config) ValidateCommand(requested string) (string, bool) {
	configured := strings.TrimSpace(c.Command)
	if configured == "" {
		configured = DefaultCommand
	}
	if strings.TrimSpace(requested) == "" || requested == configured {
		return configured, true
	}

	configuredBase := filepath.Base(configured)
	requestedBase := filepath.Base(requested)
	if !strings.ContainsAny(requested, string(filepath.Separator)) && requestedBase == configuredBase {
		return configured, true
	}
	return "", false
}

func CanonicalPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("empty path")
	}
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, strings.TrimPrefix(path, "~"))
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if evaluated, err := filepath.EvalSymlinks(abs); err == nil {
		abs = evaluated
	}
	return filepath.Clean(abs), nil
}

func pathWithin(root, child string) bool {
	if runtime.GOOS == "windows" {
		root = strings.ToLower(root)
		child = strings.ToLower(child)
	}
	if child == root {
		return true
	}
	rel, err := filepath.Rel(root, child)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func validateExactOrigin(origin string) error {
	if strings.Contains(origin, "*") {
		return errors.New("wildcard origins are not allowed")
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("origin must use http or https")
	}
	if parsed.Host == "" {
		return errors.New("origin requires host")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return errors.New("origin must not include path")
	}
	return nil
}

func getenv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getenvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitList(value string) []string {
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == '\n' })
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
