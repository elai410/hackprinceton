import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Editorial palette inspired by mersi-architecture.com
        cream: "#F5F1EA",      // page background
        paper: "#FBF8F2",      // card / surface
        sand: "#E8DCC4",       // warm tan section tint
        linen: "#EDE6D6",      // softer beige tint
        ink: "#111111",        // primary text
        graphite: "#3A3833",   // secondary text
        mute: "#8A867E",       // tertiary text / placeholders
        rule: "#1A1A1A",       // hairline borders (high contrast)
        hair: "#D9D3C7",       // light hairlines
        // accents
        clay: "#B5572E",       // terracotta — primary accent / running
        sage: "#8C9C7B",       // dusty olive — workflow / verify
        sky:  "#7C95A6",       // dusty blue — info / model
        moss: "#5C6B3F",       // deeper green — success
        rust: "#8C2A1A",       // error
        plum: "#6B4F5B",       // muted aubergine — quotes
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        widest2: "0.22em",
      },
      borderRadius: {
        none: "0",
        DEFAULT: "0",
        sm: "0",
        md: "0",
        lg: "0",
        xl: "0",
        full: "9999px", // keep only for pill states (status dots)
      },
      keyframes: {
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(181,87,46,0.45)" },
          "70%": { boxShadow: "0 0 0 10px rgba(181,87,46,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(181,87,46,0)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        fadeUp: "fadeUp 0.25s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
