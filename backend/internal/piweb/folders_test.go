package piweb

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListFoldersStartsFromHomeAlias(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.Mkdir(filepath.Join(home, "code"), 0o700); err != nil {
		t.Fatal(err)
	}
	listing, err := ListFolders("~")
	if err != nil {
		t.Fatal(err)
	}
	if listing.Path != home || listing.DisplayPath != "~" {
		t.Fatalf("unexpected listing root: %#v", listing)
	}
	if len(listing.Folders) != 1 || listing.Folders[0].DisplayPath != "~/code" {
		t.Fatalf("unexpected folders: %#v", listing.Folders)
	}
}
