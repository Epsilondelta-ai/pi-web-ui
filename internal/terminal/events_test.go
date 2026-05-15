package terminal

import "testing"

func TestTmuxLifecycleEventVocabulary(t *testing.T) {
	if EventDetached != "terminal.detached" || EventKilled != "terminal.killed" || EventStale != "terminal.stale" {
		t.Fatalf("unexpected tmux event constants")
	}
	states := []LifecycleState{LifecycleLive, LifecycleDetached, LifecycleKilled, LifecycleStale, LifecycleError}
	want := []string{"live", "detached", "killed", "stale", "error"}
	for i, state := range states {
		if string(state) != want[i] {
			t.Fatalf("state[%d] = %q, want %q", i, state, want[i])
		}
	}
}

func TestEventSinkFuncAndNoop(t *testing.T) {
	called := false
	EventSinkFunc(func(event Event) {
		called = event.Name == EventStarted && event.WorkspaceID == "w" && event.SessionID == "s"
	}).Emit(Event{Name: EventStarted, WorkspaceID: "w", SessionID: "s"})
	if !called {
		t.Fatalf("EventSinkFunc did not receive event")
	}

	var nilSink EventSinkFunc
	nilSink.Emit(Event{Name: EventError})
	NoopEventSink{}.Emit(Event{Name: EventClosed})
}
