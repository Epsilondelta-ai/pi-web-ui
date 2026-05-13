import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../../npm/node_modules/@juicesharp/rpiv-ask-user-question/tool/response-envelope.ts", import.meta.url));

if (!existsSync(target)) {
  console.warn(`[moai patch] AskUserQuestion response envelope target not found: ${target}`);
  process.exit(0);
}

let source = readFileSync(target, "utf8");
const alreadyPatched = source.includes('export const ENVELOPE_PREFIX = "User answered MoAI\'s questions:";')
  && source.includes('buildAnswerSegment(a, segments.length === 0)')
  && source.includes('const prefix = first ? "  └ " : "    ";');

if (alreadyPatched) {
  console.log("[moai patch] AskUserQuestion response envelope already patched");
  process.exit(0);
}

const legacyClaudePatched = source.includes('export const ENVELOPE_PREFIX = "User answered Claude\'s questions:";')
  && source.includes('buildAnswerSegment(a, segments.length === 0)')
  && source.includes('const prefix = first ? "  └ " : "    ";');

if (legacyClaudePatched) {
  source = source
    .replace('export const ENVELOPE_PREFIX = "User answered Claude\'s questions:";', 'export const ENVELOPE_PREFIX = "User answered MoAI\'s questions:";')
    .replace('The Claude-style', 'The MoAI-style');
  writeFileSync(target, source, "utf8");
  console.log("[moai patch] AskUserQuestion response envelope wording patched");
  process.exit(0);
}

const interimPatched = source.includes('export const ENVELOPE_PREFIX = "User answered MoAI\'s questions:";')
  && source.includes('buildAnswerSegment(a, segments.length === 0)')
  && source.includes('const prefix = first ? "└ " : "  ";');

if (interimPatched) {
  source = source.replace('const prefix = first ? "└ " : "  ";', 'const prefix = first ? "  └ " : "    ";');
  writeFileSync(target, source, "utf8");
  console.log("[moai patch] AskUserQuestion response envelope indentation patched");
  process.exit(0);
}

const legacyClaudeInterimPatched = source.includes('export const ENVELOPE_PREFIX = "User answered Claude\'s questions:";')
  && source.includes('buildAnswerSegment(a, segments.length === 0)')
  && source.includes('const prefix = first ? "└ " : "  ";');

if (legacyClaudeInterimPatched) {
  source = source
    .replace('export const ENVELOPE_PREFIX = "User answered Claude\'s questions:";', 'export const ENVELOPE_PREFIX = "User answered MoAI\'s questions:";')
    .replace('const prefix = first ? "└ " : "  ";', 'const prefix = first ? "  └ " : "    ";')
    .replace('The Claude-style', 'The MoAI-style');
  writeFileSync(target, source, "utf8");
  console.log("[moai patch] AskUserQuestion response envelope wording and indentation patched");
  process.exit(0);
}

const replacements = [
  [
    'export const ENVELOPE_PREFIX = "User has answered your questions:";\nexport const ENVELOPE_SUFFIX = "You can now continue with the user\'s answers in mind.";',
    'export const ENVELOPE_PREFIX = "User answered MoAI\'s questions:";\nexport const ENVELOPE_SUFFIX = "";',
  ],
  [
    'for (let i = 0; i < params.questions.length; i++) {\n\t\tconst a = result.answers.find((x) => x.questionIndex === i);\n\t\tif (a) segments.push(buildAnswerSegment(a));\n\t}\n\tif (segments.length === 0) {\n\t\treturn buildToolResult(DECLINE_MESSAGE, { answers: result.answers, cancelled: true });\n\t}\n\treturn buildToolResult(`${ENVELOPE_PREFIX} ${segments.join(" ")} ${ENVELOPE_SUFFIX}`, result);',
    'for (let i = 0; i < params.questions.length; i++) {\n\t\tconst a = result.answers.find((x) => x.questionIndex === i);\n\t\tif (a) segments.push(buildAnswerSegment(a, segments.length === 0));\n\t}\n\tif (segments.length === 0) {\n\t\treturn buildToolResult(DECLINE_MESSAGE, { answers: result.answers, cancelled: true });\n\t}\n\treturn buildToolResult(`${ENVELOPE_PREFIX}\\n${segments.join("\\n")}`, result);',
  ],
  [
    ' * Format a single answer segment for the envelope. Pure of `a`. The `"Q"="A"` shape and\n * the optional `selected preview:` / `user notes:` suffixes are pinned by envelope tests.',
    ' * Format a single answer segment for the envelope. Pure of `a`. The MoAI-style\n * `· <question> → <answer>` shape and optional preview / notes suffixes are pinned by envelope tests.',
  ],
  [
    'export function buildAnswerSegment(a: QuestionAnswer): string {\n\tconst parts: string[] = [`"${a.question}"="${formatAnswerScalar(a, "envelope")}"`];\n\tif (a.preview && a.preview.length > 0) parts.push(`selected preview: ${a.preview}`);\n\tif (a.notes && a.notes.length > 0) parts.push(`user notes: ${a.notes}`);\n\treturn `${parts.join(". ")}.`;\n}',
    'export function buildAnswerSegment(a: QuestionAnswer, first = false): string {\n\tconst prefix = first ? "  └ " : "    ";\n\tconst parts: string[] = [`${prefix}· ${a.question} → ${formatAnswerScalar(a, "envelope")}`];\n\tif (a.preview && a.preview.length > 0) parts.push(`selected preview: ${a.preview}`);\n\tif (a.notes && a.notes.length > 0) parts.push(`user notes: ${a.notes}`);\n\treturn parts.join(" · ");\n}',
  ],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    console.error("[moai patch] AskUserQuestion response envelope patch anchor not found");
    process.exit(1);
  }
  source = source.replace(from, to);
}

writeFileSync(target, source, "utf8");
console.log("[moai patch] AskUserQuestion response envelope patched");
