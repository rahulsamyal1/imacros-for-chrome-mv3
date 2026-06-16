# iMacros MV3 — internal messaging contract

_MV3 rebuild by Rahul Simi (2026); original iMacros © iOpus Software GmbH._

This file documents how the pieces of the MV3 port talk to each other, so page
scripts can be ported consistently. (Reference, not shipped behavior.)

## Contexts

- **Service worker** (`bg.js` + everything it `importScripts`): owns the macro
  engine (`context[winId].mplayer` / `.recorder`), all `chrome.*` privileged
  APIs, crypto (`Rijndael`), native messaging (`afio`, `nm_connector`), and the
  dialog/offscreen orchestration. No DOM, no `window`, no `localStorage`,
  no `window.open`, no `getBackgroundPage`.
- **Pages** (`panel`, `options`, `fileView`, `folderView`, `treeView`,
  `macroView`, `browse`, and the dialogs): normal extension pages with a DOM.
  They load `utils.js` (giving them `$`, `Storage`, `link`, `swSend`,
  `getDialogArgs`, `sendDialogResult`, `resizeToContent`).
- **Offscreen document** (`offscreen.html` + `offscreen.js`): hosts the
  sandboxed `<iframe>` (`sandbox.html`) used to run macro `EVAL()`.

## Page → service worker

Use `swSend(cmd, extra, callback)` (defined in `utils.js`). It posts
`{topic:"sw", cmd, ...extra}`. Supported `cmd`s (see `handleSwCommand` in
`bg.js`): `play`, `pause`, `unpause`, `stop`, `record`, `stopRecord`, `saveAs`,
`capture`, `edit`, `save`, `addTab`, `openSettings`, `getState`, `link`,
`askMasterPassword`. Most carry `win_id`. `play`/`edit`/`save` carry a `macro`
or `save_data` object.

**Never** use `chrome.extension.getBackgroundPage()` or reach into
`bg.context[...]` — that object graph does not exist in MV3.

## Service worker → panel

The worker calls `context[winId].panelWindow.<method>(...)`, a proxy that posts
`{topic:"panel", win_id, cmd, args}`. The panel page registers a
`chrome.runtime.onMessage` listener that dispatches `cmd` to its local function
(`updatePanel`, `showLines`, `addLine`, `highlightLine`, `setStatLine`,
`removeLastLine`, `setLoopValue`, `showMacroTree`, `showInfo`, `refreshTree`).
Messages are filtered by `win_id`.

## Dialogs opened BY the service worker (engine dialogs)

`passwordDialog` (master key), `beforePlay`, `extractDialog`, `loginDialog`,
`editor`. The worker `openDialog(page, payload, winOpts, onResult)`:
- stashes `payload` in `chrome.storage.session` under `dialog:<reqId>`,
- opens the page as a popup with `?reqId=<reqId>`.

The dialog page:
- reads its args with `getDialogArgs(function(args, reqId){...})`,
- returns its result with `sendDialogResult(reqId, payload)` and `window.close()`.

The worker's `onResult(payload)` resumes the correct player/recorder.

## Dialogs opened BY a page (settings dialogs) — page-to-page

`AlertFoxLoginDialog` (opened from panel/options), `browse` (from options),
`saveAsDialog` (from editor). These remain `window.open(...)` + `win.args = {}`
+ `window.opener.<fn>()` because both ends are PAGES (same origin, live window
references work). They must still avoid `getBackgroundPage`; use `swSend` for
anything the worker must do (e.g. `save`).

## Storage

`Storage` (in `utils.js`) is a synchronous-looking cache over
`chrome.storage.local`, shared by the worker and all pages and kept coherent via
`chrome.storage.onChanged`. Call `await Storage.ready()` (or `.then`) before
reading right after a cold start if a stale default would be wrong.

## Security rules

- Page-triggered macros (`iMacrosRunMacro`) ALWAYS go through the `beforePlay`
  confirmation in the worker — never run silently.
- Untrusted strings (file names, folder names, bookmark titles, macro names,
  auth realms) go into the DOM via `textContent`, never `innerHTML`.
- File paths go through `afio.append()`, which rejects `..` traversal.
- Crypto is WebCrypto AES-256-GCM + PBKDF2 (`rijndael.js`), async.
