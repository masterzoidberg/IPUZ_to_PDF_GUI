@echo off
echo Starting IPUZ to PDF Converter with debugging...
cd /d "%~dp0"

:: Clear the log file
echo Application Log > debug.log

:: Run the app with debugging enabled
set DEBUG=*
npm start >> debug.log 2>&1

echo.
echo If the application crashed, check debug.log for details.
echo.
pause