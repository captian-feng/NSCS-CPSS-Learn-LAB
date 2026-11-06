@echo off
set "CPSS_DATA_DIR=%~dp0Source\.local\preview-cpss"
cd /d "%~dp0Source"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron is missing. Run npm ci and npx install-electron --no in the Source folder.
  pause
  exit /b 1
)
if not exist "out\main\index.js" (
  echo The application has not been built. Run npm run build in the Source folder.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
