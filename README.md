# Leonida Map: GTA VI Interactive Map

A fan-made interactive map for Grand Theft Auto VI. It's a static site with no build step and no backend.

**Live:** https://maumit.github.io/gta6-interactive-map/

## Features

- Pan and zoom the map. The current view is kept in the URL, so you can share a link to any spot.
- Category tree with Locations, Collections and Activities sections, plus groups and types. Each level has **All / None / Only** buttons.
- Section toggles at the top of the map, a "Jump to type…" menu, and county shortcuts.
- Found tracking with a progress bar. The Complete and Incomplete filters, plus **Hide found**, show what's left to collect.
- Notes on any marker, and an **Only with notes** filter.
- **My markers**: drop your own pins, name them, drag them around and add notes.
- Search across marker names, types, descriptions and your notes.
- Export and import your progress as JSON, or reset it.
- Light and dark themes, fullscreen mode, and a mobile drawer layout.
- Progress is stored in your browser's `localStorage`. There's no account and nothing is uploaded.

## Important: placeholder data

- `assets/leonida.svg` is an **original stylized drawing**. It is not Rockstar's map art.
- `data/markers.js` holds **placeholder positions** that were scattered around towns, roads and coasts so the UI has something to show. They are **not** real in-game locations.

## Adding real data

Edit `data/markers.js`. Each marker looks like this:

```js
{ "id": "bank-1", "type": "bank", "title": "Bank #1", "desc": "Downtown Vice City", "lat": 440.2, "lng": 735.8 }
```

- `lng` is the x position (0 to 1000, left to right) and `lat` is `1000 - y` (0 at the bottom).
- Hover over the map and the bottom-left corner shows the **x / y** of your cursor. Use `lat = 1000 - y`.
- A quick way to collect coordinates is to drop a **My marker** where something is, then use **Export**. The JSON contains the marker's `lat` and `lng`.
- `type` must match a type `id` in `sections`. Add new types there, each with a name and an emoji icon.

To swap in a different base map image, replace `assets/leonida.svg` (a PNG or JPG works too). Then update the `imageOverlay` path in `js/app.js`, and update `meta.size` if the image isn't square.

To regenerate the drawn map and the placeholder markers, run:

```
python tools/generate.py
```

**Warning:** this overwrites `data/markers.js`.

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000. You can also just open `index.html` directly, because the site doesn't need a server.

## Credits

Built with [Leaflet](https://leafletjs.com/). This is an unofficial fan project and isn't affiliated with Rockstar Games or Take-Two Interactive. Grand Theft Auto is a trademark of Take-Two Interactive.
