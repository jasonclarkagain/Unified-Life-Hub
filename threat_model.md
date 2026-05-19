# Threat Model

## Project Overview

AETHER-OS is a React + Express application that exposes a unified dashboard over multiple third-party accounts and services. The production application consists of the `artifacts/aether-os` frontend and the `artifacts/api-server` backend; the backend uses Replit Connectors to access GitHub, GitLab, Gmail, Outlook, HubSpot, Spotify, Google Drive, and OneDrive, plus Gemini for AI workflows and PostgreSQL for workflow history.

Production assumptions for this scan:
- `NODE_ENV` is `production` in deployments.
- The current deployment is `private`, so Replit infrastructure is assumed to block access from the public internet. Findings should still consider anyone who can reach the private deployment.
- The mockup sandbox is not deployed to production and is out of scope unless a production reachability path is found.
- TLS is platform-managed and not a primary analysis target here.

## Assets

- **Connected third-party account data** — repository metadata, PRs, issues, emails, calendar events, CRM deals, storage metadata, playlists, and similar information retrieved through Replit Connectors. Exposure would leak sensitive operational and personal data from linked accounts.
- **Connected third-party account capabilities** — the ability to create GitHub repositories, commit files, upload to cloud storage, control Spotify playback, and send Twilio SMS. Abuse would let attackers perform actions on behalf of the deployment owner or workspace user.
- **Application secrets and integration credentials** — database credentials and provider credentials sourced from environment variables and connector context. Compromise would enable persistent account abuse or data exfiltration.
- **Workflow history stored in PostgreSQL** — recorded workflow runs, deal identifiers, repository URLs, and action traces. Exposure reveals internal business activity and may assist follow-on attacks.
- **AI prompts and outputs** — prompt content includes user-supplied or integration-sourced operational data and can influence generated artifacts or recommendations.
- **Session secret and shared dashboard password** — `SESSION_SECRET` protects session integrity and `API_SECRET_KEY` gates dashboard access. Compromise of either lets an attacker reach privileged connector-backed routes.

## Trust Boundaries

- **Browser to API** — all `/api` requests originate from an untrusted client. The server must authenticate and authorize every sensitive read or write endpoint.
- **Login boundary to privileged connector context** — the app currently authenticates users with a single shared password and then exposes the full connector context behind that session. This boundary must prevent one shared secret from becoming deployment-wide account takeover.
- **API to Replit Connectors / third-party APIs** — the backend can act against GitHub, GitLab, Gmail, Outlook, HubSpot, Spotify, Google Drive, and OneDrive using linked identity context. Any missing authorization on API routes becomes third-party account abuse.
- **API to Gemini** — the backend sends user-controlled and integration-derived content to the AI provider. Prompt content and outputs must not create unsafe follow-on actions.
- **API to arbitrary outbound URLs** — routes that `fetch()` caller-supplied URLs cross from untrusted input to server-side network access and must prevent SSRF against internal or private destinations for the real connection attempt, not just the original URL string.
- **API to PostgreSQL** — the backend persists workflow runs and must ensure attackers cannot read or write stored records outside intended flows.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox` is treated as development-only and should usually be ignored during production scans unless evidence shows it is deployed or reachable.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/aether-os/src/main.tsx`.
- Highest-risk code areas: `artifacts/api-server/src/middleware/auth.ts`, `artifacts/api-server/src/routes/devops.ts`, `environment.ts`, `workflow.ts`, `focus-feed.ts`, and `storage.ts`.
- Public surface: `/api/auth/login`, `/api/auth/logout`, and `/api/healthz`.
- Authenticated surface: all other `/api` routes are behind `requireSession`, but the session is only backed by a shared password and has no user or role binding.
- Dev-only area: `artifacts/mockup-sandbox`.

## Threat Categories

### Spoofing

The production API now has an application-layer session gate, but it authenticates users with a single deployment-wide shared password and records only `session.authenticated = true`. The required guarantee is that privileged API access MUST be bound to a real caller identity or tightly scoped operator role, so that possession of one shared secret does not let any reachable user impersonate the full deployment owner across all connected services.

### Tampering

Several routes can trigger actions in external systems such as GitHub, Spotify, Google Drive, OneDrive, and Twilio. The required guarantee is that caller-supplied parameters MUST be validated and only authorized users MAY invoke third-party writes, uploads, notifications, or workflow triggers; high-cost actions also need route-specific abuse controls, not just the coarse shared session gate.

### Information Disclosure

The backend aggregates mailbox, calendar, CRM, storage, and repository data from linked accounts. The required guarantee is that integration-backed responses MUST be scoped to the intended authenticated actor, and a shared dashboard session MUST NOT become a blanket read token for all sensitive third-party data visible to the connector context.

### Denial of Service

The private deployment setting reduces anonymous internet abuse, but authenticated callers can still trigger expensive operations including AI generation, connector fan-out, repository scaffolding, SMS delivery, and outbound health checks. The required guarantee is that costly routes MUST enforce request validation and abuse throttling so a reachable insider or compromised session cannot consume paid APIs or overwhelm the service.

### Elevation of Privilege

Because the backend can act with connector-backed privileges against third-party services, any weakness in the shared-password boundary effectively elevates a caller into the privileges of the connected account owner. The required guarantee is that the server MUST never proxy third-party capabilities to a caller based only on possession of one shared secret, and server-side fetches from user-controlled URLs MUST restrict redirects, rebinding, and other paths to internal/private network access.
