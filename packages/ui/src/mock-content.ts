// Static sample content for the Reasoning and Artifacts tabs, ported from the
// design reference. The mock orchestrator doesn't produce reasoning traces or
// artifacts yet — these keep the panels visually complete until it does.

export const REASONING: Record<string, string[]> = {
  design: [
    "Requirements call for Google + GitHub OAuth2 with CSRF protection (state param). Choosing PKCE authorization code flow — correct for a server-rendered app.",
    "No auth layer in codebase. User model has email/name but missing externalId and provider fields. Noting as migration requirement.",
    "Session strategy: stateless JWT rather than server-side sessions. Satisfies the stateless NFR and horizontal-scaling requirement.",
    "API surface: /auth/{provider} (initiate), /auth/{provider}/callback, /auth/me, /auth/logout.",
  ],
  requirements: [
    "Parsing task. 'OAuth2 login flow' with Google and GitHub. Checking for existing auth primitives — none found.",
    "User model exists (email, name) but missing externalId and provider. Must call this out as a migration need.",
    "Drafting FR-01 through FR-04. CSRF state parameter (FR-03) is the key safety requirement here.",
    "Propagating project README constraint: 'zero third-party analytics'. OAuth providers OK; tracking pixels are not.",
  ],
  implementation: [
    "Reading architecture doc. PKCE flow, TypeScript strict, Passport.js strategies. Installing passport + passport-google-oauth20.",
    "Writing oauth.ts. Google strategy callback receives (accessToken, refreshToken, profile, done). Upserting user by email.",
    "TypeScript error at line 47: req.session.userId — express-session SessionData doesn't include userId. Need to extend the namespace.",
    "Attempting fix via session.d.ts declaration. Build still fails — Prisma upsert return type mismatch. Need to check the schema.",
  ],
};

export const ARTIFACTS: Record<string, Array<{ name: string; size: string; preview: string }>> = {
  requirements: [
    { name: "requirements.md", size: "3.2 KB",
      preview: "# Requirements: OAuth2 Login Flow\n\n## Summary\nAdd OAuth2 authentication with Google and GitHub.\n\n## Functional Requirements\n- **FR-01** Sign in with Google OAuth2\n- **FR-02** Sign in with GitHub OAuth2\n- **FR-03** State param validated to prevent CSRF\n- **FR-04** Sessions expire after 24 hours\n\n## Non-functional\n- Token validation < 200ms\n- Zero third-party analytics" },
    { name: "acceptance-criteria.md", size: "1.1 KB",
      preview: "# Acceptance Criteria\n\n- [ ] Google SSO button on /login\n- [ ] GitHub SSO button on /login\n- [ ] Success → redirect to /dashboard\n- [ ] Failed auth → error toast\n- [ ] Expired session → redirect to /login" },
  ],
  design: [
    { name: "architecture.md", size: "4.8 KB",
      preview: "# System Architecture: OAuth2 Flow\n\n## Overview\nStateless OAuth2 with PKCE authorization code flow.\n\n## Components\n**AuthController** — /auth/{provider} routes, generates state token in Redis (10m TTL).\n\n**TokenService** — validates callback, exchanges code, issues session JWT.\n\n**SessionMiddleware** — validates JWT on protected routes, refreshes within 5m of expiry." },
    { name: "api-spec.yaml", size: "2.1 KB",
      preview: "openapi: 3.0.0\npaths:\n  /auth/{provider}:\n    get:\n      summary: Initiate OAuth flow\n  /auth/{provider}/callback:\n    get:\n      summary: Handle OAuth callback\n  /auth/me:\n    get:\n      summary: Get current session\n  /auth/logout:\n    post:\n      summary: Invalidate session" },
  ],
  implementation: [
    { name: "src/auth/oauth.ts", size: "2.8 KB", preview: "// ✗ Build error at line 47\n// req.session.userId — type not declared\n// Fix: extend express-session SessionData\n// interface SessionData { userId: string; }" },
    { name: "src/auth/session.ts", size: "0.4 KB", preview: "// Partial — blocked by TypeScript error" },
  ],
};
