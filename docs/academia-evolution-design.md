# Evolução — Corpo e Desempenho

Implemented from the two approved Norte mockups: shared charcoal cards, emerald selection controls, period selector, three compact KPIs, anatomical body map and interactive exercise chart. The mobile UI scrolls naturally rather than shrinking text to fit an entire dashboard into a phone frame.

## Data contracts

- Body: recorded consistency, greatest comparable exercise load increase (with the source exercise named), and a stable exercise with at least four comparable sessions. No aggregate muscle-strength claim.
- Performance: progressing exercises, historical personal records within the active scope, stable exercises. Records consult history before the visible period.
- Strength estimate: Epley, external load, 1–10 reps; a one-rep set retains its recorded load. Unknown equipment, bands, assisted and bodyweight sets are excluded. One series per exercise/equipment, best eligible set per session.
- Body colors represent relative recorded direct-set counts, not recovery or an ideal training dose. No data leaves the region neutral. Named selector complements touch/keyboard targets.
- Exercise details separate equipment variants. Load reduction now displays a negative change instead of “stable”.
- Existing distribution chart, measurements, stage/program filters and history are retained. “Revisar próximo treino” returns to the workout tab.

## Asset

`public/images/academia/anatomy-atlas.png` is an original front/back illustration generated with the built-in image generation tool using the approved mockup as a style reference. The rendering is an illustration, not a rotatable 3D mesh. SVG paths supply data-dependent colors and keyboard/touch selection.

Final generation prompt: Create a production asset, not a UI screenshot. Recreate the reference's translucent anatomical male figure style. Two equal side-by-side panels: orthographic front on left and back on right, full body, matching pose/proportions, arms slightly away from body. Pure black background. Cool silver-blue translucent detailed muscles, luminous edges and internal fibers. All muscles neutral blue-gray; no orange/green highlights, text, labels, frames or UI. Interactive colors are added in code.

## Verification

`npm test -- src/lib/workout-performance.test.ts src/lib/workout-evolution.test.ts`

With the dev server running on localhost:5173: `node scripts/check-evolution.mjs`. It intercepts all Supabase calls and uses synthetic fixtures without writing to a live account. Checks both views, body orientation, muscle filters, metric switch, workout navigation, empty custom range, light theme, runtime errors and overflow. Screenshots are saved under `/tmp/norte-*.png` for inspection.
