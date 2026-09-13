# MindAgora

[![pull-request](https://github.com/janwychowaniak/mindagora/actions/workflows/pull-request.yml/badge.svg)](https://github.com/janwychowaniak/mindagora/actions/workflows/pull-request.yml)
[![gitleaks](https://github.com/janwychowaniak/mindagora/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/janwychowaniak/mindagora/actions/workflows/gitleaks.yml)

A web application for conducting conversations with multiple AI models simultaneously in a unified chat interface.

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Container Image](#container-image)
- [Deployment & Releases](#deployment--releases)
- [Project Scope](#project-scope)
- [Project Context](#project-context)
- [Project Status](#project-status)
- [License](#license)

## Project Description

MindAgora eliminates the need to manually switch between different AI services (ChatGPT, Claude, Gemini) by providing a single interface where multiple AI models can participate in the same conversation with full context awareness.

### The Problem

Working with multiple AI models currently requires:

- Opening multiple tabs/applications
- Manually copying conversation context between services
- Constructing summaries of previous exchanges
- Managing fragmented knowledge across different platforms
- Remembering which model provided which response

### Key Features

- **Unified Chat Interface**: Single interface for all AI models
- **Shared Conversation Context**: All AI participants have full awareness of the entire conversation history
- **Conversation Persistence**: Save and return to conversations at any time
- **Multi-Model Support**: Access to various AI models through OpenRouter (OpenAI, Anthropic, Google, and more)
- **Flexible Participant Management**: Create multiple participants, even with the same model but different aliases
- **Conversation Management**: Create, edit, and delete conversations with auto-generated or custom titles

### Target Users

MindAgora is designed for users who:

- Work with multiple AI models regularly
- Need to compare different AI perspectives within a single discussion
- Want to maintain conversation context without manual copying and pasting
- Require a streamlined workflow for multi-model AI interactions

## Tech Stack

### Frontend

- **Astro 5** - Fast, efficient pages with minimal JavaScript
- **React 19** - Interactive components where needed
- **TypeScript 5** - Static typing and improved IDE support
- **Tailwind CSS 4** - Utility-first CSS framework
- **Shadcn/ui** - Accessible React component library
- **Lucide React** - Icon library

### Backend

- **Supabase** - Backend-as-a-Service providing:
  - PostgreSQL database
  - Built-in user authentication
  - SDK for database operations
  - Open-source and self-hostable

### AI Integration

- **OpenRouter.ai** - Unified API for accessing multiple AI models:
  - Access to OpenAI, Anthropic, Google, and many other providers
  - Financial limit controls for API keys
  - Consistent interface across different models

### CI/CD & Hosting

- **GitHub Actions** - `pull-request.yml` on every PR to `master`: lint and type check, unit tests with coverage,
  E2E tests on a Supabase stack started in the runner, production build, and a status comment on the PR;
  `master.yml` on every push to `master`: lint and type check, unit tests, then the container image built and pushed
  to GHCR (`ghcr.io/janwychowaniak/mindagora`, tags `latest` and `sha-<commit>`)
- **Railway** - Application hosting from the GHCR image, released through the `production` environment gate

### Testing

- **Vitest 4** - Unit tests for helpers, services, hooks and components (`npm test`), jsdom for DOM tests
- **React Testing Library** + **user-event** - Hook and component tests
- **curl smoke suite** - Integration tests of every endpoint against the local Supabase stack and the real
  OpenRouter API (`scripts/smoke/smoke-baseline.sh`, compared against the last baseline run)
- **Playwright** - End-to-end scenarios in `e2e/` (Chromium, page objects, the local Supabase stack, real OpenRouter
  calls when `E2E_OPENROUTER_KEY` is set in `.env.test`)

## Getting Started Locally

### Prerequisites

- **Node.js**: Version 24.13.1 (specified in `.nvmrc`)
  - We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions
  - Run `nvm use` in the project directory to switch to the correct version

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd MindAgora
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Local development: install Docker and run `npx supabase start` (the Supabase CLI is a devDependency). The schema is applied automatically from `supabase/migrations/`; `npx supabase db reset` rebuilds the local database from the migrations
   - Alternatively create a [Supabase](https://supabase.com/) cloud project and apply `supabase/migrations/` there
   - Configure Supabase authentication settings
   - For local development, disable email verification in Supabase Auth settings

4. **Set up OpenRouter**
   - Create an account at [OpenRouter.ai](https://openrouter.ai/)
   - Generate an API key
   - Set financial limits for your API key (recommended)

5. **Configure environment variables**
   - Create a `.env` file in the project root
   - Add the following variables (update with your values):
     ```env
     # Supabase (for the local stack: values from `npx supabase status`)
     SUPABASE_URL=your_supabase_url
     SUPABASE_KEY=your_supabase_anon_key

     # OpenRouter (optional headers for request attribution)
     OPENROUTER_HTTP_REFERER=http://localhost:3000
     OPENROUTER_X_TITLE=MindAgora

     # Public origin of a deployment (optional; the dev server uses the request origin)
     SITE_URL=http://localhost:3000
     ```

6. **Run the development server**

   ```bash
   npm run dev
   ```

7. **Open your browser**
   - Navigate to `http://localhost:3000` (port configured in `astro.config.mjs`)

### First-Time User Setup

After launching the application:

1. **Register/Login** - Create an account or sign in
2. **Add OpenRouter API Key** - Enter your OpenRouter API key in the onboarding flow
3. **Create AI Participants** - Add at least 2 AI participants with unique aliases and selected models
4. **Start Conversing** - Create a new conversation and start chatting with multiple AI models!

## Available Scripts

- `npm run dev` - Start the development server with hot-reload
- `npm run build` - Build the application for production
- `npm run preview` - Preview the production build locally
- `npm run astro` - Run Astro CLI commands
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run check` - Type check the project with `astro check`
- `npm run format` - Format code with Prettier
- `npm test` - Run the unit tests once (Vitest)
- `npm run test:watch` - Run unit tests in watch mode
- `npm run test:coverage` - Run unit tests with a V8 coverage report
- `npm run test:e2e` - Run the Playwright E2E suite (`npx supabase start` first; copy `.env.test.example` to `.env.test`)
- `npm run test:e2e:ui` - Playwright UI mode
- `npm run dev:e2e` - Dev server with `.env.test` (started by Playwright automatically)
- `npx supabase start` / `npx supabase stop` - Start / stop the local Supabase stack (Docker)
- `npx supabase db reset` - Rebuild the local database from `supabase/migrations/`

## Container Image

`Dockerfile` builds the production server: two stages on `node:24-alpine`, production dependencies only, a non-root
user and a health check on `/login`. Configuration is read from the environment when the container runs (`astro:env`);
nothing is baked into the image. To build and run it locally against the local Supabase stack:

```bash
docker build -t mindagora:local .
docker run --rm --network host \
  -e PORT=3200 \
  -e SUPABASE_URL=http://127.0.0.1:54321 \
  -e SUPABASE_KEY=<anon key from "npx supabase status"> \
  -e OPENROUTER_X_TITLE=MindAgora \
  mindagora:local
# then open http://localhost:3200
```

## Deployment & Releases

The app runs at **https://mindagora.ai**: Railway (EU West) runs the GHCR image, Cloudflare serves DNS and TLS for the
domain (`www` redirects to the root), and a Supabase cloud project in the EU holds the data.

- **Deployment** happens on every push to `master`: `.github/workflows/master.yml` lints, type-checks, runs the unit
  tests and pushes the image to GHCR (`ghcr.io/janwychowaniak/mindagora:latest` and `sha-<commit>`).
- **Release** is the `deploy` job behind the GitHub environment `production`: it waits for the required reviewer, then
  `railway redeploy` pulls the new `latest` digest and restarts the service (about a minute; Railway checks `/login`
  before switching traffic). Approve or reject a pending deployment promptly: it holds the workflow's concurrency group.
- **Configuration** lives only in the Railway service variables (`SUPABASE_URL`, `SUPABASE_KEY`, `SITE_URL`,
  `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`; `PORT` comes from the image) and in the environment secret
  `RAILWAY_TOKEN`. Nothing is baked into the image and nothing is committed.
- **Database changes** reach the cloud project from a maintainer's machine with `npx supabase link --project-ref <ref>`
  and `npx supabase db push`, before the release that needs them.
- **Plans:** Railway Hobby keeps the service always on (the free plan stops it once the monthly credit is used up).
  The Supabase free tier pauses a project after a week without activity; it is resumed from the Supabase dashboard.
- **Known limitation:** each user's OpenRouter key is stored in the database in plain text, protected by row-level
  security only, so the maintainer could read it. Use a key with a spending limit and delete it in OpenRouter when you
  stop using MindAgora. Encryption at rest is planned.

## Project Scope

### MVP Features (Implemented)

#### Authentication & User Management

- User registration with email verification (disabled in local dev, enabled in production)
- Login/logout with the session kept in httpOnly cookies (`@supabase/ssr`); the REST API also accepts `Authorization: Bearer <jwt>` for non-browser clients
- Guided onboarding for new users
- Account settings page

#### OpenRouter API Key Management

- Secure storage of API keys in Supabase
- Masked input with show/hide toggle
- API key validation with timeout handling
- API responses include `Cache-Control: no-store` for sensitive data

#### AI Participants Management

- Create AI participants with unique aliases (max 30 characters)
- Select from available models via OpenRouter API
- Delete participants (hard delete)
- Support for multiple participants with the same model but different aliases
- Minimum 2 participants required for conversations
- Deleted participant messages preserved as "(Deleted Participant)"

#### Conversations Management

- List conversations sorted by last updated
- Create new conversations
- Edit conversation titles inline
- Delete conversations with confirmation
- Auto-generated titles from first message
- Message count badges
- Relative timestamps

#### Multi-Model Chat

- Stack layout for all messages
- Visual distinction between user and AI messages
- Full conversation context sent to AI models
- Non-streaming responses
- Character limit (10,000 chars) with counter
- Auto-scroll to bottom when at bottom
- Date separators between days
- Absolute timestamps for each message

#### Error Handling

- API timeout handling
- Invalid/expired key detection
- Rate limit notifications
- Network error handling
- Clear error messages from OpenRouter

### Out of Scope for MVP

**Features:**

- Dynamic participant management during active conversations
- Editing AI participants after creation
- Editing sent messages
- Model parameter configuration (temperature, top_p, max_tokens)
- Token usage tracking and cost estimation
- Export/import conversations
- Message threading
- Streaming responses
- Conversation archiving
- Conversation search
- Password change in-app
- Account deletion in-app
- Keyboard shortcuts
- Dark/light mode toggle (dark mode only)
- Language selection (English only)
- Real-time collaboration

**Technical:**

- Message pagination/lazy loading
- Smart participant sorting
- Live relative time updates
- Offline detection and handling
- Rate limiting on application side
- Soft delete for participants
- Context limit monitoring
- Advanced error recovery with retry logic
- Multi-tab synchronization

## Project Context

The application was built from written documents, not the other way round. They live in [`context/`](context/README.md):

- `context/foundation/` — the MVP definition, the PRD, the tech stack, the database plan, the REST API plan, the
  authentication spec, the UI plan, the test plans (`test-plan.md`: risks, rollout, quality gates and the
  risk → test index; `ap8-test-plan-pl.md`: the detailed plan) and the hosting analysis
- `context/archive/` — the implementation plans that were executed for every endpoint, the OpenRouter service and
  every view, kept as a record of the reasoning at the time

The foundation documents are in Polish (the course language); `context/README.md` maps them to the `context/`
vocabulary and explains the deviation from the English-only rule of this repository.

## Project Status

🟢 **MVP live at [mindagora.ai](https://mindagora.ai)**

The MVP scope above is implemented, tested (unit, integration smoke, E2E) and deployed; see
[Deployment & Releases](#deployment--releases) and [Project Context](#project-context). MindAgora is a course project (10xDevs) that keeps evolving as a
portfolio piece.

### Success Metrics

The MVP will be considered successful when:

1. **Multi-model usage**: 50% of conversations use 3+ different models
2. **Context persistence**: Users can return to conversations after a week and continue without context loss
3. **Intuitive UX**: Users can naturally switch between models without thinking about technical details

### Contributing

MindAgora is a one-maintainer course project. Issues and suggestions are welcome; contribution guidelines will follow if the project grows beyond that.

## License

MIT

---

**Need Help?**

For questions, issues, or feature requests, please open an issue on GitHub.
