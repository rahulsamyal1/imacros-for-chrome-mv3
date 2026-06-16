# iMacros for Chrome — Manifest V3 rebuild

Browser automation for Chrome: record and replay repetitive tasks, fill forms,
extract data, and script the browser with the iMacros `.iim` macro language.

This repository is a **Manifest V3 modernization** of the classic *iMacros for
Chrome* extension (last shipped as Manifest V2 in 2014). It was updated to load
and run on current versions of Chrome — which no longer support MV2 — and the
legacy security issues were fixed.

> **Rebuilt for Manifest V3 by Rahul Simi (2026).**
>
> **Original extension © iOpus Software GmbH.** The iMacros macro engine,
> recorder, player, panel UI and sample macros are their work. This project only
> modernizes that code to MV3 and hardens it; it is not the official iMacros
> product and is not affiliated with or endorsed by iMacros / iOpus.

## What this rebuild changes

- Manifest **V2 → V3**: background page → service worker; the eval sandbox moved
  to an offscreen document; `window.open` dialogs → `chrome.windows.create` +
  message handshake; `localStorage` → `chrome.storage`; all removed Chrome APIs
  migrated.
- **UI**: the panel is now injected as a draggable **in-page overlay** (Shadow
  DOM + iframe) in the active tab, instead of opening a separate popup window.
- **Theme**: a modern dark *amber-on-espresso* look applied across the panel,
  dialogs, tree views and settings, driven by the design tokens in `design/`
  (`skin/design-system.css`).
- **Crypto**: the custom Rijndael cipher (unsalted key, weak IV, no
  authentication) was replaced with **WebCrypto AES-256-GCM + PBKDF2**.
- **Security hardening**: page-triggered macros now always require confirmation;
  path-traversal is rejected; untrusted strings use `textContent` (no DOM XSS);
  the eval sandbox validates message origins.
- Full detail, verification notes, and **known limitations** are in
  **[STATUS.md](STATUS.md)**. The internal messaging architecture is documented
  in **[CONTRACT.md](CONTRACT.md)**.

## Install (developer mode)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open any normal `http(s)`/`file` page and click the iMacros toolbar icon —
   the panel appears as a **draggable in-page overlay** docked top-right (not a
   separate window). Click the icon again to close it.

> The panel is injected into the page, so it can't appear on restricted pages
> (`chrome://`, the Web Store, etc.). On tabs that were already open when you
> installed/updated the extension, reload the page once so macro playback can
> attach to it.

> File access, screenshots, and the Scripting Interface rely on iMacros'
> **native-messaging host apps**, which are installed separately and are **not**
> part of this repository. Without them, bookmark-stored macros, playback,
> recording and EVAL still work, but file-based macros and capture do not.

## Status & limitations

This is a best-effort modernization that has been statically verified but not
fully exercised in a live browser. Some areas — full macro playback,
service-worker lifetime during long macros, the bundled editor under MV3 CSP,
and native file I/O — still need validation. **Read [STATUS.md](STATUS.md)
before relying on it.**

## Credits

- **iMacros engine, recorder, player, UI, sample macros** — © iOpus Software
  GmbH (*iMacros for Chrome*). <https://www.imacros.net>
- **Manifest V3 rebuild, security fixes & UI theme** — Rahul Simi, 2026.
- **Visual design** — the *RahulGPT* amber-on-espresso design system (see
  `design/`), applied across the extension UI.
- Bundled third-party components keep their own licenses (e.g. the **EditArea**
  code editor under `editor/editarea/`, and `mktree.js`).

## Attribution & licensing notice

The original *iMacros for Chrome* is the intellectual property of its original
authors (iOpus Software GmbH / iMacros). **Before publishing or distributing
this repository, confirm that you have the right to redistribute the original
code** (an applicable open-source license, or permission from the rights
holder). This MV3 rebuild is provided for modernization and educational
purposes and grants no rights to the original software. All original copyright
notices have been kept in the source files.
