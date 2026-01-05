# Copilot instructions for three-test

This project is a minimal Vite + TypeScript demo that mounts a Three.js scene and a first-person controller.
Keep guidance short and code-focused — follow these concrete patterns when making changes.

## Big picture

- Entry point: `src/main.ts`.
- Static UI: `index.html`.

## Developer workflow (concrete commands)

- Install deps: `npm install`.
- Run dev server (Vite): `npm start` (package.json defines `start: "vite"`).
- Type-check: `npm run tsc`.
- Lint only: `npm run eslint`.
- Full lint/format check: `npm run lint` (runs eslint, tsc, stylelint, prettier).

## Integration & dependencies

- Three.js is imported from `three`. Types are provided via `@types/three`.
- No external asset pipeline — assets would be referenced from `index.html`/`src` and served by Vite.

## Editing & testing hints

- Always familiarize yourself with possible changes made by the user.
- Never request to run `npm start`.
- Never create `*.d.ts` files without asking the user for permission.
- Always check linter errors with `npm run lint`.
- Keep comments to a minimum.
