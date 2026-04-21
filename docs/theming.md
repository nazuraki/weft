# Theming

## Built-in Themes

Weft ships with `light` and `dark` themes. Theme resolution order:

1. User's saved preference (persisted in `localStorage`)
2. `defaultTheme` from `weft.config.ts`
3. OS/browser system preference

To set the default theme site-wide:

```ts
// weft.config.ts
export default defineConfig({
  defaultTheme: "dark",
});
```

To force a theme on a specific document regardless of user preference, use frontmatter:

```markdown
---
theme: light
---
```

The toggle in the UI header lets users switch themes at any time; their choice persists across sessions.

---

## CSS Custom Properties

All visual properties are defined as CSS custom properties on `[data-theme="dark"]` and `[data-theme="light"]`. Override any of them to customize the appearance.

### Layout

Defined on `:root` (theme-independent):

| Variable | Default | Description |
|----------|---------|-------------|
| `--lhn-width` | `240px` | Left-hand navigation sidebar width |
| `--rhs-width` | `260px` | Right-hand linked-items sidebar width |
| `--header-height` | `48px` | Top header bar height |

### Typography

| Variable | Default | Description |
|----------|---------|-------------|
| `--font-sans` | Inter, system-ui | Body text font stack |
| `--font-heading` | Space Grotesk, Inter | Heading font stack |
| `--font-mono` | ui-monospace, SF Mono, Menlo | Code font stack |

### Color (per theme)

These are defined on `[data-theme="dark"]` and `[data-theme="light"]`. Override on either or both.

| Variable | Description |
|----------|-------------|
| `--color-bg` | Page background |
| `--color-bg-secondary` | Sidebar and panel backgrounds |
| `--color-bg-elevated` | Elevated surfaces (hover states, dropdowns) |
| `--color-border` | Primary border color |
| `--color-border-subtle` | Subtle/divider borders |
| `--color-text` | Primary text |
| `--color-text-secondary` | Secondary/muted text |
| `--color-link` | Link color |
| `--color-link-hover` | Link hover color |
| `--color-accent` | Accent color (active states, highlights) |
| `--color-accent-subtle` | Subtle accent background (selection, badges) |

---

## Overriding Styles

Weft does not yet support a user-supplied CSS file via config. To customize styles, override CSS custom properties in a document's frontmatter-driven inline style block, or fork the `@weft/ui` package.

A `customCss` config option is planned (Phase 2). Until then, the most practical approach for branding is overriding variables directly on the host `html` element via a wrapper script, or pointing `--color-accent` and `--color-link` variables to your brand color by patching `packages/ui/src/app.css`.

### Example: brand accent color

```css
/* In packages/ui/src/app.css, append: */
[data-theme="light"] {
  --color-accent: #0066cc;
  --color-link: #0066cc;
  --color-link-hover: #004499;
  --color-accent-subtle: #e6f0ff;
}

[data-theme="dark"] {
  --color-accent: #4da6ff;
  --color-link: #4da6ff;
  --color-link-hover: #80bfff;
  --color-accent-subtle: #001a33;
}
```
