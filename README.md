# Standing Wave

**The bass isn't louder in the corner because the speaker is. The room is stacking the wave.**

A playable, procedural 3D explanation of one idea: a room can make the same bass note strong in one place and weak a few steps away. Scrub the frequency, move the listener, and compare a distance-only intuition with a standing pressure pattern.

Built with Vite, TypeScript, Three.js and Web Audio. Visual assets are procedural; licensed fonts are bundled locally. No backend, account, audio download, or runtime connection to a font service is required.

## Run

Use a current Node.js LTS release (Node 22 or later).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The scene starts immediately; audio starts only when you turn it on. A phone or laptop speaker may reproduce very low frequencies weakly. Audio output is a quiet, normalized illustration, not a measurement of your own room.

```sh
npm test          # analytical model checks
npm run build    # strict TypeScript check + production bundle
npm run preview  # serve the production bundle locally
```

Run the browser interaction checks after installing Playwright's Chromium once:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite builds the production bundle and starts its own preview server at `http://127.0.0.1:5179/standing-wave/`. Desktop Chromium checks tuning, quiet spots, the comparison, keyboard controls, mic dragging, camera movement, accessible pressure feedback, and agreement between the meter and audio gain. It also checks short windows, static metadata, and subpath asset responses. Separate Pixel 7 portrait and landscape projects use mobile viewports and touch input, including live rotation and the persistent sound control. These are browser emulation, not tests on physical phones. Optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to the absolute path of an existing compatible Chrome/Chromium executable.

Pushes and pull requests run the build, acoustic tests, and all Chromium browser projects in GitHub Actions on Node 22. Failed browser runs retain their Playwright report, traces, and screenshots as an artifact.

## Deploy under a subpath

Live/deploy URL: `https://<domain>/standing-wave/` — the public domain has not been selected yet.

Vite defaults to `BASE_PATH=/standing-wave/`. Development, production assets, and Playwright all use that prefix; preview it with `npm run preview` at `http://127.0.0.1:4173/standing-wave/`. An alternative root-relative `BASE_PATH` is supported and its trailing slash is normalized. Vite rewrites the bundled CSS, fonts, scripts, and favicon under the configured base.

For **Cloudflare Pages**, use build command `npm run build` and output directory `dist`. In the project's **build environment variables**, set `SITE_URL` to the eventual public origin, such as `https://<domain>`, with no path, query, or fragment. Keep `BASE_PATH=/standing-wave/` unless the public path changes, then rebuild. For local configuration, copy `.env.example` to `.env.local`.

The build emits a Pages `_redirects` file that adds the trailing slash and proxies requests under the configured prefix to the corresponding files in `dist`. This matters because Vite rewrites asset URLs but does not nest the output inside a `standing-wave` directory. Other static hosts must mount `dist` at the configured prefix. These rules use [Cloudflare Pages prefix proxying](https://developers.cloudflare.com/pages/configuration/redirects/#proxying); this repo does not deploy or change any host configuration automatically.

When `SITE_URL` is empty, canonical and social URLs remain relative to the site root; no public domain is invented. Set it at deployment to publish absolute canonical, Open Graph, Twitter, and structured-data URLs. The sharing image is the independently authored, checked-in `public/og.png` (1200 × 630). Replace that PNG to update the card; `npm run build` copies it unchanged. The static document also contains an explanation for crawlers and visitors without JavaScript. No ratings, measurements, host-wide robots policy, or speculative sitemap are published.

`public/og.svg` contains the earlier vector design, not the source of the current PNG. Opening it in a browser will still show that earlier artwork. **Do not run `npm run og` to build or deploy the current card:** that optional Playwright command renders the old SVG and overwrites `public/og.png`. The SVG → `npm run og` → PNG recipe is only for intentionally returning to the vector design. Rebuild with `SITE_URL` set to the public origin so the current PNG has an absolute sharing URL, such as `https://<domain>/standing-wave/og.png`.

## Code structure

The application uses TypeScript modules with separate responsibilities:

| Location | Responsibility |
| --- | --- |
| `src/main.ts` | Own experiment state, route user actions, and coordinate the interface, scene, and audio |
| `src/ui/template.ts` | Static page markup, icons, and explanatory copy |
| `src/ui/view.ts` | Render readings and control states through cached DOM references |
| `src/acoustics.ts` | Pure calculations for room modes, pressure, wavelength, and relative level |
| `src/audio.ts` | Manage the optional tone, gain transitions, and audio lifecycle |
| `src/scene.ts` | Own the renderer, camera, pointer interaction, and scene lifecycle |
| `src/scene/` | Build the room, pressure field, listener marker, and projected labels |
| `src/styles/` | Format and organize styles by responsibility; `src/style.css` preserves their cascade order |

The interface renders existing state without owning the acoustic calculations. Scene objects share one renderer and are disposed through `RoomScene`. Keep those boundaries when making changes; a file's responsibility matters more than a fixed line-count limit.

## Try it

1. Start with the length mode, about **28.6 Hz**. Its **12 m wavelength** is twice the **6 m room length**: half of one wave fits between the end walls.
2. Drag the listener towards the middle of the room. The pressure level falls into a **node**: a quiet plane in this isolated mode.
3. Move towards the opposite wall. The level rises again at an **antinode**, even though you are farther from the speaker.
4. Switch to **Speaker only** under **The assumption**. This view only gets quieter with distance. Switch back to **Room interference** under **The physics** to bring back the room's pattern.
5. Try the width and height modes, then scrub farther up the frequency range. Higher modes fit more half-waves into the same room, adding quiet planes.

## Controls

| Control | Action |
| --- | --- |
| Frequency slider | Tune from 25 to 200 Hz |
| Length / width / height shortcuts; `1` / `2` / `3` | Tune to the first axial mode of that dimension |
| `4` | Tune to the second length mode |
| Drag listener / click floor | Move through the field |
| Arrow keys | Move the listener along the room's length (`x`) and width (`z`) in 0.1 m steps; hold `Shift` for 0.4 m steps |
| Find a node / corner buttons | Jump to a quiet plane or a pressure antinode |
| Listener height control | Explore floor-to-ceiling modes |
| Drag empty space | Orbit the room |
| Right-drag | Pan the camera |
| Scroll / pinch | Zoom |
| `W` / `A` / `S` / `D` | Explore with the camera; hold `Shift` to move faster |
| `C` | Toggle cinematic orbit |
| `R` | Reset the experiment; retain your audio opt-in |
| `/` | Hide or show the interface |
| `Escape` | Restore the interface or close the explainer |
| Header Sound off / Sound on button | Enable or mute the tone |

Keyboard shortcuts are ignored while typing in a number field. Native sliders keep their arrow-key adjustments; camera, reset, mode, and interface shortcuts still work while a slider has focus.

Tab to the room to use its keyboard controls, then Tab again to leave it. The canvas describes those controls for screen readers. The pressure legend explains both views in text, and a polite announcement follows changes of mode or listener pressure band without announcing every drag sample.

The live scene keeps one short teaching line beside the comparison; the longer explanation lives in **How it works**. Amber marks the room's pressure pattern, while the source-only view uses a cool palette. The mic's glow and the listener meter both follow the same local pressure amplitude as the tone. A quiet reading can also result from detuning, so it does not by itself identify a node.

## Mobile checks

Open the deployed lab on the phone, or run `npx vite --host 0.0.0.0` and open `http://<computer-LAN-address>:5173/standing-wave/` from a phone on the same Wi-Fi. `localhost` on the phone points to the phone itself.

- **Portrait and landscape:** rotate in both directions. Check that the room stays visible, the page has no sideways overflow, and notch/home-indicator areas do not cover controls. Scrub 25–200 Hz and tap all three mode buttons; the field and readings should respond together.
- **Mic versus orbit:** drag from the mint mic, including just beside its centre. Only the mic should move. Lift your finger, then drag empty space to orbit and pinch to zoom. Repeat after rotating and zooming out; a second finger must not steal an active mic drag.
- **Pressure and comparison:** use **Find a node** and **Try a corner**, then drag between them. Check the meter and mic glow change together. Switch **Speaker only** / **Room interference** and check the legend and pattern change with it.
- **Sound:** the page starts silent with **Sound off** in the sticky header. Confirm the button stays reachable while scrolling, tap it to enable sound, compare a node with a corner, then tap **Sound on** to mute. **Starting sound…** indicates a pending browser request. Low bass may be inaudible on phone speakers; headphones make this check clearer at a comfortable volume.
- **Background and return:** enable sound, switch apps or browser tabs, then return. Sound must stop while hidden and remain muted on return, showing **Sound off** until tapped again. Mute-on-hide is intentional; the browser test simulates the visibility event, so this OS-level check still needs a phone.
- **Short windows:** open DevTools below the scene or reduce a desktop window to 1440 × 420 / 1024 × 500; also try phone landscape with browser chrome visible. Adjust **Ear height**, **Find a node**, **Try a corner**, and the scene tools. Controls must not overlap; scroll the listener panel when its full desktop layout needs more space.
- **Safari on iPhone:** repeat every check above in Safari, including the first sound gesture, rotation, pinch, app switching, and muting. With VoiceOver, navigate the comparison, mode buttons, listener presets, and pressure legend; check that mode/band changes are announced. WebKit is not part of CI, so Chromium results do not certify Safari. Repeat the touch/performance checks on a mid-range Android phone; TalkBack should expose the same controls and pressure meaning.

Browser emulation cannot establish physical-device frame rate, thermal behavior, notch handling, or screen-reader output. Those checks remain part of release verification.

## What is real

The displayed room is **6.0 × 4.0 × 2.8 metres**. The model uses a sound speed of **343 m/s**, representative of air near room temperature.

For an ideal rectangular room with rigid boundaries, an axial pressure mode varies along one dimension. Its frequency and signed pressure shape are:

```text
f_n = n c / (2 L)
φ_n(s) = cos(n π s / L)
λ = c / f
```

Here `n` is the mode order, `L` is that room dimension in metres, and `s` is position along it. Each axial mode has pressure antinodes at its pair of opposing boundaries. Its nodal planes extend across the other walls. The first mode has one interior nodal plane; the second has two. Opposite signed lobes oscillate in opposite phase, while their quiet planes stay in place.

Mode labels use the order **(length, width, height)**: `(1, 0, 0)` varies once along the length, `(0, 1, 0)` across the width, and `(0, 0, 1)` vertically. World coordinates in the code are `x = length`, `y = height`, `z = width`.

Corners lie at the pressure antinodes of ideal rectangular-room modes. This helps explain why bass often builds up near boundaries. It does not mean that a corner is always the loudest location for every frequency in every real room.

## What is deliberately simplified

- **One isolated axial mode at a time.** The viewer chooses the nearest axial eigenfrequency in the 25–200 Hz catalogue. It does not add all modes together. For coincident frequencies, it chooses length before width before height; when two distinct frequencies are equally near, it chooses the lower frequency. For example, `(3, 0, 0)` and `(0, 2, 0)` both occur at 85.75 Hz; a real room can excite both at once. The selected pattern can therefore change when crossing the midpoint between eigenfrequencies.
- **Normalized modes.** Each mode has a peak amplitude of 1 at resonance. The fixed speaker sits near a corner. Its exact coupling to each mode, speaker directivity, and different peak strengths are omitted. This makes nodal patterns easy to compare; it is not a prediction of the speaker's complete room response.
- **Illustrative detuning.** A Lorentzian envelope with `Q = 12` reduces the selected mode's amplitude as you move away from its eigenfrequency. This is a smooth demonstration of resonance, not measured wall absorption:

  ```text
  gain = 1 / sqrt(1 + [2 Q (f - f_n) / f_n]²)
  amplitude = 0.02 + 0.98 × |φ_n| × gain
  ```

- **Nearly silent nodes.** A 2% amplitude floor avoids presenting mathematically perfect silence as a real-room guarantee. This is a chosen display and audio floor, not a simulated noise source.
- **Pressure amplitude, not air motion.** Glow and particles make the pattern visible. Brightness uses boosted contrast to keep quiet planes legible; use the relative-level meter for numerical readings. The animation is slowed for readability and is not vibrating at the actual acoustic frequency. Any visual phase or pulse is illustrative. The audio oscillator does use the chosen frequency.
- **Relative level, not SPL.** `20 log10(amplitude)` is displayed relative to an isolated on-resonance antinode, with a −40 dB display floor. There is no calibration to pascals, loudspeaker output, hearing sensitivity, or your playback volume. Loudness also depends on frequency and the listener's hearing.
- **The belief view removes the room.** It uses normalized, regularized distance falloff `1 / (1 + distance_in_metres)` to depict a source-only intuition. This is a simple visualization of spreading, not a full free-field loudspeaker model.
- **An empty rigid box.** No tangential or oblique modes, furniture, openings, frequency-dependent absorption, wall flex, transients, echoes, or reverberation are simulated. There is no FDTD or FEM solver.

These choices keep one relationship clear: **where you stand matters as much as which note is playing**.

## Sources

- [Daniel A. Russell, Penn State: Driving Room Modes — Source Location](https://www.acs.psu.edu/drussell/Demos/roommodes/driving.html): axial mode frequencies, pressure nodes and antinodes, rigid-boundary pressure maxima, and the importance of source location.
- [Purdue ME 513: Modes in a rectangular room](https://engineering.purdue.edu/ME513/animations/room.htm): a signed pressure-field illustration of rectangular-room acoustic modes.

All application geometry, materials, interface, copy, and effects are original. Reference sites informed interaction density and visual polish; no reference branding or assets are used.

The interface uses [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) and [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), bundled as unmodified variable TrueType fonts under the SIL Open Font License 1.1. Their copyright notices and complete licenses are included in `public/fonts/DM-Sans-OFL.txt` and `public/fonts/Manrope-OFL.txt`. See `public/fonts/README.md` for exact source files.

## Model checks

`src/acoustics.test.ts` checks known eigenfrequencies and wavelength units, rigid-boundary antinodes, central and higher-order nodes, axis/index conventions, coincident-mode selection, detuning bandwidth, bounded amplitudes, relative pressure decibels, and the difference between distance falloff and a far-wall antinode.
