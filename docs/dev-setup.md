# Dev Setup

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

## Local Database

Start Postgres 16 and Adminer in the background:

```sh
docker compose up -d postgres
```

To also start Adminer (database UI at <http://localhost:8080>):

```sh
docker compose up -d
```

Connection details:

| Field    | Value     |
|----------|-----------|
| Host     | localhost |
| Port     | 5432      |
| Database | hone      |
| User     | hone      |
| Password | hone      |

The Postgres data directory is persisted in the `postgres_data` Docker volume, so your data survives container restarts.

To stop:

```sh
docker compose down
```

To stop and wipe the volume (full reset):

```sh
docker compose down -v
```

## Install dependencies

```sh
pnpm install
```

## Run database migrations

```sh
pnpm db:migrate
```

## Start all services in dev mode

```sh
pnpm dev
```
