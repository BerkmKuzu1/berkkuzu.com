/* ui.js - pieces shared by the VHDL pages: element builder, VHDL highlighting and the
   code editor (a textarea over a highlighted <pre>). */
(function (G) {
'use strict';
function h(t, a, ...kids) {
    const e = document.createElement(t);
    if (a) for (const [k, v] of Object.entries(a)) {
        if (v === null || v === undefined || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'html') e.innerHTML = v;
        else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
}

/* ---------- VHDL highlighting */
const KW = new Set(('abs after alias all and architecture array assert attribute begin block body buffer case component configuration constant downto else elsif end entity exit file for function generate generic if impure in inout is library loop map mod nand new next nor not null of on open or others out package port process pure range record rem report return rol ror select severity signal sla sll sra srl subtype then to type until use variable wait when while with xnor xor').split(' '));
const TY = new Set(['std_logic', 'std_ulogic', 'std_logic_vector', 'std_ulogic_vector', 'unsigned', 'signed', 'integer', 'natural', 'positive', 'boolean', 'bit', 'bit_vector', 'string', 'time', 'rising_edge', 'falling_edge', 'to_integer', 'to_unsigned', 'to_signed', 'resize', 'shift_left', 'shift_right', 'ieee', 'work', 'std']);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function hl(code) {
    let out = '';
    const re = /(--[^\n]*)|((?:\d*[us]?[bBoOxXdD])?"[^"\n]*")|('[^'\n]')|(\b\d[\d_]*\b)|([A-Za-z]\w*)|([\s\S])/g;
    let m;
    while ((m = re.exec(code))) {
        if (m[1]) out += `<span class="hc">${esc(m[1])}</span>`;
        else if (m[2]) out += `<span class="hs">${esc(m[2])}</span>`;
        else if (m[3]) out += `<span class="hs">${esc(m[3])}</span>`;
        else if (m[4]) out += `<span class="hn">${esc(m[4])}</span>`;
        else if (m[5]) { const w = m[5].toLowerCase(); out += KW.has(w) ? `<span class="hk">${m[5]}</span>` : TY.has(w) ? `<span class="ht">${m[5]}</span>` : m[5]; }
        else out += esc(m[6]);
    }
    return out;
}

/* ---------- the editor */
function editor(text, onChange, onRun, aria) {
    const gut = h('pre', { class: 'ed-gut', 'aria-hidden': 'true' });
    const pre = h('pre', { class: 'ed-hl', 'aria-hidden': 'true' });
    const ta = h('textarea', { class: 'ed-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', 'aria-label': aria || 'Your VHDL code', wrap: 'off' });
    const box = h('div', { class: 'ed' }, gut, h('div', { class: 'ed-wrap' }, pre, ta));
    let marks = {};
    ta.value = text;
    function paint() {
        const v = ta.value;
        pre.innerHTML = hl(v) + '\n';
        const n = v.split('\n').length;
        let g = '';
        for (let i = 1; i <= n; i++) g += (marks[i] ? `<span class="${marks[i]}">${i}</span>` : i) + '\n';
        gut.innerHTML = g;
    }
    ta.addEventListener('input', () => { paint(); onChange(ta.value); });
    ta.addEventListener('scroll', () => { ta.scrollTop = 0; ta.scrollLeft = 0; });   // the box around it scrolls instead
    ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); return; }
        if (e.key === 'Tab' && !e.altKey && !e.ctrlKey) {
            e.preventDefault();
            const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
            if (s === en && !e.shiftKey) { ta.setRangeText('  ', s, en, 'end'); }
            else {
                const ls = v.lastIndexOf('\n', s - 1) + 1;
                const block = v.slice(ls, en);
                const nb = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
                ta.setRangeText(nb, ls, en, 'select');
            }
            ta.dispatchEvent(new Event('input'));
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            const s = ta.selectionStart, v = ta.value;
            const ls = v.lastIndexOf('\n', s - 1) + 1;
            const ind = /^\s*/.exec(v.slice(ls, s))[0];
            const extra = /\b(begin|then|loop|is|generate|else|port|generic)\s*(--.*)?$|\($/i.test(v.slice(ls, s).trim()) && !/^\s*end\b/i.test(v.slice(ls, s)) ? '  ' : '';
            e.preventDefault();
            ta.setRangeText('\n' + ind + extra, s, ta.selectionEnd, 'end');
            ta.dispatchEvent(new Event('input'));
        }
    });
    paint();
    return {
        el: box,
        get value() { return ta.value; },
        set(v) { ta.value = v; paint(); },
        mark(m) { marks = m || {}; paint(); },
        goLine(n) {
            const v = ta.value;
            let pos = 0;
            for (let i = 1; i < n; i++) { const k = v.indexOf('\n', pos); if (k < 0) break; pos = k + 1; }
            const end = v.indexOf('\n', pos);
            ta.focus();
            ta.setSelectionRange(pos, end < 0 ? v.length : end);
            const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
            const y = box.getBoundingClientRect().top + scrollY + (n - 1) * lh;
            scrollTo({ top: Math.max(0, y - innerHeight / 3), behavior: 'smooth' });
        }
    };
}

G.VHDLUI = { h, esc, hl, editor };
})(window);
