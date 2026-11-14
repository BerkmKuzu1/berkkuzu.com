/* check.js - runs the tests of one problem against a VHDL design (sim.js).
   Shared by the problem page and the offline cross-check against GHDL. */
(function (G) {
'use strict';

/* ---------- seeded random numbers, so every run uses the same vectors */
function rng(seed) {
    let x = (seed >>> 0) || 0x9e3779b9;
    const u32 = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x; };
    return {
        u32,
        bits(w) { let v = 0n; for (let i = 0; i < w; i += 32) v = (v << 32n) | BigInt(u32()); return BigInt.asUintN(w, v); },
        bit() { return BigInt(u32() & 1); },
        int(n) { return u32() % n; },
        chance(p) { return u32() / 4294967296 < p; }
    };
}

/* ---------- values: BigInt in the models, strings of '0'/'1' (MSB first) on the ports */
const toStr = (v, w) => (typeof v === 'string' ? v : BigInt.asUintN(w, v).toString(2).padStart(w, '0'));
const fromStr = s => (/^[01]+$/.test(s) ? BigInt('0b' + s) : null);

function portDecl(p) {
    const [name, mode, w, dir] = p;
    const type = w === 1 && !dir ? 'std_logic' : dir === 'to' ? `std_logic_vector(0 to ${w - 1})` : `std_logic_vector(${w - 1} downto 0)`;
    return { name, mode, type };
}
function entityText(prob) {
    const ds = prob.ports.map(portDecl);
    const wn = Math.max(...ds.map(d => d.name.length));
    const lines = ds.map((d, i) => `    ${d.name.padEnd(wn)} : ${d.mode.padEnd(3)} ${d.type}${i < ds.length - 1 ? ';' : ''}`);
    return `entity top_module is\n  port (\n${lines.join('\n')}\n  );\nend entity;`;
}
const HEADER = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
function template(prob) {
    if (prob.template) return prob.template;
    const hdr = HEADER + (prob.numeric ? 'use ieee.numeric_std.all;\n' : '');
    return `${hdr}\n${entityText(prob)}\n\narchitecture rtl of top_module is\nbegin\n\n  -- Write your code here\n\nend architecture;\n`;
}
function solution(prob) {
    if (prob.solution) return prob.solution;
    const hdr = HEADER + (prob.numeric ? 'use ieee.numeric_std.all;\n' : '');
    const decls = prob.solDecls ? prob.solDecls.replace(/^/gm, '  ') + '\n' : '';
    return `${hdr}\n${entityText(prob)}\n\narchitecture rtl of top_module is\n${decls}begin\n${prob.sol.replace(/^/gm, '  ')}\nend architecture;\n`;
}

/* ---------- the test vectors of a problem:
   [{ in: {port: '0101'}, out: {port: '01' | null}, clk: bool }] */
function steps(prob) {
    const t = prob.test, ins = prob.ports.filter(p => p.mode === 'in' || p[1] === 'in');
    const inPorts = prob.ports.filter(p => p[1] === 'in' && p[0] !== (t.clk || ''));
    const outPorts = prob.ports.filter(p => p[1] === 'out');
    const R = rng(t.seed || 7);
    const enc = (vals, ports) => Object.fromEntries(ports.map(([n, , w]) => [n, vals[n] === null || vals[n] === undefined ? null : toStr(vals[n], w)]));
    const S = [];
    void ins;
    if (!t.clk) {
        const vecs = [];
        const total = inPorts.reduce((a, p) => a + p[2], 0);
        if (t.vectors) vecs.push(...t.vectors);
        if (t.exhaustive !== false && total <= 12) {
            for (let k = 0n; k < 1n << BigInt(total); k++) {
                let r = k;
                const v = {};
                for (let i = inPorts.length - 1; i >= 0; i--) { const [n, , w] = inPorts[i]; v[n] = r & ((1n << BigInt(w)) - 1n); r >>= BigInt(w); }
                vecs.push(v);
            }
        }
        const nRand = t.random !== undefined ? t.random : (total <= 12 ? 0 : 300);
        if (total > 12 && t.corners !== false) {
            const z = {}, o = {}, a5 = {}, aa = {};
            for (const [n, , w] of inPorts) { z[n] = 0n; o[n] = (1n << BigInt(w)) - 1n; a5[n] = BigInt('0b' + '01'.repeat(w).slice(0, w)); aa[n] = BigInt('0b' + '10'.repeat(w).slice(0, w)); }
            vecs.push(z, o, a5, aa);
        }
        for (let k = 0; k < nRand; k++) {
            if (t.gen) { vecs.push(t.gen(R, k)); continue; }
            const v = {};
            for (const [n, , w] of inPorts) v[n] = R.bits(w);
            vecs.push(v);
        }
        for (const v of vecs) S.push({ in: enc(v, inPorts), out: enc(t.model(v), outPorts), clk: false });
        return S;
    }
    let st = t.init();
    const cycles = t.cycles || 100;
    for (let k = 0; k < cycles; k++) {
        const v = t.gen(R, k);
        const exp = t.out(st, v);
        S.push({ in: enc(v, inPorts), out: enc(exp, outPorts), clk: true });
        st = t.next(st, v);
    }
    return S;
}

/* ---------- run a design */
function run(prob, userText, LIB, opt) {
    opt = opt || {};
    const files = [];
    if (prob.lib && prob.lib.length) files.push({ name: 'provided', text: prob.lib.map(n => LIB[n]).join('\n') });
    files.push({ name: 'yours', text: userText });
    const userIdx = files.length - 1;
    const fixLoc = list => list.map(e => Object.assign({}, e, { mine: e.fileIdx === userIdx }));
    const d = VHDL.compile(files, 'top_module');
    if (!d.ok) return { ok: false, phase: 'compile', errors: fixLoc(d.errors), warnings: fixLoc(d.warnings || []) };
    let warnings = fixLoc(d.warnings);
    if (prob.allowMulti) warnings = warnings.filter(w => !/more than one place/.test(w.msg));
    // the interface
    const want = prob.ports.map(([name, mode, w, dir]) => ({ name, mode, w, vec: !(w === 1 && !dir), dir: dir || 'downto' }));
    const problems = [];
    for (const p of want) {
        const got = d.ports.find(x => x.name === p.name);
        const decl = portDecl(prob.ports.find(x => x[0] === p.name));
        if (!got) { problems.push(`the port '${p.name}' is missing (${p.name} : ${p.mode} ${decl.type})`); continue; }
        if (got.mode !== p.mode && !(p.mode === 'out' && got.mode === 'buffer')) problems.push(`'${p.name}' must be an ${p.mode} port`);
        if (got.width !== p.w || got.vector !== p.vec || (p.vec && got.dir !== p.dir)) problems.push(`'${p.name}' must be ${decl.type}, not ${got.type}`);
    }
    for (const g of d.ports) if (!want.some(p => p.name === g.name)) problems.push(`the port '${g.name}' is not part of this problem`);
    if (problems.length) return { ok: false, phase: 'interface', errors: problems.map(m => ({ line: 0, msg: `Keep the entity as given: ${m}.`, mine: true })), warnings };
    const S = opt.steps || steps(prob);
    const outNames = prob.ports.filter(p => p[1] === 'out').map(p => p[0]);
    const clk = prob.test.clk;
    const mism = [], trace = [];
    let bad = 0, k = 0;
    try {
        d.reset();
        if (clk) { d.set(clk, '0'); d.settle(); }
        for (k = 0; k < S.length; k++) {
            const s = S[k];
            for (const [n, v] of Object.entries(s.in)) d.set(n, v);
            d.settle();
            const got = {};
            let wrong = false;
            for (const n of outNames) {
                got[n] = d.get(n);
                if (s.out[n] !== null && s.out[n] !== undefined && got[n] !== s.out[n]) wrong = true;
            }
            if (wrong) { bad++; if (mism.length < 12) mism.push({ k, in: s.in, out: s.out, got }); }
            if (trace.length < (opt.trace || 400)) trace.push({ in: s.in, out: s.out, got, wrong });
            if (s.clk) { d.set(clk, '1'); d.settle(); d.set(clk, '0'); d.settle(); }
        }
    } catch (e) {
        const w = e.where || { line: 0, msg: e.message, fileIdx: userIdx };
        return { ok: false, phase: 'sim', errors: fixLoc([w]).map(x => Object.assign(x, { msg: `${x.msg} (while testing vector ${k + 1})` })), warnings, trace, mism };
    }
    return { ok: bad === 0, phase: 'done', total: S.length, bad, mism, trace, warnings, messages: fixLoc(d.messages()), clk };
}

/* ---------- an example of the book: apply its steps and record every port.
   spec = { top?, clk?, steps: ['a=0 b=01', ...] }; without top, the last entity is simulated */
const stepPairs = s => (s || '').trim().split(/\s+/).filter(Boolean).map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; });
function topOf(text) {
    let m, last = null;
    const re = /^\s*entity\s+(\w+)\s+is\b/gim;
    while ((m = re.exec(text))) last = m[1].toLowerCase();
    return last;
}
function simulate(spec, text) {
    const top = spec.top || topOf(text);
    if (!top) return { ok: false, phase: 'compile', errors: [{ line: 0, msg: 'There is no entity to simulate.' }], warnings: [] };
    const d = VHDL.compile([{ name: 'example', text }], top);
    if (!d.ok) return { ok: false, phase: 'compile', errors: d.errors, warnings: d.warnings || [] };
    if (spec.tb) {
        // a testbench drives itself: run it in time
        let r;
        try { r = d.runTB(spec.limit || TB_LIMIT); }
        catch (e) { const w = e.where || { line: 0, msg: e.message }; return { ok: false, phase: 'sim', errors: [w], warnings: d.warnings, messages: d.messages() }; }
        return { ok: true, tb: true, reason: r.reason, end: r.end, wave: r.wave, warnings: d.warnings, messages: d.messages() };
    }
    const trace = [];
    let k = 0;
    const stop = msg => { const e = new Error(msg); e.where = { line: 0, msg }; throw e; };
    try {
        d.reset();
        if (spec.clk) {
            if (!d.ports.some(p => p.name === spec.clk && p.mode === 'in')) stop(`the example needs the clock input '${spec.clk}'`);
            d.set(spec.clk, '0'); d.settle();
        }
        for (k = 0; k < spec.steps.length; k++) {
            for (const [n, v] of stepPairs(spec.steps[k])) {
                const p = d.ports.find(x => x.name === n);
                if (!p || p.mode !== 'in') stop(`the example drives the input '${n}', which the entity no longer has; keep its ports as they were`);
                if (p.width !== v.length) stop(`'${n}' is ${p.width} ${p.width === 1 ? 'bit' : 'bits'} wide now, but the example drives it with ${v.length}; keep its ports as they were`);
                d.set(n, v);
            }
            d.settle();
            const got = {};
            for (const p of d.ports) if (p.name !== spec.clk) got[p.name] = d.get(p.name);
            trace.push(got);
            if (spec.clk) { d.set(spec.clk, '1'); d.settle(); d.set(spec.clk, '0'); d.settle(); }
        }
    } catch (e) {
        const w = e.where || { line: 0, msg: e.message };
        return { ok: false, phase: 'sim', errors: [Object.assign({}, w, { msg: `${w.msg} (step ${k + 1})` })], warnings: d.warnings, trace, ports: d.ports };
    }
    return { ok: true, phase: 'done', ports: d.ports, trace, warnings: d.warnings, messages: d.messages() };
}

/* ---------- a testbench exercise: the testbench must accept the correct design
   and report an error (assert ... severity error or failure) for every broken copy */
const TB_LIMIT = 1e12;            // 1 ms of simulated time, in femtoseconds
function runTB(prob, text) {
    const variants = [{ title: 'The correct design', code: prob.dut, good: true }].concat(prob.bugs.map(b => ({ title: b.title, code: b.code, good: false })));
    const top = topOf(text) || 'tb';
    const results = [];
    let warnings = [];
    for (const v of variants) {
        const d = VHDL.compile([{ name: 'provided', text: v.code }, { name: 'yours', text }], top);
        const fix = list => (list || []).map(e => Object.assign({}, e, { mine: e.fileIdx === 1 }));
        if (!d.ok) return { ok: false, phase: 'compile', errors: fix(d.errors), warnings: fix(d.warnings) };
        if (v.good) warnings = fix(d.warnings);
        if (d.ports.length) return { ok: false, phase: 'interface', errors: [{ line: 0, msg: `A testbench has no ports, but '${top}' has ${d.ports.length}: it should start with 'entity ${top} is end entity;'.`, mine: true }], warnings };
        let r;
        try { r = d.runTB(prob.limit || TB_LIMIT); }
        catch (e) {
            const w = e.where || { line: 0, msg: e.message, fileIdx: 1 };
            return { ok: false, phase: 'sim', errors: fix([w]).map(x => Object.assign(x, { msg: `${x.msg} (with ${v.good ? 'the correct design' : `broken design ${results.length}`})` })), warnings };
        }
        const msgs = fix(d.messages());
        const bad = msgs.filter(m => m.sev === 'error' || m.sev === 'failure');
        results.push({ title: v.title, good: v.good, caught: bad.length > 0, first: bad[0] || null, reason: r.reason, end: r.end, messages: msgs, wave: r.wave });
    }
    const ok = !results[0].caught && results.slice(1).every(x => x.caught);
    return { ok, phase: 'done', results, warnings, total: results.length - 1, bad: results.slice(1).filter(x => !x.caught).length + (results[0].caught ? 1 : 0) };
}

G.VHDLCheck = { rng, toStr, fromStr, entityText, template, solution, steps, run, runTB, portDecl, simulate, stepPairs, topOf, TB_LIMIT };
})(typeof window !== 'undefined' ? window : globalThis);
