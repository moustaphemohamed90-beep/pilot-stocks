@echo off
chcp 65001 >nul
title Pilote Stocks - serveur
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe sur ce poste.
  echo  Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
