@echo off
cd /d "%~dp0"
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
