$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "构建命令失败：$LASTEXITCODE" } }
npm ci
Check-Exit
npx install-electron --no
Check-Exit
npm run check
Check-Exit
npm run test:e2e
Check-Exit
npm run dist:win
Check-Exit
Write-Host '构建文件在 release 目录；仍需执行 Windows 安装/升级/卸载与真实教材人工验收。'
