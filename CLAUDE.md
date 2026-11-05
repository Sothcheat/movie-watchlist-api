# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Movie watchlist REST API built on NestJS 12 (Express platform). It is still the bare `nest new` scaffold: a single `AppModule` with `AppController`/`AppService`, no database or config module yet.

## Commands

The package manager is pnpm.

```bash
pnpm install
pnpm run start:dev          # watch mode, listens on $PORT or 3000
pnpm run build              # nest build -> dist/ (uses tsconfig.build.json, excludes specs)
pnpm run lint               # oxlint --type-aware src/ test/
pnpm run format             # prettier on src/ and test/
pnpm run test               # unit tests (*.spec.ts)
pnpm run test:e2e           # e2e tests (*.e2e-spec.ts, via vitest.config.e2e.ts)
pnpm run test:cov

# single test file / single test by name
pnpm exec vitest run src/app.controller.spec.ts
pnpm exec vitest run -t "should return"
pnpm exec vitest run --config ./vitest.config.e2e.ts test/app.e2e-spec.ts
```

## Things that differ from a typical Nest project

- **Native ESM** (`"type": "module"`, `module: nodenext`). Relative imports must use the `.js` extension even in `.ts` files (`import { AppService } from './app.service.js'`). `main.ts` uses top-level `await bootstrap()`.
- **Vitest, not Jest.** Globals (`describe`, `it`, `expect`, `vi`) are enabled; use `vi.fn()`/`vi.spyOn()` rather than `jest.*`. Unit specs live next to the source in `src/`; e2e specs live in `test/` and boot the full `AppModule` with supertest.
- **oxlint, not ESLint.** `.oxlintrc.json` makes `no-floating-promises` an error (every promise must be awaited or handled) and allows `any`.
- Prettier: single quotes, trailing commas.
- `strict` is on but `strictPropertyInitialization` is off, so DTO/entity class properties don't need initializers.
