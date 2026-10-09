@echo off
cd /d "%~dp0"
if not exist .env.local (
  copy .env.example .env.local >nul
  echo Add your OpenAI API key to .env.local, then run this launcher again.
  notepad .env.local
  exit /b
)
if not exist node_modules call npm install
call npm run dev -- --open
