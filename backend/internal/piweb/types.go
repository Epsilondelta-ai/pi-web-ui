package piweb

import "time"

type Workspace struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	SessionCount int       `json:"sessionCount"`
	LastUsed     string    `json:"lastUsed"`
	Live         bool      `json:"live"`
	Sessions     []Session `json:"sessions,omitempty"`
}

type Session struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	LastUsed  string `json:"lastUsed"`
	Live      bool   `json:"live,omitempty"`
	Active    bool   `json:"active,omitempty"`
	Workspace string `json:"workspaceId,omitempty"`
}

type FileNode struct {
	Type     string     `json:"type"`
	Name     string     `json:"name"`
	Path     string     `json:"path,omitempty"`
	Depth    int        `json:"depth"`
	Open     bool       `json:"open,omitempty"`
	Status   string     `json:"status,omitempty"`
	Children []FileNode `json:"children,omitempty"`
}

type Message struct {
	Kind               string `json:"kind"`
	Text               string `json:"text,omitempty"`
	Tool               string `json:"tool,omitempty"`
	Args               string `json:"args,omitempty"`
	Status             string `json:"status,omitempty"`
	DurationMs         int    `json:"durationMs,omitempty"`
	ResultMeta         string `json:"resultMeta,omitempty"`
	Body               string `json:"body,omitempty"`
	CollapsedByDefault bool   `json:"collapsedByDefault,omitempty"`
	Running            bool   `json:"running,omitempty"`
}

type GitStatus struct {
	Branch string `json:"branch"`
	Dirty  int    `json:"dirty"`
}

type Event struct {
	ID          uint64    `json:"id"`
	Type        string    `json:"type"`
	SessionID   string    `json:"sessionId,omitempty"`
	WorkspaceID string    `json:"workspaceId,omitempty"`
	Payload     any       `json:"payload,omitempty"`
	At          time.Time `json:"at"`
}

type PromptRequest struct {
	Text        string   `json:"text"`
	Attachments []string `json:"attachments,omitempty"`
}

type OpenWorkspaceRequest struct {
	Path string `json:"path"`
}

type RenameSessionRequest struct {
	Title string `json:"title"`
}

type FileContent struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	Truncated bool   `json:"truncated,omitempty"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}
