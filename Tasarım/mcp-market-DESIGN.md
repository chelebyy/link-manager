# Design System: MCP Market

## 1. Visual Theme & Atmosphere

The interface exudes technical precision through its extensive use of monospace typography, creating an environment that feels native to developers. The dual-theme system provides both the clean brightness of a code editor's light mode and the focused depth of dark mode, while blue accent colors add just enough warmth to prevent sterility. The overall mood is professional yet approachable, balancing technical authenticity with marketplace accessibility.

The design uses minimal elevation with subtle card shadows and clean borders to create gentle layering. Content floats slightly above backgrounds without dramatic depth effects, maintaining the clean, technical aesthetic. The dual-theme system creates natural depth through high contrast rather than shadow-based elevation.

Subtle rounded corners (2-10px) soften the technical aesthetic without compromising the clean, code-like feel. The design favors rectangular cards and linear layouts with minimal decorative elements. Typography creates the primary visual texture through the contrast between monospace headings and sans-serif body text.

## 2. Color Palette & Roles

**Primary Foundation:**
- Pure White (#ffffff) — background
- True Black (#050505) — text
- Deep Charcoal (#0a0a0a) — text
- Off White (#ededed) — text

**Accent & Interactive:**
- GitHub Blue (#58a6ff) — primary
- Sky Blue (#9ecbff) — secondary
- Navy Depth (#032f62) — accent

**Neutral & Surface:**
- Slate Gray (#737373) — text
- Medium Gray (#808080) — text
- Silver Border (#d1d5db) — border

## 3. Typography Rules

**Inter** (custom), **Noto Sans CJK JP** (custom), **Hiragino Kaku Gothic ProN** (custom), **Hiragino Sans** (custom), **Yu Gothic** (custom), **Meiryo** (custom), **Fraunces** (custom), **Crimson Text** (custom), **Noto Serif** (custom), **Noto Serif CJK JP** (custom), **Hiragino Mincho ProN** (custom), **Yu Mincho** (custom), **JetBrains Mono** (custom), **JetBrains Mono Fallback** (custom), **GeistMono** (custom), **Roboto Mono** (custom), **DejaVu Sans Mono** (custom), **GeistPixelSquare** (custom), **Geist Mono** (custom), **GeistPixelGrid** (custom), **GeistPixelCircle** (custom), **GeistPixelTriangle** (custom), **GeistPixelLine** (custom)

- **heading-1**: GeistPixelSquare, Geist Mono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, monospace 72px/72px, weight 500, letter-spacing: -1.8px — Page titles
- **heading-2**: GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace 24px/32px, weight 600, letter-spacing: -0.6px — Section headings
- **heading-3**: GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace 16px/24px, weight 600 — Sub-section headings
- **heading-4**: GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace 12px/16px, weight 600, letter-spacing: 0.6px — Card/block headings
- **body**: Inter, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Noto Sans CJK JP, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif 16px/24px, weight 400 — Base body text
- **body-text**: Inter, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Noto Sans CJK JP, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif 18px/28px, weight 400 — Paragraph text
- **inline-text**: GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace 10px/16px, weight 600, letter-spacing: 0.5px — Inline text elements
- **link**: GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace 12px/16px, weight 400 — Hyperlinks
- **button**: Inter, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Noto Sans CJK JP, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif 16px/24px, weight 400 — Button labels
- **navigation**: Inter, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, Noto Sans CJK JP, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif 16px/24px, weight 400 — Navigation text

## 4. Component Stylings

* **server-card:** Clean white/dark cards with subtle borders, containing server information with monospace headings and sans-serif descriptions, featuring rating systems and metadata
* **category-filter:** Horizontal scrollable filter buttons with rounded corners, using monospace typography and subtle background colors for active states
* **search-bar:** Minimal search input with clean borders and placeholder text, integrated seamlessly into the header navigation
* **navigation-header:** Clean header with logo, navigation links, and action buttons, using consistent spacing and the dual-theme color system
* **section-divider:** Subtle horizontal dividers and generous whitespace separating content sections, maintaining clean visual hierarchy
* **faq-accordion:** Expandable FAQ items with clean typography and subtle interaction states, maintaining the monospace aesthetic for questions

## 5. Layout Principles

Content is organized in a centered container with generous margins and consistent vertical rhythm. The layout uses a grid-based card system for server listings with ample whitespace between sections. Horizontal spacing follows a systematic approach with clear content groupings and breathing room around interactive elements.
