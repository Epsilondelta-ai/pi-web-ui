package piweb

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type Runner struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc
}

func NewRunner() *Runner {
	return &Runner{running: map[string]context.CancelFunc{}}
}

func (r *Runner) StartPiPrompt(parent context.Context, broker *Broker, store *Store, sessionID, text string) error {
	sessionFile, cwd, ok := store.SessionRuntime(sessionID)
	if !ok {
		return ErrNotFound
	}
	ctx, cancel := context.WithCancel(parent)
	r.mu.Lock()
	if _, exists := r.running[sessionID]; exists {
		r.mu.Unlock()
		cancel()
		return errors.New("session already running")
	}
	r.running[sessionID] = cancel
	r.mu.Unlock()

	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.running, sessionID)
			r.mu.Unlock()
			cancel()
		}()
		user := Message{Kind: "user", Text: text}
		_ = store.AppendMessage(sessionID, user)
		broker.Publish(sessionID, "session.message", user)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "running"})

		args := []string{"--session", sessionFile, "--mode", "json", "--print", text}
		cmd := exec.CommandContext(ctx, "pi", args...)
		cmd.Dir = cwd
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			return
		}
		stderr, _ := cmd.StderrPipe()
		if err := cmd.Start(); err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			return
		}
		go func() {
			<-ctx.Done()
			if cmd.Process != nil {
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			}
		}()

		state := &jsonStreamState{}
		stdoutDone := make(chan struct{})
		go streamPipe(stdout, func(line string) {
			if !handlePiJSONEvent(line, broker, store, sessionID, state) {
				broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
			}
		}, stdoutDone)
		go streamPipe(stderr, func(line string) {
			broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
		}, nil)

		<-stdoutDone
		err = cmd.Wait()
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		broker.Publish(sessionID, "session.status", map[string]string{"status": "idle", "finishedAt": time.Now().UTC().Format(time.RFC3339)})
	}()
	return nil
}

func (r *Runner) Cancel(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	cancel, ok := r.running[sessionID]
	if ok {
		cancel()
		delete(r.running, sessionID)
	}
	return ok
}

type jsonStreamState struct {
	streamedText     bool
	streamedThinking bool
}

func handlePiJSONEvent(line string, broker *Broker, store *Store, sessionID string, state *jsonStreamState) bool {
	var event struct {
		Type                  string          `json:"type"`
		Message               json.RawMessage `json:"message"`
		ToolName              string          `json:"toolName"`
		Args                  json.RawMessage `json:"args"`
		PartialResult         json.RawMessage `json:"partialResult"`
		Result                json.RawMessage `json:"result"`
		IsError               bool            `json:"isError"`
		AssistantMessageEvent struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
			Text  string `json:"text"`
		} `json:"assistantMessageEvent"`
	}
	if err := json.Unmarshal([]byte(line), &event); err != nil || event.Type == "" {
		return false
	}
	switch event.Type {
	case "session", "agent_start", "turn_start", "queue_update":
		return true
	case "message_update":
		delta := event.AssistantMessageEvent.Delta
		if delta == "" {
			delta = event.AssistantMessageEvent.Text
		}
		if delta == "" {
			return true
		}
		switch event.AssistantMessageEvent.Type {
		case "thinking_delta", "reasoning_delta":
			state.streamedThinking = true
			broker.Publish(sessionID, "session.delta", map[string]string{"kind": "think", "delta": delta})
		default:
			state.streamedText = true
			broker.Publish(sessionID, "session.delta", map[string]string{"kind": "pi", "delta": delta})
		}
		return true
	case "message_end":
		for _, msg := range convertAgentMessages(event.Message) {
			_ = store.AppendMessage(sessionID, msg)
			if (msg.Kind == "pi" && state.streamedText) || (msg.Kind == "think" && state.streamedThinking) {
				continue
			}
			broker.Publish(sessionID, eventTypeForMessage(msg), msg)
		}
		return true
	case "tool_execution_start":
		broker.Publish(sessionID, "tool.started", Message{Kind: "tool", Tool: event.ToolName, Args: string(event.Args), Status: "running", CollapsedByDefault: true})
		return true
	case "tool_execution_update":
		broker.Publish(sessionID, "tool.output", map[string]string{"tool": event.ToolName, "chunk": jsonChunk(event.PartialResult)})
		return true
	case "tool_execution_end":
		status := "ok"
		if event.IsError {
			status = "err"
		}
		msg := Message{Kind: "tool", Tool: event.ToolName, Args: string(event.Args), Status: status, Body: jsonChunk(event.Result), CollapsedByDefault: true}
		_ = store.AppendMessage(sessionID, msg)
		broker.Publish(sessionID, "tool.finished", msg)
		return true
	case "agent_end", "turn_end":
		return true
	default:
		return true
	}
}

func jsonChunk(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}
	return fmt.Sprintf("%s", raw)
}

func eventTypeForMessage(msg Message) string {
	if msg.Kind == "tool" && msg.Status == "running" {
		return "tool.started"
	}
	if msg.Kind == "tool" {
		return "tool.finished"
	}
	return "session.message"
}

func streamPipe(pipe io.Reader, onLine func(string), done chan<- struct{}) {
	if done != nil {
		defer close(done)
	}
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	for scanner.Scan() {
		onLine(scanner.Text())
	}
}

func tailSessionFile(ctx context.Context, broker *Broker, store *Store, sessionID, path string, offset int64, emitted *atomic.Int64, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(120 * time.Millisecond)
	defer ticker.Stop()
	idleAfterCancel := time.NewTimer(500 * time.Millisecond)
	if !idleAfterCancel.Stop() {
		<-idleAfterCancel.C
	}
	for {
		newOffset := readSessionLines(path, offset, func(line string) {
			for _, msg := range ParsePiSessionLineMessages(line) {
				_ = store.AppendMessage(sessionID, msg)
				broker.Publish(sessionID, eventTypeForMessage(msg), msg)
				emitted.Add(1)
			}
		})
		if newOffset > offset {
			offset = newOffset
		}
		select {
		case <-ctx.Done():
			idleAfterCancel.Reset(500 * time.Millisecond)
			select {
			case <-idleAfterCancel.C:
				readSessionLines(path, offset, func(line string) {
					for _, msg := range ParsePiSessionLineMessages(line) {
						_ = store.AppendMessage(sessionID, msg)
						broker.Publish(sessionID, eventTypeForMessage(msg), msg)
						emitted.Add(1)
					}
				})
				return
			case <-ticker.C:
				continue
			}
		case <-ticker.C:
		}
	}
}

func readSessionLines(path string, offset int64, onLine func(string)) int64 {
	file, err := os.Open(path)
	if err != nil {
		return offset
	}
	defer file.Close()
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return offset
	}
	reader := bufio.NewReader(file)
	for {
		line, err := reader.ReadString('\n')
		if line != "" && err == nil {
			offset += int64(len(line))
			onLine(line)
		}
		if err != nil {
			break
		}
	}
	return offset
}

func waitForTail(done <-chan struct{}) {
	select {
	case <-done:
	case <-time.After(700 * time.Millisecond):
	}
}

func fileSize(path string) int64 {
	stat, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return stat.Size()
}
