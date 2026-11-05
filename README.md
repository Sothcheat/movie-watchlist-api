# Movie Watchlist API

A REST API where each user keeps a personal watchlist of movies. Built with NestJS, TypeORM and
PostgreSQL, with JWT login. Search results come from [TMDB](https://www.themoviedb.org), and the
server fetches a movie's details itself when it is added, so the client only sends a TMDB id.

## Data fields (`watchlist_items`)

| Field                                            | Type                      | Notes                                       |
| ------------------------------------------------ | ------------------------- | ------------------------------------------- |
| `id`                                             | uuid                      | Generated                                   |
| `tmdbId`                                         | integer                   | **Required** when creating. Unique per user |
| `title`, `overview`, `posterPath`, `releaseDate` | text, text, text, date    | Copied from TMDB by the server              |
| `priority`                                       | `low` / `medium` / `high` | Optional, default `medium`                  |
| `watched`                                        | boolean                   | Default `false`                             |
| `watchedAt`                                      | timestamp                 | Set when `watched` becomes true             |
| `rating`                                         | integer 1-10              | Optional, `null` clears it                  |
| `createdAt`, `updatedAt`                         | timestamp                 | Generated                                   |

## Routes

All five need a token (`Authorization: Bearer <accessToken>`, from `POST /api/auth/login`) and
only ever see the caller's own items.

| Action         | Method | URL                  |
| -------------- | ------ | -------------------- |
| List all items | GET    | `/api/watchlist`     |
| Get one item   | GET    | `/api/watchlist/:id` |
| Create an item | POST   | `/api/watchlist`     |
| Update an item | PATCH  | `/api/watchlist/:id` |
| Delete an item | DELETE | `/api/watchlist/:id` |

Missing item: 404. No token: 401. Empty or invalid body: 400.

## Run it

```bash
cp .env.example .env              # then fill in the secrets and TMDB_ACCESS_TOKEN
docker compose up -d postgres
pnpm install
pnpm run migration:run         # creates the tables
pnpm run start:dev                # http://localhost:3000, docs at /api/docs
pnpm run test && pnpm run test:e2e
```
