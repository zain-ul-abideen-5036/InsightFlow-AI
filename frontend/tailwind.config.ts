import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * InsightFlow design system.
 *
 * Colours live as CSS custom properties in `app/globals.css` and are
 * referenced here, so light and dark share one set of token names and a
 * component never needs to know which theme is active.
 *
 * Two things changed in the redesign and are load-bearing:
 *
 * - **The type scale moved up.** Body was 13–14px throughout, including on the
 *   marketing site and the login page. That reads as unfinished rather than as
 *   information-dense. The scale now starts at 15px for body and keeps a tight
 *   ratio above it, so hierarchy comes from weight and colour as much as size.
 *
 * - **Elevation is a real ladder.** `e0`–`e3` plus `overlay`, tuned so a card
 *   on the tinted canvas is legible without a heavy drop shadow. The old scale
 *   topped out below the threshold of visibility.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1240px" },
    },
    extend: {
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
          subtle: "hsl(var(--primary-subtle))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        subtle: {
          foreground: "hsl(var(--subtle-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
        },
        chrome: {
          DEFAULT: "hsl(var(--chrome))",
          foreground: "hsl(var(--chrome-foreground))",
        },
        /** An inverted block, for sections that must carry real weight. */
        inverse: {
          DEFAULT: "hsl(var(--inverse))",
          foreground: "hsl(var(--inverse-foreground))",
          muted: "hsl(var(--inverse-muted))",
          border: "hsl(var(--inverse-border))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          subtle: "hsl(var(--success-subtle))",
          border: "hsl(var(--success-border))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          subtle: "hsl(var(--warning-subtle))",
          border: "hsl(var(--warning-border))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          subtle: "hsl(var(--danger-subtle))",
          border: "hsl(var(--danger-border))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          subtle: "hsl(var(--info-subtle))",
          border: "hsl(var(--info-border))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        /** Categorical series colours. Ordered for maximum adjacent contrast. */
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
          grid: "hsl(var(--chart-grid))",
          axis: "hsl(var(--chart-axis))",
        },
      },
      borderRadius: {
        xs: "calc(var(--radius) - 5px)",
        sm: "calc(var(--radius) - 3px)",
        md: "calc(var(--radius) - 1px)",
        lg: "var(--radius)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-xl)",
        "3xl": "1.5rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Body sits at 15px. The steps below it are for metadata and labels
        // only; the steps above it carry hierarchy. Tracking tightens as size
        // grows, which is what keeps large headings from looking loose.
        "2xs": ["0.75rem", { lineHeight: "1.0625rem" }],
        xs: ["0.8125rem", { lineHeight: "1.1875rem" }],
        sm: ["0.875rem", { lineHeight: "1.375rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        md: ["1rem", { lineHeight: "1.625rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.006em" }],
        xl: ["1.3125rem", { lineHeight: "1.875rem", letterSpacing: "-0.012em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.018em" }],
        "3xl": ["1.875rem", { lineHeight: "2.3125rem", letterSpacing: "-0.022em" }],
        "4xl": ["2.25rem", { lineHeight: "2.625rem", letterSpacing: "-0.027em" }],
        "5xl": ["2.75rem", { lineHeight: "3rem", letterSpacing: "-0.031em" }],
        "6xl": ["3.5rem", { lineHeight: "1.06", letterSpacing: "-0.034em" }],
        "7xl": ["4.25rem", { lineHeight: "1.02", letterSpacing: "-0.038em" }],
        // Figures. Separate from the text scale because a KPI value is a
        // graphic element, not a heading, and wants its own optical sizing.
        "metric-sm": ["1.375rem", { lineHeight: "1.625rem", letterSpacing: "-0.02em" }],
        metric: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.024em" }],
        "metric-lg": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.028em" }],
      },
      boxShadow: {
        // e0 is a hairline for elements that sit on the canvas but must not
        // float; e3 is as far as anything in the product goes short of an
        // overlay. Two layers each: a tight contact shadow and a soft ambient.
        e0: "0 1px 1px 0 hsl(var(--shadow-color) / 0.04)",
        e1: "0 1px 2px -1px hsl(var(--shadow-color) / 0.08), 0 2px 6px -2px hsl(var(--shadow-color) / 0.05)",
        e2: "0 2px 4px -2px hsl(var(--shadow-color) / 0.09), 0 6px 16px -4px hsl(var(--shadow-color) / 0.08)",
        e3: "0 4px 8px -3px hsl(var(--shadow-color) / 0.10), 0 16px 36px -8px hsl(var(--shadow-color) / 0.12)",
        overlay:
          "0 8px 16px -6px hsl(var(--shadow-color) / 0.14), 0 28px 60px -16px hsl(var(--shadow-color) / 0.22)",
        // Named for what it is on, so popovers, menus, dialogs and toasts
        // cannot drift onto three different elevations.
        popover:
          "0 8px 16px -6px hsl(var(--shadow-color) / 0.14), 0 28px 60px -16px hsl(var(--shadow-color) / 0.22)",
        // The product shot on the marketing page, which needs to read as a
        // physical object sitting above the page.
        showcase:
          "0 2px 4px -2px hsl(var(--shadow-color) / 0.06), 0 12px 24px -8px hsl(var(--shadow-color) / 0.10), 0 40px 80px -20px hsl(var(--shadow-color) / 0.18)",
        "inner-top": "inset 0 1px 0 0 hsl(0 0% 100% / 0.06)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        topbar: "var(--topbar-height)",
      },
      maxWidth: {
        prose: "68ch",
        measure: "42rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        /** A single dot travelling along a track: work in progress, honestly. */
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        /** Draws a chart line on, once, when it first appears. */
        "draw-in": {
          from: { strokeDashoffset: "var(--dash, 1000)" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-out)",
        "accordion-up": "accordion-up 0.2s var(--ease-out)",
        "fade-in": "fade-in var(--duration-base) var(--ease-out)",
        "slide-up": "slide-up var(--duration-slow) var(--ease-out)",
        "slide-in-left": "slide-in-left var(--duration-base) var(--ease-out)",
        shimmer: "shimmer 1.7s infinite",
        "pulse-soft": "pulse-soft 1.9s var(--ease-in-out) infinite",
        "progress-indeterminate": "progress-indeterminate 1.5s var(--ease-in-out) infinite",
        "draw-in": "draw-in 900ms var(--ease-out) both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
