#!/usr/bin/env bash
# Run the hidden acceptance tests for one issue against a GitCore PR branch.
#
#   bash run_hidden.sh <path-to-fork-clone> <issue-id: b1|b2|f1|f2|v1> <branch | pr-number>
#
# Examples:
#   bash run_hidden.sh ../../../Gitwallah_v2 b2 autose/issue-2
#   bash run_hidden.sh ../../../Gitwallah_v2 b2 7        # PR number (needs gh)
#
# It checks out the PR head in a temporary git worktree (your working copy is not
# touched), copies the hidden test file in, runs it plus the full suite, prints
# "hidden: passed/total", and removes the worktree. Nothing is committed or pushed.
set -euo pipefail

FORK=$(cd "$1" && pwd); ID=$2; REF=$3
HERE=$(cd "$(dirname "$0")" && pwd)
TEST=$(ls "$HERE"/hidden_"$ID"_*.test.js 2>/dev/null | head -1)
[ -n "$TEST" ] || { echo "no hidden test file for '$ID'"; exit 2; }

cd "$FORK"
git fetch -q origin
if [[ "$REF" =~ ^[0-9]+$ ]]; then
  git fetch -q origin "pull/$REF/head:gitcore-hidden-pr-$REF"
  REF="gitcore-hidden-pr-$REF"
elif git rev-parse -q --verify "origin/$REF" >/dev/null; then
  REF="origin/$REF"
fi
SHA=$(git rev-parse "$REF")
WT=$(mktemp -d)/wt
git worktree add -q --detach "$WT" "$SHA"
trap 'cd "$FORK"; git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

cd "$WT/backend"
npm ci --ignore-scripts --no-audit --no-fund --silent
cp "$TEST" tests/
NAME=$(basename "$TEST")
REPORT=hidden-report.json   # relative: works for node on Windows (Git Bash) too

echo "== $ID on $SHA ($3)"
npx vitest run "tests/$NAME" --reporter=default --reporter=json --outputFile.json="$REPORT" || true
node -e "const r=require(require('path').resolve(process.argv[1])); console.log('hidden: ' + r.numPassedTests + '/' + r.numTotalTests + ' passed');
for (const f of r.testResults) for (const a of f.assertionResults) if (a.status!=='passed') console.log('  FAIL ' + a.title);" "$REPORT"

echo "== full suite on the PR head (without the hidden file)"
rm "tests/$NAME"
npx vitest run --reporter=dot 2>&1 | grep -E "Tests |Test Files" || true
