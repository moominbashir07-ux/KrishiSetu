---
name: AgriCore Modern
colors:
  surface: '#e9ffed'
  surface-dim: '#c3e1cb'
  surface-bright: '#e9ffed'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#dcfbe4'
  surface-container: '#d7f5de'
  surface-container-high: '#d1f0d9'
  surface-container-highest: '#cbead3'
  on-surface: '#062012'
  on-surface-variant: '#3f4940'
  inverse-surface: '#1c3626'
  inverse-on-surface: '#d9f8e1'
  outline: '#6f7a6f'
  outline-variant: '#becabd'
  surface-tint: '#006d3b'
  primary: '#006033'
  on-primary: '#ffffff'
  primary-container: '#0f7b45'
  on-primary-container: '#aeffc4'
  inverse-primary: '#7bda9a'
  secondary: '#715d00'
  on-secondary: '#ffffff'
  secondary-container: '#ffda51'
  on-secondary-container: '#745f00'
  tertiary: '#8a3c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#af4f04'
  on-tertiary-container: '#ffe9de'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#97f7b4'
  primary-fixed-dim: '#7bda9a'
  on-primary-fixed: '#00210e'
  on-primary-fixed-variant: '#00522b'
  secondary-fixed: '#ffe177'
  secondary-fixed-dim: '#e7c43c'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#554500'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#e9ffed'
  on-background: '#062012'
  surface-variant: '#cbead3'
  success-emerald: '#0F7B45'
  harvest-gold: '#F7D34A'
  soil-brown: '#6D786F'
  error-alert: '#E64B3C'
  surface-muted: '#F7F7F5'
  border-subtle: '#E7E7E2'
  input-bg: '#F3F3F0'
typography:
  display:
    fontFamily: Inter
    fontSize: 55px
    fontWeight: '900'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  section-head:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: '700'
    lineHeight: 24px
  body-default:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  ui-label-bold:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '900'
    lineHeight: 12px
    letterSpacing: 0.05em
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
  micro:
    fontFamily: Inter
    fontSize: 9px
    fontWeight: '900'
    lineHeight: 10px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 14px
  margin-mobile: 16px
  margin-desktop: 28px
  max-width: 1420px
---

## Brand & Style

The design system for this agricultural marketplace is built on the narrative of "Digital Stewardship"—merging the raw, organic vitality of farming with the precision and reliability of modern commerce. The visual language is designed to feel trustworthy for farmers and efficient for enterprise buyers, moving away from bureaucratic aesthetics toward a high-performance dashboard experience.

The design style is **Corporate / Modern** with a **Tactile** edge. It utilizes a structured grid and clean surfaces (Corporate) but incorporates organic greens and warm earth tones to ground the product in its industry. Subtle elevations and soft rounded corners provide a friendly, accessible feel that lowers the barrier to entry for users less familiar with complex software.

- **Primary Audience:** Farmers (Sellers), Agri-business Buyers, and Logistics Providers.
- **Emotional Response:** Professionalism, growth, security, and clarity.

## Colors

The color strategy uses "Nature-to-Market" tones. The palette is anchored by **Deep Emerald Green** to represent growth and brand authority, while **Fresh Sprout Yellow** acts as a high-visibility accent for calls-to-action and critical alerts.

- **Primary:** Used for main actions, active states, and brand presence.
- **Secondary:** Reserved for highlighting selection states, active chips, and hero accents.
- **Neutral:** A deep green-tinted charcoal used for typography to ensure better harmony than pure black.
- **System States:** Use `error-alert` for negative price trends or validation errors and `success-emerald` for positive confirmations.
- **Surfaces:** Use `surface-muted` for global backgrounds to reduce eye strain, while white (`#FFFFFF`) is strictly reserved for cards and foreground panels to create clear containment.

## Typography

This design system uses **Inter** exclusively to ensure maximum legibility across data-heavy tables and mobile interfaces. The hierarchy relies on extreme weight variance rather than just size changes.

- **High-Density Labels:** A unique trait of this system is the use of `ui-label-bold` and `micro` tokens. These use very heavy weights (900) at tiny sizes (9px-10px) to provide "UI toughness" and clarity in dense data environments like price grids.
- **Display & Headlines:** Use tighter letter spacing and heavy weights to convey strength.
- **Body Text:** Standard weight for readability, using `neutral_color_hex` to maintain a soft but high-contrast reading experience.

## Layout & Spacing

The layout utilizes a **12-column fluid grid** with a maximum content width of 1420px to accommodate wide data tables and multi-card dashboards.

- **Rhythm:** A 4px/8px incremental scale ensures tight alignment. 
- **Dashboards:** Use `gutter` (14px) for spacing between cards and `md` (16px) for internal card padding.
- **Mobile Adaptivity:** On mobile (below 768px), margins compress to 16px. Sidebars transition to a bottom-navigation bar or a hidden drawer. Content reflows into a single column, prioritizing the "Price Trend" charts and "Quick Action" buttons.
- **Safe Areas:** Maintain a minimum 24px vertical padding between logical sections (e.g., between a Hero banner and a product grid).

## Elevation & Depth

Visual hierarchy is achieved through a combination of **Tonal Layers** and **Ambient Shadows**.

- **Surface Strategy:** The global background is `surface-muted`. Cards and interactive panels are pure white, creating a natural lift without needing heavy shadows.
- **Shadow Profile:** Use a single, extra-diffused shadow for interactive elements: `0 4px 18px rgba(23, 49, 34, 0.07)`. The tint is derived from the neutral color (Deep Green) rather than pure black to keep the palette organic.
- **High-Depth:** For modals (like Sign In), use a significant "Auth Depth" shadow: `0 25px 70px rgba(0, 0, 0, 0.16)` to aggressively pull the user's focus.
- **Interactive States:** Use a 1.5px border of `primary_color_hex` for "Selected" states (e.g., choosing between Buyer/Seller roles) instead of elevation.

## Shapes

The shape language is consistently **Rounded**, reflecting the organic nature of the industry while maintaining professional structure.

- **Standard Elements:** Buttons, inputs, and product thumbnails use 8px (standard) corners.
- **Containers:** Dashboard cards and large panels use 12px-15px for a softer, more modern container feel.
- **Specialty Shapes:** Use "Pill" shapes (full radius) for Category Chips and Status Badges (e.g., "In Stock", "Verified").
- **Dashed Borders:** Use a 1px dashed border in `soil-brown` for empty states or "Add New" placeholders.

## Components

- **Buttons:** Primary buttons use `primary_color_hex` with white text. Ghost buttons use a `border-subtle` with `neutral_color_hex` text. All buttons have an 8px radius.
- **Inputs:** Use `input-bg` for the field fill with no border by default. On focus, apply a 1px `primary_color_hex` border. Labels must use the `ui-label-bold` typography token.
- **Cards:** White background, 12px radius, and the standard ambient shadow. Content within cards should use `gutter` (14px) for spacing.
- **Chips:** Pill-shaped, using `harvest-gold` with `neutral_color_hex` text for active states, and `surface-muted` for inactive states.
- **Data Tables:** Headers use `ui-label-bold` with `soil-brown` text. Row dividers use `border-subtle` (1px solid).
- **Price Indicators:** Use `success-emerald` for upward trends and `error-alert` for downward trends, accompanied by simple arrow icons.
- **Icons:** Use high-contrast emojis for product categories (e.g., 🌾 for grains, 🍅 for vegetables) to add a friendly, tactile quality to the professional interface.