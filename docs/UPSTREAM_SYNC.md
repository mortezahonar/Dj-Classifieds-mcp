# Upstream provenance and synchronization

## Relationship and provenance

- Upstream: <https://github.com/joomengine/joomla-mcp>, branch `main`.
- Downstream: <https://github.com/mortezahonar/Dj-Classifieds-mcp>, branch `main`.
- DJ-Classifieds source branch: <https://github.com/mortezahonar/joomla-mcp/tree/J6-djcf-v1>.
- Provider-isolation commit retained in this repository's history:
  [`23142d75cd428b9562785c45e859b998ab2b1cff`](https://github.com/mortezahonar/joomla-mcp/commit/23142d75cd428b9562785c45e859b998ab2b1cff).
- Initial downstream history also retains the earlier DJ-Classifieds work and
  its upstream merge; no source snapshot or squash replaced that history.
- On creation, `upstream/main` at
  [`b79c7183c577e96e8389c1a293833f7fad408827`](https://github.com/joomengine/joomla-mcp/commit/b79c7183c577e96e8389c1a293833f7fad408827)
  was merged into the user branch. Future upstream changes are additive merge
  commits so downstream commits remain visible and are not rewritten.

This is a downstream repository. It does not change or push to the upstream
repository, and it does not imply affiliation with JoomEngine or the
DJ-Classifieds vendor. Original licensing, notices and attributions are retained;
see [`LICENSE`](../LICENSE).

## Preferred sync procedure

Run from a clean clone of this downstream repository while checked out on
`main`:

```bash
./scripts/sync-upstream.sh
```

The script verifies the working tree and remotes, fetches `origin/main` and
`upstream/main`, creates a dated `sync/upstream-*` branch from the latest
`origin/main`, and merges `upstream/main` without rewriting history. If the
upstream commit is already included it exits without creating a branch. If a
conflict exists, Git leaves the sync branch and conflict markers for manual
resolution; the script does not discard either side or force-push.

After a successful merge, review the diff and run the relevant checks before
pushing/opening a pull request:

```bash
npm ci
npm run validate
./tests/deploy/static-deployment.test.sh
php companion/tests/run.php
php companion/build.php
```

Then push and create a reviewable PR into downstream `main`:

```bash
git push -u origin HEAD
gh pr create --base main --fill
```

Do not merge upstream updates directly to `main` without review. Resolve
conflicts by keeping upstream improvements to shared Joomla/MCP behavior and
retaining DJ-Classifieds behavior in its provider-owned files. Re-run the full
checks after resolving conflicts. Do not rebase or force-push published sync
branches.

## Manual equivalent

If the helper script is unavailable, the equivalent Git flow is:

```bash
git remote add upstream https://github.com/joomengine/joomla-mcp.git
git fetch origin main
git fetch upstream main
git switch main
git switch -c "sync/upstream-$(date -u +%Y%m%d)"
git merge --no-ff --no-edit upstream/main
```

If an `upstream` remote already exists, verify its URL rather than adding a
second remote. The helper performs those checks and avoids duplicate branch
names.

## Conflict-resolution boundary

Prefer upstream for shared Joomla core, transport, security, release-independent
infrastructure and tests. Preserve or deliberately rebase the downstream
behavior in:

- `src/catalog/providers/djclassifieds.ts`;
- `companion/plugin/src/Joomla/DjClassifiedsCatalogue.php`;
- `companion/plugin/src/Provider/`;
- `companion/plugin/src/Action/DjClassifiedsInspectAction.php`;
- DJ-Classifieds-specific tests, configuration, documentation and fixtures.

Some shared files necessarily register or authorize the provider, including the
companion action registry, configuration toolset schema and MCP resource setup.
Treat those small integration points as explicit merge boundaries and test them;
“separate provider” means an isolated feature boundary, not an independent
submodule or a guarantee that shared integration files never conflict.

## Release and package identity

The inherited `@joomengine/joomla-mcp` package name and release scripts are kept
for local package-contract compatibility. This downstream checkout is marked
`private` in `package.json`; its upstream release/publish workflows are removed,
and this repository does not publish the upstream npm package or upstream OCI
image. `npm pack` can be used for local testing. Do not add publishing credentials
or enable a release workflow without first defining a distinct package/image
identity, ownership, provenance and release process.
