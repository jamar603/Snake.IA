@echo off
rem Installe les dependances au premier lancement, demarre le serveur et ouvre le jeu
cd /d "%~dp0"
if not exist node_modules call npm install
start "" http://localhost:8080
node server/index.js
