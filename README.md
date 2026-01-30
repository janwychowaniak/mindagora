# MindAgora

A web application for conducting conversations with multiple AI models simultaneously in a unified chat interface.

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Project Scope](#project-scope)
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
- **GitHub Actions** - CI/CD pipelines
- **DigitalOcean** - Application hosting via Docker

### Testing
- **Vitest** - Unit testing framework
- **React Testing Library** - React component testing
- **Playwright** - End-to-end testing
- **Codecov** - Code coverage tracking

## Getting Started Locally

### Prerequisites

- **Node.js**: Version 22.14.0 (specified in `.nvmrc`)
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
   - Create a [Supabase](https://supabase.com/) account and project
   - Set up the required database tables (schema documentation coming soon)
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
     # Supabase
     PUBLIC_SUPABASE_URL=your_supabase_project_url
     PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

     # OpenRouter (optional headers for request attribution)
     OPENROUTER_HTTP_REFERER=http://localhost:4321
     OPENROUTER_X_TITLE=MindAgora
     ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

7. **Open your browser**
   - Navigate to `http://localhost:3000` (default Astro port)

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
- `npm run format` - Format code with Prettier

## Project Scope

### MVP Features (In Development)

#### Authentication & User Management
- User registration with email verification (disabled in local dev, enabled in production)
- Login/logout functionality
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

## Project Status

🚧 **MVP in Development**

MindAgora is currently in active development for the MVP release. Core features are being implemented according to the product requirements document.

### Success Metrics

The MVP will be considered successful when:

1. **Multi-model usage**: 50% of conversations use 3+ different models
2. **Context persistence**: Users can return to conversations after a week and continue without context loss
3. **Intuitive UX**: Users can naturally switch between models without thinking about technical details

### Contributing

This project is currently in early development. Contribution guidelines will be added in future releases.

## License

MIT

---

**Need Help?**

For questions, issues, or feature requests, please open an issue on GitHub.

