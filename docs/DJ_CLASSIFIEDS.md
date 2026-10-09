# DJ-Classifieds provider

This document describes the DJ-Classifieds-specific extension maintained in this
repository. It is a downstream extension of the Joomla MCP TypeScript project,
not an upstream JoomEngine feature or an endorsement by the DJ-Classifieds
vendor.

## Design and source boundaries

The upstream Joomla MCP server and PHP companion remain at the repository root
and retain their upstream Git history. DJ-Classifieds behavior is isolated behind
provider-specific catalogues and actions rather than being added to Joomla's
core entity allowlists:

- TypeScript action catalogue and strict input normalization:
  `src/catalog/providers/djclassifieds.ts`.
- PHP entity/write allowlists: `companion/plugin/src/Joomla/DjClassifiedsCatalogue.php`.
- PHP action registration: `companion/plugin/src/Provider/DjClassifiedsActionProvider.php`.
- Item expiry lifecycle adapter:
  `companion/plugin/src/Provider/DjClassifiedsItemExpiryHook.php`.
- Live installation/reference inspector:
  `companion/plugin/src/Action/DjClassifiedsInspectAction.php`.
- Focused offline provider tests:
  `companion/tests/djclassifieds-provider-test.php` and the TypeScript
  companion-action tests.

The common action framework still handles authorization, Joomla ACL, schemas,
plans, confirmation, audit and transport. The provider does not add a generic
model/method, URL, HTTP, CLI, shell, PHP, SQL or filesystem passthrough. When
syncing upstream, keep provider-specific behavior in these provider-owned files
and update the fixed registry/contract only where integration requires it.

## Supported entities and actions

The fixed catalogue targets `com_djclassifieds` administrator models for these
six entity families:

| Semantic prefix | Entity | State action |
|---|---|---|
| `djclassifieds.items` | Classified ads/items | Yes |
| `djclassifieds.categories` | Categories | Yes |
| `djclassifieds.profiles` | User profiles | No |
| `djclassifieds.regions` | Regions | Yes |
| `djclassifieds.plans` | Plans | Yes |
| `djclassifieds.types` | Item types | Yes |

Each entity has fixed `list`, `get`, `create`, `update` and `delete` actions. The
five state-capable entities additionally have a `state` action, giving 35 entity
operations. `djclassifieds.inspect` is a separate read-only action, for 36
DJ-Classifieds companion actions in total. State values are restricted to
`-2`, `0`, `1` and `2`; profiles do not have a state action.

List input is bounded (`offset` 0–1,000,000; `limit` 1–100, default 20; optional
search up to 200 characters; optional state). Get/update/delete require positive
integer IDs. Create/update accept a non-empty `data` object whose keys are
checked against the entity-specific writable allowlist in both the TypeScript
edge and PHP companion. Unknown input keys and writable fields are rejected.
Nested values and strings are bounded before dispatch. Read fields are fixed by
the provider catalogue and are not caller-selectable.

Deletes are high-risk mutations. All writes must pass the ordinary MCP plan,
operator-grant and one-time apply flow; this provider does not bypass the
site's enabled toolsets, API scopes, Joomla API permissions or companion actor
ACL. Use `djclassifieds.read` for reads and `djclassifieds.write` for mutations.

## DJ-Classifieds item expiry

The native DJ-Classifieds administrator form derives `date_exp` from `exp_days`.
The local companion calls the Joomla model directly, so the item provider hook
mirrors the component's save lifecycle for create/update operations. It uses
Joomla's configured date/timezone, preserves existing expiry behavior on partial
updates, reads the component's configured default duration when creating an
item without `exp_days`, and uses the component's `2038-01-01 00:00:00` sentinel
for zero/unbounded expiry. This logic is confined to the DJ-Classifieds item
provider; core Joomla entity actions are unchanged.

## Live reference and inspection

`djclassifieds.inspect` returns a bounded, machine-readable view of the installed
component: its detected version, relevant database tables/columns and inferred
relations, models, views and matching plugins. Optional sample rows are off by
default. The MCP resource `joomla://catalog/djclassifieds/{site}` wraps that
read-only inspection when enabled in the top-level configuration:

```json
{
  "features": {
    "djclassifiedsReferenceResource": {
      "enabled": true,
      "maxTables": 200,
      "maxColumns": 200,
      "maxSampleRows": 5
    }
  }
}
```

The resource switch defaults to `false`. Limits are bounded by the configuration
schema (up to 1,000 tables, 1,000 columns per table, and 50 sample rows). Sample
rows can contain site data; enable sampling only on an appropriately protected
installation and use the least generous limits that meet the task. Database
table names are derived from the live Joomla prefix; no site prefix or table
name is hard-coded.

A machine-readable example is retained at
[`docs/djclassifieds-reference.sample.json`](djclassifieds-reference.sample.json).
It is an example, not a promise that every DJ-Classifieds version has an
identical schema.

## Configure and install

1. Install the Joomla MCP companion package built from this repository on a
   compatible Joomla site that has DJ-Classifieds installed and enabled.
2. Select a dedicated least-privilege MCP actor in Joomla. Grant only the Joomla
   ACL permissions the intended operations need; do not use a Super User as a
   shortcut.
3. Configure the site's fixed Joomla root and PHP executable in
   `config/sites.json`, and include `djclassifieds.read` and/or
   `djclassifieds.write` in that site's `toolsets` list. Companion actions need
   the local `cli` adapter configured.
4. For write operations, configure the normal approval secret outside the
   repository, request and approve the exact site/toolset grant, inspect the
   dry-run plan, and only then apply its one-time token.
5. Enable the optional reference resource separately using the configuration
   block above if it is needed.

Build and run offline checks from the repository root:

```bash
npm ci
npm run validate
php companion/tests/run.php
php companion/build.php
```

Install the generated `companion/dist/pkg_joomlamcp-*.zip` using Joomla's
Extension Installer and verify the companion description and self-test from the
Joomla root. See [`docs/PHP_COMPANION.md`](PHP_COMPANION.md),
[`docs/USAGE.md`](USAGE.md) and [`config/sites.example.json`](../config/sites.example.json)
for the common transport/configuration details.

## Verification status and production limits

Offline TypeScript/PHP tests verify catalogue membership, schemas, allowlists,
input rejection, action registration and the item-expiry adapter. They do not
prove the behavior of every installed DJ-Classifieds release or the effective
permissions of a live site. The repository's coverage policy currently marks
live success/denial, independent postconditions and recovery as pending; do not
interpret an implemented action or a passing offline suite as production
certification. Before enabling writes on a production site, validate the exact
Joomla and DJ-Classifieds versions, actor ACL, successful and denied reads and
writes, state transitions, delete recovery, package upgrade/rollback and the
site's backup/restore procedure on a disposable fixture.

The action and test counts are summarized in [`docs/COVERAGE.md`](COVERAGE.md).
For importing upstream changes while retaining these additions, follow
[`docs/UPSTREAM_SYNC.md`](UPSTREAM_SYNC.md).
