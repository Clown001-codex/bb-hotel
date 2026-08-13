@echo off
cd /d "%~dp0"
echo Installing/checking dependencies...
npm install
echo.
echo Starting BB Hotel...
npm start
pause
