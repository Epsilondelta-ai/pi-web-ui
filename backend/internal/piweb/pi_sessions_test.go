package piweb

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParsePiSessionLine(t *testing.T) {
	msg, ok := ParsePiSessionLine(`{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","name":"read","arguments":{"path":"README.md"}}]}}`)
	if !ok || msg.Kind != "tool" || msg.Tool != "read" || msg.Status != "running" {
		t.Fatalf("unexpected message: %#v %v", msg, ok)
	}
}

func TestParsePiSessionLineMessagesKeepsThinkingAndAnswer(t *testing.T) {
	messages := ParsePiSessionLineMessages(`{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"checking"},{"type":"text","text":"done"}]}}`)
	if len(messages) != 2 || messages[0].Kind != "think" || messages[1].Kind != "pi" || messages[1].Text != "done" {
		t.Fatalf("unexpected messages: %#v", messages)
	}
}

func TestParsePiSessionFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "session.jsonl")
	data := `{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/project"}
{"type":"message","id":"a","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hello world"}}
{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"hi"}],"provider":"x","model":"m","stopReason":"stop"}}
`
	if err := os.WriteFile(file, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	parsed, err := ParsePiSessionFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Session.ID != "s1" || parsed.Session.Title != "hello world" || len(parsed.Messages) != 2 {
		t.Fatalf("unexpected parsed session: %#v", parsed)
	}
}

func TestNewPiStore(t *testing.T) {
	root := t.TempDir()
	sessionDir := filepath.Join(root, "--tmp-project--")
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(sessionDir, "session.jsonl")
	data := `{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/project"}
{"type":"message","id":"a","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hello"}}
`
	if err := os.WriteFile(file, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewPiStore(root)
	if err != nil {
		t.Fatal(err)
	}
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || workspaces[0].ID != "project" || len(workspaces[0].Sessions) != 1 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
}
