# TBDFF

Fantasy football platform with web and mobile clients.

## Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL

## Setup

```bash
# Install dependencies
pnpm install

# Build the shared package (required before first run)
pnpm build:shared

# Set up backend environment
cp apps/backend/.env.example apps/backend/.env
# Edit .env with your DATABASE_URL, JWT_SECRET, etc.

# Run database migrations
pnpm --filter @tbdff/backend migrate
```

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `DATABASE_URL` | `apps/backend/.env` | PostgreSQL connection string |
| `JWT_SECRET` | `apps/backend/.env` | Minimum 64 characters |
| `CORS_ORIGIN` | `apps/backend/.env` | Comma-separated allowed origins |
| `PORT` | `apps/backend/.env` | Backend port (default: 5000) |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | API base URL for web |
| `API_URL` | Mobile env | API base URL for mobile |

## Development

```bash
# Start backend + web + shared (watch) together
pnpm dev

# Or start individually
pnpm dev:backend   # Backend on :5000
pnpm dev:web       # Web on :3000
pnpm dev:mobile    # Mobile (Expo)
```

### Mobile on Physical Devices

By default, the mobile app connects to `http://localhost:5000/api`, which only works in emulators/simulators.

- **Android emulator**: Use `http://10.0.2.2:5000/api`
- **Physical device**: Use your machine's LAN IP

```bash
API_URL=http://192.168.x.x:5000/api pnpm dev:mobile
```

Ensure `CORS_ORIGIN` in the backend `.env` includes the mobile app's origin if needed.

## Linting & Formatting

```bash
pnpm lint          # Check for lint errors
pnpm lint:fix      # Auto-fix lint errors
pnpm format        # Format all files with Prettier
```

## Project Structure

```
apps/
  backend/     # Express API server
  web/         # Next.js web app
  mobile/      # Expo/React Native app
packages/
  shared/      # Shared types, API client, auth helpers
```
