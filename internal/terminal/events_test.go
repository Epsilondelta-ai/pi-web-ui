package terminal

import "testing"

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
