---
name: Telas live preview must stay stateless
description: Why the tela preview renders via stateless POST + iframe srcdoc instead of a server-side singleton
---

The tela live preview renders by POSTing the current tela state to `/api/telas/render`,
which returns HTML that the client injects via `iframe.srcdoc`. The client also keeps a
`previewSeq` token and discards out-of-order responses.

**Why:** The earlier design stored the preview in a process-global `let lastTela` (POST
`/telas/state` then GET `/telas/preview`). With this single shared app password, every
logged-in user/tab shares the same session-less global, so one user's tela could leak into
another's preview, and fast edits raced (an older async response could overwrite newer
state). Making preview stateless removes both the cross-session leak and the race without
bloating the session store with multi-MB base64 product/background images.

**How to apply:** Never reintroduce a module-level mutable "current preview" cache for
telas. Keep preview rendering pure (state in → HTML out). If you add similar live-preview
features, prefer stateless render + srcdoc + a client sequence guard over server singletons.
