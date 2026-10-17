import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'tests/e2e',testMatch:'textbook.spec.ts',workers:1,timeout:120000,reporter:'list'})
