package piweb

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Store struct {
	mu            sync.RWMutex
	workspaces    []Workspace
	files         map[string][]FileNode
	conversations map[string][]Message
	workspacePath map[string]string
	sessionFiles  map[string]string
	sessionCWD    map[string]string
	dbPath        string
}

func NewAutoStore() *Store {
	return NewWebStore(DefaultWebDBPath())
}

func NewWebStore(dbPath string) *Store {
	store := emptyStore(dbPath)
	for _, path := range LoadWebWorkspacePaths(dbPath) {
		clean, err := ValidateWorkspacePath(path)
		if err == nil {
			store.addWorkspaceLocked(clean)
		}
	}
	return store
}

func emptyStore(dbPath string) *Store {
	return &Store{workspaces: []Workspace{}, files: map[string][]FileNode{}, conversations: map[string][]Message{}, workspacePath: map[string]string{}, sessionFiles: map[string]string{}, sessionCWD: map[string]string{}, dbPath: dbPath}
}

func NewPiStore(sessionDir string) (*Store, error) {
	parsed, err := LoadPiSessions(sessionDir)
	if err != nil {
		return nil, err
	}
	byWorkspace := map[string]*Workspace{}
	workspacePath := map[string]string{}
	sessionFiles := map[string]string{}
	sessionCWD := map[string]string{}
	conversations := map[string][]Message{}
	for _, item := range parsed {
		id := workspaceIDFromPath(item.Header.CWD)
		workspace, ok := byWorkspace[id]
		if !ok {
			workspace = &Workspace{ID: id, Name: filepath.Base(item.Header.CWD), Path: item.Header.CWD, LastUsed: item.Session.LastUsed}
			byWorkspace[id] = workspace
			workspacePath[id] = item.Header.CWD
		}
		item.Session.Workspace = id
		item.Session.ID = item.Header.ID
		workspace.Sessions = append(workspace.Sessions, item.Session)
		workspace.SessionCount = len(workspace.Sessions)
		sessionFiles[item.Header.ID] = item.File
		sessionCWD[item.Header.ID] = item.Header.CWD
		conversations[item.Header.ID] = item.Messages
	}
	var workspaces []Workspace
	for _, workspace := range byWorkspace {
		sort.Slice(workspace.Sessions, func(i, j int) bool { return workspace.Sessions[i].ID < workspace.Sessions[j].ID })
		workspaces = append(workspaces, *workspace)
	}
	sort.Slice(workspaces, func(i, j int) bool { return workspaces[i].Path < workspaces[j].Path })
	return &Store{workspaces: workspaces, files: map[string][]FileNode{}, conversations: conversations, workspacePath: workspacePath, sessionFiles: sessionFiles, sessionCWD: sessionCWD}, nil
}

func (s *Store) saveWorkspaceRecentsLocked() {
	paths := make([]string, 0, len(s.workspaces))
	for _, workspace := range s.workspaces {
		if workspace.Path != "" {
			paths = append(paths, workspace.Path)
		}
	}
	_ = SaveWebWorkspacePaths(s.dbPath, paths)
}

func (s *Store) addWorkspaceLocked(clean string) Workspace {
	for _, workspace := range s.workspaces {
		if workspace.Path == clean {
			return workspace
		}
	}
	id := slug(filepath.Base(clean))
	if id == "" {
		id = "workspace"
	}
	used := map[string]int{}
	for _, workspace := range s.workspaces {
		used[workspace.ID] = 1
	}
	baseID := id
	for used[id] > 0 {
		id = uniqueID(baseID, used)
	}
	workspace := Workspace{ID: id, Name: filepath.Base(clean), Path: clean, LastUsed: "now", Sessions: []Session{}}
	parsed, err := LoadPiSessions(piSessionDirForCWD(clean))
	if err == nil {
		for _, item := range parsed {
			item.Session.Workspace = id
			item.Session.ID = item.Header.ID
			workspace.Sessions = append(workspace.Sessions, item.Session)
			s.conversations[item.Header.ID] = item.Messages
			s.sessionFiles[item.Header.ID] = item.File
			s.sessionCWD[item.Header.ID] = item.Header.CWD
		}
		if len(parsed) > 0 {
			workspace.LastUsed = parsed[0].Session.LastUsed
		}
	}
	workspace.SessionCount = len(workspace.Sessions)
	s.workspaces = append([]Workspace{workspace}, s.workspaces...)
	s.files[id] = []FileNode{}
	s.workspacePath[id] = clean
	return workspace
}

func NewMockStore() *Store {
	workspaces := []Workspace{
		{ID: "pi-mono", Name: "pi-mono", Path: "~/code/pi-mono", SessionCount: 6, LastUsed: "3h ago", Live: true, Sessions: []Session{
			{ID: "8e7c-44ff", Title: "port pi-tui to web", LastUsed: "live", Live: true, Active: true, Workspace: "pi-mono"},
			{ID: "3f4a-1c2b", Title: "refactor bash tool", LastUsed: "3h ago", Workspace: "pi-mono"},
			{ID: "9d12-aa01", Title: "add Cloudflare provider", LastUsed: "yesterday", Workspace: "pi-mono"},
			{ID: "2210-3b1e", Title: "draft AGENTS.md", LastUsed: "5d ago", Workspace: "pi-mono"},
			{ID: "4471-77aa", Title: "fix shell completion", LastUsed: "1w ago", Workspace: "pi-mono"},
			{ID: "0c98-1122", Title: "wire session export", LastUsed: "2w ago", Workspace: "pi-mono"},
		}},
		{ID: "openclaw", Name: "openclaw", Path: "~/code/openclaw", SessionCount: 3, LastUsed: "yesterday", Sessions: []Session{
			{ID: "aa11-2233", Title: "tighten retrieval prompt", LastUsed: "yesterday", Workspace: "openclaw"},
			{ID: "bb44-5566", Title: "ship eval harness", LastUsed: "3d ago", Workspace: "openclaw"},
			{ID: "cc77-8899", Title: "first pass", LastUsed: "1mo ago", Workspace: "openclaw"},
		}},
		{ID: "dotfiles", Name: "dotfiles", Path: "~/.dotfiles", SessionCount: 1, LastUsed: "1mo ago", Sessions: []Session{{ID: "ff00-1234", Title: "zsh prompt reflow", LastUsed: "1mo ago", Workspace: "dotfiles"}}},
		{ID: "design-system", Name: "pi-web-ds", Path: "/Users/jay/.../pi-mono/packages/web-ds", SessionCount: 0, LastUsed: "—"},
	}
	files := []FileNode{{Type: "dir", Name: "packages", Depth: 0, Open: true, Children: []FileNode{{Type: "dir", Name: "coding-agent", Depth: 1, Open: true, Children: []FileNode{{Type: "dir", Name: "src", Depth: 2, Open: true, Children: []FileNode{{Type: "dir", Name: "tools", Depth: 3, Open: true, Children: []FileNode{{Type: "file", Name: "bash.ts", Depth: 4, Status: "modified"}, {Type: "file", Name: "edit.ts", Depth: 4}, {Type: "file", Name: "read.ts", Depth: 4}, {Type: "file", Name: "processes.ts", Depth: 4, Status: "added"}}}, {Type: "file", Name: "agent.ts", Depth: 3}, {Type: "file", Name: "cli.ts", Depth: 3}, {Type: "file", Name: "session.ts", Depth: 3}}}, {Type: "file", Name: "README.md", Depth: 2}, {Type: "file", Name: "package.json", Depth: 2}}}, {Type: "dir", Name: "pi-tui", Depth: 1}, {Type: "dir", Name: "web", Depth: 1}}}, {Type: "file", Name: "AGENTS.md", Depth: 0, Status: "modified"}, {Type: "file", Name: "SYSTEM.md", Depth: 0}, {Type: "file", Name: "README.md", Depth: 0}, {Type: "file", Name: "package.json", Depth: 0}}
	conversation := []Message{{Kind: "banner", Text: "┌─ session · 8e7c-44ff ──────────────────────┐\n│  <a>pi > ready</a>  ·  sonnet:high · auto-accept   │\n│  <a>ws</a> pi-mono · <d>main</d> · <t>3 files modified</t>   │\n└────────────────────────────────────────────┘"}, {Kind: "user", Text: "refactor the bash tool to handle background processes. keep the existing sync path as the default, and add a `processes` tool to list / signal / harvest output."}, {Kind: "think", Text: "tmux integration vs `&` with disown. bash tool currently shells out synchronously — need a process registry keyed by short id."}, {Kind: "pi", Text: "I'll add a <code>background:true</code> flag to <tool>bash</tool> and a sibling <tool>processes</tool> tool."}, {Kind: "tool", Tool: "bash", Args: "$ rg \"tool\" packages/coding-agent/src --files-with-matches", Status: "ok", DurationMs: 184, ResultMeta: "3 results", Body: "packages/coding-agent/src/tools/bash.ts\npackages/coding-agent/src/tools/edit.ts\npackages/coding-agent/src/tools/read.ts"}}
	return &Store{workspaces: workspaces, files: map[string][]FileNode{"pi-mono": files, "openclaw": files, "dotfiles": files, "design-system": files}, conversations: map[string][]Message{"8e7c-44ff": conversation}, workspacePath: map[string]string{"pi-mono": ".", "openclaw": ".", "dotfiles": ".", "design-system": "."}, sessionFiles: map[string]string{}, sessionCWD: map[string]string{"8e7c-44ff": "."}}
}

func (s *Store) Workspaces() []Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneWorkspaces(s.workspaces)
}

func (s *Store) OpenWorkspace(path string) (Workspace, error) {
	clean, err := ValidateWorkspacePath(path)
	if err != nil {
		return Workspace{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	workspace := s.addWorkspaceLocked(clean)
	s.saveWorkspaceRecentsLocked()
	return workspace, nil
}

func (s *Store) CreateSession(workspaceID string) (Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root := s.workspacePath[workspaceID]
	if root == "" {
		return Session{}, ErrNotFound
	}
	session, file, err := CreatePiSessionFile(root)
	if err != nil {
		return Session{}, err
	}
	session.Workspace = workspaceID
	for i := range s.workspaces {
		if s.workspaces[i].ID == workspaceID {
			for j := range s.workspaces[i].Sessions {
				s.workspaces[i].Sessions[j].Active = false
			}
			s.workspaces[i].Sessions = append([]Session{session}, s.workspaces[i].Sessions...)
			s.workspaces[i].SessionCount = len(s.workspaces[i].Sessions)
			s.workspaces[i].LastUsed = "now"
			s.conversations[session.ID] = []Message{}
			s.sessionFiles[session.ID] = file
			s.sessionCWD[session.ID] = root
			return session, nil
		}
	}
	return Session{}, ErrNotFound
}

func (s *Store) DeleteWorkspace(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			s.workspaces = append(s.workspaces[:i], s.workspaces[i+1:]...)
			delete(s.workspacePath, workspaceID)
			delete(s.files, workspaceID)
			s.saveWorkspaceRecentsLocked()
			return nil
		}
	}
	return ErrNotFound
}

func (s *Store) Sessions(workspaceID string) ([]Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			return append([]Session(nil), workspace.Sessions...), nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) Session(sessionID string) (Session, []Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, workspace := range s.workspaces {
		for _, session := range workspace.Sessions {
			if session.ID == sessionID {
				return session, append([]Message(nil), s.conversations[sessionID]...), nil
			}
		}
	}
	return Session{}, nil, ErrNotFound
}

func (s *Store) RenameSession(sessionID, title string) (Session, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Session{}, errors.New("title is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for wi := range s.workspaces {
		for si := range s.workspaces[wi].Sessions {
			if s.workspaces[wi].Sessions[si].ID == sessionID {
				s.workspaces[wi].Sessions[si].Title = title
				if err := appendSessionInfo(s.sessionFiles[sessionID], title); err != nil {
					return Session{}, err
				}
				return s.workspaces[wi].Sessions[si], nil
			}
		}
	}
	return Session{}, ErrNotFound
}

func (s *Store) DeleteSession(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for wi := range s.workspaces {
		for si := range s.workspaces[wi].Sessions {
			if s.workspaces[wi].Sessions[si].ID == sessionID {
				s.workspaces[wi].Sessions = append(s.workspaces[wi].Sessions[:si], s.workspaces[wi].Sessions[si+1:]...)
				s.workspaces[wi].SessionCount = len(s.workspaces[wi].Sessions)
				if file := s.sessionFiles[sessionID]; file != "" {
					_ = os.Remove(file)
				}
				delete(s.conversations, sessionID)
				delete(s.sessionFiles, sessionID)
				delete(s.sessionCWD, sessionID)
				return nil
			}
		}
	}
	return ErrNotFound
}

func appendSessionInfo(path, title string) error {
	if path == "" {
		return nil
	}
	entry := map[string]any{"type": "session_info", "id": createSessionID(), "parentId": nil, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "name": title}
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(line, '\n'))
	return err
}

func (s *Store) Files(workspaceID string) ([]FileNode, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	mock := append([]FileNode(nil), s.files[workspaceID]...)
	_, exists := s.files[workspaceID]
	s.mu.RUnlock()
	if root != "" {
		if files, err := RealFileTree(root, 3); err == nil {
			return files, nil
		}
	}
	if !exists {
		return nil, ErrNotFound
	}
	return mock, nil
}

func (s *Store) ReadFile(workspaceID, rel string) (FileContent, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return FileContent{}, ErrNotFound
	}
	return ReadWorkspaceFile(root, rel, 256*1024)
}

func (s *Store) GitStatus(workspaceID string) (GitStatus, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	found := false
	for _, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			found = true
			break
		}
	}
	s.mu.RUnlock()
	if !found {
		return GitStatus{}, ErrNotFound
	}
	if root != "" {
		if status, err := RealGitStatus(root); err == nil {
			return status, nil
		}
	}
	return GitStatus{Branch: "main", Dirty: 3}, nil
}

func (s *Store) AppendMessage(sessionID string, msg Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conversations[sessionID]; !ok {
		return ErrNotFound
	}
	s.conversations[sessionID] = append(s.conversations[sessionID], msg)
	return nil
}

func (s *Store) SessionRuntime(sessionID string) (sessionFile, cwd string, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sessionFile = s.sessionFiles[sessionID]
	cwd = s.sessionCWD[sessionID]
	return sessionFile, cwd, sessionFile != "" && cwd != ""
}

var ErrNotFound = errors.New("not found")

func ValidateWorkspacePath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	path, err := ExpandUserPath(path)
	if err != nil {
		return "", err
	}
	if strings.Contains(path, "\x00") {
		return "", errors.New("path contains null byte")
	}
	if strings.Contains(path, "..") && !strings.HasPrefix(path, "~") {
		clean := filepath.Clean(path)
		if strings.Contains(clean, "..") {
			return "", errors.New("path traversal is not allowed")
		}
	}
	return filepath.Clean(path), nil
}

func slug(value string) string {
	value = strings.ToLower(value)
	value = strings.TrimSpace(value)
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func cloneWorkspaces(workspaces []Workspace) []Workspace {
	out := append([]Workspace(nil), workspaces...)
	for i := range out {
		out[i].Sessions = append([]Session(nil), out[i].Sessions...)
		out[i].SessionCount = len(out[i].Sessions)
	}
	return out
}
