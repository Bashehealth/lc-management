# Dependency audit

## Finding

`npm.cmd audit` reports 16 moderate vulnerabilities for `minimatch <11.0.1` (GHSA-g3hv-75wg-m249), a glob-pattern amplification denial-of-service issue.

## Dependency paths

- `eslint@9.39.5` introduces `minimatch@3.1.5` directly and through `@eslint/config-array` and `@eslint/eslintrc`.
- `eslint-config-next@16.4.3` introduces `minimatch@3.1.5` through `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react`.
- `eslint-config-next@16.4.3` also introduces `typescript-eslint` and `@typescript-eslint/typescript-estree@8.72.1`, which uses `minimatch@10.2.6`.

## Decision

The audit tool offers only `npm audit fix --force`, which proposes a breaking ESLint change. It was not run. No non-breaking automatic remediation was offered by the installed dependency graph.

An `overrides` entry forcing minimatch 11 is not appropriate at this stage: the vulnerable parents declare older major-version compatibility and an override can break linting or Next.js tooling. Reassess when Next.js, `eslint-config-next`, and ESLint publish compatible dependency updates, then update through normal version ranges and rerun the audit/build/type checks.

## Remaining impact

The exposure is in development/lint tooling, not shipped application runtime code. It remains unresolved and should be tracked until a compatible upstream update is available; do not process untrusted, attacker-controlled glob patterns in local tooling workflows.
