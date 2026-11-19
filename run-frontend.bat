@echo off
cd /d "%~dp0frontend"
echo Starting IIUI Exam Portal frontend on http://localhost:5173
call npm run dev
pause
