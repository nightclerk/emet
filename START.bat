@echo off
rem Emet: one double-click does everything. Output goes to C:\emet\run.log
setlocal
set ROOT=C:\emet
set APP=%ROOT%\app
set LOG=%ROOT%\run.log
echo ===== %DATE% %TIME% ===== > "%LOG%"

rem 1. Node.js (installs the LTS version with winget if it is missing)
where node >nul 2>nul
if errorlevel 1 (
  echo Installing Node.js LTS... >> "%LOG%"
  echo Installing Node.js, this happens only once...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >> "%LOG%" 2>&1
  set "PATH=%PATH%;C:\Program Files\nodejs"
)
where node >> "%LOG%" 2>&1 || (echo NODE_MISSING >> "%LOG%" & echo Node.js could not be installed. & pause & exit /b 1)
node -v >> "%LOG%" 2>&1

rem 2. The app (downloaded from GitHub the first time; later updates are written straight into C:\emet\app)
if not exist "%APP%\package.json" (
  echo Downloading Emet... >> "%LOG%"
  echo Downloading Emet...
  powershell -NoProfile -Command "Invoke-WebRequest https://github.com/nightclerk/emet/archive/refs/heads/main.zip -OutFile '%ROOT%\emet.zip'; Expand-Archive '%ROOT%\emet.zip' '%ROOT%\unzip' -Force; Move-Item '%ROOT%\unzip\emet-main' '%APP%'; Remove-Item '%ROOT%\unzip','%ROOT%\emet.zip' -Recurse -Force" >> "%LOG%" 2>&1
)
if exist "%ROOT%\presage.key" copy /y "%ROOT%\presage.key" "%APP%\presage.key" >nul

rem 3. Install and run (diagnostic mode: only "arrived / confidence", never values or images)
cd /d "%APP%"
echo Installing (the first time takes a few minutes)...
call npm install --no-fund --no-audit >> "%LOG%" 2>&1
echo INSTALL_EXIT=%ERRORLEVEL% >> "%LOG%"
echo Starting Emet. Sit in front of the camera, in good light, for about 90 seconds, then close the window.
call npm run diag >> "%LOG%" 2>&1
echo APP_EXIT=%ERRORLEVEL% >> "%LOG%"
echo Done. You can close this window.
