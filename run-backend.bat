@echo off
cd /d "%~dp0backend"
echo Starting IIUI Exam Portal backend on http://localhost:8000
"%~dp0backend\venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
