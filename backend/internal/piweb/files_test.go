package piweb

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadWorkspaceFileRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	content, err := ReadWorkspaceFile(root, "note.txt", 1024)
	if err != nil || content.Content != "hello" {
		t.Fatalf("unexpected content: %#v %v", content, err)
	}
	if _, err := ReadWorkspaceFile(root, "../secret", 1024); err == nil {
		t.Fatal("expected traversal to fail")
	}
}

func TestRealFileTree(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "src"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "main.go"), []byte("package main"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "node_modules"), 0o700); err != nil {
		t.Fatal(err)
	}
	nodes, err := RealFileTree(root, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 || nodes[0].Name != "src" || len(nodes[0].Children) != 1 {
		t.Fatalf("unexpected nodes: %#v", nodes)
	}
}
