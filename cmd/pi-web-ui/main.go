package main

import (
	"log"
	"net/http"

	"github.com/Epsilondelta-ai/pi-web-ui/internal/config"
	"github.com/Epsilondelta-ai/pi-web-ui/internal/server"
	"github.com/Epsilondelta-ai/pi-web-ui/internal/terminal"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}

func run() error {
	return runWith(func(httpServer *http.Server) error {
		return httpServer.ListenAndServe()
	})
}

func runWith(listen func(*http.Server) error) error {
	httpServer, err := newHTTPServer()
	if err != nil {
		return err
	}
	log.Printf("pi-web-ui listening on http://%s", httpServer.Addr)
	return listen(httpServer)
}

func newHTTPServer() (*http.Server, error) {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return nil, err
	}

	events := terminal.EventSinkFunc(func(event terminal.Event) {
		// Lifecycle names and non-secret reason codes only; raw terminal streams are never logged.
		log.Printf("event=%s workspace=%s session=%s code=%s", event.Name, event.WorkspaceID, event.SessionID, event.Code)
	})
	srv := server.New(cfg, terminal.PTYRunner{}, events)
	return &http.Server{Addr: cfg.Addr(), Handler: srv.Handler()}, nil
}
