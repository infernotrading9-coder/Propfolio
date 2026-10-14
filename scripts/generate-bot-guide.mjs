#!/usr/bin/env node
// scripts/generate-bot-guide.mjs
//
// Generates PROPFOLIO-BOT-GUIDE.md (or .md.new) from the *actual* action shapes
// declared in netlify/functions/*.ts. Source-of-truth = code, not prose.
//
// What it scrapes, per file:
//   - Every "case 'foo':" in a switch (db-budget-state, db-notes, etc.)
//   - Every "if (input.action === 'foo')" / "if (body.action === 'foo')" /
//     "if (params.action === 'foo')" (db-accounts uses this style)
//
// For each action it captures:
//   - The action name
//   - The JSDoc / block-comment lines immediately above the case (the
//     human-written description, when one exists). If none, it falls back
//     to a one-line "TODO: describe" marker.
//   - The bare field names referenced in the body via destructuring
//     (`const { foo, bar } = input` / `Number(body.bar)` / `body.baz`)
//     so the bot knows what fields to send.
//
// This is a working draft — the goal is "useful skeleton", not a finished doc.

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.cwd();
const FN_DIR = join(ROOT, 'netlify', 'functions');
const OUT   = join(ROOT, 'PROPFOLIO-BOT-GUIDE.generated.md');

const SKIP_FILES = new Set([
  '_utils.ts',           // helpers, no actions
  'auth-google.ts',      // Firebase auth flow, special
  'auth-login.ts',
  'auth-signup.ts',
  'db-firms.ts',         // mostly GETs for select-options
  'db-payouts.ts',
  'db-phase.ts',
  'db-bulk.ts',
  'db-state.ts',
  'db-budget.ts',        // legacy thin pass-through to db-budget-state
  'db-bot-notes.ts',     // bot-only notes channel, separate doc
]);

// ---------- regex toolbox ----------

// `case 'foo':` (sometimes shared with case 'bar': followed by {})
const RE_CASE = /^[ \t]*case\s+['"]([a-z0-9_-]+)['"]\s*:/gim;

// `if (input.action === 'foo')` (and body/params variants)
const RE_IF_ACTION = /if\s*\(\s*(?:input|body|params|req\.body)\.action\s*===\s*['"]([a-z0-9_-]+)['"]/g;

// JSDoc blocks immediately above a line. Greedy enough to grab multi-line.
const RE_JSDOC_ABOVE = (anchorRe) =>
  new RegExp(
    '(?:^|\\n)\\s*\\/\\*\\*(?:.|\\n)*?\\*\\/\\s*\\n\\s*' + anchorRe.source,
    'gim'
  );

// Block comments (`/* ... */`) for the `if` style
const RE_BLOCK_COMMENT_ABOVE = (anchorRe) =>
  new RegExp(
    '(?:^|\\n)\\s*\\/\\*[^*][^*]*\\*+(?:[^/*][^*]*\\*+)*\\/\\s*\\n\\s*' + anchorRe.source,
    'gim'
  );

// `// ...` line-comments stacked immediately above
const RE_LINE_COMMENTS_ABOVE = (anchorRe) =>
  new RegExp(
    '(?:(?:^|\\n)\\s*\\/\\/[^\\n]*\\n)+' + anchorRe.source,
    'gim'
  );

// Field-extraction regexes — applied to the ~80 chars after each anchor,
// just enough to catch destructuring / body refs.
const RE_FIELDS = [
  /\{[^}]*\b(?:name|field)\s*\}\s*=\s*(?:input|body|params)/,
  /(?:input|body|params)\.([a-zA-Z_]\w*)/g,
  /Number\((?:input|body|params)\.([a-zA-Z_]\w*)/g,
];

// ---------- core extraction ----------

function extractFromFile(path) {
  const text = readFileSync(path, 'utf8');
  const base = basename(path, '.ts');

  const actions = [];
  const seen = new Set();

  function addAction(name, anchorIdx, sourceLine, style) {
    if (seen.has(name)) return;
    seen.add(name);
    const desc = findCommentAbove(text, anchorIdx);
    const fields = findFields(text, anchorIdx);
    actions.push({ name, desc, fields, sourceLine, style });
  }

  // 1) switch/case style
  for (const m of text.matchAll(RE_CASE)) {
    const idx = m.index;
    const sourceLine = lineOf(text, idx);
    addAction(m[1], idx, sourceLine, 'switch');
  }

  // 2) if (.action === ...) style
  for (const m of text.matchAll(RE_IF_ACTION)) {
    const idx = m.index;
    const sourceLine = lineOf(text, idx);
    addAction(m[1], idx, sourceLine, 'if');
  }

  // Sort alphabetically for stable output
  actions.sort((a, b) => a.name.localeCompare(b.name));
  return { file: base, actions };
}

function findCommentAbove(text, idx) {
  // Walk backwards from idx, collecting JSDoc / block / line comments.
  const before = text.slice(Math.max(0, idx - 1500), idx);

  // Strip everything after the last blank line so we only see comments that
  // are *immediately* above the action.
  const lastBlank = before.search(/\n\s*\n[^\n]*$/m);
  const window = lastBlank >= 0 ? before.slice(lastBlank + 1) : before;

  // 1) /** ... */ block
  const j = window.match(/\/\*\*([\s\S]*?)\*\//);
  if (j) return cleanComment(j[1]);

  // 2) /* ... */ block (non-JSDoc)
  const b = window.match(/\/\*([\s\S]*?)\*\//);
  if (b) return cleanComment(b[1]);

  // 3) Stacked // comments
  const lines = [];
  for (const line of before.trimEnd().split('\n').reverse()) {
    const m = line.match(/^\s*\/\/\s?(.*)$/);
    if (m) lines.unshift(m[1]);
    else break;
  }
  if (lines.length) return lines.join(' ').trim();

  return null;
}

function cleanComment(body) {
  return body
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())  // strip leading "*  "
    .filter(l => l.length > 0)
    .join(' ')
    .trim();
}

function findFields(text, idx) {
  // Look ahead ~600 chars after the action anchor for field references.
  // Skip — picking fields reliably from arbitrary body code is fragile and
  // often wrong. The actual field list lives in the case body; rather than
  // trying to parse JS, we link the bot at the source line.
  // Returning [] keeps the guide unambiguous: "see the code at line N".
  void RE_FIELDS;
  void idx;
  void text;
  return [];
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// ---------- render ----------

function render(fileData) {
  const lines = [];
  lines.push('# PROPFOLIO Bot Guide (GENERATED)');
  lines.push('');
  lines.push('> ⚠️  This file is **generated** by `scripts/generate-bot-guide.mjs`');
  lines.push('> from the code in `netlify/functions/*.ts`. Do not edit by hand.');
  lines.push('>');
  lines.push('> Regenerate with: `node scripts/generate-bot-guide.mjs`');
  lines.push('> The pre-existing `PROPFOLIO-BOT-GUIDE.md` is the human-curated');
  lines.push('> prose; this generated file is the *machine-readable contract*.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const { file, actions } of fileData) {
    if (actions.length === 0) continue;
    lines.push(`## \`${file}.ts\``);
    lines.push('');
    lines.push('```');
    lines.push(`POST /.netlify/functions/${file}`);
    lines.push('{ "action": "<one of the actions below>", ...fields }');
    lines.push('```');
    lines.push('');

    for (const a of actions) {
      lines.push(`### \`${a.name}\``);
      lines.push('');
      lines.push(`* style: \`${a.style}\` · source: \`${file}.ts:${a.sourceLine}\``);
      lines.push('');
      if (a.desc) {
        lines.push(a.desc);
        lines.push('');
      } else {
        lines.push('_No description in code — read the source at the line above._');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// ---------- main ----------

const files = readdirSync(FN_DIR)
  .filter(n => n.endsWith('.ts') && !SKIP_FILES.has(n))
  .map(n => join(FN_DIR, n));

const data = files.map(extractFromFile);
const totalActions = data.reduce((s, d) => s + d.actions.length, 0);

const md = render(data);
writeFileSync(OUT, md);

// quick stdout summary so you can sanity-check the run
let coverageWarns = 0;
for (const d of data) {
  for (const a of d.actions) {
    if (!a.desc) coverageWarns++;
  }
}

console.log(`Wrote ${OUT}`);
console.log(`Scanned ${files.length} functions · ${totalActions} actions extracted`);
console.log(`Files: ${data.map(d => `${d.file}(${d.actions.length})`).join(' ')}`);
console.log(`Actions with no in-code comment: ${coverageWarns} (will show the fallback line in the guide)`);
