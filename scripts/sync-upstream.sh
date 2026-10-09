#!/usr/bin/env bash
set -euo pipefail

readonly UPSTREAM_URL='https://github.com/joomengine/joomla-mcp.git'
readonly UPSTREAM_BRANCH='main'

fail() {
  printf 'sync-upstream: %s\n' "$*" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'run this script inside a Git repository.'
cd "$repo_root"

[[ "$(git branch --show-current)" == 'main' ]] || fail 'start from the downstream main branch.'
git diff --quiet && git diff --cached --quiet || fail 'commit or stash tracked changes before syncing.'
[[ -z "$(git ls-files --others --exclude-standard)" ]] || fail 'move or ignore untracked files before syncing.'

git remote get-url origin >/dev/null 2>&1 || fail 'origin must point to the downstream repository.'

if git remote get-url upstream >/dev/null 2>&1; then
  existing_upstream="$(git remote get-url upstream)"
  [[ "$existing_upstream" == "$UPSTREAM_URL" ]] || fail "upstream remote points to $existing_upstream; expected $UPSTREAM_URL. Fix it manually before continuing."
else
  git remote add upstream "$UPSTREAM_URL"
fi

printf 'Fetching downstream origin/main and upstream/%s…\n' "$UPSTREAM_BRANCH"
git fetch origin main
git fetch upstream "$UPSTREAM_BRANCH"

base_ref='origin/main'
upstream_ref="upstream/$UPSTREAM_BRANCH"
base_sha="$(git rev-parse "$base_ref")"
upstream_sha="$(git rev-parse "$upstream_ref")"

if git merge-base --is-ancestor "$upstream_sha" "$base_ref"; then
  printf 'Already current: downstream main contains upstream %s (%s).\n' "$UPSTREAM_BRANCH" "${upstream_sha:0:12}"
  exit 0
fi

stamp="$(date -u +%Y%m%d)"
short_sha="${upstream_sha:0:8}"
branch="sync/upstream-${stamp}-${short_sha}"
if git show-ref --verify --quiet "refs/heads/$branch" || git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  fail "sync branch $branch already exists; preserve it and inspect it before retrying."
fi

printf 'Creating %s from downstream %s (%s).\n' "$branch" "$base_ref" "${base_sha:0:12}"
git switch --create "$branch" "$base_ref"

git config user.name "$(git config user.name || printf 'Downstream maintainer')"
git config user.email "$(git config user.email || printf 'mortezahonar@users.noreply.github.com')"

printf 'Merging upstream/%s at %s; conflicts, if any, are left for manual resolution.\n' "$UPSTREAM_BRANCH" "$upstream_sha"
git merge --no-ff --no-edit "$upstream_ref"

cat <<'NEXT'
Upstream merge is complete on this sync branch. Review it, run the validation
commands in docs/UPSTREAM_SYNC.md, then push the branch and open a pull request
to downstream main. No force-push or direct update to main was performed.
NEXT
