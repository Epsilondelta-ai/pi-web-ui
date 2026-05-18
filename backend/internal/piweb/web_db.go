package piweb

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

func DefaultWebDBPath() string {
	sessionDir := DefaultPiSessionDir()
	if sessionDir == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(sessionDir), "pi-web.db")
}

func openWebDB(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS workspaces (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workspaces_visible_last_opened ON workspaces(hidden, last_opened_at DESC);
`); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func LoadWebWorkspacePaths(dbPath string) []string {
	if dbPath == "" {
		return nil
	}
	db, err := openWebDB(dbPath)
	if err != nil {
		return nil
	}
	defer db.Close()
	rows, err := db.Query(`SELECT path FROM workspaces WHERE hidden = 0 ORDER BY last_opened_at DESC, path ASC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var paths []string
	for rows.Next() {
		var path string
		if rows.Scan(&path) == nil {
			paths = append(paths, path)
		}
	}
	return paths
}

func SaveWebWorkspacePaths(dbPath string, paths []string) error {
	if dbPath == "" {
		return nil
	}
	db, err := openWebDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.Exec(`UPDATE workspaces SET hidden = 1`); err != nil {
		_ = tx.Rollback()
		return err
	}
	for i, path := range paths {
		lastOpened := now
		if i > 0 {
			lastOpened = time.Now().UTC().Add(-time.Duration(i) * time.Nanosecond).Format(time.RFC3339Nano)
		}
		if _, err := tx.Exec(`
INSERT INTO workspaces(path, name, created_at, last_opened_at, hidden)
VALUES (?, ?, ?, ?, 0)
ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened_at = excluded.last_opened_at, hidden = 0
`, path, filepath.Base(path), now, lastOpened); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
