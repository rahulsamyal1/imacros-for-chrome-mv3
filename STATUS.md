# iMacros for Chrome — MV3 port & security-fix status

_Rebuilt for Manifest V3 by Rahul Simi (2026). Original extension © iOpus
Software GmbH — see [README.md](README.md) for credits._

This extension was migrated from **Manifest V2 (2014, dead in current Chrome)**
to **Manifest V3**, and the security issues from the audit were fixed.

The original code is preserved at `P:\Clients\Imacros_mv2_backup`.

---

## How to load and test

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select `P:\Clients\Imacros`.
2. The service worker ("Inspect views: service worker") should start with no
   errors. Click the toolbar icon to open the panel.

> **Native features need the host apps.** File I/O, screen capture (`SAVEAS`),
> and the Scripting Interface talk to native-messaging hosts
> (`com.iopus.imacros.fio`, `com.iopus.imacros.host`) that are installed
> *separately* and are **not** part of this folder. The extension `key` was
> kept so the existing hosts still recognise the extension ID. Without those
> hosts installed, file-based macros/capture won't work, but bookmark-stored
> macros, playback, recording, EVAL, etc. do not need them.

---

## What changed (high level)

**Architecture**
- Background *page* → **service worker** (`bg.js`, classic worker using
  `importScripts`). `bg.html` deleted.
- The eval sandbox `<iframe>` moved into an **offscreen document**
  (`offscreen.html`/`offscreen.js`); the worker relays EVAL over messages.
- All `window.open` + `win.args` engine dialogs → `chrome.windows.create`
  popups + a `chrome.storage.session` request-id handshake (`CONTRACT.md`).
- The panel is now an **in-page overlay** injected into the active tab
  (`content_scripts/panel_host.js`: Shadow DOM host + an iframe of `panel.html`,
  injected on demand via `chrome.scripting` and toggled by the toolbar icon),
  instead of a separate popup window.
- `chrome.extension.getBackgroundPage()` / `bg.context[...]` live references →
  `chrome.runtime` messaging (`swSend`, panel proxy).
- Synchronous `localStorage` `Storage` → cached facade over
  `chrome.storage.local`.
- Removed APIs migrated: `chrome.extension.onRequest/sendRequest/getURL`,
  `chrome.tabs.sendRequest/getAllInWindow`, `browser_action`.
- `webRequest` blocking `onAuthRequired` → `asyncBlocking` +
  `webRequestAuthProvider`.
- Dead NPAPI `npimr.dll` removed.

**Security fixes (from the audit)**
- **Crypto**: custom Rijndael-256/CBC (unsalted SHA-256 key, `Math.random` IV,
  no MAC) → **WebCrypto AES-256-GCM + PBKDF2(200k)**, random IV, authenticated
  (`rijndael.js`).
- **Page-triggered macro execution** (`iMacrosRunMacro`) now **always** requires
  an explicit confirmation dialog before running — no silent execution.
- **Path traversal**: `afio.append()` rejects `..` in every segment (replaced
  the broken `replace("..","_")`).
- **Sandbox eval**: validates `event.source`; replies only to the embedder.
- **DOM XSS**: untrusted file/folder names, bookmark titles, macro names, and
  auth realms now use `textContent`, not `innerHTML`.
- Fixed `onAuthRequired` cancel-all behavior, the notification-listener leak,
  `captureVisibleTab(undefined)`, `RegExp.$1` fragility, `legnth`/`undefinded`
  typos, implicit globals, `.toSource()`, and the `unregisterHandler` bug.

---

## Confidence / what still needs YOUR Chrome to validate

I cannot run Chrome or the native hosts here, so the following are
**structurally complete and syntax-clean but not runtime-verified**:

- **End-to-end macro playback / recording.** The engine, messaging, dialogs and
  offscreen eval are wired per design but have not been exercised live.
- **Service-worker lifetime.** MV3 kills idle workers (~30 s). Long waits
  (page loads, native round-trips, an open password dialog, IMAGESEARCH loops)
  may outlive the worker. In-memory player state is **not** persisted across a
  worker restart, so a macro interrupted by worker death will not resume. This
  is the biggest real-world risk and needs testing; if it bites, the fix is to
  persist per-window player state into `chrome.storage.session`.
- **Native messaging hosts** — see above; protocol/file ops unverified here.
- **`onAuthRequired` blocking (ONLOGIN)** works via `webRequestAuthProvider`
  but, for **Web-Store-distributed** extensions, blocking auth is only allowed
  for force-installed/enterprise-policy installs. For unpacked/dev use it works.
- **Crypto format is not backward compatible.** Passwords encrypted by the old
  Rijndael cannot be decrypted by AES-GCM; `decryptString` throws a clear
  "re-create with this version" error for legacy blobs. Re-record any stored
  website passwords.
- **The bundled EditArea editor** (`editor/editarea/**`, third-party) uses inline
  `onclick=` handlers and `document.write`, which the MV3 page CSP
  (`script-src 'self'`) blocks. Editing macros may be partly broken until
  EditArea is replaced or patched (it was not modified in this pass).
- **`_metadata/verified_contents.json`** is the old Web-Store signature; it is
  ignored when loading unpacked. Delete it before repackaging for the store.

## Known functional gaps (not crashes)

- **`SET !CLIPBOARD` / `{{!CLIPBOARD}}` do nothing.** Clipboard relied on
  `document.execCommand`, which the service worker lacks; these are now silent
  no-ops. Macros that depend on the clipboard need a future offscreen-clipboard
  bridge.
- **The bundled EditArea editor** may not work under MV3 CSP (see above).

## Verification performed (no live Chrome available)

- `node --check` on every JS file.
- A harness that loads all service-worker scripts into one shared global scope
  (simulating `importScripts`) — **no top-level errors / no identifier
  collisions** (this caught and fixed a real `im_strre` redeclaration that would
  have bricked the worker).
- A functional WebCrypto test of `rijndael.js`: encrypt→decrypt round-trip,
  wrong-password rejection (authenticated), legacy-blob rejection, random IV.
- A multi-agent adversarial review of the whole port; its confirmed findings
  (profiler DOM usage, a `getDefaultDir` misuse, recorder encryption-label
  ordering, and several low-severity items) were fixed.

## Residual items intentionally left

- "Stored master password" mode still persists the key (base64) — that mode is,
  by design, a convenience/security trade-off, and extensions have no OS
  keystore. The strong default is the cipher itself + the tmpkey (not stored)
  mode. AlertFox "save credentials" likewise persists the password by user opt-in.
- Panel docking (an old `setInterval`) was dropped (unreliable in a worker).
