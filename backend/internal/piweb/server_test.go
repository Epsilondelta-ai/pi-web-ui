package piweb

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHealthEndpoint(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceAndSessionManagementEndpoints(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, store, NewBroker())

	createReq := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", nil)
	createRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(createRes, createReq)
	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", createRes.Code, createRes.Body.String())
	}

	var body struct {
		Session Session `json:"session"`
	}
	if err := json.NewDecoder(createRes.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	renameReq := httptest.NewRequest(http.MethodPatch, "/api/sessions/"+body.Session.ID, bytes.NewBufferString(`{"title":"renamed"}`))
	renameRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(renameRes, renameReq)
	if renameRes.Code != http.StatusOK || !strings.Contains(renameRes.Body.String(), "renamed") {
		t.Fatalf("rename failed: %d %s", renameRes.Code, renameRes.Body.String())
	}
	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/sessions/"+body.Session.ID, nil)
	deleteRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(deleteRes, deleteReq)
	if deleteRes.Code != http.StatusOK {
		t.Fatalf("delete failed: %d %s", deleteRes.Code, deleteRes.Body.String())
	}
}

func TestCreateSessionEndpoint(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, store, NewBroker())
	req := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"title":"new session"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestPromptPublishesSSE(t *testing.T) {
	broker := NewBroker()
	broker.heartbeat = time.Hour
	server := NewServer(Config{}, NewMockStore(), broker)
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	eventsReq, err := http.NewRequest(http.MethodGet, testServer.URL+"/api/sessions/8e7c-44ff/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	eventsRes, err := testServer.Client().Do(eventsReq)
	if err != nil {
		t.Fatal(err)
	}
	defer eventsRes.Body.Close()
	if eventsRes.StatusCode != http.StatusOK {
		t.Fatalf("expected event stream 200, got %d", eventsRes.StatusCode)
	}

	promptRes, err := testServer.Client().Post(testServer.URL+"/api/sessions/8e7c-44ff/prompt", "application/json", bytes.NewBufferString(`{"text":"hello"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer promptRes.Body.Close()
	if promptRes.StatusCode != http.StatusAccepted {
		t.Fatalf("expected prompt 202, got %d", promptRes.StatusCode)
	}

	lines := make(chan string, 16)
	go func() {
		scanner := bufio.NewScanner(eventsRes.Body)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
	}()

	deadline := time.After(2 * time.Second)
	for {
		select {
		case line := <-lines:
			if line == "event: session.message" {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for session.message event")
		}
	}
}
