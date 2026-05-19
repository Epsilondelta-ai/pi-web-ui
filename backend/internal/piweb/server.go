package piweb

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Host              string
	Port              string
	AllowedOrigins    []string
	EnablePiExecution bool
	StaticFiles       fs.FS
}

type Server struct {
	store  *Store
	broker *Broker
	runner *Runner
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
	s := &Server{store: store, broker: broker, runner: NewRunner(), mux: http.NewServeMux(), config: config}
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
	s.mux.HandleFunc("GET /api/system/folders", s.listFolders)
	s.mux.HandleFunc("GET /api/workspaces", s.workspaces)
	s.mux.HandleFunc("POST /api/workspaces/open", s.openWorkspace)
	s.mux.HandleFunc("POST /api/workspaces/clone", s.cloneWorkspace)
	s.mux.HandleFunc("DELETE /api/workspaces/{workspaceID}", s.deleteWorkspace)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/sessions", s.workspaceSessions)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/sessions", s.createSession)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files", s.workspaceFiles)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files/read", s.readWorkspaceFile)
	s.mux.HandleFunc("PUT /api/workspaces/{workspaceID}/files/write", s.writeWorkspaceFile)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/status", s.gitStatus)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/shell", s.shellCommand)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}", s.session)
	s.mux.HandleFunc("PATCH /api/sessions/{sessionID}", s.renameSession)
	s.mux.HandleFunc("DELETE /api/sessions/{sessionID}", s.deleteSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/prompt", s.prompt)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/cancel", s.cancelSession)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}/events", s.sessionEvents)
	if s.config.StaticFiles != nil {
		s.mux.HandleFunc("GET /", s.staticFile)
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}

func (s *Server) staticFile(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "." || name == "" {
		name = "index.html"
	}
	if fsFileExists(s.config.StaticFiles, name) {
		http.ServeFileFS(w, r, s.config.StaticFiles, name)
		return
	}
	if staticFallbackToIndex(name) && fsFileExists(s.config.StaticFiles, "index.html") {
		http.ServeFileFS(w, r, s.config.StaticFiles, "index.html")
		return
	}
	http.NotFound(w, r)
}

func fsFileExists(files fs.FS, name string) bool {
	info, err := fs.Stat(files, name)
	return err == nil && !info.IsDir()
}

func staticFallbackToIndex(name string) bool {
	return !strings.HasPrefix(name, "_astro/") && !strings.Contains(path.Base(name), ".")
}

func (s *Server) listFolders(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "~"
	}
	folders, err := ListFolders(path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, folders)
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

func (s *Server) cloneWorkspace(w http.ResponseWriter, r *http.Request) {
	var req CloneWorkspaceRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	workspace, output, err := CloneGitWorkspace(s.context(), s.store, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New(strings.TrimSpace(err.Error()+"\n"+output)))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"workspace": workspace, "output": output})
}

func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWorkspace(r.PathValue("workspaceID")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	session, err := s.store.CreateSession(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"session": session})
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

func (s *Server) readWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	file, err := s.store.ReadFile(r.PathValue("workspaceID"), r.URL.Query().Get("path"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}

func (s *Server) writeWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req WriteFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	file, err := s.store.WriteFile(r.PathValue("workspaceID"), r.URL.Query().Get("path"), req.Content)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}

func (s *Server) gitStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.store.GitStatus(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) shellCommand(w http.ResponseWriter, r *http.Request) {
	var req ShellCommandRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := RunWorkspaceShellCommand(s.context(), s.store, r.PathValue("workspaceID"), req.Command)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	session, messages, err := s.store.Session(r.PathValue("sessionID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session, "messages": messages})
}

func (s *Server) renameSession(w http.ResponseWriter, r *http.Request) {
	var req RenameSessionRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	session, err := s.store.RenameSession(r.PathValue("sessionID"), req.Title)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteSession(r.PathValue("sessionID")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
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
	text := mergePromptAttachments(req.Text, req.Attachments)
	if strings.TrimSpace(text) == "" {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	if session, changed, err := s.store.AutoNameSession(sessionID, text); err != nil {
		writeStoreError(w, err)
		return
	} else if changed {
		s.broker.Publish(sessionID, "session.renamed", session)
	}
	if s.config.EnablePiExecution {
		if err := s.runner.StartPiPrompt(s.context(), s.broker, s.store, sessionID, text); err != nil {
			writeError(w, http.StatusConflict, err)
			return
		}
	} else {
		go s.broker.PublishMockPrompt(s.context(), s.store, sessionID, text)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "realPi": s.config.EnablePiExecution})
}

func (s *Server) cancelSession(w http.ResponseWriter, r *http.Request) {
	cancelled := s.runner.Cancel(r.PathValue("sessionID"))
	if cancelled {
		s.broker.Publish(r.PathValue("sessionID"), "session.status", map[string]string{"status": "cancelled"})
	}
	writeJSON(w, http.StatusOK, map[string]any{"cancelled": cancelled})
}

func (s *Server) sessionEvents(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	s.broker.ServeSession(w, r, sessionID)
}

func mergePromptAttachments(text string, attachments []string) string {
	if len(attachments) == 0 {
		return text
	}
	var b strings.Builder
	b.WriteString(text)
	for i, attachment := range attachments {
		if strings.TrimSpace(attachment) == "" {
			continue
		}
		b.WriteString("\n\n<attachment index=\"")
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString("\">\n")
		b.WriteString(attachment)
		b.WriteString("\n</attachment>")
	}
	return b.String()
}

func (s *Server) context() context.Context {
	return context.Background()
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
