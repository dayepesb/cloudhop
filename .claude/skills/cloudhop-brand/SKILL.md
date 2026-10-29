---
name: cloudhop-brand
description: The cloudhop visual identity and voice - "sky and coral" palette with exact tokens for light and dark mode, logo and wordmark rules, terminal colors, typography and copy tone. Use whenever you design, style or write anything for cloudhop - the web UI, the docs site, the CLI output, the README, social images, slides or new screens - or when choosing colors, so it stays consistent.
---

# cloudhop brand

Personality: a calm, precise tool that makes a small, satisfying jump. Navy
and sky for the cloud, one warm coral for the hop. Never the generic
slate-and-green "developer tool" look.

## Palette "sky and coral"

Every color below passes WCAG AA (4.5:1) for the pairing shown.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg` | `#0b1124` | `#f6f8fc` | Page background |
| `surface` | `#141c33` | `#ffffff` | Cards, panels, dialogs |
| `surface-2` | `#1b2540` | `#eef2f9` | Hover, secondary fills |
| `border` | `#2a3555` | `#dde3ef` | Hairlines |
| `text` | `#e8ecf7` | `#0f1730` | Body text |
| `muted` | `#9aa6c3` | `#55617d` | Secondary text |
| `accent` (sky) | `#3bb8f5` | `#1767c2` | Links, focus rings, selection, the "cloud" side |
| `accent-strong` | `#7fd0fa` | `#0f4e99` | Accent hover |
| `accent-soft` | `#12304f` | `#dcebfb` | Selected backgrounds, info tints |
| `cta` (coral) | `#ff7a59` | `#c2410c` | The single main action of a view, the "hop" |
| `cta-strong` | `#ff9478` | `#9a3412` | CTA hover |
| `on-cta` | `#2a0e05` | `#ffffff` | Text on `cta` |
| `ok` | `#4cd19a` | `#1a7f52` | Valid session, success |
| `warn` | `#f5b84b` | `#8a5a00` | Renewable session, warnings |
| `bad` | `#fb7185` | `#be123c` | Expired session, errors, destructive actions |
| `on-bad` | `#2b0509` | `#ffffff` | Text on `bad` |

Rules:

- **One coral thing per view.** Coral is for the primary action ("Add source",
  "Create aliases", "Get started"). Everything else interactive is sky/blue
  or neutral.
- **Coral is never an error.** Errors and destructive actions use `bad`
  (rose), which is deliberately pinker than coral.
- Status always pairs color with an icon or word (`● valid`, `○ expired`),
  never color alone.
- No gradients, glows or shadows in UI, except the logo's own gradient and a
  soft drop shadow under the hero logo.
- Check contrast when adding a color; keep AA.

Where the tokens live (keep them in sync):

- Web UI: `packages/ui/src/assets/index.html` (`:root` CSS variables).
- Docs: `docs/src/styles/custom.css` (Starlight `--sl-color-*` + `--cloudhop-cta*`).
- CLI: `packages/cli/src/ui.ts` (`STYLES`: `sky` `38;2;59;184;245` / 256-color `75`,
  `coral` `38;2;255;122;89` / `209`; respects `NO_COLOR`).

## Logo and wordmark

- Source: `assets/logo.svg` (64×64). A rounded square with a sky-to-blue
  gradient (`#3BB8F5` → `#1450A8`), two white clouds and a dotted white arc
  hopping from the small cloud to the big one, ending in an arrowhead.
- Copies: `docs/src/assets/logo.svg`, `docs/public/favicon.svg`, and two
  data URIs in the web UI (`#` must be encoded as `%23`).
- Keep the marks white; don't recolor the arc coral (it disappears on blue).
- Minimum size 16 px. Don't stretch, rotate, outline or put it on busy
  backgrounds.
- Wordmark: lowercase **cloudhop**, one word. Where color is available,
  "cloud" in the text color and "hop" in coral (web UI header, CLI banner).
- The CLI banner is ASCII art: "cloud" in sky, "hop" in coral (split at
  column 30).

## Typography

- UI and docs: the system sans stack (`system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif`); weights 400, 600 for buttons, 700 for headings.
- Commands, aliases, regions, paths and ids: monospace
  (`ui-monospace, SFMono-Regular, Menlo, Consolas`).
- Body 15–16 px, line height 1.5; never below 12 px.

## Voice

- Short, plain, second person: "Sign in again", "Your session expired".
- Sentence case for buttons and headings; lowercase product name.
- Errors say what happened and what to do, with the exact command when there
  is one (`Run cloudhop doctor`).
- No "please", "successfully", "simply", "just", exclamation marks or
  marketing filler. No emoji in the product.
- Examples use neutral names: `acme`, `acme-prod`, `123456789012`,
  `https://acme.awsapps.com/start`. Never real companies or accounts.
- Docs exist in English and Spanish (neutral Latin American, "tú").

## Taste notes from the maintainer

- Prefers a polished, intentional look over templates; ask "would this look
  generated?" and fix it if yes.
- Likes the sky-and-coral contrast; keep coral rare so it stays special.
- Wants everything to feel like one product across terminal, local web UI and
  docs.
