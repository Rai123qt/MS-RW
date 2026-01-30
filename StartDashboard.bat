@echo off
cd /d "%~dp0"
title Microsoft Rewards Bot - Dashboard

echo Starting Dashboard Server...
echo Please wait while the server initializes...

:: Start the browser in 5 seconds (allows server to boot up)
timeout /t 5 /nobreak >nul
start http://localhost:3000

:: Set timezone to US to match proxy and prevent "On the go" warning
set TZ=America/New_York

:: Run the dashboard server using the compiled code
:: Using cmd /c just to be safe with npm execution policies
cmd /c npm run dashboard

pause
