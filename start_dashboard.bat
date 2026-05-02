@echo off
setlocal
chcp 65001 > nul

set "ROOT=%~dp0"
set "DOCKER_DIR=%ROOT%docker"
set "DE_DOCKER_DIR=%ROOT%Taipei-City-Dashboard-DE\docker\develop"

echo Starting Taipei City Dashboard...

if not exist "%DOCKER_DIR%\docker-compose.yaml" (
    echo Cannot find "%DOCKER_DIR%\docker-compose.yaml".
    pause
    exit /b 1
)

cd /d "%DOCKER_DIR%"
docker compose -f docker-compose-db.yaml -f docker-compose.yaml up -d
if errorlevel 1 (
    echo Failed to start dashboard services.
    pause
    exit /b 1
)

if exist "%DE_DOCKER_DIR%\docker-compose.yaml" (
    cd /d "%DE_DOCKER_DIR%"
    docker compose up -d
    if errorlevel 1 (
        echo Failed to start data engineering services.
        pause
        exit /b 1
    )
) else (
    echo Skipping data engineering services; "%DE_DOCKER_DIR%\docker-compose.yaml" was not found.
)

echo Waiting for services to start...
timeout /t 15 /nobreak > nul

start http://localhost
start http://localhost:8889

echo All services started!
pause
