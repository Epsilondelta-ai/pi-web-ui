package piweb

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type Broker struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan Event]struct{}
	nextID      atomic.Uint64
	buffer      int
	heartbeat   time.Duration
	history     map[string][]Event
	historySize int
}

func NewBroker() *Broker {
	return &Broker{subscribers: map[string]map[chan Event]struct{}{}, history: map[string][]Event{}, buffer: 32, heartbeat: 15 * time.Second, historySize: 256}
}

func (b *Broker) Subscribe(sessionID string) (<-chan Event, func()) {
	ch := make(chan Event, b.buffer)
	b.mu.Lock()
	if b.subscribers[sessionID] == nil {
		b.subscribers[sessionID] = map[chan Event]struct{}{}
	}
	b.subscribers[sessionID][ch] = struct{}{}
	b.mu.Unlock()

	unsubscribe := func() {
		b.mu.Lock()
		if subscribers := b.subscribers[sessionID]; subscribers != nil {
			if _, ok := subscribers[ch]; ok {
				delete(subscribers, ch)
				close(ch)
			}
			if len(subscribers) == 0 {
				delete(b.subscribers, sessionID)
			}
		}
		b.mu.Unlock()
	}
	return ch, unsubscribe
}

func (b *Broker) Publish(sessionID, eventType string, payload any) Event {
	event := Event{ID: b.nextID.Add(1), Type: eventType, SessionID: sessionID, Payload: RedactPayload(payload), At: time.Now().UTC()}
	b.mu.Lock()
	b.history[sessionID] = append(b.history[sessionID], event)
	if len(b.history[sessionID]) > b.historySize {
		b.history[sessionID] = b.history[sessionID][len(b.history[sessionID])-b.historySize:]
	}
	var subscribers []chan Event
	for ch := range b.subscribers[sessionID] {
		subscribers = append(subscribers, ch)
	}
	b.mu.Unlock()
	for _, ch := range subscribers {
		select {
		case ch <- event:
		default:
		}
	}
	return event
}

func (b *Broker) Replay(sessionID string, after uint64) []Event {
	b.mu.RLock()
	defer b.mu.RUnlock()
	var replay []Event
	for _, event := range b.history[sessionID] {
		if event.ID > after {
			replay = append(replay, event)
		}
	}
	return replay
}

func (b *Broker) ServeSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	var after uint64
	if value := r.Header.Get("Last-Event-ID"); value != "" {
		after, _ = strconv.ParseUint(value, 10, 64)
	}
	for _, event := range b.Replay(sessionID, after) {
		if err := WriteSSE(w, event); err != nil {
			return
		}
	}
	flusher.Flush()

	events, unsubscribe := b.Subscribe(sessionID)
	defer unsubscribe()
	ticker := time.NewTicker(b.heartbeat)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := WriteSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			event := Event{ID: b.nextID.Add(1), Type: "heartbeat", SessionID: sessionID, Payload: map[string]string{"status": "ok"}, At: time.Now().UTC()}
			if err := WriteSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func WriteSSE(w io.Writer, event Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", event.Type); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "id: %d\n", event.ID); err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", data)
	return err
}

func (b *Broker) PublishMockPrompt(ctx context.Context, store *Store, sessionID, text string) {
	user := Message{Kind: "user", Text: text}
	_ = store.AppendMessage(sessionID, user)
	b.Publish(sessionID, "session.message", user)

	steps := []struct {
		delay    time.Duration
		typeName string
		payload  any
	}{
		{100 * time.Millisecond, "session.status", map[string]string{"status": "thinking"}},
		{150 * time.Millisecond, "tool.started", Message{Kind: "tool", Tool: "bash", Args: "$ pwd", Status: "running"}},
		{150 * time.Millisecond, "tool.output", map[string]string{"tool": "bash", "chunk": "/mock/workspace"}},
		{150 * time.Millisecond, "tool.finished", Message{Kind: "tool", Tool: "bash", Args: "$ pwd", Status: "ok", DurationMs: 42, ResultMeta: "done", Body: "/mock/workspace"}},
		{150 * time.Millisecond, "session.message", Message{Kind: "pi", Text: "Mock backend received your prompt and streamed this response over SSE."}},
		{100 * time.Millisecond, "session.status", map[string]string{"status": "idle"}},
	}
	for _, step := range steps {
		select {
		case <-ctx.Done():
			return
		case <-time.After(step.delay):
			if msg, ok := step.payload.(Message); ok && step.typeName == "session.message" {
				_ = store.AppendMessage(sessionID, msg)
			}
			b.Publish(sessionID, step.typeName, step.payload)
		}
	}
}
