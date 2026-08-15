/**
 * Builds assets/contributions.svg and assets/contributions.json from the
 * GitHub contribution calendar.
 *
 * Run by .github/workflows/contributions.yml on a daily schedule. The SVG is
 * committed to the repo, so the site serves it from its own origin — no
 * third-party image host, no tracking pixel, and it keeps working if any
 * external service disappears.
 *
 *   GH_LOGIN      GitHub username (default: BerkmKuzu1)
 *   GITHUB_TOKEN  any token that can read public contribution data
 *
 * Local run:  GITHUB_TOKEN=ghp_xxx node tools/build-contributions.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "assets");

const LOGIN = process.env.GH_LOGIN || "BerkmKuzu1";
const TOKEN = process.env.GITHUB_TOKEN;

/* Theme — must stay in step with the --accent ramp in style.css. */
const EMPTY = "#161b22";
const RAMP = ["#5c3a05", "#a35f02", "#ff9800", "#ffc166"];
const LABEL = "#9a9a9a";

/* Geometry, in SVG user units. */
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const PAD_LEFT = 30; // weekday labels
const PAD_TOP = 20; // month labels

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              date
              weekday
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar() {
  if (!TOKEN) {
    throw new Error("GITHUB_TOKEN is not set");
  }

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "berkkuzu.com-contribution-graph",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();

  if (body.errors?.length) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  if (!body.data?.user) {
    throw new Error(`No such user: ${LOGIN}`);
  }

  return body.data.user.contributionsCollection.contributionCalendar;
}

/**
 * GitHub buckets by quartile rather than by a fraction of the maximum, so a
 * single 40-commit day does not flatten every other day to the palest shade.
 * Returns a function mapping a day count to 0..4.
 */
function makeLevelFn(counts) {
  const nonzero = counts.filter((c) => c > 0).sort((a, b) => a - b);

  if (nonzero.length === 0) {
    return () => 0;
  }

  const at = (p) => nonzero[Math.min(nonzero.length - 1, Math.floor(nonzero.length * p))];
  const q1 = at(0.25);
  const q2 = at(0.5);
  const q3 = at(0.75);

  return (c) => {
    if (c <= 0) return 0;
    if (c <= q1) return 1;
    if (c <= q2) return 2;
    if (c <= q3) return 3;
    return 4;
  };
}

function monthLabels(weeks) {
  const labels = [];
  let lastMonth = -1;

  weeks.forEach((week, i) => {
    // firstDay is an ISO date; parse the month directly to stay TZ-independent.
    const month = Number(week.firstDay.slice(5, 7)) - 1;

    if (month !== lastMonth) {
      // Skip a label that would collide with the previous one or overflow.
      const prev = labels[labels.length - 1];
      if (!prev || i - prev.week >= 3) {
        labels.push({ week: i, text: MONTHS[month] });
      }
      lastMonth = month;
    }
  });

  return labels;
}

function buildSvg(calendar) {
  const weeks = calendar.weeks;
  const counts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
  const levelOf = makeLevelFn(counts);

  const width = PAD_LEFT + weeks.length * STEP;
  const height = PAD_TOP + 7 * STEP;

  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" role="img" ` +
      `aria-label="${calendar.totalContributions} GitHub contributions by ${LOGIN} in the last year">`
  );
  parts.push(
    `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,"Courier New",monospace;` +
      `font-size:9px;fill:${LABEL}}</style>`
  );

  for (const label of monthLabels(weeks)) {
    parts.push(
      `<text x="${PAD_LEFT + label.week * STEP}" y="${PAD_TOP - 8}">${label.text}</text>`
    );
  }

  // Mon / Wed / Fri, matching GitHub's own sparse labelling.
  for (const [row, text] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]]) {
    parts.push(
      `<text x="0" y="${PAD_TOP + row * STEP + CELL - 2}">${text}</text>`
    );
  }

  weeks.forEach((week, w) => {
    for (const day of week.contributionDays) {
      const level = levelOf(day.contributionCount);
      const fill = level === 0 ? EMPTY : RAMP[level - 1];
      const x = PAD_LEFT + w * STEP;
      const y = PAD_TOP + day.weekday * STEP;
      const plural = day.contributionCount === 1 ? "" : "s";

      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}">` +
          `<title>${day.contributionCount} contribution${plural} on ${day.date}</title>` +
          `</rect>`
      );
    }
  });

  parts.push("</svg>");
  return parts.join("");
}

async function main() {
  const calendar = await fetchCalendar();

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(resolve(OUT_DIR, "contributions.svg"), buildSvg(calendar) + "\n", "utf8");
  await writeFile(
    resolve(OUT_DIR, "contributions.json"),
    JSON.stringify(
      {
        login: LOGIN,
        total: calendar.totalContributions,
        updated: new Date().toISOString().slice(0, 10),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `Wrote assets/contributions.svg and assets/contributions.json ` +
      `(${calendar.totalContributions} contributions, ${calendar.weeks.length} weeks).`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
