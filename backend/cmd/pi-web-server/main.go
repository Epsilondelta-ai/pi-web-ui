package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pi-web-ui/backend/internal/piweb"
)

func main() {
	host := flag.String("host", "127.0.0.1", "host to bind")
	port := flag.String("port", "8732", "port to bind")
	mock := flag.Bool("mock", false, "mock prompt streaming instead of executing the local pi CLI")
	flag.Parse()

	store := piweb.NewAutoStore()
	if *mock {
		store = piweb.NewMockStore()
	}
	server := piweb.NewServer(piweb.Config{Host: *host, Port: *port, EnablePiExecution: !*mock}, store, piweb.NewBroker())
	httpServer := &http.Server{Addr: server.Addr(), Handler: server.Handler(), ReadHeaderTimeout: 5 * time.Second}

	go func() {
		slog.Info("pi web backend listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Error("shutdown failed", "error", err)
		os.Exit(1)
	}
	slog.Info("pi web backend stopped")
}
