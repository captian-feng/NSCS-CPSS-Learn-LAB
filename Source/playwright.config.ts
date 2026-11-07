import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: 'tests/e2e', testMatch:['desktop.spec.ts','custom-bank.spec.ts','draft.spec.ts'], workers: 1, timeout: 60000, reporter: 'list' })
