package piweb

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	Host           string
	Port           string
	AllowedOrigins []string
}

type Server struct {
	store  *Store
	broker *Broker
	mux    *http.ServeMux
	config Config
}

func NewServer(config Config, store *Store, broker *Broker) *Server {
	if config.Host == "" {
		config.Host = "127.0.0.1"
	}
	if config.Port == "" {
		config.Port = "8732"
	}
	if len(config.AllowedOrigins) == 0 {
		config.AllowedOrigins = []string{"http://localhost:4321", "http://127.0.0.1:4321", "http://localhost:6006", "http://127.0.0.1:6006"}
	}
	s := &Server{store: store, broker: broker, mux: http.NewServeMux(), config: config}
	s.routes()
	return s
}

func (s *Server) Addr() string {
	return s.config.Host + ":" + s.config.Port
}

func (s *Server) Handler() http.Handler {
	return s.withLogging(s.withCORS(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/workspaces", s.workspaces)
	s.mux.HandleFunc("POST /api/workspaces/open", s.openWorkspace)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/sessions", s.workspaceSessions)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files", s.workspaceFiles)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/status", s.gitStatus)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}", s.session)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/prompt", s.prompt)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}/events", s.sessionEvents)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}

func (s *Server) workspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": s.store.Workspaces()})
}

func (s *Server) openWorkspace(w http.ResponseWriter, r *http.Request) {
	var req OpenWorkspaceRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	workspace, err := s.store.OpenWorkspace(req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}

func (s *Server) workspaceSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.store.Sessions(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (s *Server) workspaceFiles(w http.ResponseWriter, r *http.Request) {
	files, err := s.store.Files(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}

func (s *Server) gitStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.store.GitStatus(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	session, messages, err := s.store.Session(r.PathValue("sessionID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session, "messages": messages})
}

func (s *Server) prompt(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	var req PromptRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Text) == "" {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	go s.broker.PublishMockPrompt(s.context(), s.store, sessionID, req.Text)
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
}

func (s *Server) sessionEvents(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	s.broker.ServeSession(w, r, sessionID)
}

func (s *Server) context() context.Context {
	return context.Background()
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	for _, allowed := range s.config.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start).String())
	})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, ErrorResponse{Error: err.Error()})
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}
