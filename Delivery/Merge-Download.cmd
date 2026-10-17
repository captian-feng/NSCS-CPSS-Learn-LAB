@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Merge-Download.ps1"
if errorlevel 1 echo Failed. Read the error above and send a screenshot.
pause
