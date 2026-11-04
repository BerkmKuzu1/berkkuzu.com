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
    /* Every project card whose <li> carries data-thread gets a Comments
       button. It opens one shared panel under the card's row and loads that
       project's thread into it; nothing is fetched from giscus.app before
       that, unless a link opens a thread directly (projects.html?thread=
       vhdl-2024). The thread is the discussion titled projects/<data-thread>
       on GitHub, so never rename a key that has comments. */
    var commentCards = Array.prototype.slice.call(
        document.querySelectorAll(".project-grid > li[data-thread]"));

    if (commentCards.length) {
        var giscusOrigin = "https://giscus.app";
        /* From https://giscus.app; copied onto client.js's script tag. */
        var giscusConfig = {
            repo: "BerkmKuzu1/berkkuzu.com",
            repoId: "R_kgDORfZeew",
            category: "Announcements",
            categoryId: "DIC_kwDORfZee84DKP2W",
            mapping: "specific",
            strict: "1",
            reactionsEnabled: "1",
            emitMetadata: "0",
            inputPosition: "top",
            lang: "en"
        };
        var canonical = document.querySelector('link[rel="canonical"]');
        var pageUrl = canonical ? canonical.href : location.href.split(/[?#]/)[0];

        var panel = document.createElement("li");
        panel.className = "comment-panel";
        panel.id = "comment-panel";
        panel.hidden = true;
        panel.innerHTML =
            '<div class="comment-panel-head">' +
                "<h3></h3>" +
                '<button type="button" class="icon-btn" aria-label="Close comments">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
                    '<path d="M6 6l12 12M18 6L6 18"/></svg>' +
                "</button>" +
            "</div>" +
            '<div class="giscus comment-thread" id="comment-thread"></div>';

        var panelTitle = panel.querySelector("h3");
        var closeButton = panel.querySelector("button");
        var threadRoot = panel.querySelector(".giscus");

        var toggles = commentCards.map(function (li) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "comments-toggle";
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-controls", "comment-panel");
            button.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
                'aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7' +
                'l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>Comments' +
                '<svg class="comments-chevron" viewBox="0 0 24 24" fill="none" ' +
                'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
                'stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
            li.appendChild(button);
            return button;
        });

        /* What the frame should show. The term is the discussion's title on
           GitHub; description and backLink only go into its first post,
           written with the first comment. */
        var wanted = {};
        var openCard = null;
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

        function projectName(li) {
            var heading = li.querySelector("h3");
            return heading ? heading.textContent.trim() : li.getAttribute("data-thread");
        }

        /* A fresh frame for each project: moving a live frame to another card
           would reload it anyway, and on the old thread first. */
        function mount(li) {
            var thread = li.getAttribute("data-thread");
            var script = document.createElement("script");

            wanted.term = "projects/" + thread;
            wanted.description = "Comments on " + projectName(li) + ".";
            wanted.backLink = pageUrl + "?thread=" + thread;
            wanted.theme = giscusTheme();

            threadRoot.textContent = "";

            Object.keys(giscusConfig).forEach(function (key) {
                script.dataset[key] = giscusConfig[key];
            });
            script.dataset.term = wanted.term;
            script.dataset.theme = wanted.theme;
            script.src = giscusOrigin + "/client.js";
            script.crossOrigin = "anonymous";
            /* Run in order, so a quick second click cannot lose to the first. */
            script.async = false;

            /* client.js builds the frame from the page's own description and
               URL, and rebuilds it with its first settings after a sign-out.
               giscus drops a message that arrives before it has rendered, so
               after every (re)load send the settings again once it speaks. */
            stale = true;
            script.addEventListener("load", function () {
                var frame = threadRoot.querySelector("iframe.giscus-frame");

                script.remove();
                if (!frame) { return; }

                frame.addEventListener("load", function () {
                    stale = true;
                    sync();
                });
            });

            document.body.appendChild(script);
        }

        function show(li) {
            if (li !== openCard) {
                mount(li);
                openCard = li;
            }

            panelTitle.textContent = "Comments on " + projectName(li);
            /* Putting the panel back where it already is would reload its frame. */
            if (li.nextElementSibling !== panel) { li.after(panel); }
            panel.hidden = false;

            toggles.forEach(function (button, i) {
                button.setAttribute("aria-expanded", commentCards[i] === li ? "true" : "false");
            });
        }

        function hide() {
            panel.hidden = true;
            toggles.forEach(function (button) {
                button.setAttribute("aria-expanded", "false");
            });
            history.replaceState(null, "", location.pathname);
        }

        commentCards.forEach(function (li, i) {
            toggles[i].addEventListener("click", function () {
                if (!panel.hidden && li === openCard) {
                    hide();
                    return;
                }

                /* The address now opens this thread, so it can be shared, and
                   giscus brings people back to it after they sign in. */
                history.replaceState(null, "", "?thread=" + li.getAttribute("data-thread"));
                show(li);
                panel.scrollIntoView({ block: "nearest" });
            });
        });

        closeButton.addEventListener("click", function () {
            hide();
            toggles[commentCards.indexOf(openCard)].focus();
        });

        window.addEventListener("message", function (event) {
            if (event.origin === giscusOrigin && stale) {
                stale = false;
                sync();
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

        var query = new URLSearchParams(location.search);
        var linked = commentCards.filter(function (li) {
            return li.getAttribute("data-thread") === query.get("thread");
        })[0];

        /* Back from GitHub sign-in (?giscus=), client.js has to run or the
           session is lost; giscus returns to the thread it was opened on. */
        if (!linked && query.has("giscus")) { linked = commentCards[0]; }

        if (linked) {
            show(linked);

            /* Jump like a #fragment does on load, rather than glide there. */
            root.style.scrollBehavior = "auto";
            linked.scrollIntoView();
            root.style.scrollBehavior = "";
        }
    }
}());
