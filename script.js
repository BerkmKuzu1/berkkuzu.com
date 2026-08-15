/* ==========================================================================
   berkkuzu.com — background particles + activity panel
   ========================================================================== */

(function () {
    "use strict";

    /* ----------------------------------------------------------------------
       Particle field
       ---------------------------------------------------------------------- */
    const canvas = document.getElementById("particleCanvas");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (canvas && canvas.getContext) {
        const ctx = canvas.getContext("2d");

        let particles = [];
        let frameId = null;
        let width = 0;
        let height = 0;

        /* The canvas is sized by CSS (30% on desktop, 100% on mobile), so read
           the rendered box rather than recomputing it from innerWidth. Scaling
           the backing store by devicePixelRatio keeps the dots crisp on
           high-DPI screens. */
        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;

            width = canvas.clientWidth;
            height = canvas.clientHeight;

            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function Particle() {
            this.size = Math.random() * 2 + 0.5;
            this.speedY = Math.random() * 0.5 + 0.2;
            this.x = Math.random() * width;
            this.y = Math.random() * height;
        }

        Particle.prototype.update = function () {
            this.y += this.speedY;

            if (this.y > height) {
                this.y = -this.size;
                this.x = Math.random() * width;
            }
        };

        Particle.prototype.draw = function () {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        };

        /* Roughly one particle per 12k CSS pixels, clamped, so a narrow strip
           on a laptop and a full-width phone screen end up at similar density
           instead of the fixed 60 the old version used. */
        function particleCount() {
            const target = Math.round((width * height) / 12000);
            return Math.min(120, Math.max(25, target));
        }

        function init() {
            particles = [];
            const n = particleCount();
            for (let i = 0; i < n; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = "rgba(255, 152, 0, 0.4)";

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }

            frameId = window.requestAnimationFrame(animate);
        }

        function start() {
            if (frameId === null && !reduceMotion.matches) {
                frameId = window.requestAnimationFrame(animate);
            }
        }

        function stop() {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
                frameId = null;
            }
        }

        resizeCanvas();
        init();
        start();

        /* Debounced: maximising or restoring a window fires resize dozens of
           times, and rebuilding the particle array on each one is wasted work. */
        let resizeTimer = null;
        window.addEventListener("resize", function () {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () {
                resizeCanvas();
                init();
            }, 150);
        });

        /* Do not burn battery animating a tab nobody is looking at. */
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        });

        /* React live if the OS motion preference is toggled. */
        const onMotionChange = function () {
            if (reduceMotion.matches) {
                stop();
                ctx.clearRect(0, 0, width, height);
            } else {
                start();
            }
        };

        if (typeof reduceMotion.addEventListener === "function") {
            reduceMotion.addEventListener("change", onMotionChange);
        } else if (typeof reduceMotion.addListener === "function") {
            reduceMotion.addListener(onMotionChange); // Safari < 14
        }
    }

    /* ----------------------------------------------------------------------
       Activity total — written by .github/workflows/contributions.yml
       ---------------------------------------------------------------------- */
    const totalEl = document.getElementById("activity-total");

    if (totalEl && typeof window.fetch === "function") {
        fetch("assets/contributions.json", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) { throw new Error("no contributions.json"); }
                return res.json();
            })
            .then(function (data) {
                if (typeof data.total !== "number") { return; }

                const count = data.total.toLocaleString("en-US");
                totalEl.innerHTML =
                    "<strong>" + count + "</strong> contributions in the last year &mdash; " +
                    '<a href="https://github.com/BerkmKuzu1" target="_blank" rel="noopener">@BerkmKuzu1</a>';
            })
            .catch(function () {
                /* Workflow has not run yet, or the file is missing.
                   The static fallback already in the HTML stays as-is. */
            });
    }
}());
