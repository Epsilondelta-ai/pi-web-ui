package server

import (
	"net/http"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/Epsilondelta-ai/pi-web-ui/internal/terminal"
)

type Server struct {
	Config config.Config
	Mux    *http.ServeMux
}

func New(cfg config.Config, runner terminal.Runner, events terminal.EventSink) *Server {
	mux := http.NewServeMux()
	termHandler := terminal.Handler{Config: cfg, Runner: runner, Events: events}
	mux.Handle("/api/terminals/", termHandler)
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
