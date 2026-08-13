# Showing a running product inside Isotopy

Research done 2026-08-11 for `TASK-138`, because Isotopy had no embedding precedent
of any kind — no iframe anywhere in the repo, no Electron or Tauri shell — and
dev servers commonly refuse to be framed. This records what the established
harnesses actually do, so the choice is not re-litigated from first principles
the next time someone opens `PreviewPanel.tsx`.

## What the harnesses do

| Harness | Showing a human | Letting an agent drive |
| --- | --- | --- |
| [VS Code Simple Browser](https://github.com/microsoft/vscode/tree/main/extensions/simple-browser) | `<iframe>` inside a webview. No proxy. | — |
| [Cursor Preview / Browser](https://cursor.com/docs/agent/tools/browser) | iframe in an editor tab | **CDP** — an embedded Chromium; "select element" forwards DOM information to the agent |
| Codex | — | **CDP**, since June 2026 |
| Claude Code | its own browser pane | CDP |

Two findings, and both shaped the design.

**Nobody proxies to defeat `X-Frame-Options`.** VS Code's own guidance is that
there is no reliable client-side workaround, and names a header-stripping proxy
as the only escape — which none of them ships. It works anyway, because a
localhost dev server does not set `X-Frame-Options` or a `frame-ancestors`
policy by default. Framing is the common case; a refusal is the exception, and
what matters is that the exception is *legible* rather than a blank rectangle.

**Nobody drives the product through the iframe.** A cross-origin iframe hands
back no DOM, no console and no network. Every harness that lets an agent look at
a page drives a real browser over the Chrome DevTools Protocol, separately from
whatever the human is looking at.

## What Isotopy builds

The task's premise was that *"showing the user and letting an agent look are the
same seam."* That is true of the **process and its URL**, and false of the
rendering surface. So: one process, one URL, two consumers.

- **The human** gets an `<iframe>` in the `Preview` tab. On reaching ready, the
  server makes one request to the health URL and reads `X-Frame-Options` and any
  CSP `frame-ancestors` directive (`domain/rules/product-preview.ts`). A refusal
  is reported with the exact header that caused it, beside an "Open in browser"
  link — never an empty frame.
- **The agent** gets the URL and an idempotent start endpoint, injected into the
  QA stage prompt as an `## Environment` section, and drives it with whatever
  browser capability its CLI has. Where it has none, Playwright is the complete
  fallback and stays the authority for anything that must hold in CI — which is
  the whole of `TASK-095` that survived.

Isotopy hosting its own Playwright Chromium and streaming screenshots to the UI
would have made one mechanism serve both, and was rejected: it makes
`playwright` a server runtime dependency plus a browser download on install, and
Milestone F's rule is to stop adding.

## The limitation worth knowing

`framingVerdict` treats any `frame-ancestors` that is not `*` as a refusal,
because the server cannot know which origin the user's browser is serving Isotopy
from. A dev server that explicitly allows `http://localhost:5173` is therefore
reported as refusing when it would in fact have framed. The failure is visible
and recoverable — the card names the directive and offers the external link — so
this is a deliberate trade against carrying the UI's origin through the API for
a case no dev server has yet been observed to hit.
