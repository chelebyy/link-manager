# Plan: MCP Market Design System Implementation

## Context
The project "link-manager" is a React + Vite + TypeScript + Tailwind CSS application that manages links/categories/resources. Currently it uses a neutral gray design system. The goal is to implement the MCP Market design system which is a developer-centric marketplace design with monospace typography.

## Design Reference
Source files in ./Tasarım/:
- mcp-market-DESIGN.md - Visual theme, color roles, typography rules
- mcp-market-design.json - Design tokens in JSON format
- mcp-market-design.css - CSS @theme format
- mcp-market-design-system-extended.md - Extended design documentation

## Target Design System (MCP Market)
- **Theme**: Developer Monospace Marketplace
- **Dual-theme**: Light (#ffffff background) and Dark (#050505 background)
- **Primary accent**: GitHub Blue (#58a6ff)
- **Typography**: GeistMono for headings (monospace), Inter for body (sans-serif)
- **Minimal elevation**: Subtle borders, no heavy shadows
- **Border radius**: 2-10px (subtle rounding)

### Color Palette
**Light Theme:**
- background: #ffffff
- text: #0a0a0a
- text-muted: #737373
- primary: #58a6ff
- secondary: #9ecbff
- accent: #032f62
- border: #d1d5db

**Dark Theme:**
- background: #050505
- text: #ededed
- text-muted: #808080
- primary: #58a6ff
- secondary: #9ecbff
- accent: #032f62
- border: #d1d5db

### Typography Scale
- heading-1: GeistMono, 72px, weight 500, -1.8px letter-spacing (page titles)
- heading-2: GeistMono, 24px, weight 600, -0.6px letter-spacing (section headings)
- heading-3: GeistMono, 16px, weight 600 (sub-section headings)
- heading-4: GeistMono, 12px, weight 600, 0.6px letter-spacing (card headings)
- body: Inter, 16px, weight 400, 24px line-height
- body-text: Inter, 18px, weight 400, 28px line-height (paragraphs)
- inline-text: GeistMono, 10px, weight 600, 0.5px letter-spacing
- link: GeistMono, 12px, weight 400
- button: Inter, 16px, weight 400
- navigation: Inter, 16px, weight 400

### Spacing
- 3xs: 1px, 2xs: 9.1px, xs: 16px, sm: 21.3px, md: 26.7px, lg: 40px, xl: 48px, 2xl: 56px, 3xl: 64px

### Border Radius
- none: 0, sm: 2px, md: 5px, lg: 10px, full: 9999px

## Implementation Tasks

### 1. Update index.css
**File**: frontend/src/index.css
- Replace HSL-based variables with MCP Market hex colors
- Light theme uses #ffffff background, dark theme uses #050505
- Primary accent is #58a6ff (GitHub blue)
- Muted text is #737373 (light) / #808080 (dark)
- Border color is #d1d5db
- Font imports need to be added via Google Fonts CDN for JetBrains Mono (fallback for GeistMono)

### 2. Update tailwind.config.js
**File**: frontend/tailwind.config.js
- Add JetBrains Mono as monospace font family (closest freely available alternative to GeistMono)
- Add mcp-market colors mapping to CSS variables
- Add custom border-radius tokens: sm: 2px, md: 5px, lg: 10px

### 3. Update UI Components
**Files**: frontend/src/components/ui/*.tsx
- button.tsx: Update to use monospace font, subtle borders, primary #58a6ff
- card.tsx: Clean cards with #d1d5db borders, subtle styling
- input.tsx: Clean borders, monospace placeholder
- badge.tsx: Small rounded badges with monospace text
- Other UI components should follow the minimal, technical aesthetic

### 4. Update App.tsx
**File**: frontend/src/App.tsx
- Header: Clean header with logo, navigation in monospace
- Typography: Use heading-2 for section titles, heading-3 for card titles
- Buttons: Update styling to match new design system

### 5. Update Feature Components
**Files**: 
- frontend/src/components/CategoryGrid/CategoryGrid.tsx
- frontend/src/components/ResourceList/ResourceList.tsx
- frontend/src/components/TypeCategories/TypeCategories.tsx
- frontend/src/components/GlobalSearchPanel.tsx
- frontend/src/components/ThemeToggle.tsx

Apply MCP Market styling to all cards, filters, search inputs.

### 6. Update ThemeContext.tsx
**File**: frontend/src/contexts/ThemeContext.tsx
- Ensure dark mode uses #050505 background and #ededed text

## Technical Approach
- Use Google Fonts CDN for JetBrains Mono (fallback for GeistMono which is proprietary)
- Maintain Tailwind CSS utilities alongside custom CSS
- Preserve all existing functionality while updating visual design

## Verification
After implementation:
1. Run `npm run dev` to verify no build errors
2. Check light/dark theme toggle works correctly
3. Verify all components render with new design tokens
4. Test responsive behavior
