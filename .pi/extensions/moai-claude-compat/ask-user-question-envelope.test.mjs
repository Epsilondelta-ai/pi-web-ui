import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function loadResponseEnvelopeModule() {
  const sourcePath = fileURLToPath(new URL("../../npm/node_modules/@juicesharp/rpiv-ask-user-question/tool/response-envelope.ts", import.meta.url));
  let source = readFileSync(sourcePath, "utf8");
  source = source
    .replace('import { formatAnswerScalar } from "./format-answer.js";\n', `function formatAnswerScalar(a) {
      switch (a.kind) {
        case "multi": return a.selected && a.selected.length > 0 ? a.selected.join(", ") : "(no input)";
        case "custom": return a.answer && a.answer.length > 0 ? a.answer : "(no input)";
        case "chat": return "User wants to chat about this. Continue the conversation to help them decide.";
        case "option": return a.answer ?? "(no input)";
      }
    }\n`)
    .replace(/import type \{[^}]+\} from "\.\/types\.js";\n/, "")
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .replace(/: QuestionnaireResult \| null \| undefined/g, "")
    .replace(/: QuestionParams/g, "")
    .replace(/: QuestionAnswer/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/: string/g, "")
    .replace(/: QuestionnaireResult/g, "")
    .replace(/ as const/g, "");
  source += "\nexport { buildQuestionnaireResponse, buildAnswerSegment, buildToolResult };\n";
  const dir = mkdtempSync(join(tmpdir(), "moai-aq-envelope-"));
  const modulePath = join(dir, "response-envelope.mjs");
  writeFileSync(modulePath, source, "utf8");
  const module = await import(pathToFileURL(modulePath).href);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const { buildQuestionnaireResponse } = await loadResponseEnvelopeModule();

const params = {
  questions: [
    {
      header: "키워드",
      question: "Q1. 현행 하드코드 키워드(타다, 대한항공 등)는 어떻게 처리합니까?",
      options: [
        { label: "폐기 · LLM 일원화 (Recommended)", description: "기존 하드코드 목록을 없애고 LLM 판단으로 일원화합니다." },
        { label: "유지", description: "기존 하드코드 목록을 유지합니다." },
      ],
    },
    {
      header: "브랜치",
      question: "Q3-Q4. 브랜치 · 워크플로우는 어떻게?",
      options: [
        { label: "현재 브랜치 이어서 진행", description: "현재 브랜치에서 이어서 작업합니다." },
        { label: "새 브랜치", description: "새 브랜치를 만듭니다." },
      ],
    },
  ],
};

const result = {
  cancelled: false,
  answers: [
    {
      questionIndex: 0,
      question: params.questions[0].question,
      kind: "option",
      answer: "폐기 · LLM 일원화 (Recommended)",
    },
    {
      questionIndex: 1,
      question: params.questions[1].question,
      kind: "option",
      answer: "현재 브랜치 이어서 진행",
    },
  ],
};

const response = buildQuestionnaireResponse(result, params);
const text = response.content[0].text;

assert.equal(
  text,
  "User answered MoAI's questions:\n" +
    "  └ · Q1. 현행 하드코드 키워드(타다, 대한항공 등)는 어떻게 처리합니까? → 폐기 · LLM 일원화 (Recommended)\n" +
    "    · Q3-Q4. 브랜치 · 워크플로우는 어떻게? → 현재 브랜치 이어서 진행",
);
assert.match(text, /^User answered MoAI's questions:/);
assert.match(text, /\n  └ · Q1\. 현행 하드코드 키워드\(타다, 대한항공 등\)는 어떻게 처리합니까\? → 폐기 · LLM 일원화 \(Recommended\)/);
assert.match(text, /\n    · Q3-Q4\. 브랜치 · 워크플로우는 어떻게\? → 현재 브랜치 이어서 진행$/);
assert.doesNotMatch(text, /User has answered your questions/);
assert.doesNotMatch(text, /Claude's questions/);
assert.doesNotMatch(text, /"[^"]+"="[^"]+"/);
assert.doesNotMatch(text, /You can now continue/);

const declined = buildQuestionnaireResponse({ cancelled: true, answers: result.answers }, params);
assert.equal(declined.content[0].text, "User declined to answer questions");
assert.equal(declined.details.cancelled, true);

console.log("ask-user-question envelope regression ok");
