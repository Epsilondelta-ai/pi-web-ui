package piweb

import (
	"strings"
	"testing"
	"time"
)

func TestWriteSSE(t *testing.T) {
	var b strings.Builder
	event := Event{ID: 7, Type: "tool.output", SessionID: "s1", Payload: map[string]string{"chunk": "ok"}, At: time.Unix(0, 0).UTC()}
	if err := WriteSSE(&b, event); err != nil {
		t.Fatal(err)
	}
	got := b.String()
	for _, want := range []string{"event: tool.output\n", "id: 7\n", `"sessionId":"s1"`, `"chunk":"ok"`, "\n\n"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in %q", want, got)
		}
	}
}

func TestBrokerReplayAndRedaction(t *testing.T) {
	broker := NewBroker()
	event := broker.Publish("s1", "tool.output", map[string]string{"chunk": "api_key=secret-value"})
	replay := broker.Replay("s1", event.ID-1)
	if len(replay) != 1 {
		t.Fatalf("expected replay event: %#v", replay)
	}
	payload := replay[0].Payload.(map[string]string)
	if strings.Contains(payload["chunk"], "secret-value") || !strings.Contains(payload["chunk"], "[REDACTED]") {
		t.Fatalf("secret was not redacted: %#v", payload)
	}
}

func TestBrokerFanoutAndUnsubscribe(t *testing.T) {
	broker := NewBroker()
	ch, unsubscribe := broker.Subscribe("s1")
	broker.Publish("s1", "session.status", map[string]string{"status": "ok"})
	select {
	case event := <-ch:
		if event.Type != "session.status" || event.SessionID != "s1" {
			t.Fatalf("unexpected event: %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
	unsubscribe()
	_, ok := <-ch
	if ok {
		t.Fatal("expected subscription channel to close")
	}
}
