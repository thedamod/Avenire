## Physics Simulation Module

Use this module for simulations where motion over time is the point: orbits, pendulums, waves, fields, energy exchange, and other systems with changing state. The output should feel like one purpose-built widget, not a collage of unrelated sections.

### Layout
- Put the main canvas on top.
- Put the explanation and controls beneath the canvas.
- Stack those sections vertically on mobile.
- Split them into two columns on wider screens.
- Left bottom column: a short explanation, one or two sentences max.
- Right bottom column: sliders, toggles, buttons, and live readouts.
- Use a second canvas only when the system genuinely benefits from a companion view such as phase space or energy.

### Canonical layout
```html
<div class="phys-sim-layout">
  <div class="phys-sim-canvas">
    <canvas id="sim"></canvas>
  </div>

  <div class="phys-sim-bottom">
    <div class="phys-sim-copy">
      <h2>Title</h2>
      <p>Short explanation.</p>
    </div>

    <div class="phys-sim-controls">
      <!-- sliders, toggles, buttons, readouts -->
    </div>
  </div>
</div>
<style>
  .phys-sim-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 1rem 0;
  }

  .phys-sim-canvas {
    height: clamp(320px, 55vh, 560px);
    min-width: 0;
  }

  .phys-sim-canvas canvas {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 8px;
    background: var(--color-background-secondary);
  }

  .phys-sim-bottom {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .phys-sim-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .phys-sim-copy h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 500;
    line-height: 1.2;
    color: var(--color-text-primary);
  }

  .phys-sim-copy p {
    margin: 0;
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-text-secondary);
  }

  .phys-sim-controls {
    background: var(--color-background-secondary);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  @media (min-width: 720px) {
    .phys-sim-layout {
      gap: 20px;
    }

    .phys-sim-bottom {
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      gap: 24px;
    }
  }
</style>
```

### Control rules
- Include sliders for almost all meaningful factors.
- Use toggles or buttons for mode switches, visibility, reset, pause, and demo controls.
- Do not rely on checkbox rendering. Use button-style toggles or segmented controls instead.
- Do not rely on KaTeX or math rendering in the widget. Use plain text labels, Unicode symbols, or simple inline text.
- Every control should expose a real model variable: `g`, `m`, `k`, length, damping, amplitude, frequency, charge, speed, separation, mass ratio, initial angle, and similar values.
- Round every displayed number with `Math.round()`, `.toFixed()`, or `toLocaleString()`.
- If a control changes a physical parameter, the user should be able to drag it directly.

### Scaling and navigation
- Fit the whole system into the canvas intelligently.
- If the content risks clipping, automatically reduce scale or recenter before the user notices.
- If there is any doubt about fit, add zoom in and zoom out buttons.
- Support dragging to pan when the scene is wider or taller than the view.
- Use those controls sparingly, but make them available whenever a simulation can grow beyond the default frame.
- Keep the main subject readable at all times; do not force the user to guess where the important object went.

### Complex visualizations
- For complex systems like the double pendulum, include a companion phase diagram.
- Let the user choose the phase axes instead of hard-coding them.
- Common axis choices include angle, angular velocity, position, momentum, energy, or any other state variables that make sense for the system.
- Keep the phase plot legible and synchronized with the main simulation.
- If the phase plot is not helping the explanation, leave it out.

### Visual stability
- Keep the simulation palette stable across wavelength, frequency, and parameter changes.
- Do not let the user’s choice leak into the surrounding app chrome or outer widget background.
- For YDSE and similar optics simulations, wavelength may change fringe spacing, intensity, or the appearance of the light itself, but it should not recolor the whole interface or make the widget feel detached from the app.
- Treat the widget chrome as constant and the physics as the only thing that changes.

### Simulation rules
- Represent state explicitly instead of hiding it in canvas globals.
- Use fixed-step integration. `requestAnimationFrame` drives rendering, not physics.
- Use RK4 for coupled or chaotic systems. Do not fall back to Euler for double pendulums, orbital mechanics, or anything sensitive to drift.
- Use Verlet only for simple orbit-style motion when it produces the cleanest result.
- Keep units consistent and label them in plain text.
- Expose the real control variables the user would actually want to adjust.
- Clamp extreme values so the sim never explodes into `NaN`.
- Include reset and pause controls when the system has memory or chaos.
- Add trails, phase plots, or envelope curves only when they help the explanation.
- Use `sendPrompt()` for follow-up actions that benefit from chat reasoning, not for deterministic UI filtering or arithmetic.

### Canvas rules
- Size the canvas to the available space and scene, then scale by `devicePixelRatio` for crisp rendering.
- Use `ResizeObserver` to reflow cleanly.
- Use `IntersectionObserver` or an equivalent visibility check to pause animation off-screen.
- Keep drawing code in CSS pixels after scaling the context.
- Use CSS variables for colors wherever possible.
- Draw the primary object, then supporting annotations, then labels.
- Avoid decorative effects that make the sim harder to read mid-stream.

### Common recipes

#### Kepler orbit
- Show the star at the true focus, not the center.
- Draw the planet, trail, optional velocity vector, and optional sweep area.
- Use eccentricity and speed controls.
- Add zoom and drag if the orbit can leave the frame.
- Let the user see how the orbit changes as the parameters change.

#### Double pendulum
- Show two arms, two bobs, and a fading trail for the second bob.
- RK4 is mandatory.
- Include damping, reset, pause, and sensitivity controls.
- Include a phase plot or second canvas.
- Let the user choose the phase axes, such as `θ1 vs θ2`, `θ1 vs ω1`, or `ω1 vs ω2`.
- If you include a chaos demo, use a ghost pendulum with a tiny initial offset and a different trail color.

#### Waves and harmonics
- Show superposition, standing-wave nodes and antinodes, or beat envelopes.
- Use frequency, amplitude, wavelength, or harmonic controls.
- Keep the visual language simple: curves, phase labels, and one or two highlight colors.

#### Fields and forces
- Show vector fields, trajectories, or force arrows derived from superposition.
- Let the user place or adjust sources when it materially improves understanding.
- Use field lines only if they are cleaner than arrows.

#### Energy views
- Pair the physical system with an energy panel when the conservation story matters.
- Show kinetic, potential, and total energy as bars or readouts.
- Make the total obvious: flat when ideal, decaying when damping is on.

### Typical outputs
- Orbit request: one main canvas with a focal star, moving body, trail, and a couple of toggles.
- Pendulum request: one main canvas with controlled motion, readouts, and phase/chaos support if relevant.
- Wave request: one canvas with layered curves and an envelope or node markers.
- Field request: one canvas with vectors or lines and placeable sources.

### What not to do
- Do not mix this module with the old “layout skeleton” plus separate “per-simulation specs” format.
- Do not turn the output into a generic dashboard with too many unrelated cards.
- Do not hide the state behind a library when a small handwritten integrator is enough.
- Do not use raw floats in labels.
- Do not add a second canvas unless it meaningfully changes the explanation.
- Do not use checkbox UI or KaTeX-dependent equation blocks in this module.
