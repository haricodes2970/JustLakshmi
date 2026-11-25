# JustLakshmi Sakuga VFX UI/UX Architecture

## Design System & Attribution

JustLakshmi's interactive visual system is inspired by [sakuga-vfx](https://github.com/finktheartist/sakuga-vfx) (MIT License, by `finktheartist`), adapted into a native React 19 + Next.js 16 + Tailwind CSS implementation tailored for calm daily productivity.

### Visual Tokens (`apps/web/src/app/globals.css`)

- **Light Mode (Paper & Ink)**:
  - Paper background `#FAF9F6`, card `#FFFFFF`, soft lavender surface `#F3EFFA`.
  - Primary ink `#24212D`, lavender `#DAD1FF`, deep violet `#7462D8`, pink accent `#F2A5C4`, flat shadow `#E8E3F2`.
  - Restrained semantic tones: success `#2A7F62`, danger `#C14253`.
- **Dark Mode (Deliberate Midnight Ink)**:
  - Background `#14121B`, surface `#1C1926`, elevated `#262234`, ink `#F7F5FC`, lavender `#B8A9F5`, violet `#9B8AEF`, pink `#F4A9C7`.
- **Typography**: `Instrument Serif` (display headings) + `DM Sans` (body/UI), >=16px inputs for iOS Safari safety.

### Sakuga React Interaction Layer (`apps/web/src/components/sakuga/`)

- `motion-config.ts`: Semi-implicit Euler `Spring` engine, `volumeSquash(sy)` volume-preserving transform, spring presets, and `useReducedMotion()`.
- `effects-layer.tsx`: On-demand `<canvas>` overlay (`z-25`, below navigation `z-30` and modals `z-40`/`z-50`, `pointer-events-none`, `aria-hidden="true"`). Draws flat two-tone shapes with crisp ink outlines, exits by shrinking/thinning (never fading opacity), and runs **zero** `requestAnimationFrame` work when idle or hidden.
- `sakuga-provider.tsx`: Provides `useSakuga()` (`fireEffect`, `toast`, `reducedMotion`) and mounts `<EffectsLayer>` and `<SakugaToastViewport>`.
- Controls: `SakugaButton`, `SakugaCheckbox`, `SakugaToggle`, `SakugaInput`, `SakugaTextarea`, `SakugaTabs`, `SakugaProgress`, `SakugaToastViewport`, `SakugaTooltip`.

### Accessibility & Reduced Motion

- Native HTML semantics preserved (`<button>`, `<input>`, `role="checkbox"`, `role="switch"`, radio-based tabs).
- Decorative canvas effects are `aria-hidden="true"` and completely skipped when `prefers-reduced-motion: reduce` is active.
- All state transitions happen immediately regardless of animation state.
