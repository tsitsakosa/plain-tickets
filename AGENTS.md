# AGENTS.md

plain-tickets is a zero-dependency Node CLI and library. It keeps tickets as markdown files with YAML frontmatter, creates them from templates, lists and validates them, writes `BOARD.md`, and writes ticket rules for agents into a project's `AGENTS.md`. The user-facing docs are in [README.md](README.md).

## Commands

- `npm test`: all tests, with `node:test`. They must pass before every commit.
- `npm run example`: rewrites `examples/BOARD.md`. Run it after changing an example ticket or the board rendering.
- `node bin/plain-tickets.js <command>`: runs the CLI from source. Try `init` and `new` in a temporary folder, never in this repository's root.
- `npm pack --dry-run`: shows what ships. Only `bin/`, `src/`, `README.md`, `LICENSE` and `package.json`.

## Layout

- `src/index.js`: all logic. It reads files but never writes them.
- `bin/plain-tickets.js`: the CLI. Parses arguments, writes files, sets exit codes.
- `test/plain-tickets.test.js`: unit tests, and CLI tests through a child process in temporary folders.
- `examples/`: a sample project with a config, a bug template, tickets and the board they produce.

## Rules

- No dependencies, also no dev dependencies. Use only Node 18.3 APIs (see `engines`).
- Validation stays strict. Every problem names the file and the reason. Nothing is written while a ticket is invalid. Unknown config keys and values are errors.
- Never overwrite a user's file. `new` writes with the `wx` flag. `init` only changes the block between the `plain-tickets` markers in `AGENTS.md` and never edits `CLAUDE.md`.
- Exit codes: `0` ok, `1` invalid tickets, `2` bad command, option, config or input.
- A behavior change comes with a test and a README update in the same commit.
- Tests compare `examples/BOARD.md` and the agent guide shown in the README with the generated output. When you change `agentGuide` in `src/index.js`, copy the new `plain-tickets guide` output (default config, plain-tickets in `devDependencies`) into the README.
- Do not add an `AGENTS.md` under `examples/`. The closest `AGENTS.md` wins, so it would replace this file for those paths.
- The package is not on the npm registry. Docs must never tell users to run `npx plain-tickets` without the local install from GitHub. The generated guide uses `npx --no plain-tickets`, which refuses to install from the registry.
- Write the README, messages and the guide in plain English with short sentences and no em dashes.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). No attribution or co-author lines.
