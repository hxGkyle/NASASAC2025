# Meteor Madness

Meteor Madness is a hackathon-friendly interactive sandbox that visualises the potential impact footprint of a meteoroid entry using NASA CNEOS fireball data. Tune key parameters, drop the impact point on a live map, and watch a dual-view direction indicator show how entry angles steer the blast footprint.

## Features
- Leaflet-powered map with click-to-place impact location, animated damage rings, and a directional arrow at the ground impact point.
- Canvas-based compass and profile indicator that animates azimuth and elevation, linked to the physics model.
- Exponential atmospheric-loss model that attenuates ground energy with entry angle, size, mass, and speed.
- NASA Fireball API sampler with offline fallback to bundled sample data.
- Lightweight state store keeping controls, model, maps, and visuals in sync.

## Quick Start
1. Serve the project with any static file server. Example using `npx`:
   ```bash
   npx serve .
   ```
2. Open the reported URL (defaults to http://localhost:3000). Click the map to position an impact, tweak parameters in the control panel, or load a NASA sample event.

> **Tip:** Because the app calls the live CNEOS API, ensure your browser session can reach https://ssd-api.jpl.nasa.gov. If offline, the sampler falls back to bundled JSON data.

## Architecture
```
meteor-madness/
|-- index.html            # page scaffolding, CDN dependencies
|-- js/
|   |-- state.js           # minimal reactive store shared by modules
|   |-- datasource.js      # NASA API sampler + offline fallback
|   |-- model.js           # physics approximations + risk classification
|   |-- mapview.js         # Leaflet map, hit-zone circles, direction arrow
|   |-- direction-indicator.js # canvas-based compass/profile widget
|   |-- controls.js        # parameter form, outputs, button wiring
|   |-- app.js             # module orchestration and lifecycle glue
|-- css/style.css         # thematic styling, layout
|-- data/sample.json      # curated fallback fireball events
|-- docs/
|   |-- screenshot-1.png   # placeholder for hackathon capture
|   |-- demo-notes.md      # runbook for the <30s demo video
|-- README.md
|-- LICENSE
```

### Model Overview & Limits
| Quantity | Formula | Notes |
| --- | --- | --- |
| Mass | m = (4/3) * pi * r^3 | Prefers direct input; otherwise derives from diameter (density 3300 kg/m^3) or NASA energy |
| Entry energy | E0 = 0.5 * m * v0^2 | v0 converts velocity to m/s and clamps to 11?72 km/s |
| Atmospheric loss | f(phi) = exp(-K / sin phi) | K = Cd * A * rho0 * H / m with Cd=1.0, rho0=1.225 kg/m^3, H=8500 m |
| Ground energy | E_ground = E0 * f(phi) | Uses h_top = 80 km as the atmospheric ceiling |
| TNT equivalent | TNT = E_ground / 4.184e9 | Ton TNT approximation |
| Damage radii | R = k * E_ground^(1/3) | k1=0.05, k2=0.10, k3=0.20 (meters) |
| Risk level | Low < 10^2 t TNT < Medium < 10^4 t TNT <= High | Matches UI thresholds |



**Limitations**
- Ignores atmospheric ablation, fragmentation, and ground material response.
- Radii scaling is a heuristic (cube-root law) and not site-specific.
- Drag coefficient is fixed at Cd = 1.0 for this demo run.
- API sampling favours high-energy events for dramatic visualisation.

## Data Attribution
- https://ssd-api.jpl.nasa.gov/fireball.api
- https://cneos.jpl.nasa.gov/fireballs/
- https://www.usgs.gov/3d-elevation-program

## Demo Outline
See docs/demo-notes.md for a 30s walkthrough covering parameter tweaks, impact zone animation, and interpreting the risk readout.

## License
Released under the MIT License - see LICENSE for details.


