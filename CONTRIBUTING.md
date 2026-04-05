# Contributing to AngleCheck

Thank you for your interest in contributing to AngleCheck! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/anglenews.git`
3. Install dependencies:
   ```bash
   npm install
   cd extension && npm install
   cd ../api && npm install
   ```
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites
- Node.js 18+
- npm

### API Server
```bash
cd api
cp .env.example .env    # Add your API keys
npm run dev             # Starts on http://localhost:3001
```

### Extension
```bash
cd extension
npm run dev             # Watch mode
npm run build           # Production build to dist/
```

Then load `extension/dist/` as an unpacked extension in Chrome.

## Running Tests

```bash
# API tests (172 tests)
cd api && npx vitest run

# Extension tests (92 tests)
cd extension && npx vitest run
```

All tests must pass before submitting a PR.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, descriptive commits
3. Ensure all tests pass
4. Ensure the extension builds cleanly (`cd extension && npm run build`)
5. Update documentation if your changes affect the public API or user-facing behavior
6. Submit a pull request with:
   - A clear title describing the change
   - A description of what changed and why
   - Screenshots for UI changes

## Code Style

- TypeScript strict mode throughout
- React functional components with hooks
- Tailwind CSS for styling (no inline styles except for dynamic values)
- Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`)

## Project Structure

```
anglecheck/
├── extension/    # Chrome Manifest V3 extension (React + Tailwind + Vite)
├── api/          # Backend API (Hono + Anthropic SDK)
└── shared/       # Shared TypeScript types, constants, bias ratings
```

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Include browser version and OS for extension issues

## Bias Ratings

The source bias ratings in `shared/bias-ratings.json` are derived from publicly available media bias research methodology. If you believe a rating is inaccurate:

1. Open an issue with the outlet name and your suggested rating
2. Include sources supporting the change
3. Ratings are reviewed periodically

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
