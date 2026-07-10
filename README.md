# GitHub Wrapped

GitHub Wrapped is a React + Vite project that turns a GitHub username into a polished, story-style annual recap. It combines a landing flow, loading sequence, animated Wrapped slides, keyboard navigation, pause/play controls, and secure GitHub data fetching for full-year contribution data.

## Overview

The app supports two data modes:

- Secure authenticated mode via a serverless API route for full-year GitHub GraphQL contribution data
- Public fallback mode using GitHub REST endpoints when the secure token is unavailable

The current Wrapped year is `2026`.

## Features

- Username-based GitHub Wrapped generation
- Animated story/slides flow with:
  - autoplay
  - pause/play
  - keyboard arrow navigation
  - manual slide selection
- Responsive Wrapped presentation
- Secure server-side GitHub token handling for deployment
- Public-mode fallback when secure GraphQL data is unavailable
- Share-ready final slide

## Tech Stack

- React 19
- Vite
- Framer Motion
- ESLint
- Vercel serverless function pattern via `api/`

## Project Structure

```text
.
|-- api/
|   `-- github-wrapped.js      # Secure serverless GitHub proxy for GraphQL Wrapped data
|-- src/
|   |-- lib/
|   |   `-- github.js          # GitHub API helpers, data shaping, Wrapped data builders
|   |-- App.jsx                # Main app flow and all Wrapped screens
|   |-- index.css              # Global styling and responsive layout
|   `-- main.jsx               # React entry point
|-- .env.example
|-- eslint.config.js
|-- index.html
|-- package.json
`-- vite.config.js
```

## How It Works

### 1. Landing

The user enters a GitHub username on the landing screen.

### 2. Secure Attempt

The frontend first calls:

```text
/api/github-wrapped
```

That serverless endpoint:

- reads `GITHUB_TOKEN` from server environment variables
- calls GitHub GraphQL
- builds the full Wrapped dataset
- returns only the processed data to the client

This keeps the token off the browser.

### 3. Public Fallback

If the secure endpoint is unavailable, the app falls back to public GitHub REST data:

- user profile
- repositories
- recent public events

That mode is less complete, but still lets the user generate a Wrapped experience.

## Security

### Safe

- `GITHUB_TOKEN` stored in Vercel environment variables
- GitHub GraphQL requests executed only on the server
- frontend receives processed response data, not the token

### Not Safe

- putting a GitHub token in `VITE_*`
- calling GitHub GraphQL directly from browser code with a personal token

### Important Rule

Use:

```bash
GITHUB_TOKEN=your_token_here
```

Do not use:

```bash
VITE_GITHUB_TOKEN=...
```

Anything prefixed with `VITE_` is exposed to the client bundle.

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start the app

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build locally

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Environment Variables

Copy the example:

```bash
.env.example
```

Current expected variable:

```bash
GITHUB_TOKEN=
```

Notes:

- For plain Vite local development, the secure serverless endpoint may not be present unless you run in a Vercel-compatible environment.
- In that case, the app will fall back to public mode.

## Deploying to Vercel

### 1. Push the project to GitHub

Make sure your latest code is committed and pushed.

### 2. Import the repo into Vercel

Create a new Vercel project from the repository.

### 3. Add environment variable

In Vercel project settings, add:

```bash
GITHUB_TOKEN=your_github_personal_access_token
```

### 4. Deploy

Vercel will:

- build the Vite frontend
- expose the `api/github-wrapped.js` function
- keep the token server-side

## Recommended GitHub Token Permissions

For this app, use the minimum token scope required for the GraphQL data you need. In most cases, a low-privilege personal access token is enough for reading user and contribution data.

Keep it limited. Do not use a broader token than necessary.

## UX Notes

The Wrapped flow currently includes:

- landing screen
- loading screen
- multiple animated Wrapped slides
- autoplay with pause/resume
- keyboard navigation
- responsive mobile layout with a simplified small-screen presentation

## Scripts

Defined in [package.json](/abs/path/C:/Users/rishi/Desktop/Projects/github-wrapped/package.json):

- `npm run dev` - start Vite dev server
- `npm run build` - create production build in `dist/`
- `npm run preview` - preview production build locally
- `npm run lint` - run ESLint

## Output Folder

Running `npm run build` generates:

```text
dist/
```

This folder contains the optimized production output and should not usually be edited manually.

## Known Behavior

- Secure mode depends on server-side environment configuration
- Public fallback mode cannot provide the same full-year depth as authenticated GraphQL mode
- Small-screen layouts intentionally simplify the presentation to keep everything inside the viewport

## Future Improvements

- richer share/export flow
- better analytics across more contribution types
- more slide variants
- improved local serverless dev ergonomics
- test coverage for data helpers and serverless endpoint behavior

## License

No license file is currently included in this repository. Add one if you plan to distribute or open-source the project.
