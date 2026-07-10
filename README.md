# Toolkino Minoru

Personal utility suite for [TazunaBot](https://github.com/) work. Local folder name: **TazunaTools**.

## Tools

| Tool | Path | Purpose |
|------|------|---------|
| Condition Converter | `/converter/` | Raw skill conditions → English |
| Event Formatter | `/formatter/` | Event text → `supporter.json` objects |
| Image Quiz Cropper | `/cropper/` | Multi-box crop + umaguesser JSON |
| Wheelspin | `/wheelspin/` | Racecourse / track / uma / custom wheels |
| Skill Visualizer | `/visualizer/` | CM + map skill activation preview |

## Local preview

Any static server from the repo root:

```bash
npx --yes serve .
```

Then open `http://localhost:3000` (or the port shown).

## GitHub Pages

1. Create a GitHub repo and push this project.
2. Settings → Pages → Deploy from branch → `main` / root (or `/docs` if you move files).
3. Site will be at `https://<user>.github.io/<repo>/`.

A `.nojekyll` file is included so GitHub Pages serves `_` paths and raw JSON without Jekyll filtering.

## Data

Copied from TazunaDiscordBot for offline use:

- `data/conditions.json` — converter rules
- `data/maps.json`, `data/champsmeet.json`, `data/skill.json` — visualizer
- `data/lists.json` — uma names for wheelspin

Refresh these when the bot assets change.

## Design

Stitch prototypes live in `design/` (Derby Terminal system: turf green `#54e98a`, Geist + Space Mono).
