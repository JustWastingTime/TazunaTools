---
name: Derby Terminal
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1a1b1e'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#bbcbbb'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#2f3033'
  outline: '#869486'
  outline-variant: '#3d4a3e'
  surface-tint: '#4ae183'
  primary: '#54e98a'
  on-primary: '#003919'
  primary-container: '#2ecc71'
  on-primary-container: '#005027'
  inverse-primary: '#006d37'
  secondary: '#ffb961'
  on-secondary: '#472a00'
  secondary-container: '#e89300'
  on-secondary-container: '#563400'
  tertiary: '#ffc1a6'
  on-tertiary: '#571e00'
  tertiary-container: '#ff996a'
  on-tertiary-container: '#792d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6bfe9c'
  primary-fixed-dim: '#4ae183'
  on-primary-fixed: '#00210c'
  on-primary-fixed-variant: '#005228'
  secondary-fixed: '#ffddb9'
  secondary-fixed-dim: '#ffb961'
  on-secondary-fixed: '#2b1700'
  on-secondary-fixed-variant: '#663e00'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb595'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7c2e00'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  data-mono:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1440px
---

## Brand & Style

The design system is built on the concept of **Premium Utility**. It bridges the gap between high-energy sports entertainment and high-performance technical tools. The brand personality is precise, efficient, and celebratory—catering to users who treat "Umamusume" with the strategic depth of an analyst.

The aesthetic blends **Minimalism** with **Modern Industrial** influences. It utilizes a dark-mode-first approach to reduce eye strain during long sessions of data analysis or team building. The UI evokes a "mission control" atmosphere: dark surfaces, high-contrast data visualizations, and subtle glowing accents that mimic the energy of a race finish line.

Key visual principles:
- **Modular Efficiency**: Elements are grouped into logical clusters to reduce cognitive load.
- **Vibrant Precision**: Saturated colors are used sparingly as data signals and status indicators against a neutral dark backdrop.
- **Kinetic Stasis**: While the layout is rigid and functional, interactive states should feel energetic through sharp transitions and glow effects.

## Colors

The palette is anchored in a deep, tech-inspired neutral base, allowing the thematic colors to function as high-visibility alerts and brand anchors.

- **Primary (Turf Green)**: Used for primary actions, success states, and indicating "Go" or "Optimal" conditions. It should feel neon and "charged."
- **Secondary (Dirt Brown/Gold)**: Used for secondary highlights, star ratings, and achievement-related UI.
- **Tertiary (Track Red)**: Reserved for high-priority alerts, stamina warnings, or critical data points.
- **Neutral (Paddock Ink)**: A series of layered greys with a slight blue tint to provide depth without introducing pure black.

Use transparency for "Glassmorphism" overlays to maintain context when layering complex data sets.

## Typography

This design system utilizes a dual-font strategy to balance modernity with technical utility.

- **Geist (Sans)**: The primary typeface for all interface elements, headings, and body copy. Its clean, geometric nature and wide apertures ensure legibility at small sizes within dense data tables.
- **Space Mono**: Used exclusively for labels, data points, and metadata. The monospaced nature emphasizes the "toolkit" feel and ensures that numerical values align vertically for easy comparison.

**Styling Note**: Headlines should use tighter letter spacing for a punchy, aggressive look. Labels should always be uppercase when using the Mono font to clearly differentiate them from interactive text.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a strict 4px base unit to maintain technical alignment.

- **Desktop**: A 12-column grid with a 16px gutter. Content is organized into "Modules" (Cards) that occupy spans of 3, 4, 6, or 12 columns. 
- **Tablet**: An 8-column grid with 16px gutters.
- **Mobile**: A 4-column grid. Complex data tables should transition to card-based summaries or horizontal scrolling views.

Spacing should be tight and efficient. Use `16px` for internal module padding to maximize content density. Large white spaces should be replaced with "dark space" (neutral surface colors) to maintain the industrial feel.

## Elevation & Depth

In this dark-mode-first environment, depth is communicated through **Tonal Layers** and **Glow Outlines** rather than traditional shadows.

- **Surface Levels**:
    - `Base`: #1A1B1E (Deepest background)
    - `Surface`: #25262B (Default card/module background)
    - `Overlay`: #2C2E33 (Hover states and tooltips)
- **Outer Glow**: High-priority elements (like active race buttons or "Max Stat" indicators) utilize a subtle 4px blur glow in the Primary color (#2ECC71) to simulate an illuminated hardware interface.
- **Dividers**: Use low-opacity (10-15%) white borders to define edges without adding visual weight. Avoid heavy dropshadows.

## Shapes

The shape language is **Soft-Industrial**. We avoid fully round corners to maintain a serious, tool-like feel, but utilize small radii to prevent the UI from feeling too harsh or dated.

- **Standard Elements**: 4px (0.25rem) corner radius for buttons and input fields.
- **Containers**: 8px (0.5rem) corner radius for cards and larger modules.
- **Interactive Indicators**: Vertical bars or "pips" should be used for status indicators, maintaining sharp 90-degree corners to look like LED readouts.

## Components

### Buttons
- **Primary**: Solid Turf Green background with black text. No border. On hover, apply a Primary-colored glow.
- **Ghost**: Transparent background with a Primary color border. 

### Cards / Modules
- Modular units with a thin 1px border (#2C2E33). Headers within cards should have a slightly darker background to create clear sectioning.

### Input Fields
- Dark backgrounds (#141517) with subtle bottom-borders. On focus, the border turns Primary green and a slight glow is applied.

### Data Chips
- Small, rectangular tags with Space Mono text. Use background tints for categories (e.g., "Speed" = Green tint, "Stamina" = Blue tint).

### Progress Bars
- High-contrast bars with segmented markers. The fill should be a gradient of the Primary color to imply energy and movement.

### Lists
- Clean, row-based layouts with subtle hover highlighting. Use monospaced font for numerical data within list items.