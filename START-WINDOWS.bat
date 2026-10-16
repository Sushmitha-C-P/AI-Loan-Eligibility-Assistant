@echo off
title loaneligibilitycheck
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  1. Install it from https://nodejs.org  (choose LTS)
  echo  2. Then double-click this file again.
  echo.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo Installing for the first time. This takes about a minute...
  call npm install
)
echo.
echo  Starting the app. Your browser will open at http://localhost:5173
echo  Keep this window open. Close it to stop the app.
echo.
call npm run dev
pause
