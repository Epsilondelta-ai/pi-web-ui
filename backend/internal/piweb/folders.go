package piweb

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func ExpandUserPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" || path == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return home, nil
	}
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, path[2:]), nil
	}
	return path, nil
}

func DisplayPath(path string) string {
	home, err := os.UserHomeDir()
	if err == nil {
		home = filepath.Clean(home)
		clean := filepath.Clean(path)
		if clean == home {
			return "~"
		}
		if rel, err := filepath.Rel(home, clean); err == nil && rel != "." && !strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel) {
			return "~/" + filepath.ToSlash(rel)
		}
	}
	return filepath.Clean(path)
}

func ListFolders(path string) (FolderListing, error) {
	expanded, err := ExpandUserPath(path)
	if err != nil {
		return FolderListing{}, err
	}
	clean := filepath.Clean(expanded)
	info, err := os.Stat(clean)
	if err != nil {
		return FolderListing{}, err
	}
	if !info.IsDir() {
		return FolderListing{}, errors.New("path is not a directory")
	}
	entries, err := os.ReadDir(clean)
	if err != nil {
		return FolderListing{}, err
	}
	var folders []FolderEntry
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") && name != ".config" {
			continue
		}
		full := filepath.Join(clean, name)
		folders = append(folders, FolderEntry{Name: name, Path: full, DisplayPath: DisplayPath(full)})
	}
	sort.Slice(folders, func(i, j int) bool { return strings.ToLower(folders[i].Name) < strings.ToLower(folders[j].Name) })
	parent := filepath.Dir(clean)
	if parent == clean {
		parent = ""
	}
	return FolderListing{Path: clean, DisplayPath: DisplayPath(clean), Parent: parent, ParentDisplayPath: DisplayPath(parent), Folders: folders}, nil
}
