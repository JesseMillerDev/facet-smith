# Inspector

`@facetsmith/inspector` is optional, portal-rendered, and disabled by default. It shows fixed-position outlines and badges without changing application layout. `ResizeObserver`, capture-phase scroll events, and resize events update the union of rendered descendant rectangles. Nested markers receive staggered badges and independent outlines.

The toolbar lists mounted experiments, highlights a chosen experiment, toggles outlines, resets overrides, and copies the current URL. Each badge opens an ARIA-labelled dialog with all variant/revision pairs, switch/reset controls, and URL copying. Controls are ordinary keyboard-focusable buttons with visible focus supplied by the overlay and host application; Escape closes the active popover. When inactive, the full-screen portal has `pointer-events: none`, while only controls opt back into pointer interaction.

## Override storage

- Query parameter: `__exp=experiment:variant,other:variant`
- Serialization: experiment IDs sort lexically, then every ID is URL encoded.
- Browser persistence: localStorage key `__facetsmith-overrides` stores the same compact string.
- Precedence: URL wins over localStorage for the same experiment; source-provided developer overrides win over both. The Next example maps URL to developer overrides before server rendering.
- Invalid encodings and malformed entries are ignored. Unknown variants are rejected as soon as the source definition is registered.
- Reset removes persisted state; reset-all also removes `__exp` from the current URL.

Use the conditional dynamic import shown in the root README. A production environment disables the inspector even if its URL parameter exists. `allowInProduction: true` is an explicit escape hatch for isolated, access-controlled preview infrastructure; it should never be a normal deployment setting, and the endpoint requires the same explicit opt-in.

Canvas-only components, content rendered entirely through unrelated portals, and descendants without measurable DOM rectangles may register but cannot be outlined. Their exposure also requires an observable DOM descendant.
