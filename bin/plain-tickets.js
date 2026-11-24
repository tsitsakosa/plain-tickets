#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { loadConfig, readTickets, renderBoard } from '../src/index.js'

const USAGE = `Usage: plain-tickets <command> [--config <file>]

Commands:
  board   Validate every ticket, then write the board.
  check   Validate every ticket, write nothing.

Options:
  --config <file>   Config file. Default: tickets.config.json in the current folder, if it exists.
  -h, --help        Show this help.`

let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: { config: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  })
} catch (error) {
  fail(2, error.message, USAGE)
}
const [command, ...extra] = args.positionals
if (args.values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (!['board', 'check'].includes(command) || extra.length) fail(2, USAGE)

const cwd = process.cwd()
let config
try {
  config = loadConfig(cwd, args.values.config)
} catch (error) {
  fail(2, `plain-tickets: ${error.message}`)
}
const boardPath = relative(cwd, config.board)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const { tickets, byId, problems } = readTickets(config, cwd)
if (problems.length) {
  const what = command === 'board' ? `${boardPath} was not written. Fix` : 'Fix'
  const these = problems.length === 1 ? 'this problem' : `these ${problems.length} problems`
  fail(1, `plain-tickets: ${what} ${these}:`, ...problems.map((p) => `  ${p}`))
}

if (command === 'check') {
  console.log(`plain-tickets: no problems in ${plural(tickets.length, 'ticket')}`)
} else {
  mkdirSync(dirname(config.board), { recursive: true })
  writeFileSync(config.board, renderBoard(tickets, byId, config))
  console.log(`plain-tickets: wrote ${boardPath} (${plural(tickets.length, 'ticket')})`)
}

function fail(code, ...lines) {
  console.error(lines.join('\n'))
  process.exit(code)
}
