package terminal

const (
	EventStarted  = "terminal.started"
	EventResized  = "terminal.resized"
	EventClosed   = "terminal.closed"
	EventRejected = "terminal.rejected"
	EventError    = "terminal.error"

	EventDetached = "terminal.detached"
	EventKilled   = "terminal.killed"
	EventStale    = "terminal.stale"
)

type LifecycleState string

const (
	LifecycleLive     LifecycleState = "live"
	LifecycleDetached LifecycleState = "detached"
	LifecycleKilled   LifecycleState = "killed"
	LifecycleStale    LifecycleState = "stale"
	LifecycleError    LifecycleState = "error"
)

type Event struct {
	Name        string `json:"event"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	SessionID   string `json:"sessionId,omitempty"`
	Code        string `json:"code,omitempty"`
}

type EventSink interface {
	Emit(Event)
}

type EventSinkFunc func(Event)

func (f EventSinkFunc) Emit(event Event) {
	if f != nil {
		f(event)
	}
}

type NoopEventSink struct{}

func (NoopEventSink) Emit(Event) {}
