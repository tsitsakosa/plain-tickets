#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  agentGuide,
  configErrors,
  createTicket,
  formatList,
  listTickets,
  loadConfig,
  readTickets,
  renderBoard,
  upsertBlock,
} from '../src/index.js'

const USAGE = `Usage: plain-tickets <command> [options]

Commands:
  init                     Create the config, the tickets folder, a first ticket, the board
                           and a tickets section in AGENTS.md. Safe to run again.
  new <type> "<title>"     Create the next ticket from its template and print its path.
  list                     Show open tickets, one line each.
  check                    Validate every ticket, write nothing.
  board                    Validate every ticket, then write the board.
  guide                    Print the tickets section for AGENTS.md.

Options:
  --config <file>          Config file. Default: tickets.config.json in the current folder, if it exists.
  -h, --help               Show this help.

init:  --prefix <PREFIX>   Id prefix for a new config, like WEB. Default: T.
       --skip-agents       Do not touch AGENTS.md.
new:   --priority <p>  --status <s>  --epic <id>  --slug <short-slug>  --ref <path> (repeatable)
list:  --status, --type, --priority, --epic (comma-separated)  --all  --json

Exit codes: 0 ok, 1 invalid tickets, 2 bad command, option, config or input.`

const OPTIONS = {
  config: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  prefix: { type: 'string' },
  'skip-agents': { type: 'boolean' },
  priority: { type: 'string' },
  status: { type: 'string' },
  epic: { type: 'string' },
  type: { type: 'string' },
  slug: { type: 'string' },
  ref: { type: 'string', multiple: true },
  all: { type: 'boolean' },
  json: { type: 'boolean' },
}
const COMMANDS = {
  init: { args: 0, options: ['prefix', 'skip-agents'] },
  new: { args: 2, options: ['priority', 'status', 'epic', 'slug', 'ref'] },
  list: { args: 0, options: ['status', 'type', 'priority', 'epic', 'all', 'json'] },
  check: { args: 0, options: [] },
  board: { args: 0, options: [] },
  guide: { args: 0, options: [] },
}

const cwd = process.cwd()
const show = (path) => relative(cwd, path).split(sep).join('/') || '.'
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

let args
try {
  args = parseArgs({ allowPositionals: true, options: OPTIONS })
} catch (error) {
  fail(2, error.message, '', USAGE)
}
if (args.values.help) {
  console.log(USAGE)
  process.exit(0)
}
const [command, ...rest] = args.positionals
const spec = COMMANDS[command]
if (!spec) fail(2, command ? `unknown command "${command}"` : 'no command given', '', USAGE)
if (rest.length !== spec.args) {
  fail(2, command === 'new' ? 'new needs a type and a title: plain-tickets new bug "Login fails"' : `${command} takes no arguments`)
}
const stray = Object.keys(args.values).filter((key) => !['config', 'help', ...spec.options].includes(key))
if (stray.length) fail(2, `${command} does not take --${stray.join(', --')}`)

try {
  if (command === 'init') init()
  else run(command, loadConfig(cwd, args.values.config))
} catch (error) {
  fail(2, `plain-tickets: ${error.message}`)
}

function run(command, config) {
  if (command === 'guide') return process.stdout.write(agentGuide(config))
  if (command === 'new') return newTicket(config)

  const { tickets, byId, problems } = readTickets(config, cwd)
  if (command === 'list') return list(config, tickets, problems)
  if (problems.length) {
    const what = command === 'board' ? `${show(config.board)} was not written. Fix` : 'Fix'
    const these = problems.length === 1 ? 'this problem' : `these ${problems.length} problems`
    fail(1, `plain-tickets: ${what} ${these}:`, ...problems.map((p) => `  ${p}`))
  }
  if (command === 'check') return console.log(`plain-tickets: no problems in ${plural(tickets.length, 'ticket')}`)
  writeBoard(config, tickets, byId)
}

function writeBoard(config, tickets, byId) {
  mkdirSync(dirname(config.board), { recursive: true })
  writeFileSync(config.board, renderBoard(tickets, byId, config))
  console.log(`plain-tickets: wrote ${show(config.board)} (${plural(tickets.length, 'ticket')})`)
}

function newTicket(config) {
  const [type, title] = rest
  const { values } = args
  const ticket = createTicket(config, {
    type,
    title,
    priority: values.priority,
    status: values.status,
    epic: values.epic,
    slug: values.slug,
    refs: values.ref,
  })
  mkdirSync(config.dir, { recursive: true })
  // 'wx' fails instead of overwriting, in case another process took the same id a moment ago.
  writeFileSync(join(config.dir, ticket.file), ticket.text, { flag: 'wx' })
  console.log(show(join(config.dir, ticket.file)))
}

function list(config, tickets, problems) {
  const split = (key) => args.values[key]?.split(',').map((v) => v.trim()).filter(Boolean)
  const filters = { all: args.values.all }
  for (const key of ['status', 'type', 'priority', 'epic']) filters[key] = split(key)
  const shown = listTickets(tickets, config, filters)
  if (args.values.json) {
    const out = shown.map(({ file, ...ticket }) => ({ ...ticket, file: show(join(config.dir, file)) }))
    console.log(JSON.stringify(out, null, 2))
  } else {
    console.log(formatList(shown).join('\n'))
    const hidden = !filters.all && !filters.status?.length && config.closed.length
    const note = hidden ? `. Closed (${config.closed.join(', ')}) hidden, --all shows them` : ''
    console.log(`\n${shown.length} of ${plural(tickets.length, 'ticket')}${note}.`)
  }
  if (problems.length) {
    fail(1, `plain-tickets: ${plural(problems.length, 'problem')} in the tickets. Run plain-tickets check.`)
  }
}

function init() {
  const { values } = args
  const configFile = resolve(cwd, values.config ?? 'tickets.config.json')
  if (existsSync(configFile)) {
    if (values.prefix) fail(2, `plain-tickets: ${show(configFile)} exists. Change the prefix there.`)
  } else {
    const raw = { prefix: values.prefix ?? 'T' }
    const errors = configErrors(raw)
    if (errors.length) fail(2, `plain-tickets: ${errors.join('; ')}`)
    mkdirSync(dirname(configFile), { recursive: true })
    writeFileSync(configFile, `${JSON.stringify(raw, null, 2)}\n`)
    console.log(`created ${show(configFile)}`)
  }
  const config = loadConfig(cwd, show(configFile))

  if (!existsSync(config.dir)) {
    mkdirSync(config.dir, { recursive: true })
    console.log(`created ${show(config.dir)}/`)
  }
  const before = readTickets(config, cwd)
  if (!before.tickets.length && !before.problems.length) {
    const type = config.types.includes('chore') ? 'chore' : (config.types.find((t) => t !== 'epic') ?? config.types[0])
    const ticket = createTicket(config, {
      type,
      title: 'Set up plain-tickets',
      status: config.closed[0] ?? config.defaults.status,
      refs: [show(configFile)],
    })
    writeFileSync(join(config.dir, ticket.file), ticket.text, { flag: 'wx' })
    console.log(`created ${show(join(config.dir, ticket.file))}`)
  }

  const { tickets, byId, problems } = readTickets(config, cwd)
  if (problems.length) {
    console.error(`plain-tickets: the board was not written. Fix ${plural(problems.length, 'problem')}:`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exitCode = 1
  } else {
    writeBoard(config, tickets, byId)
  }

  if (!values['skip-agents']) {
    const agentsFile = join(config.root, 'AGENTS.md')
    const old = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : null
    const text = upsertBlock(old ?? '', agentGuide(config))
    if (text !== old) writeFileSync(agentsFile, text)
    console.log(`${old === null ? 'created' : text === old ? 'unchanged' : 'updated'} ${show(agentsFile)}`)

    const claude = join(config.root, 'CLAUDE.md')
    if (existsSync(claude) && !readFileSync(claude, 'utf8').includes('@AGENTS.md')) {
      console.log(`note: Claude Code reads ${show(claude)} instead of AGENTS.md here. Add this line to it: @AGENTS.md`)
    }
    if (existsSync(join(config.root, 'GEMINI.md'))) {
      console.log('note: Gemini CLI reads GEMINI.md. Add "AGENTS.md" to context.fileName in .gemini/settings.json')
    }
  }
}

function fail(code, ...lines) {
  console.error(lines.join('\n'))
  process.exit(code)
}
