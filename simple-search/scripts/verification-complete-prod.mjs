#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const currentFilePath = fileURLToPath(import.meta.url)
const scriptsDir = path.dirname(currentFilePath)

const baseScriptPath = path.resolve(scriptsDir, 'verification-complete.mjs')
const envFilePath = path.resolve(process.cwd(), '.env.production')

const args = process.argv.slice(2)
const child = spawn(
  process.execPath,
  [baseScriptPath, `--env-file=${envFilePath}`, ...args],
  {
    stdio: 'inherit',
    env: process.env
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
