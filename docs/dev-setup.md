# Dev Setup

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

## Clone

```sh
git clone https://github.com/TheCruzControll/Bookshelf.git
cd Bookshelf
```

## Install dependencies

```sh
pnpm install
```

## Environment variables

Copy the example file and fill in values:

```sh
cp .env.example .env.local
```

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | Yes | Set automatically when using the local Docker Postgres (see below). Format: `postgresql://hone:hone@localhost:5432/hone` |
| `SUPABASE_URL` | Only if using Supabase Auth/Storage | Project URL from the [Supabase dashboard](https://supabase.com/dashboard) → your project → Settings → API |
| `SUPABASE_ANON_KEY` | Only if using Supabase Auth/Storage | Anon public key from Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Only if using Supabase server-side features | Service role key from Supabase dashboard → Settings → API (keep secret, never expose to clients) |
| `NEXT_PUBLIC_API_URL` | Yes (web app) | URL of the running API. Defaults to `http://localhost:8787` for local dev |
| `EXPO_PUBLIC_API_URL` | Yes (native app) | URL of the running API. Use `http://localhost:8787` for local dev or your machine's LAN IP when testing on a physical device |
| `PORT` | No | Port the API server listens on. Defaults to `8787` |
| `APPLE_CLIENT_ID` | Only if testing Apple Sign-In | App Bundle ID from Apple Developer account (e.g., `com.hone.app`) |
| `APPLE_TEAM_ID` | Only if testing Apple Sign-In | Team ID from Apple Developer account |
| `APPLE_KEY_ID` | Only if testing Apple Sign-In | Key ID of the private key used to validate Apple tokens |
| `APPLE_PRIVATE_KEY` | Only if testing Apple Sign-In | Private key for Apple token validation (format: PEM-encoded RSA key) |

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

## Run database migrations

```sh
pnpm db:migrate
```

## Start all services in dev mode

```sh
pnpm dev
```
