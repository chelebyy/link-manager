#!/bin/bash

# Link Manager Docker Deployment Script
# Usage: ./deploy.sh [up|down|build|logs|restart]

set -e

COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="link-manager"

case "${1:-up}" in
  up)
    echo "Starting Link Manager..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d
    echo "Waiting for services to be ready..."
    sleep 5
    echo "Link Manager is running!"
    echo "Frontend: http://localhost"
    echo "Backend API: http://localhost/api"
    ;;
  down)
    echo "Stopping Link Manager..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down
    echo "Stopped."
    ;;
  build)
    echo "Building Docker images..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME build --no-cache
    echo "Build complete."
    ;;
  logs)
    echo "Showing logs..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f
    ;;
  restart)
    echo "Restarting Link Manager..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME restart
    echo "Restarted."
    ;;
  *)
    echo "Usage: $0 [up|down|build|logs|restart]"
    exit 1
    ;;
esac
