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

G.VHDLCheck = { rng, toStr, fromStr, entityText, template, solution, steps, run, portDecl };
})(typeof window !== 'undefined' ? window : globalThis);
