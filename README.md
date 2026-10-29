# Passage

A generative ASCII study of pedestrians crossing illuminated frosted glass, viewed from below. TypeScript, Vite, and Canvas 2D; no graphics framework, models, recorded footage, or runtime dependencies.

## Run

Requires Node.js 24+.

```sh
npm install
npm run dev
```

Open the printed local URL. For production: `npm run build`, then serve `dist/` with any static HTTP server. `npm run typecheck` and `npm test` run the checks. A prebuilt copy is included in `dist/`; the source archive also includes an offline `standalone.html` that can be opened directly.

The Vite config uses TypeScript's in-process transpiler, disables unnecessary dependency scanning, and preserves symlinks. This avoids native subprocess requirements in restricted Windows environments. Type checking remains a separate build gate. The build target is modern browsers with ES2022, ResizeObserver, Canvas 2D, and HTML dialog support.

The separate `gait-study.html` lets you inspect the same rig frame by frame from the side and from below. Regenerate it after compiling the tests with `node scripts/gait-study.mjs`. Its ½× playback shows heel strike, foot-flat support, heel rise before the opposite landing, toe-off, knee flexion and early heel lift, and toe clearance. The steady 0.82 m/s study measures a 1.09 m stride, 1.33 s cycle, and 64% support / 36% swing. Slightly longer swing and cadence timing place steps about 5% farther apart at the same walking speed while preserving the original reach limits.

## Controls

- **Pause / Play**, or **Space**: hold the current observation.
- **Pace**: cycle 1× → 1.5× → 2× → 3× → 4× → ½× → ¼× playback. Higher speeds advance more fixed simulation steps, preserving gait and collision checks.
- **Frosted / Clear**: compare the optical treatment with the underlying rig.
- **Solo**: inspect a single walker.
- **Randomness On / Off**: switch between the regular vertical flow and pedestrians with persistent Relaxed, Easy, and Brisk walking styles, individual speeds, and routes in different directions. Switching modes composes a fresh crowd. Random traffic uses 8 walkers on smaller screens and 12 on wide screens to leave room for turns and passing.
- **D** or **[ d ]**: open the hidden technical panel. Inspect skeletons, locked contacts, height bands, projection guides, optical diffusion, and gait phase; advance a single simulation step or reset.
- `?still=1`: load the composed still frame with an explicit Play option. The system's reduced-motion setting also selects a still frame automatically. A hidden page suspends simulation without a catch-up jump.

## Tune

| Source | Settings |
| --- | --- |
| `src/gait.ts` | Shoe proportions; 0.10 s toe-off, 0.12 s landing, swing duration/clearance; load transfer, support reach, and stride limits |
| `src/crowd.ts` | Seed, population, vertical/random routes, walking styles, individual pace, height/build/shoe variation, anticipation, passing, yielding, and pauses |
| `src/collision.ts` | Body clearance, continuous collision constraints, sole capsules, reserved swing/landing corridors, and shoe spacing |
| `src/inspection.ts` | Independent checks of actual projected body parts and shoe contours, including glyph and glass diffusion margins |
| `src/camera.ts` | Camera distance/offset, portrait and landscape scale; the glass remains at z = 0 |
| `src/field.ts` | Height-band centers, blur radii, optical resolution |
| `src/renderer.ts` | Local sole outline/tread, body density, calibrated glyph atlas, fixed dot lattice and illuminated seams |
| `src/style.css`, `index.html` | All editable editorial text and responsive presentation |

The main seam is at 54% of the viewport width; the horizontal seams are at 26% and 74% of its height. These normalized positions are recomputed only on resize. The app maintains 12 walkers on smaller screens and 20 on wide screens, including people approaching or leaving the floor. A resize retires excess walkers only after they leave the frame and admits additional walkers into the least occupied lanes through clear entrances. Three consecutive seconds above 18 ms per rendered frame enable a modest reduction in optical resolution while retaining the population and fixed simulation rate. The debug panel reports actual frame cost, frame rate, field size, gait stages, and velocity.

The regular crowd follows three vertical lanes on smaller screens and five on wide screens, alternating upward and downward travel. Lane positions and directions persist through resizing. Lanes are 2.3 m apart, initial arrivals are staggered by 3.15 m, and following speed responds to a 3.05 m headway. People enter at the top or bottom and slow behind a paused or slower pedestrian rather than taking a diagonal passing route. An occupied entrance waits offstage until the complete figure has room; it does not build an obstructive queue of projected bodies outside the viewport. Head-on and four-way intersections remain independent stress cases in the test suite.

## How it works

1. A bounded 60 Hz simulation steers persistent destinations with smooth acceleration and anticipatory personal-space checks. The regular crowd follows vertical lanes; the general crossing solver samples reachable headings and speeds against predicted figure clearance. Proposed velocities satisfy body, view-space, movement-heading, and planted-foot reach constraints together. Initial placements and incoming pedestrians reserve a complete figure envelope through the projected head. The camera shows approximately 85 square metres, with a minimum 6 m floor width, giving the busier crowd more physical room rather than squeezing extra people into the previous view.
2. Alternating steps have heel landing, foot-flat support, terminal-stance heel rise, toe-off, and swing phases. Heel rise begins before the opposite heel lands. Foot anchors stay fixed through supporting heel/toe rolls. During swing, the physical shoe centre follows a continuous path, compensating for the changing heel/toe pivot so unrolling cannot produce a backward kick. A single smooth height curve avoids a vertical snap as the ankle becomes neutral. Walking steps pass the supporting foot, with reach limits preserved; a brief collision slowdown cannot turn successive strides into repeated closing steps. Cadence follows smoothly filtered walking intent while heel-strike prediction uses actual body speed. Arrivals accelerate from a balanced stance. Early landing adjustments use a bounded spring, preserve the step-through placement, and fade into a committed target before contact. Every shoe path reserves its swept envelope against planted shoes, pending steps, and other figures. Tight turns use a rounded arc with duration based on its length; eight swept segments and a curvature margin check the actual path around the supporting shoe. Blocked placements shorten or gently widen; otherwise the walker yields. Random walking styles vary stride, cadence, clearance, arm swing, and sway while retaining symmetric alternating steps.
3. Fixed-length two-bone leg IK follows actual shoe height. The pelvis rises over the supporting leg and settles through weight acceptance. Early-swing heel lift allows knee flexion without forcing the pelvis into a crouch; the ankle becomes neutral for toe clearance later in swing. Normalized support loads, opposite arm swing, and restrained pelvis/shoulder rotation follow the actual step timing. The full pose and contact shading interpolate between simulation states, including weight acceptance and arm positions. Lifted soles lose contrast faster than contacting heels and forefeet.
4. A perspective camera below the plane projects actual world height. Shoe mesh triangles and articulated capsules are rasterized into reusable optical-density and camera-depth buffers. Sole edges use subpixel coverage to avoid whole-pixel flicker during motion. Local tread stays attached to the shoe.
5. Several height bands blend continuously, diffuse the density field, and compose by light transmission. Contact detail stays separate and sharp. Four sub-cell samples choose calibrated, crisp glyphs with bounded hysteresis on a fixed screen lattice.

The static glass, dot grid, seams, and glyph atlas are cached. Temporary joint, projection, and image buffers are reused. No footprints persist. No network request is required after loading the application; the optional web fonts gracefully fall back to local fonts.

Below 600 CSS pixels, footprints use a finer 2 px optical field and 3 × 4 px character lattice, heavier glyphs, stronger sole contrast, and less subpixel tread breakup. Lifted feet fade more gradually so both sides of the step remain legible, while the floor dots are quieter. The world scale, shoe contours, walking behavior, and spacing stay the same. Adaptive resolution can reduce field detail on slower devices while retaining the mobile contrast treatment.

## Validation

`npm test` covers sustained commanded travel; world-space stance locking and heel/toe pivots; alternating steps and double support; swing clearance and landing continuity; shoe/plane separation; leg lengths through acceleration, both turn directions, stopping and restarting; settled idle poses; true height projection; and a deterministic five-minute crowd run with portrait/landscape changes and repeated entrances/exits.

Additional collision regressions exercise head-on passing, a four-way junction, occupied footprint rejection, and five minutes of crowd movement with paired walkers and new arrivals. They check body separation and conservative shoe-envelope clearance every simulation frame, including separation between each person's own feet. A load-transfer regression checks normalized support loads and continuous pelvis sway.

The earlier center/sole-proxy tests missed projected silhouette overlaps. The new independent view regression uses the actual rig joints and rendered shoe outline, adds optical/glyph margins, and samples previous, midpoint, and current rendered poses during a five-minute run across three aspect ratios. Head-on and four-way crossings also check the projected geometry. Gait regressions check full stride length, support/swing proportions, heel-rise timing, a straight supporting knee, swing-knee flexion, and fixed leg lengths. These checks are stronger than the earlier root-distance tests; they do not imply a biomechanical simulation.

A longer-run regression additionally checks planted-foot reach, continued through traffic, and stationary periods across desktop, portrait, and near-square previews, to catch a crowd that avoids overlap by getting stuck.

Motion-continuity regressions check forward shoe-centre movement and frame-to-frame velocity at both 60 and 120 Hz, non-stopping turning arcs, and exact reproduction of the complete previous rig pose at interpolation alpha zero through lift-off, landing, and braking.

A busy-floor regression exercises 20 → 12 → 20 walkers across wide and portrait views over three simulated minutes. It checks actual projected bodies and soles at previous, midpoint, and current poses, world-space shoe spacing, continued admissions, visible traffic flow, and a population that remains visibly busier.

Further regressions check balanced left/right strides during arrivals and slowdowns, coordinated feet through near-half-turns in both directions, and two minutes of random traffic through a desktop-to-mobile resize. Random traffic checks persistent style and speed variation, multiple heading sectors, continued arrivals, consecutive stationary periods, fixed leg lengths, finite poses, and actual projected body/sole clearance at previous, midpoint, and current poses. Blocked groups can turn away temporarily to create passing room; an unavailable pivot releases into a short move in the current facing direction before retrying the route. All 25 tests pass.

Gait references used for the revision: [University of Oklahoma gait-cycle phases](https://www.ouhsc.edu/bserdac/dthompso/web/gait/terms.htm) and [University of Alberta rocker and swing descriptions](https://engcourses-uofa.ca/books/ortho/gait-analysis/).

Browser QA includes desktop (1440 × 900), mobile portrait (390 × 844), pause/play, pace changes, clear/frosted comparison, solo mode, diagnostic overlays, phase inspection, and the notes dialog. Performance is reported live instead of assuming a frame-rate guarantee. Glass scattering, bodies, and crowd behavior are stylized approximations, not a biomechanical or optical simulation.

Only the text attachment was available for this build. The referenced portrait image and shark repository were not attached; composition and engineering were reconstructed from the written specification.

## Delivery checks

The regression suite, TypeScript check, and Vite production build are the delivery gates. The self-contained HTML and the walking study were also inspected over HTTP. The initial embedded desktop preview measured about 25–28 ms per frame (roughly 32–36 fps); the smaller embedded preview typically costs 7–10 ms per frame. Actual device performance varies. The app browser disallows direct `file:` navigation, so that launch path could not be exercised there.

Private Site publication did not complete: the environment rejects the publishing helper's Node-to-Git subprocess with `spawn EPERM`. The runnable HTML, production build, source, and tuning instructions are complete. The original Site identity is retained in the workspace's `.openai/hosting.json` for a later publishing attempt; no live Site URL is claimed.
