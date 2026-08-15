# berkkuzu.com

Personal site of Berk Muammer Kuzu — <https://berkkuzu.com>

Plain HTML, CSS and JavaScript. No framework, no build step, no bundler.
GitHub Pages serves the repository root directly; `CNAME` points the custom
domain at it.

## Layout

```
index.html        Menu + Activity (GitHub contribution graph)
projects.html     Project cards
notes.html        Lecture notes and PDFs
about.html        Bio, skills, track, contact
404.html          Not-found page (GitHub Pages picks this up automatically)

style.css         All styling. Design tokens live in :root at the top.
script.js         Particle background + activity total
favicon.svg
robots.txt / sitemap.xml

assets/           Generated — do not edit by hand
  contributions.svg
  contributions.json

tools/
  build-contributions.mjs    Builds the contribution graph
.github/workflows/
  contributions.yml          Runs it daily
```

## The contribution graph

`assets/contributions.svg` is generated from the GitHub GraphQL contribution
calendar and committed to this repository, so the site serves it from its own
origin. No third-party image host and no tracker — if an external service goes
down, the graph still renders.

The workflow runs at 03:17 UTC daily, and can be triggered by hand from
**Actions → Contribution graph → Run workflow**.

To run it locally you need Node 20+ and a GitHub token with no special scopes
(public contribution data only):

```bash
GITHUB_TOKEN=ghp_xxx node tools/build-contributions.mjs
```

If the SVG is ever missing, the `onerror` handler on the `<img>` in
`index.html` hides the whole Activity section rather than leaving a broken
image on the page.

The palette in `tools/build-contributions.mjs` (`EMPTY`, `RAMP`) mirrors the
`--accent` ramp in `style.css`; change both together.

## Editing content

Adding a note or a project means copying an existing `<li>` block — each page
has a commented template at the bottom of its list showing the shape.

## Local preview

Any static server works, for example:

```bash
python -m http.server 8000
```

then open <http://localhost:8000>.
