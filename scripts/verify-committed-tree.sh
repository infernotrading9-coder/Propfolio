#!/usr/bin/env bash
#
# Build the COMMITTED tree, not the working tree.
#
# WHY THIS EXISTS
#   Several agents work in this same checkout, so `npm run build` in the repo compiles files
#   that are NOT in the commit you are about to push. That cuts both ways:
#     - it can PASS while the commit is broken (a helper the commit needs is still
#       uncommitted, so the working tree has it and the commit does not), and
#     - it can FAIL while the commit is fine (someone else's half-finished file).
#   Netlify only ever sees the commit, so the commit is what has to build.
#
# It also keeps the repo's own dist/ untouched, which stops the build churn that shows up
# as spurious `D dist/assets/...` entries in git status.
#
#   Usage: scripts/verify-committed-tree.sh [ref]        (default: HEAD)
#
set -euo pipefail

REF="${1:-HEAD}"
REPO="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d /tmp/pf-verify-XXXXXX)"

cleanup() {
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
}
trap cleanup EXIT

git -C "$REPO" worktree add --detach "$WT" "$REF" >/dev/null
# Share the installed modules instead of paying for a second `npm ci`.
ln -sfn "$REPO/node_modules" "$WT/node_modules"

cd "$WT"
echo "── tsc ────────────────────────────────────────────────"
npx tsc --noEmit
echo "── vite build ─────────────────────────────────────────"
npx vite build
echo "OK: $REF builds clean (tsc + vite) outside the working tree."
