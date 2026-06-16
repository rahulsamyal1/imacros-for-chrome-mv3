# RahulGPT Design System

A warm "amber on espresso" dark theme: deep brown surfaces, gold gradient
actions, soft cream text. Copy `design-system.css` into a new extension and
use the tokens and `.ds-*` classes. Open `style-guide.html` to preview.

## Colour palette

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#14110d` | App / page background |
| `--bg-2` | `#1d1813` | Raised background, top gradient stop |
| `--surface` | `#241e17` | Inputs, chips, quiet panels |
| `--surface-2` | `#2c251c` | Hover / secondary surface |
| `--line` | `#3a3025` | Borders and dividers |
| `--ink` | `#f3ead9` | Primary text on dark |
| `--ink-soft` | `#b8aa92` | Secondary text |
| `--ink-faint` | `#80735f` | Muted hints, captions |
| `--ink-on-amber` | `#2a1c08` | Dark text on amber buttons |
| `--amber` | `#e8a33d` | Solid accent (active tab, focus ring) |
| `--amber-bright` | `#ffc25c` | Gradient light stop |
| `--amber-deep` | `#b9772a` | Gradient dark stop |
| `--good` | `#7fc99a` | Success |
| `--bad` | `#e0795f` | Error |

## Gradients

- **Buttons** `--grad-amber`: `linear-gradient(135deg, #ffc25c, #b9772a)`
- **Logo badge / dot** `--grad-mark`: `linear-gradient(150deg, #ffc25c, #b9772a)`
- **Cards / panels** `--grad-surface`: `linear-gradient(180deg, #1d1813, #14110d)`
- **Header glow** `--glow-amber`: `radial-gradient(140% 140% at 100% 0%, rgba(232,163,61,0.14), transparent 60%)`

## Typography

- **Wordmark / brand**: serif stack `"Palatino Linotype", "Iowan Old Style", Palatino, Georgia, serif`
- **Everything else**: `ui-sans-serif, -apple-system, "Segoe UI", Roboto, system-ui, sans-serif`
- Buttons are weight 700, panel titles 800, body 13 to 14px, captions 11 to 12px.

## Shape and depth

- Radii: `12px` (default), `14px` (cards), `999px` (pills)
- Card shadow: `0 12px 34px rgba(0,0,0,0.5)` plus a 1px inner top highlight
- Button shadow: `0 4px 14px rgba(232,163,61,0.40)` (the gold glow)
- Focus ring: `0 0 0 3px rgba(232,163,61,0.15)` with `--amber` border

## Components (classes in design-system.css)

- `.ds-mark` + `.ds-wordmark` and `.ds-dot` for branding
- `.ds-btn`, `.ds-btn.ghost`, `.ds-btn.cta`, `.ds-btn.is-ok`, `.ds-btn.is-err`
- `.ds-pill` floating launcher
- `.ds-card` with `.ds-card__head`, `.ds-card__title`, `.ds-card__body`, `.ds-iconbtn`
- `.ds-input`, `textarea.ds-input`, `.ds-label`
- `.ds-tabs` + `.ds-tab` / `.ds-tab.active`
- `.ds-checkbox`
- `.ds-status` (`.ok` / `.err`) + `.ds-spinner`

## Icon set

The UI uses emoji as button glyphs (no icon font needed), plus one inline SVG
gear and a couple of brand glyphs.

- **Brand glyph**: `✦`  | **Star**: `★`  | **Check**: `✓`
- **Action buttons**: ✨ Standout, 🎁 Sample, ⭐ Trust, 💰 Value, ❓ Clarify,
  ⚡ Urgent, 💎 Premium, ✂️ Short, 🖼️ Recent work, 🟢 Available, 🔔 Follow-up,
  🤝 Assigned, 💸 Request pay, 🙏 Get review
- **Inline list / deliverable emojis**: 🌐 🖥️ 📄 📝 🔗 📱 🧹 🌿 🔧 🪛 📦 🚚 🎨 🛒 ⚙️

### Gear (settings) SVG

```html
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6">
  <circle cx="12" cy="12" r="3.2"/>
  <path d="M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>
```

## Usage notes

- **Popup width** in the original is `384px`; the floating on-page panel is
  about `300px` (`min(300px, calc(100vw - 24px))` so it stays mobile-safe).
- For an **on-page panel** in a content script, render it inside a Shadow DOM
  so the host site's CSS cannot touch it, and put `:host { all: initial; }` at
  the top of the shadow stylesheet. Use a very high `z-index` (2147483647).
- Buttons always use dark text (`--ink-on-amber`) on the gold gradient for
  contrast; ghost buttons use cream text on a `--line` border.
- Keep the accent to amber only. Greens and reds are reserved for success and
  error states, never decoration.
