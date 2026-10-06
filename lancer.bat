@echo off
rem Lance un serveur local (necessaire pour charger les modeles 3D) et ouvre le jeu
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000
