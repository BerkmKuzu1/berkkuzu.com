# berkkuzu.com

Personal site of Berk Muammer Kuzu — <https://berkkuzu.com>

Plain HTML, CSS and JavaScript. No framework, no build step, no bundler.
GitHub Pages serves the repository root directly; `CNAME` points the custom
domain at it.

## Layout

```
index.html        Hero, latest log entries, selected projects, activity graph
log.html          Learning log — rendered from assets/log.json
projects.html     Project cards
notes.html        Lecture notes and PDFs
about.html        Bio, skills, track, contact
404.html          Not-found page (GitHub Pages picks this up automatically)

style.css         All styling. Design tokens live in :root at the top.
script.js         Theme toggle, mobile nav, log rendering, activity panel
robots.txt / sitemap.xml

Berk_Muammer_Kuzu.png   Portrait — used on the home hero and the About page
blogic.png              Source: the team badger on white
blogic.jpeg             Source: the full team logo, badger + wordmark

assets/           Generated — do not edit by hand
  badger.png                 badger, background knocked out
  favicon.png                badger on a dark tile
  og.jpg                     social card
  contributions.svg  contributions.json
  log.json                   <- EXCEPTION: this one you DO edit

tools/
  build_badger.py            Builds badger.png, favicon.png, og.jpg
  build-contributions.mjs    Builds the contribution graph (Node)
.github/workflows/
  contributions.yml          Runs the graph build daily
```

---

## Log'a yeni kayıt eklemek

Tek yapman gereken **`assets/log.json`** dosyasını açıp `entries` listesinin
başına yeni bir blok eklemek. HTML'e dokunmuyorsun, sayfa kendi kendine
çiziyor.

```json
{
  "id": "kisa-slug-adres-icin",
  "date": "2026-08-20",
  "title": "Başlık",
  "tags": ["Verilog", "FPGA"],
  "summary": "Tek cümlelik özet — anasayfada bu görünür.",
  "body": [
    "Düz paragraf. `kod`, **kalın** ve [link](https://ornek.com) çalışır.",
    { "lang": "verilog", "code": "assign y = a & b;" },
    { "list": ["madde bir", "madde iki"] }
  ],
  "links": [{ "label": "Repo", "url": "https://github.com/..." }]
}
```

- `id` adres çubuğunda kullanılır: `log.html#kisa-slug-adres-icin`
- `date` `YYYY-AA-GG` formatında. Sıralamayla uğraşma, sayfa kendi sıralar.
- `body`, `links` ve `tags` isteğe bağlı — sadece `summary` de yeterli.
- Etiket filtreleri `tags` alanlarından otomatik üretilir.

Commit'leyip push'ladığında yayında. Başka adım yok.

**Dikkat:** şu an dosyada 3 tane örnek kayıt var (FSM encoding, clock enable,
UART). Bunlar başlangıç içeriği — kendi yazdıklarınla değiştir ya da sil.

---

## Görseller

| Sitede gördüğün | Dosya |
|---|---|
| Home ve About'taki fotoğraf | `Berk_Muammer_Kuzu.png` (repo kökü) |
| Üstteki logo | `assets/badger.png` |
| Sekme ikonu | `assets/favicon.png` |
| Link paylaşınca çıkan kart | `assets/og.jpg` |

**Fotoğrafı değiştirmek:** yeni fotoğrafı `Berk_Muammer_Kuzu.png` adıyla
üzerine kaydet. Başka hiçbir yere dokunma.

**Logoyu değiştirmek:** yeni logoyu `blogic.png` adıyla (beyaz zeminli olabilir)
repo köküne kaydet, sonra:

```bash
pip install pillow
python tools/build_badger.py
```

`tools/build_badger.py` beyaz zemini şeffaflaştırır, kırpar ve üç dosyayı da
(`badger.png`, `favicon.png`, `og.jpg`) yeniden üretir.

Beyazı parlaklık eşiğiyle değil, dört köşeden içeri doğru flood fill ile
siliyor — eşik kullansaydı porsuğun sırtındaki beyaz şeridi ve yüzündeki beyazı
da yerdi. Flood fill koyu konturda durduğu için sadece kenara bağlı gerçek
arka plan gidiyor.

## The contribution graph

`assets/contributions.svg` is generated from the GitHub GraphQL contribution
calendar and committed to this repository, so the site serves it from its own
origin. No third-party image host and no tracker.

The workflow runs at 03:17 UTC daily, and can be triggered by hand from
**Actions → Contribution graph → Run workflow**.

To run it locally you need Node 20+ and a GitHub token with no special scopes
(public contribution data only):

```bash
GITHUB_TOKEN=ghp_xxx node tools/build-contributions.mjs
```

The cells carry `c0`–`c4` classes rather than baked-in fills. `script.js`
inlines the SVG so those classes pick up the `--cell-*` tokens from
`style.css` and follow the light/dark theme; the `<img>` in `index.html` is the
no-JS fallback and carries its own palette inside the SVG.

If the SVG is ever missing, the `onerror` handler on that `<img>` hides the
whole Activity section rather than leaving a broken image on the page.

## Editing other content

Adding a note or a project means copying an existing `<li>` block — each page
has a commented template next to its list showing the shape.

## Local preview

Any static server works — the log fetches `assets/log.json`, so opening the
files directly with `file://` will not work.

```bash
python -m http.server 8080
```

then open <http://localhost:8080>.
