@echo off
chcp 65001 > nul
echo Starting Taipei City Dashboard...

cd /d "C:\Users\user\Documents\黑客松\Taipei-City-Dashboard\docker"
docker compose up -d
docker compose -f docker-compose-db.yaml up -d

cd /d "C:\Users\user\Documents\黑客松\Taipei-City-Dashboard\Taipei-City-Dashboard-DE\docker\develop"
docker compose up -d

echo Waiting for services to start...
timeout /t 15 /nobreak > nul

<<<<<<< HEAD
start http://192.168.8.80
start http://192.168.8.80:8889
=======

echo All services started!
pause