package piweb

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateWorkspacePath(t *testing.T) {
	if _, err := ValidateWorkspacePath(""); err == nil {
		t.Fatal("expected empty path to fail")
	}
	if _, err := ValidateWorkspacePath("/tmp/project"); err != nil {
		t.Fatalf("expected valid path: %v", err)
	}
}

func TestWebStoreLoadsOnlyWebRecents(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	wanted := t.TempDir()
	unwanted := t.TempDir()
	if _, _, err := CreatePiSessionFile(wanted); err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreatePiSessionFile(unwanted); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(t.TempDir(), "pi-web.db")
	if err := SaveWebWorkspacePaths(dbPath, []string{wanted}); err != nil {
		t.Fatal(err)
	}
	store := NewWebStore(dbPath)
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || workspaces[0].Path != wanted || len(workspaces[0].Sessions) != 1 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
}

func TestCreateSession(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	workspaceRoot := t.TempDir()
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	file, cwd, ok := store.SessionRuntime(session.ID)
	if !ok || cwd != workspaceRoot {
		t.Fatalf("missing runtime: %q %q %v", file, cwd, ok)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatal(err)
	}
}

func TestOpenWorkspace(t *testing.T) {
	store := NewMockStore()
	workspace, err := store.OpenWorkspace("/tmp/My Project")
	if err != nil {
		t.Fatal(err)
	}
	if workspace.ID != "my-project" || workspace.Name != "My Project" {
		t.Fatalf("unexpected workspace: %#v", workspace)
	}
}
