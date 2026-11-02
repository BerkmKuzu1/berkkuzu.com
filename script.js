/* ==========================================================================
   berkkuzu.com — theme, nav, learning log
   No framework, no build step. Everything degrades to plain HTML if this
   file fails to load.
   ========================================================================== */

(function () {
    "use strict";

    var root = document.documentElement;

    /* ----------------------------------------------------------------------
       Theme. The stored choice is applied by a tiny inline script in <head>
       so the page never flashes the wrong palette; this only wires the button.
       ---------------------------------------------------------------------- */
    var themeBtn = document.querySelector(".theme-toggle");

    function systemTheme() {
        return window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light" : "dark";
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", function () {
            var current = root.getAttribute("data-theme") || systemTheme();
            var next = current === "dark" ? "light" : "dark";

            root.setAttribute("data-theme", next);
            themeBtn.setAttribute("aria-label",
                next === "dark" ? "Switch to light theme" : "Switch to dark theme");

            try {
                localStorage.setItem("theme", next);
            } catch (e) {
                /* Private mode: the toggle still works for this page view. */
            }
        });
    }

    /* ----------------------------------------------------------------------
       Mobile navigation
       ---------------------------------------------------------------------- */
    var navBtn = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");

    if (navBtn && nav) {
        navBtn.addEventListener("click", function () {
            var open = nav.getAttribute("data-open") === "true";
            nav.setAttribute("data-open", open ? "false" : "true");
            navBtn.setAttribute("aria-expanded", open ? "false" : "true");
        });

        /* Following a link should close the panel, not leave it hanging open
           behind the new page's scroll position. */
        nav.addEventListener("click", function (event) {
            if (event.target.closest("a")) {
                nav.setAttribute("data-open", "false");
                navBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

    /* ----------------------------------------------------------------------
       Text helpers
       ---------------------------------------------------------------------- */
    function esc(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /* A deliberately tiny subset of Markdown: `code`, **bold**, [text](url).
       Escaping happens first, so nothing in log.json can inject markup. */
    function withLinks(text) {
        return esc(text)
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
                function (match, label, url) {
                    return '<a href="' + url + '" target="_blank" rel="noopener">' +
                           label + "</a>";
                });
    }

    function formatDate(iso) {
        var parts = String(iso).split("-");
        if (parts.length !== 3) { return esc(iso); }

        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        var month = months[parseInt(parts[1], 10) - 1] || parts[1];

        return parts[2].replace(/^0/, "") + " " + month + " " + parts[0];
    }

    /* ----------------------------------------------------------------------
       Learning log
       ---------------------------------------------------------------------- */
    var logRoot = document.getElementById("log-list");
    var latestRoot = document.getElementById("log-latest");

    function renderBody(blocks) {
        if (!Array.isArray(blocks)) { return ""; }

        return blocks.map(function (block) {
            if (typeof block === "string") {
                return "<p>" + withLinks(block) + "</p>";
            }

            if (block && block.code) {
                return '<pre><code>' + esc(block.code) + "</code></pre>";
            }

            if (block && Array.isArray(block.list)) {
                return "<ul>" + block.list.map(function (item) {
                    return "<li>" + withLinks(item) + "</li>";
                }).join("") + "</ul>";
            }

            return "";
        }).join("");
    }

    function renderEntry(entry, full) {
        var tags = (entry.tags || []).map(function (tag) {
            return "<li>" + esc(tag) + "</li>";
        }).join("");

        var links = (entry.links || []).map(function (link) {
            return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener">' +
                   esc(link.label) + " &rarr;</a>";
        }).join("");

        var head =
            '<div class="log-meta">' +
                "<time datetime=\"" + esc(entry.date) + "\">" +
                    formatDate(entry.date) +
                "</time>" +
                (entry.tags && entry.tags.length
                    ? '<span aria-hidden="true">&middot;</span>' +
                      '<ul class="tags">' + tags + "</ul>"
                    : "") +
            "</div>" +
            '<h3><a href="log.html#' + esc(entry.id) + '">' +
                esc(entry.title) + "</a></h3>";

        if (!full) {
            return '<li class="log-entry">' + head +
                   '<div class="log-body"><p>' + withLinks(entry.summary || "") +
                   "</p></div></li>";
        }

        return '<li class="log-entry" id="' + esc(entry.id) + '">' + head +
               '<div class="log-body">' +
                   (entry.summary ? "<p>" + withLinks(entry.summary) + "</p>" : "") +
                   renderBody(entry.body) +
               "</div>" +
               (links ? '<div class="log-links">' + links + "</div>" : "") +
               "</li>";
    }

    function loadLog() {
        return fetch("assets/log.json", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) { throw new Error("log.json missing"); }
                return res.json();
            })
            .then(function (data) {
                var entries = (data && data.entries) || [];
                /* Newest first, whatever order the file happens to be in — one
                   less thing to get right by hand when adding an entry. */
                return entries.slice().sort(function (a, b) {
                    return String(b.date).localeCompare(String(a.date));
                });
            });
    }

    /* --- home page: the three most recent entries --- */
    if (latestRoot) {
        loadLog().then(function (entries) {
            /* Nothing to show yet: leave the placeholder that is already in the
               HTML rather than blanking the section. Real entries replace it
               the moment log.json has one. */
            if (!entries.length) { return; }

            latestRoot.innerHTML = entries.slice(0, 3).map(function (entry) {
                return renderEntry(entry, false);
            }).join("");
        }).catch(function () {
            /* Could not load at all — the placeholder stays put. */
        });
    }

    /* --- log page: full list, tag filter, search --- */
    if (logRoot) {
        var searchInput = document.getElementById("log-search");
        var chipsRoot = document.getElementById("log-tags");
        var countEl = document.getElementById("log-count");

        var all = [];
        var activeTag = "";
        var jumped = false;

        function matches(entry, query) {
            if (activeTag && (entry.tags || []).indexOf(activeTag) === -1) {
                return false;
            }
            if (!query) { return true; }

            var haystack = [
                entry.title,
                entry.summary,
                (entry.tags || []).join(" "),
                JSON.stringify(entry.body || "")
            ].join(" ").toLowerCase();

            return haystack.indexOf(query) !== -1;
        }

        function draw() {
            var query = (searchInput ? searchInput.value : "").trim().toLowerCase();
            var shown = all.filter(function (entry) { return matches(entry, query); });

            logRoot.innerHTML = shown.length
                ? shown.map(function (entry) { return renderEntry(entry, true); }).join("")
                : '<li class="empty-state">Nothing matches that filter yet.</li>';

            if (countEl) {
                countEl.textContent = shown.length === all.length
                    ? all.length + (all.length === 1 ? " entry" : " entries")
                    : shown.length + " of " + all.length;
            }

            /* Re-apply the URL fragment once: the target element only exists
               after the first draw. Doing it on every draw would yank the page
               around while someone is typing in the search box. */
            if (!jumped && window.location.hash.length > 1) {
                var target = document.getElementById(window.location.hash.slice(1));
                if (target) {
                    jumped = true;
                    target.scrollIntoView();
                }
            }
        }

        function buildChips() {
            var seen = [];
            all.forEach(function (entry) {
                (entry.tags || []).forEach(function (tag) {
                    if (seen.indexOf(tag) === -1) { seen.push(tag); }
                });
            });
            seen.sort();

            chipsRoot.innerHTML = seen.map(function (tag) {
                return '<li><button type="button" class="chip" aria-pressed="false" ' +
                       'data-tag="' + esc(tag) + '">' + esc(tag) + "</button></li>";
            }).join("");

            chipsRoot.addEventListener("click", function (event) {
                var button = event.target.closest(".chip");
                if (!button) { return; }

                var tag = button.getAttribute("data-tag");
                activeTag = activeTag === tag ? "" : tag;

                chipsRoot.querySelectorAll(".chip").forEach(function (chip) {
                    chip.setAttribute("aria-pressed",
                        chip.getAttribute("data-tag") === activeTag ? "true" : "false");
                });

                draw();
            });
        }

        loadLog().then(function (entries) {
            all = entries;

            if (!all.length) {
                logRoot.innerHTML =
                    '<li class="empty-state">No entries yet — first one soon.</li>';
                if (countEl) { countEl.hidden = true; }
                return;
            }

            if (chipsRoot) { buildChips(); }
            draw();
        }).catch(function () {
            logRoot.innerHTML =
                '<li class="empty-state">Could not load the log. ' +
                'If you are opening this file directly, run a local server instead ' +
                '(<code>python -m http.server</code>).</li>';
        });

        if (searchInput) {
            searchInput.addEventListener("input", draw);
        }
    }

    /* ----------------------------------------------------------------------
       Activity total — written by .github/workflows/contributions.yml
       ---------------------------------------------------------------------- */
    /* An <img> is opaque to page CSS, so the graph's colours would stay frozen
       at whatever the build baked in. Swapping it for the SVG document itself
       lets .c0–.c4 pick up the current theme's tokens. The <img> stays in the
       markup as the no-JS fallback. */
    var graphImg = document.querySelector(".activity-graph img");

    if (graphImg && window.DOMParser) {
        fetch(graphImg.getAttribute("src"), { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) { throw new Error("no contributions.svg"); }
                return res.text();
            })
            .then(function (text) {
                var doc = new DOMParser().parseFromString(text, "image/svg+xml");
                var svg = doc.documentElement;

                if (!svg || svg.nodeName.toLowerCase() !== "svg") { return; }

                /* Let CSS drive the size; the viewBox carries the aspect ratio. */
                svg.removeAttribute("width");
                svg.removeAttribute("height");
                svg.setAttribute("role", "img");

                graphImg.replaceWith(svg);
            })
            .catch(function () {
                /* The <img> is already on the page and handles its own error. */
            });
    }

    var totalEl = document.getElementById("activity-total");

    if (totalEl) {
        fetch("assets/contributions.json", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) { throw new Error("no contributions.json"); }
                return res.json();
            })
            .then(function (data) {
                if (typeof data.total !== "number") { return; }

                totalEl.innerHTML =
                    "<strong>" + data.total.toLocaleString("en-US") +
                    "</strong> contributions in the last year &mdash; " +
                    '<a href="https://github.com/BerkmKuzu1" target="_blank" ' +
                    'rel="noopener">@BerkmKuzu1</a>';
            })
            .catch(function () {
                /* The static fallback already in the HTML stays as-is. */
            });
    }

    /* ----------------------------------------------------------------------
       Project comments — giscus, on this repository's GitHub Discussions
       ---------------------------------------------------------------------- */
    /* One giscus frame serves every project: a chip swaps the thread with a
       setConfig message instead of reloading the frame. Nothing is fetched
       from giscus.app until the section is about to scroll into view, or a
       link points straight at a thread (projects.html?thread=vhdl-2024). Without
       a category id there is nothing to load, so the plain link stays. */
    var threadRoot = document.getElementById("comment-thread");
    var topicsRoot = document.getElementById("comment-topics");

    if (threadRoot && topicsRoot && threadRoot.getAttribute("data-category-id")) {
        var giscusOrigin = "https://giscus.app";
        var chips = Array.prototype.slice.call(topicsRoot.querySelectorAll(".chip"));
        var threads = chips.map(function (chip) {
            return chip.getAttribute("data-thread");
        });
        var canonical = document.querySelector('link[rel="canonical"]');
        var pageUrl = canonical ? canonical.href : location.href.split(/[?#]/)[0];

        /* What the frame should show. The term is the discussion's title on
           GitHub; description and backLink only go into its first post,
           written with the first comment. */
        var wanted = {};
        var loaded = false;
        var stale = false;

        function giscusTheme() {
            var theme = root.getAttribute("data-theme") || systemTheme();
            return theme === "light" ? "light" : "transparent_dark";
        }

        function sync() {
            var frame = threadRoot.querySelector("iframe.giscus-frame");
            if (frame) {
                frame.contentWindow.postMessage(
                    { giscus: { setConfig: wanted } }, giscusOrigin);
            }
        }

        function pick(thread) {
            wanted.term = "projects/" + thread;
            wanted.description = "Comments on " +
                chips[threads.indexOf(thread)].textContent + ".";
            wanted.backLink = pageUrl + "?thread=" + thread;

            chips.forEach(function (chip) {
                chip.setAttribute("aria-pressed",
                    chip.getAttribute("data-thread") === thread ? "true" : "false");
            });

            try {
                sessionStorage.setItem("comment-thread", thread);
            } catch (e) {
                /* Private mode: back from GitHub sign-in, the first thread opens. */
            }
        }

        function load() {
            if (loaded) { return; }
            loaded = true;

            var script = document.createElement("script");

            Object.keys(threadRoot.dataset).forEach(function (key) {
                script.dataset[key] = threadRoot.dataset[key];
            });
            script.dataset.term = wanted.term;
            script.dataset.theme = wanted.theme;
            script.src = giscusOrigin + "/client.js";
            script.crossOrigin = "anonymous";
            script.async = true;

            /* client.js builds the frame from the page's own description and
               URL, and rebuilds it with its first settings after a sign-out.
               giscus drops a message that arrives before it has rendered, so
               after every (re)load send the settings again once it speaks. */
            stale = true;
            script.addEventListener("load", function () {
                var frame = threadRoot.querySelector("iframe.giscus-frame");
                if (!frame) { return; }

                frame.addEventListener("load", function () {
                    stale = true;
                    sync();
                });
            });

            document.body.appendChild(script);
        }

        window.addEventListener("message", function (event) {
            if (event.origin === giscusOrigin && stale) {
                stale = false;
                sync();
            }
        });

        topicsRoot.addEventListener("click", function (event) {
            var chip = event.target.closest(".chip");
            if (!chip) { return; }

            var thread = chip.getAttribute("data-thread");
            pick(thread);
            /* The address now opens this thread, so it can be shared. */
            history.replaceState(null, "", "?thread=" + thread + "#comments");

            if (loaded) {
                sync();
            } else {
                load();
            }
        });

        /* Follow the theme toggle, and the system setting while no choice is
           stored. */
        function syncTheme() {
            wanted.theme = giscusTheme();
            sync();
        }

        if (window.MutationObserver) {
            new MutationObserver(syncTheme)
                .observe(root, { attributes: true, attributeFilter: ["data-theme"] });
        }

        var lightQuery = window.matchMedia("(prefers-color-scheme: light)");
        if (lightQuery.addEventListener) {
            lightQuery.addEventListener("change", syncTheme);
        } else if (lightQuery.addListener) {
            lightQuery.addListener(syncTheme);
        }

        /* After GitHub sign-in giscus comes back to #comment-thread with a
           ?giscus= session; reopen the thread the visitor was reading. */
        var query = new URLSearchParams(location.search);
        var linked = threads.indexOf(query.get("thread")) !== -1;
        var returning = query.has("giscus");
        var stored = null;

        try {
            stored = sessionStorage.getItem("comment-thread");
        } catch (e) {
            /* Nothing stored is fine: the first thread opens. */
        }

        wanted.theme = giscusTheme();
        pick(linked ? query.get("thread")
            : returning && threads.indexOf(stored) !== -1 ? stored
            : threads[0]);
        topicsRoot.hidden = false;

        if (linked || returning) {
            load();

            /* Jump like a #fragment does on load, rather than glide there. */
            if (linked) {
                root.style.scrollBehavior = "auto";
                topicsRoot.closest("section").scrollIntoView();
                root.style.scrollBehavior = "";
            }
        } else if ("IntersectionObserver" in window) {
            var commentsObserver = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) {
                    commentsObserver.disconnect();
                    load();
                }
            }, { rootMargin: "300px 0px" });
            commentsObserver.observe(threadRoot);
        } else {
            load();
        }
    }
}());
