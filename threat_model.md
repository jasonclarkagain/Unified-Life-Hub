# Threat Model

## Project Overview

AETHER-OS is a React + Express application that exposes a unified dashboard over multiple third-party accounts and services. The production application consists of the `artifacts/aether-os` frontend and the `artifacts/api-server` backend; the backend uses Replit Connectors to access GitHub, GitLab, Gmail, Outlook, HubSpot, Spotify, Google Drive, and OneDrive, plus Gemini for AI workflows and PostgreSQL for workflow history.

Production assumptions for this scan:
- `NODE_ENV` is `production` in deployments.
- The mockup sandbox is not deployed to production and is out of scope unless a production reachability path is found.
- TLS is platform-managed and not a primary analysis target here.

## Assets

- **Connected third-party account data** — repository metadata, PRs, issues, emails, calendar events, CRM deals, storage metadata, playlists, and similar information retrieved through Replit Connectors. Exposure would leak sensitive operational and personal data from linked accounts.
- **Connected third-party account capabilities** — the ability to create GitHub repositories, commit files, upload to cloud storage, control Spotify playback, and send Twilio SMS. Abuse would let attackers perform actions on behalf of the deployment owner or workspace user.
- **Application secrets and integration credentials** — database credentials and provider credentials sourced from environment variables and connector context. Compromise would enable persistent account abuse or data exfiltration.
- **Workflow history stored in PostgreSQL** — recorded workflow runs, deal identifiers, repository URLs, and action traces. Exposure reveals internal business activity and may assist follow-on attacks.
- **AI prompts and outputs** — prompt content includes user-supplied or integration-sourced operational data and can influence generated artifacts or recommendations.

## Trust Boundaries

- **Browser to API** — all `/api` requests originate from an untrusted client. The server must authenticate and authorize every sensitive read or write endpoint.
- **API to Replit Connectors / third-party APIs** — the backend can act against GitHub, GitLab, Gmail, Outlook, HubSpot, Spotify, Google Drive, and OneDrive using linked identity context. Any missing authorization on API routes becomes third-party account abuse.
- **API to Gemini** — the backend sends user-controlled and integration-derived content to the AI provider. Prompt content and outputs must not create unsafe follow-on actions.
- **API to arbitrary outbound URLs** — routes that `fetch()` caller-supplied URLs cross from untrusted input to server-side network access and must prevent SSRF against internal or private destinations.
- **API to PostgreSQL** — the backend persists workflow runs and must ensure attackers cannot read or write stored records outside intended flows.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox` is treated as development-only and should usually be ignored during production scans unless evidence shows it is deployed or reachable.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/aether-os/src/main.tsx`.
- Highest-risk code areas: `artifacts/api-server/src/routes/devops.ts`, `focus-feed.ts`, `storage.ts`, `environment.ts`, `workflow.ts`, and `ai.ts`.
- Public surface: all Express routes under `/api` appear mounted without auth middleware.
- Authenticated/admin surface: none currently implemented at the application layer.
- Dev-only area: `artifacts/mockup-sandbox`.

## Threat Categories

### Spoofing

This project does not implement its own application authentication boundary today, yet it exposes sensitive and state-changing API routes. The required guarantee is that every endpoint capable of reading integration-backed data or triggering third-party side effects MUST require a valid authenticated caller identity and MUST bind actions to the intended user or role.

### Tampering

Several routes can trigger actions in external systems such as GitHub, Spotify, Google Drive, OneDrive, and Twilio. The required guarantee is that caller-supplied parameters MUST be validated and only authorized users MAY invoke third-party writes, uploads, notifications, or workflow triggers.

### Information Disclosure

The backend aggregates mailbox, calendar, CRM, storage, and repository data from linked accounts. The required guarantee is that integration-backed responses MUST be scoped to an authenticated and authorized user, and public callers MUST NOT be able to enumerate or retrieve sensitive operational or personal data through the API.

### Denial of Service

The API allows unauthenticated expensive operations including AI generation, connector fan-out, repository scaffolding, SMS delivery, and outbound health checks. The required guarantee is that costly routes MUST enforce authentication, request validation, and rate/abuse controls so attackers cannot consume paid APIs or overload the service.

### Elevation of Privilege

Because the backend can act with connector-backed privileges against third-party services, any missing authorization effectively elevates an anonymous network caller into the privileges of the connected account. The required guarantee is that the server MUST never proxy third-party capabilities to unauthenticated or unauthorized callers, and server-side fetches from user-controlled URLs MUST restrict internal/private network access to prevent SSRF-based privilege escalation.
