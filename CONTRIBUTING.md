# Contributing Guide

Thanks for contributing to **TextCreateImageTestView**.

## Development setup

```bash
npm ci
npm run server:install
npm run prisma:generate
```

## Run locally

```bash
# frontend only
npm run dev

# frontend + backend
npm run full:dev
```

## Quality checks

Please run before opening a PR:

```bash
npm run lint
npm run build
npm run server:build
```

## Pull request rules

- Keep PRs focused and small.
- Add/update docs when behavior changes.
- Do not commit API keys, tokens, or private data.
- If UI changed, attach screenshots.
- If backend changed, include request/response examples or logs.

## Commit messages

Use clear, scoped messages, for example:

- `feat(ai-art): add model filter`
- `fix(novel-ai): parse stream events safely`
- `chore(ci): add dependabot`
