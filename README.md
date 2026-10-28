# mtt-tool

A small calculator website for MTT. It runs in the browser, so anyone with the link can use it.

**Live page:** https://imndllnuri.github.io/mtt-tool/

## Status

Starter template. The formulas are **demo only**. The real MTT formulas are not added yet.

## How it works

| File | What it does |
| --- | --- |
| `index.html` | The page layout |
| `css/style.css` | Looks (phone first, light and dark mode) |
| `js/calc.js` | **The MTT maths.** Inputs and formulas live here |
| `js/app.js` | Builds the form from `calc.js`, shows results, history, share link |

To change the calculation, edit only `js/calc.js`:

- `FIELDS` = the input boxes (name, unit, default, min, max)
- `compute(values)` = the formulas

## Share a calculation

Press **Copy link**. The numbers are saved in the link (after the `#`). Whoever opens it sees the same numbers.
Nothing is sent to a server.

## Run on your computer

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Notes

- GitHub Pages hosts websites. It cannot run Electron (desktop apps).
  This page is plain HTML, CSS and JS, so it can be wrapped in Electron later if you want a desktop app.
- No build step. Push to `main` and the site updates in about a minute.
