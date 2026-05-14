# Pi Web UI — Product Context

_Last updated: 2026-05-14_

## Mission

Pi Web UI는 로컬에서 동작하는 pi coding agent를 브라우저에서 제어하기 위한 웹 인터페이스다. 터미널 중심의 agent 경험을 모바일/웹 친화적인 shell로 옮겨 workspace, session, prompt, tool 실행, approval 흐름을 한 화면에서 다룰 수 있게 한다.

## Vision

개발자는 터미널을 직접 열지 않아도 브라우저에서 pi agent의 현재 상태를 보고, 명령을 입력하고, 위험한 작업을 승인하거나 거절할 수 있다. 장기적으로 Go backend가 로컬 PTY와 pi process를 관리하고, Astro frontend가 실제 terminal stream을 안전하게 렌더링한다.

## Current Product State

- Astro 기반 static frontend shell 구현 완료.
- phone-first 375×812 PiFrame/iOS-style shell이 중심 UI다.
- workspace home, sessions, terminal, prompt bar, keypad, approval modal, settings overlay가 client-side demo 상태로 존재한다.
- Go backend, authentication, persistence, real PTY/WebSocket terminal 연결은 아직 구현되지 않았다.
- 현재 UI는 raw HTML injection 없이 Astro component와 TypeScript event delegation으로 동작한다.

## Target Users

### 1. Solo Developer

- 로컬 프로젝트 여러 개에서 pi agent를 실행한다.
- terminal output, tool calls, approval prompts를 빠르게 보고 제어하고 싶다.
- 최소한의 setup으로 localhost 웹 UI를 원한다.

### 2. Agent Workflow Power User

- 여러 workspace/session을 오가며 계획, 실행, 검증 흐름을 관리한다.
- model, approval mode, prompt history, terminal state를 명확히 보고 싶다.
- 실수로 destructive action을 승인하지 않도록 안전한 confirmation UI가 필요하다.

### 3. Future Team Operator

- 한 명 이상의 개발자가 agent session을 관찰하거나 위임하는 사용 시나리오를 가진다.
- session 상태, logs, approvals, audit trail이 추적 가능해야 한다.

## Top Problems

1. **터미널 UX의 웹 이전**
   pi 실행 화면은 ANSI/TUI/keyboard input이 포함될 수 있어 단순 text rendering으로는 깨진다.

2. **안전한 tool approval**
   local file write, shell command, destructive action을 웹에서 다룰 때 명확한 diff preview와 승인 흐름이 필요하다.

3. **workspace/session 맥락 관리**
   여러 repo와 session을 오가면 어떤 agent가 어디에서 무엇을 하는지 놓치기 쉽다.

## Product Principles

- **Terminal-first**: 실제 pi 터미널 경험을 왜곡하지 않는다.
- **Safety-first**: tool 실행과 파일 변경은 명시적 approval 흐름을 거친다.
- **Local-first**: 초기 목표는 localhost 환경에서 안전하게 동작하는 agent control surface다.
- **Minimal shell**: backend 연결 전에는 UI 구조와 interaction contract를 작게 유지한다.
- **Accessible controls**: touch target, focus trap, ARIA state를 유지한다.

## Success Metrics

- 사용자가 workspace를 선택하고 session을 전환하는 흐름이 명확하다.
- prompt 입력과 approval modal이 keyboard/touch 모두에서 동작한다.
- future PTY terminal renderer를 통합해도 현재 layout이 크게 깨지지 않는다.
- `npm run build`와 `npm run smoke`가 기본 품질 게이트로 통과한다.
- backend 추가 후에도 frontend는 raw terminal bytes를 직접 HTML로 주입하지 않는다.

## Near-Term Roadmap

1. 실제 terminal rendering을 위한 xterm.js integration 설계.
2. Go backend의 PTY + WebSocket endpoint 설계.
3. workspace/session API contract 정의.
4. approval/tool-call event protocol 정의.
5. 현재 static shell을 real data source에 연결 가능한 component 구조로 분리.

## Out of Scope for Current State

- 인증/권한 시스템.
- multi-user collaboration.
- 원격 서버 접속.
- database-backed persistence.
- 실제 pi process 실행 및 PTY 연결.
