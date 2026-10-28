# mtt-tool

An MTT cell-viability calculator that looks like the lab Excel sheet. It runs in the browser, so anyone with the link can use it.

**Live page:** https://imndllnuri.github.io/mtt-tool/

## What it does

You type or paste plate-reader numbers (OD). The page does the rest:

1. reading − blank = corrected OD
2. control average = the 100% reference
3. corrected OD ÷ reference × 100 = % viability of each well
4. per group: mean, SD, %RSD, N, SEM, mean OD
5. dose-response chart with a straight-line fit (equation and R²)

There is one tab per sheet (like Excel). Each sheet has 8 groups × 3 wells and 3 readings ("Okuma").

## Using it

- **Paste from Excel:** copy a block (for example `B2:Y4`), click the first box of the readings, paste. Decimal commas (`2,175`) work.
- **Enter** moves down a box. **Shift+Enter** moves up.
- **Copy link** puts the current sheet in the link. Whoever opens it gets a copy as a new tab.
- **Save file / Open file** move all sheets between computers (JSON).
- **Summary CSV** downloads the summary table.
- Sheets are saved in your own browser (localStorage). Nothing is sent to a server.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout and the in-page guide |
| `css/style.css` | Looks (phone first, light and dark mode) |
| `js/calc.js` | **All the maths.** Pure functions, no page code |
| `js/app.js` | Builds the sheet, handles typing / paste / sharing, draws the chart |

## Differences from the Excel sheet (BT_24.xlsx)

The Excel formulas were read cell by cell. Every computed cell matches Excel, except these on purpose:

| Excel | This page | Why |
| --- | --- | --- |
| `D25:D32` (SD) read shifted ranges: D25 reads the 1 nM wells, D30 the control, D31/D32 reach into empty and header rows | SD of each group's own 9 wells | The formula was copied down and its range moved. %RSD (`E`) and SEM (`G`) use SD, so they were off too |
| `D18` is a typed number and is the divisor | Default: control average. A fixed value is still available | The typed number is not the control average of the sheet, so control wells came out at about 75% instead of 100% |
| Chart X values are text (`'0.1'`, `'0.3'`), so Excel plots positions 1 to 8 | X is the real concentration. Log scale available | The trendline in Excel was fitted to positions, not concentrations |
| Car sheet: `H25:H31` ("Conct Avr") runs 60 → 0.1 nM, but column B runs 0 → 60 nM, so each value sits next to the wrong concentration | Mean OD is calculated per group | The column was probably pasted from the Doco layout (which is in reverse order) |
| An empty well counts as 0 | An empty well is skipped, N shows how many wells have numbers | |
| Header `Conc(uL)` | Unit you can edit (nM) | The groups are in nM |

## Run on your computer

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Notes

- GitHub Pages hosts websites. It cannot run Electron (desktop apps).
  This is plain HTML, CSS and JS, so it can be wrapped in Electron later.
- No build step. Push to `main` and the site updates in about a minute.
- Use relative paths only (the site lives under `/mtt-tool/`).
