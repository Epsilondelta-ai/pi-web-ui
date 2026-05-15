package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/Epsilondelta-ai/pi-web-ui/internal/terminal"
)

type Server struct {
	Config config.Config
	Mux    *http.ServeMux
}

func New(cfg config.Config, runner terminal.Runner, events terminal.EventSink) *Server {
	mux := http.NewServeMux()
	tmuxManager := tmuxManagerFrom(cfg, runner)
	termHandler := terminal.Handler{Config: cfg, Runner: runner, Tmux: tmuxManager, Events: events}
	mux.Handle("/api/terminals/", termHandler)
	mux.Handle("/api/tmux/sessions", tmuxSessionsHandler(cfg, tmuxManager, events))
	mux.Handle("/api/tmux/sessions/", tmuxSessionActionHandler(cfg, tmuxManager, events))
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.Handle("/", http.FileServer(http.Dir("dist")))
	return &Server{Config: cfg, Mux: mux}
}

func (s *Server) Handler() http.Handler {
	return s.Mux
}

func tmuxManagerFrom(cfg config.Config, runner terminal.Runner) terminal.TmuxManager {
	if manager, ok := runner.(terminal.TmuxManager); ok {
		return manager
	}
	tmuxRunner := terminal.NewTmuxRunner(cfg.TmuxBinaryPath, cfg.TmuxManagedPrefix)
	return tmuxRunner
}

func tmuxSessionsHandler(cfg config.Config, manager terminal.TmuxManager, events terminal.EventSink) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}
		if !validateTmuxRESTPolicy(w, r, cfg, events) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		sessions, err := manager.List(ctx)
		if err != nil {
			http.Error(w, "tmux operation failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
	})
}

func tmuxSessionActionHandler(cfg config.Config, manager terminal.TmuxManager, events terminal.EventSink) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		if !validateTmuxRESTPolicy(w, r, cfg, events) {
			return
		}
		name, ok := parseTmuxKillRoute(r.URL.Path)
		if !ok || !validManagedRouteName(name, cfg.TmuxManagedPrefix) {
			emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectInvalidSession)})
			http.Error(w, "tmux operation rejected", http.StatusForbidden)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		state, err := manager.Kill(ctx, name)
		if err != nil {
			emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectInvalidSession)})
			http.Error(w, "tmux operation rejected", http.StatusForbidden)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"name": name, "state": state})
	})
}

func validateTmuxRESTPolicy(w http.ResponseWriter, r *http.Request, cfg config.Config, events terminal.EventSink) bool {
	if !validRequestOrigin(cfg, r) {
		emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectInvalidOrigin)})
		http.Error(w, "tmux operation rejected", http.StatusForbidden)
		return false
	}
	if _, ok := cfg.ValidateWorkspace(r.URL.Query().Get("workspace")); !ok {
		emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectInvalidWorkspace)})
		http.Error(w, "tmux operation rejected", http.StatusForbidden)
		return false
	}
	if _, ok := cfg.ValidateCommand(r.URL.Query().Get("command")); !ok {
		emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectInvalidCommand)})
		http.Error(w, "tmux operation rejected", http.StatusForbidden)
		return false
	}
	if err := cfg.ValidateTmuxBinary(); err != nil {
		emit(events, terminal.Event{Name: terminal.EventRejected, Code: string(config.RejectTmuxUnavailable)})
		http.Error(w, "tmux operation rejected", http.StatusServiceUnavailable)
		return false
	}
	return true
}

func validRequestOrigin(cfg config.Config, r *http.Request) bool {
	if cfg.ValidateOrigin(r.Header.Get("Origin")) {
		return true
	}
	if r.Header.Get("Origin") != "" || r.Host == "" {
		return false
	}
	return cfg.ValidateOrigin("http://"+r.Host) || cfg.ValidateOrigin("https://"+r.Host)
}

func validManagedRouteName(name, prefix string) bool {
	if !terminal.HasManagedPrefix(name, prefix) {
		return false
	}
	_, err := terminal.SanitizeSessionName(strings.TrimPrefix(name, prefix))
	return err == nil
}

func parseTmuxKillRoute(path string) (string, bool) {
	trimmed := strings.Trim(path, "/")
	prefix := "api/tmux/sessions/"
	if !strings.HasPrefix(trimmed, prefix) || !strings.HasSuffix(trimmed, "/kill") {
		return "", false
	}
	name := strings.TrimSuffix(strings.TrimPrefix(trimmed, prefix), "/kill")
	if name == "" || strings.Contains(name, "/") {
		return "", false
	}
	return name, true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func emit(sink terminal.EventSink, event terminal.Event) {
	if sink == nil {
		return
	}
	sink.Emit(event)
}
