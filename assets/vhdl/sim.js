/* sim.js - the checker of the VHDL problem sets on berkkuzu.com.
   A subset of VHDL-2008, in plain JavaScript: it parses, type-checks,
   elaborates and simulates small synthesizable designs in the browser.
   window.VHDL.compile(files, top) returns a design to drive and sample. */
(function (G) {
'use strict';

/* ============================================================== errors */
const FILE = 1000000;                  // a position is file * FILE + line
class VError extends Error {
    constructor(msg, at) { super(msg); this.at = at || 0; }
}
function fail(msg, at) { throw new VError(msg, at); }

/* =============================================================== lexer */
const RESERVED = new Set(('abs access after alias all and architecture array assert assume attribute begin ' +
    'block body buffer bus case component configuration constant context cover default disconnect downto else ' +
    'elsif end entity exit fairness file for force function generate generic group guarded if impure in ' +
    'inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or ' +
    'others out package parameter port postponed procedure process property protected pure range record ' +
    'register reject release rem report restrict return rol ror select sequence severity shared signal sla sll ' +
    'sra srl strong subtype then to transport type unaffected units until use variable vmode vprop vunit wait ' +
    'when while with xnor xor').split(' '));

function bitString(size, base, body, at) {
    const signed = base[0] === 's', b = base.replace(/^[us]/, '');
    body = body.replace(/_/g, '');
    let bits = '';
    if (b === 'd') {
        if (!/^[0-9]+$/.test(body)) fail(`d"${body}" may only contain decimal digits`, at);
        bits = BigInt(body).toString(2);
    } else {
        const per = b === 'b' ? 1 : b === 'o' ? 3 : 4;
        for (const ch of body) {
            const v = parseInt(ch, per === 1 ? 2 : per === 3 ? 8 : 16);
            if (isNaN(v)) {
                if (/[ZXUWLH-]/i.test(ch)) { bits += ch.toUpperCase().repeat(per); continue; }
                fail(`'${ch}' is not a valid digit in ${base}"${body}"`, at);
            }
            bits += v.toString(2).padStart(per, '0');
        }
    }
    if (size != null) {
        if (bits.length < size) bits = (signed && bits ? bits[0] : '0').repeat(size - bits.length) + bits;
        else if (bits.length > size) {
            const cut = bits.slice(0, bits.length - size), keep = bits.slice(bits.length - size);
            if (signed ? [...cut].some(c => c !== keep[0]) : /[^0]/.test(cut)) fail(`${size}${base}"${body}" does not fit in ${size} bits`, at);
            bits = keep;
        }
    }
    return bits;
}

function lex(src, fileIdx) {
    const toks = [], n = src.length, base = fileIdx * FILE;
    let i = 0, line = 1;
    const at = () => base + line;
    const push = (t, v, raw) => toks.push({ t, v, raw, at: at() });
    while (i < n) {
        const c = src[i];
        if (c === '\n') { line++; i++; continue; }
        if (c <= ' ' || c === ' ') { i++; continue; }
        if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') {
            const a0 = at(); i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
            if (i >= n) fail('this /* comment is never closed', a0);
            i += 2; continue;
        }
        if (/[A-Za-z]/.test(c)) {
            let j = i + 1;
            while (j < n && /\w/.test(src[j])) j++;
            const raw = src.slice(i, j), low = raw.toLowerCase();
            if (src[j] === '"' && /^(b|o|x|d|ub|uo|ux|sb|so|sx)$/.test(low)) {
                const k = src.indexOf('"', j + 1);
                if (k < 0 || src.slice(j, k).includes('\n')) fail('this bit string is never closed', at());
                push('bits', bitString(null, low, src.slice(j + 1, k), at()), src.slice(i, k + 1));
                i = k + 1; continue;
            }
            if (raw.endsWith('_') || raw.includes('__')) fail(`'${raw}' is not a valid name: an underscore may not end a name or follow another underscore`, at());
            push(RESERVED.has(low) ? 'kw' : 'id', low, raw);
            i = j; continue;
        }
        if (/[0-9]/.test(c)) {
            let j = i;
            while (j < n && /[0-9_]/.test(src[j])) j++;
            const digits = src.slice(i, j).replace(/_/g, '');
            const m = /^(ub|uo|ux|sb|so|sx|b|o|x|d)"/i.exec(src.slice(j, j + 3));
            if (m) {
                const b = m[1].toLowerCase(), q = j + b.length, k = src.indexOf('"', q + 1);
                if (k < 0) fail('this bit string is never closed', at());
                push('bits', bitString(parseInt(digits, 10), b, src.slice(q + 1, k), at()), src.slice(i, k + 1));
                i = k + 1; continue;
            }
            if (src[j] === '#') {
                const k = src.indexOf('#', j + 1);
                const radix = parseInt(digits, 10), body = k > 0 ? src.slice(j + 1, k).replace(/_/g, '') : '';
                if (k < 0 || radix < 2 || radix > 16 || !body || [...body].some(d => !(parseInt(d, 16) < radix))) fail(`'${src.slice(i, k > 0 ? k + 1 : j + 1)}' is not a valid based literal`, at());
                push('int', parseInt(body, radix), src.slice(i, k + 1));
                i = k + 1; continue;
            }
            let real = false;
            if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { real = true; j++; while (j < n && /[0-9_]/.test(src[j])) j++; }
            if (/[eE]/.test(src[j] || '') && /[-+0-9]/.test(src[j + 1] || '')) { j++; if (/[-+]/.test(src[j])) j++; while (j < n && /[0-9]/.test(src[j])) j++; }
            const raw = src.slice(i, j);
            push(real ? 'real' : 'int', Number(raw.replace(/_/g, '')), raw);
            i = j; continue;
        }
        if (c === '"') {
            let j = i + 1, s = '';
            for (;;) {
                if (j >= n || src[j] === '\n') fail('this string is never closed', at());
                if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
                s += src[j++];
            }
            push('str', s, src.slice(i, j + 1)); i = j + 1; continue;
        }
        if (c === "'") {
            const prev = toks[toks.length - 1];
            const tick = prev && (prev.t === 'id' || (prev.t === 'op' && prev.v === ')') || (prev.t === 'kw' && prev.v === 'all'));
            if (!tick && src[i + 2] === "'") { push('char', src[i + 1], src.slice(i, i + 3)); i += 3; continue; }
            if (!tick) fail("unexpected ' (a single bit is written like '1')", at());
            push('tick', "'", "'"); i++; continue;
        }
        const two = src.slice(i, i + 2);
        if (two === '!=') fail("'!=' is not VHDL: 'not equal' is written /=", at());
        if (two === '&&' || two === '||') fail(`'${two}' is not VHDL: write 'and' or 'or'`, at());
        if (['<=', '>=', ':=', '=>', '/=', '**', '<>', '??'].includes(two)) { push('op', two, two); i += 2; continue; }
        if ('&()*+,-./:;<=>|?[]'.includes(c)) { push('op', c, c); i++; continue; }
        if (c === '~' || c === '!') fail(`'${c}' is not VHDL: write 'not'`, at());
        if (c === '^') fail("'^' is not VHDL: write 'xor'", at());
        if (c === '{' || c === '}') fail("VHDL has no { }: join vectors with &, and repeat bits with (others => ...)", at());
        if (c === '`') fail("'`' is Verilog; VHDL has no compiler directives", at());
        fail(`unexpected character '${c}'`, at());
    }
    push('eof', null, '');
    return toks;
}

/* ============================================================== parser */
const LOGICAL = new Set(['and', 'or', 'nand', 'nor', 'xor', 'xnor']);
const RELOPS = new Set(['=', '/=', '<', '<=', '>', '>=']);
const SHIFTOPS = new Set(['sll', 'srl', 'sla', 'sra', 'rol', 'ror']);
const PHYS = new Set(['fs', 'ps', 'ns', 'us', 'ms', 'sec', 'min', 'hr']);
const ATTR_ARG = new Set(['pos', 'val', 'image', 'value', 'succ', 'pred', 'length', 'range', 'reverse_range', 'high', 'low', 'left', 'right']);

function tokDesc(t) {
    if (t.t === 'eof') return 'the end of the code';
    if (t.t === 'str') return `the string "${t.v}"`;
    if (t.t === 'char') return `'${t.v}'`;
    return `'${t.raw}'`;
}

class Parser {
    constructor(toks) { this.toks = toks; this.p = 0; }
    get cur() { return this.toks[this.p]; }
    peek(k) { return this.toks[Math.min(this.p + (k || 1), this.toks.length - 1)]; }
    is(t, v) { const c = this.toks[this.p]; return c.t === t && (v === undefined || c.v === v); }
    kw(v) { return this.is('kw', v); }
    op(v) { return this.is('op', v); }
    accept(t, v) { return this.is(t, v) ? this.toks[this.p++] : null; }
    expect(t, v, what) {
        if (this.is(t, v)) return this.toks[this.p++];
        this.err(`expected ${what || `'${v}'`}`);
    }
    err(msg) {
        const c = this.cur;
        let hint = '';
        if (c.t === 'op' && c.v === '|') hint = ". VHDL has no '|' operator: write 'or'";
        else if (c.t === 'id' && c.v === 'elseif') hint = ". VHDL writes 'elsif'";
        else if (c.t === 'op' && c.v === '=' && /'<='|':='/.test(msg)) hint = '. Assign a signal with <= and a variable with := (= only compares)';
        else if (c.t === 'op' && (c.v === '[' || c.v === ']')) hint = '. VHDL indexes with ( ), e.g. v(3) or v(7 downto 4)';
        else if (c.t === 'kw' && c.v === 'end' && /';'/.test(msg)) hint = '. Is a semicolon missing at the end of the line above?';
        else if (c.t === 'id' && /';'/.test(msg)) hint = '. Is a semicolon missing at the end of the line above?';
        fail(`${msg}, found ${tokDesc(c)}${hint}`, c.at);
    }
    ident(what) {
        const c = this.cur;
        if (c.t === 'id') { this.p++; return c; }
        if (c.t === 'kw') fail(`'${c.raw}' is a reserved word in VHDL and cannot be used as ${what || 'a name'}`, c.at);
        this.err(`expected ${what || 'a name'}`);
    }
    idList(what) { const a = [this.ident(what)]; while (this.accept('op', ',')) a.push(this.ident(what)); return a; }
    // end [kw...] [name];  (the keywords are optional at the end of a design unit)
    endUnit(kws, name) {
        this.expect('kw', 'end', `'end'`);
        if (this.kw(kws[0])) for (const k of kws) this.expect('kw', k);
        if (this.cur.t === 'id') {
            if (this.cur.v !== name) fail(`'end ${this.cur.raw}' does not match the name '${name}'`, this.cur.at);
            this.p++;
        }
        this.expect('op', ';', `';' after 'end'`);
    }
    // end kw [label];  (the keyword is required at the end of a statement)
    endStmt(kw, label) {
        this.expect('kw', 'end', `'end ${kw}'`);
        this.expect('kw', kw, `'end ${kw}'`);
        if (kw === 'case' || kw === 'generate') this.accept('op', '?');
        if (this.cur.t === 'id') {
            if (label && this.cur.v !== label) fail(`'end ${kw} ${this.cur.raw}' does not match the label '${label}'`, this.cur.at);
            if (!label) fail(`'end ${kw} ${this.cur.raw}': this ${kw} has no label`, this.cur.at);
            this.p++;
        }
        this.expect('op', ';', `';' after 'end ${kw}'`);
    }

    file() {
        const units = [];
        let ctx = [];
        while (!this.is('eof')) {
            const at = this.cur.at;
            if (this.accept('kw', 'library')) { ctx.push({ k: 'library', names: this.idList('a library name').map(t => t.v), at }); this.expect('op', ';'); continue; }
            if (this.kw('use')) { ctx.push(this.useClause()); continue; }
            let u;
            if (this.kw('entity')) u = this.entity();
            else if (this.kw('architecture')) u = this.architecture();
            else if (this.kw('package')) u = this.package();
            else if (this.kw('configuration') || this.kw('context')) fail(`${this.cur.v} declarations are not supported here`, at);
            else this.err('expected an entity, an architecture or a package');
            u.ctx = ctx; ctx = [];
            units.push(u);
        }
        if (ctx.length) fail("these 'library'/'use' clauses are not followed by an entity, architecture or package", ctx[ctx.length - 1].at);
        return units;
    }
    useClause() {
        const at = this.expect('kw', 'use').at, names = [];
        do {
            const parts = [this.ident('a library name').v];
            while (this.accept('op', '.')) {
                if (this.accept('kw', 'all')) { parts.push('all'); break; }
                parts.push(this.ident('a name').v);
            }
            names.push(parts);
        } while (this.accept('op', ','));
        this.expect('op', ';');
        return { k: 'use', names, at };
    }
    entity() {
        const at = this.expect('kw', 'entity').at, name = this.ident('the entity name').v;
        this.expect('kw', 'is');
        let generics = [], ports = [];
        if (this.accept('kw', 'generic')) { generics = this.interfaceList('generic'); this.expect('op', ';', "';' after the generic list"); }
        if (this.accept('kw', 'port')) { ports = this.interfaceList('port'); this.expect('op', ';', "';' after the port list"); }
        if (this.kw('begin') || (!this.kw('end'))) this.err("expected 'end' (an entity only declares generics and ports here)");
        this.endUnit(['entity'], name);
        return { k: 'entity', name, generics, ports, at };
    }
    interfaceList(kind) {
        this.expect('op', '(', `'(' to start the ${kind} list`);
        const items = [];
        for (;;) {
            const at = this.cur.at;
            if (this.op(')')) fail(`the last ${kind} must not end with ';'`, this.toks[this.p - 1].at);
            let cls = null;
            if (this.kw('signal') || this.kw('constant') || this.kw('variable')) cls = this.toks[this.p++].v;
            const names = this.idList(kind === 'port' ? 'a port name' : kind === 'generic' ? 'a generic name' : 'a parameter name').map(t => t.v);
            this.expect('op', ':', "':'");
            let mode = null;
            for (const m of ['in', 'out', 'inout', 'buffer', 'linkage']) if (this.accept('kw', m)) { mode = m; break; }
            const st = this.subtypeInd();
            let def = null;
            if (this.accept('op', ':=')) def = this.expr();
            items.push({ names, mode: mode || 'in', cls, st, def, at });
            if (this.accept('op', ';')) continue;
            break;
        }
        this.expect('op', ')', `')' to close the ${kind} list (or ';' between ${kind}s)`);
        return items;
    }
    selName() {
        const parts = [this.ident('a type name')];
        while (this.op('.') && this.peek().t === 'id') { this.p++; parts.push(this.ident()); }
        return { name: parts[parts.length - 1].v, raw: parts.map(p => p.raw).join('.'), parts: parts.map(p => p.v), at: parts[0].at };
    }
    subtypeInd() {
        const at = this.cur.at;
        let mark = this.selName();
        if (this.cur.t === 'id') mark = this.selName();      // a resolution function in front
        let cons = null;
        if (this.accept('kw', 'range')) cons = { k: 'range', r: this.rangeSpec() };
        else if (this.op('(')) {
            this.p++;
            const rs = [];
            do { rs.push(this.rangeSpec()); } while (this.accept('op', ','));
            this.expect('op', ')');
            cons = { k: 'index', rs };
        }
        return { k: 'sti', mark, cons, at };
    }
    rangeSpec() {
        const e = this.expr();
        if (this.kw('to') || this.kw('downto')) { const dir = this.toks[this.p++].v; return { k: 'range', l: e, dir, r: this.expr(), at: e.at }; }
        if (this.accept('kw', 'range')) {               // natural range <>, or integer range 0 to 7
            if (this.accept('op', '<>')) return { k: 'box', mark: e, at: e.at };
            const r = this.rangeSpec(); r.mark = e; return r;
        }
        return { k: 'rexpr', e, at: e.at };            // v'range, or the name of a subtype
    }
    architecture() {
        const at = this.expect('kw', 'architecture').at, name = this.ident('the architecture name').v;
        this.expect('kw', 'of');
        const ent = this.ident('the entity name').v;
        this.expect('kw', 'is');
        const decls = this.declarations();
        this.expect('kw', 'begin');
        const stmts = this.concurrentList();
        this.endUnit(['architecture'], name);
        return { k: 'arch', name, ent, decls, stmts, at };
    }
    package() {
        const at = this.expect('kw', 'package').at;
        const body = !!this.accept('kw', 'body');
        const name = this.ident('the package name').v;
        this.expect('kw', 'is');
        const decls = this.declarations();
        this.endUnit(body ? ['package', 'body'] : ['package'], name);
        return { k: body ? 'pbody' : 'pkg', name, decls, at };
    }

    declarations() {
        const ds = [];
        for (;;) {
            const at = this.cur.at;
            if (this.kw('signal') || this.kw('constant') || this.kw('variable') || this.kw('shared')) {
                if (this.accept('kw', 'shared')) fail('shared variables are not supported here', at);
                const k = this.toks[this.p++].v;
                const names = this.idList(`a ${k} name`).map(t => t.v);
                this.expect('op', ':', "':'");
                const st = this.subtypeInd();
                let init = null;
                if (this.accept('op', ':=')) init = this.expr();
                else if (this.op('<=')) fail(`a ${k} declaration gives its initial value with :=, not <=`, this.cur.at);
                this.expect('op', ';');
                ds.push({ k, names, st, init, at });
            } else if (this.accept('kw', 'type')) {
                const name = this.ident('a type name').v;
                this.expect('kw', 'is');
                let def;
                if (this.op('(')) {
                    this.p++;
                    const lits = [];
                    do {
                        const c = this.cur;
                        if (c.t === 'char') { lits.push(`'${c.v}'`); this.p++; } else lits.push(this.ident('an enumeration literal').v);
                    } while (this.accept('op', ','));
                    this.expect('op', ')');
                    def = { k: 'enum', lits };
                } else if (this.accept('kw', 'array')) {
                    this.expect('op', '(');
                    const rs = [];
                    do { rs.push(this.rangeSpec()); } while (this.accept('op', ','));
                    this.expect('op', ')');
                    this.expect('kw', 'of');
                    def = { k: 'array', rs, elem: this.subtypeInd() };
                } else if (this.accept('kw', 'range')) def = { k: 'int', r: this.rangeSpec() };
                else if (this.kw('record')) fail('record types are not supported here', at);
                else this.err('expected (enumeration literals), array or range');
                this.expect('op', ';');
                ds.push({ k: 'type', name, def, at });
            } else if (this.accept('kw', 'subtype')) {
                const name = this.ident('a subtype name').v;
                this.expect('kw', 'is');
                ds.push({ k: 'subtype', name, st: this.subtypeInd(), at });
                this.expect('op', ';');
            } else if (this.accept('kw', 'component')) {
                const name = this.ident('the component name').v;
                this.accept('kw', 'is');
                let generics = [], ports = [];
                if (this.accept('kw', 'generic')) { generics = this.interfaceList('generic'); this.expect('op', ';'); }
                if (this.accept('kw', 'port')) { ports = this.interfaceList('port'); this.expect('op', ';'); }
                this.endUnit(['component'], name);
                ds.push({ k: 'component', name, generics, ports, at });
            } else if (this.kw('function') || this.kw('pure') || this.kw('impure') || this.kw('procedure')) {
                ds.push(this.subprogram());
            } else if (this.accept('kw', 'attribute')) {
                while (!this.op(';') && !this.is('eof')) this.p++;   // attribute declarations are ignored
                this.expect('op', ';');
            } else if (this.accept('kw', 'alias')) {
                const name = this.ident('an alias name').v;
                let st = null;
                if (this.accept('op', ':')) st = this.subtypeInd();
                this.expect('kw', 'is');
                ds.push({ k: 'alias', name, st, target: this.name(), at });
                this.expect('op', ';');
            } else if (this.kw('use')) ds.push(this.useClause());
            else if (this.kw('file')) fail('files are not supported here', at);
            else break;
        }
        return ds;
    }
    subprogram() {
        const at = this.cur.at;
        let pure = true;
        if (this.accept('kw', 'impure')) pure = false; else this.accept('kw', 'pure');
        if (this.accept('kw', 'procedure')) fail('procedures are not supported here; use a function', at);
        this.expect('kw', 'function');
        const nt = this.cur;
        let name;
        if (nt.t === 'str') { this.p++; name = '"' + nt.v.toLowerCase() + '"'; } else name = this.ident('the function name').v;
        let params = [];
        if (this.op('(')) params = this.interfaceList('parameter');
        this.expect('kw', 'return', "'return' and the result type");
        const ret = this.selName();
        if (this.accept('op', ';')) return { k: 'function', name, params, ret, body: null, decls: [], pure, at };
        this.expect('kw', 'is');
        const decls = this.declarations();
        this.expect('kw', 'begin');
        const body = this.seqList(['end']);
        this.expect('kw', 'end');
        this.accept('kw', 'function');
        if (this.cur.t === 'id' || this.cur.t === 'str') this.p++;
        this.expect('op', ';');
        return { k: 'function', name, params, ret, body, decls, pure, at };
    }

    /* ---------- concurrent statements */
    concurrentList() {
        const a = [];
        while (!this.kw('end') && !this.kw('elsif') && !this.kw('else') && !this.is('eof')) a.push(this.concurrent());
        return a;
    }
    concurrent() {
        const at = this.cur.at;
        let label = null;
        if (this.cur.t === 'id' && this.peek().t === 'op' && this.peek().v === ':') { label = this.cur.v; this.p += 2; }
        if (this.kw('process') || this.kw('postponed')) return this.process(label, at);
        if (this.kw('for')) return this.forGenerate(label, at);
        if (this.kw('if')) return this.ifGenerate(label, at);
        if (this.kw('with')) return this.selected(label, at, true);
        if (this.kw('assert')) { const a = this.assertion(); a.k = 'cassert'; a.label = label; return a; }
        if (this.kw('block')) fail('block statements are not supported here', at);
        if (this.kw('case')) fail('case statements belong inside a process; outside a process use with ... select', at);
        if (this.kw('component') || this.kw('entity') || this.kw('configuration')) return this.instance(label, at);
        if (label && this.cur.t === 'id' && this.peek().t === 'kw' && ['port', 'generic'].includes(this.peek().v)) return this.instance(label, at);
        if (this.kw('if') || this.kw('elsif')) fail("'if' belongs inside a process; outside a process use: y <= a when c else b;", at);
        const target = this.target();
        if (this.accept('op', '<=')) return this.condAssign(label, target, at, true);
        if (this.op(':=')) fail('variables (:=) only exist inside a process or a function; outside a process assign signals with <=', at);
        if (this.op(';') && label) fail(`'${label}: ${target.raw || ''}' looks like an instantiation without a port map`, at);
        this.err("expected '<='");
    }
    target() {
        if (this.op('(')) fail('aggregate targets like (a, b) <= ... are not supported here; assign each signal on its own', this.cur.at);
        if (this.cur.t === 'kw') fail(`a statement cannot start with '${this.cur.raw}' here`, this.cur.at);
        return this.name();
    }
    process(label, at) {
        this.accept('kw', 'postponed');
        this.expect('kw', 'process');
        let sens = null;
        if (this.accept('op', '(')) {
            if (this.accept('kw', 'all')) sens = 'all';
            else { sens = []; do { sens.push(this.name()); } while (this.accept('op', ',')); }
            this.expect('op', ')');
        }
        this.accept('kw', 'is');
        const decls = this.declarations();
        this.expect('kw', 'begin', "'begin'");
        const body = this.seqList(['end']);
        this.expect('kw', 'end');
        this.accept('kw', 'postponed');
        this.expect('kw', 'process', "'end process'");
        if (this.cur.t === 'id') {
            if (label && this.cur.v !== label) fail(`'end process ${this.cur.raw}' does not match the label '${label}'`, this.cur.at);
            this.p++;
        }
        this.expect('op', ';', "';' after 'end process'");
        return { k: 'process', label, sens, decls, body, at };
    }
    genBody() {
        let decls = [];
        const dk = ['signal', 'constant', 'type', 'subtype', 'component', 'function', 'alias', 'attribute', 'use', 'pure', 'impure'];
        if (dk.some(k => this.kw(k))) { decls = this.declarations(); this.expect('kw', 'begin'); }
        else this.accept('kw', 'begin');
        return { decls, stmts: this.concurrentList() };
    }
    forGenerate(label, at) {
        if (!label) fail('a for ... generate needs a label, e.g. gen: for i in 0 to 7 generate', at);
        this.expect('kw', 'for');
        const param = this.ident('a loop name').v;
        this.expect('kw', 'in');
        const range = this.rangeSpec();
        this.expect('kw', 'generate', "'generate'");
        const b = this.genBody();
        this.endStmt('generate', label);
        return { k: 'forgen', label, param, range, decls: b.decls, stmts: b.stmts, at };
    }
    ifGenerate(label, at) {
        if (!label) fail('an if ... generate needs a label', at);
        this.expect('kw', 'if');
        const branches = [];
        let els = null;
        let cond = this.expr();
        this.expect('kw', 'generate', "'generate'");
        branches.push({ cond, ...this.genBody() });
        for (;;) {
            if (this.accept('kw', 'elsif')) { cond = this.expr(); this.expect('kw', 'generate'); branches.push({ cond, ...this.genBody() }); continue; }
            if (this.accept('kw', 'else')) { this.expect('kw', 'generate'); els = this.genBody(); }
            break;
        }
        this.endStmt('generate', label);
        return { k: 'ifgen', label, branches, els, at };
    }
    instance(label, at) {
        if (!label) fail('an instance needs a label, e.g. u1: entity work.mod_a port map (...)', at);
        let unit;
        if (this.accept('kw', 'entity')) {
            const nm = this.selName();
            let arch = null;
            if (this.accept('op', '(')) { arch = this.ident('an architecture name').v; this.expect('op', ')'); }
            unit = { kind: 'entity', parts: nm.parts, raw: nm.raw, arch };
        } else if (this.accept('kw', 'configuration')) fail('configurations are not supported here', at);
        else {
            this.accept('kw', 'component');
            const nm = this.selName();
            unit = { kind: 'component', parts: nm.parts, raw: nm.raw };
        }
        let gmap = [], pmap = [];
        if (this.accept('kw', 'generic')) {
            this.expect('kw', 'map', "'generic map'");
            gmap = this.assocList();
            if (this.op(';') && this.peek().t === 'kw' && this.peek().v === 'port') fail("no ';' between 'generic map (...)' and 'port map (...)'", this.cur.at);
        }
        if (this.accept('kw', 'port')) { this.expect('kw', 'map', "'port map'"); pmap = this.assocList(); }
        this.expect('op', ';', "';' after the port map");
        return { k: 'inst', label, unit, gmap, pmap, at };
    }
    assocList() {
        this.expect('op', '(');
        const a = [];
        do {
            const at = this.cur.at;
            if (this.accept('kw', 'open')) { a.push({ formal: null, val: { k: 'open', at }, at }); continue; }
            const e = this.expr();
            if (this.accept('op', '=>')) {
                const val = this.accept('kw', 'open') ? { k: 'open', at } : this.expr();
                a.push({ formal: e, val, at });
            } else a.push({ formal: null, val: e, at });
        } while (this.accept('op', ','));
        if (this.op(';')) fail("use ',' between the associations of a map; ';' ends the whole statement", this.cur.at);
        this.expect('op', ')');
        return a;
    }
    delayMech() {
        if (this.accept('kw', 'transport') || this.accept('kw', 'inertial')) return;
        if (this.accept('kw', 'reject')) { this.expr(); this.expect('kw', 'inertial'); }
        if (this.accept('kw', 'guarded')) fail('guarded assignments are not supported here', this.cur.at);
    }
    waveform() {
        if (this.accept('kw', 'unaffected')) return { k: 'unaffected' };
        const e = this.expr();
        if (this.accept('kw', 'after')) this.expr();               // delays are ignored
        if (this.op(',')) fail('waveforms with several elements are not supported here', this.cur.at);
        return e;
    }
    condAssign(label, target, at, conc) {
        this.delayMech();
        const first = this.waveform();
        if (!this.kw('when')) {
            this.expect('op', ';', "';'");
            return { k: conc ? 'casgn' : 'sasgn', label, target, val: first, at };
        }
        const alts = [];
        let val = first;
        while (this.accept('kw', 'when')) {
            const cond = this.expr();
            alts.push({ val, cond });
            if (this.accept('kw', 'else')) { val = this.waveform(); continue; }
            val = null;
            break;
        }
        if (val !== null) alts.push({ val, cond: null });
        this.expect('op', ';', "';' (or 'else')");
        return { k: conc ? 'casgn' : 'sasgn', label, target, alts, at };
    }
    selected(label, at, conc) {
        this.expect('kw', 'with');
        const sel = this.expr();
        this.expect('kw', 'select');
        const matching = !!this.accept('op', '?');
        const target = this.target();
        if (!this.accept('op', '<=')) this.err("expected '<='");
        this.delayMech();
        const alts = [];
        do {
            const val = this.waveform();
            this.expect('kw', 'when', "'when'");
            alts.push({ val, choices: this.choices(), at: this.cur.at });
        } while (this.accept('op', ','));
        if (!this.op(';')) this.err("expected ',' between the choices or ';' after the last one");
        this.p++;
        return { k: conc ? 'csel' : 'ssel', label, sel, target, alts, matching, at };
    }
    choices() {
        const cs = [];
        do {
            if (this.accept('kw', 'others')) { cs.push({ k: 'others' }); continue; }
            const e = this.expr();
            if (this.kw('to') || this.kw('downto')) { const dir = this.toks[this.p++].v; cs.push({ k: 'range', l: e, dir, r: this.expr(), at: e.at }); }
            else cs.push(e);
        } while (this.accept('op', '|'));
        return cs;
    }
    assertion() {
        const at = this.expect('kw', 'assert').at;
        const cond = this.expr();
        let report = null, severity = null;
        if (this.accept('kw', 'report')) report = this.expr();
        if (this.accept('kw', 'severity')) severity = this.expr();
        this.expect('op', ';');
        return { k: 'assert', cond, report, severity, at };
    }

    /* ---------- sequential statements */
    seqList(stops) {
        const a = [];
        while (!stops.some(s => this.kw(s)) && !this.is('eof')) {
            if (this.cur.t === 'id' && this.cur.v === 'elseif') fail("VHDL writes 'elsif', not 'elseif'", this.cur.at);
            a.push(this.sequential());
        }
        return a;
    }
    sequential() {
        const at = this.cur.at;
        let label = null;
        if (this.cur.t === 'id' && this.peek().t === 'op' && this.peek().v === ':') { label = this.cur.v; this.p += 2; }
        const c = this.cur;
        if (c.t === 'kw') {
            switch (c.v) {
                case 'if': return this.ifStmt(label);
                case 'case': return this.caseStmt(label);
                case 'for': case 'while': case 'loop': return this.loopStmt(label);
                case 'exit': case 'next': {
                    this.p++;
                    let lab = null, cond = null;
                    if (this.cur.t === 'id') lab = this.ident().v;
                    if (this.accept('kw', 'when')) cond = this.expr();
                    this.expect('op', ';');
                    return { k: c.v, label: lab, cond, at };
                }
                case 'return': { this.p++; const val = this.op(';') ? null : this.expr(); this.expect('op', ';'); return { k: 'return', val, at }; }
                case 'null': this.p++; this.expect('op', ';'); return { k: 'null', at };
                case 'assert': return this.assertion();
                case 'report': {
                    this.p++;
                    const report = this.expr();
                    let severity = null;
                    if (this.accept('kw', 'severity')) severity = this.expr();
                    this.expect('op', ';');
                    return { k: 'report', report, severity, at };
                }
                case 'with': return this.selected(label, at, false);
                case 'wait': fail('wait statements are not supported here: give the process a sensitivity list, e.g. process(all) or process(clk)', at);
                case 'process': fail('a process cannot be placed inside another process', at);
                case 'elsif': case 'else': fail(`'${c.v}' without a matching 'if'`, at);
                case 'when': fail("'when' without a matching 'case'", at);
            }
        }
        const target = this.target();
        if (this.accept('op', '<=')) return this.condAssign(label, target, at, false);
        if (this.accept('op', ':=')) {
            const val = this.expr();
            if (this.kw('when')) fail('conditional variable assignments are not supported here; use if', this.cur.at);
            this.expect('op', ';', "';'");
            return { k: 'vasgn', target, val, at };
        }
        if (this.op(';')) { this.p++; return { k: 'pcall', target, at }; }
        this.err("expected '<=' or ':='");
    }
    ifStmt(label) {
        const at = this.expect('kw', 'if').at;
        const branches = [];
        let els = null;
        let cond = this.expr();
        this.expect('kw', 'then', "'then'");
        branches.push({ cond, body: this.seqList(['elsif', 'else', 'end']) });
        for (;;) {
            if (this.accept('kw', 'elsif')) {
                cond = this.expr();
                this.expect('kw', 'then', "'then'");
                branches.push({ cond, body: this.seqList(['elsif', 'else', 'end']) });
                continue;
            }
            if (this.accept('kw', 'else')) els = this.seqList(['end']);
            break;
        }
        this.endStmt('if', label);
        return { k: 'if', branches, els, at };
    }
    caseStmt(label) {
        const at = this.expect('kw', 'case').at;
        const matching = !!this.accept('op', '?');
        const expr = this.expr();
        this.expect('kw', 'is', "'is'");
        const alts = [];
        while (this.kw('when')) {
            const wat = this.cur.at;
            this.p++;
            const choices = this.choices();
            this.expect('op', '=>', "'=>'");
            alts.push({ choices, body: this.seqList(['when', 'end']), at: wat });
        }
        if (!alts.length) this.err("expected 'when'");
        this.endStmt('case', label);
        return { k: 'case', expr, alts, matching, at };
    }
    loopStmt(label) {
        const at = this.cur.at;
        let kind = 'loop', param = null, range = null, cond = null;
        if (this.accept('kw', 'for')) {
            kind = 'for';
            param = this.ident('a loop variable').v;
            this.expect('kw', 'in');
            range = this.rangeSpec();
        } else if (this.accept('kw', 'while')) { kind = 'while'; cond = this.expr(); }
        this.expect('kw', 'loop', "'loop'");
        const body = this.seqList(['end']);
        this.endStmt('loop', label);
        return { k: kind, label, param, range, cond, body, at };
    }

    /* ---------- expressions */
    expr() {
        let l = this.relation();
        const c = this.cur;
        if (c.t === 'kw' && LOGICAL.has(c.v)) {
            const op = c.v;
            while (this.kw(op)) {
                const at = this.cur.at;
                this.p++;
                l = { k: 'bin', op, l, r: this.relation(), at };
                if ((op === 'nand' || op === 'nor') && this.cur.t === 'kw' && LOGICAL.has(this.cur.v)) fail(`'${op}' cannot be chained: add parentheses`, this.cur.at);
            }
            if (this.cur.t === 'kw' && LOGICAL.has(this.cur.v)) fail(`VHDL does not let you mix '${op}' and '${this.cur.v}' without parentheses: write (a ${op} b) ${this.cur.v} c`, this.cur.at);
        }
        return l;
    }
    relation() {
        const l = this.shiftExpr();
        if (this.cur.t === 'op' && RELOPS.has(this.cur.v)) {
            const op = this.cur.v, at = this.cur.at;
            this.p++;
            const r = this.shiftExpr();
            if (this.cur.t === 'op' && RELOPS.has(this.cur.v)) fail('comparisons cannot be chained: write (a < b) and (b < c)', this.cur.at);
            return { k: 'bin', op, l, r, at };
        }
        return l;
    }
    shiftExpr() {
        const l = this.simple();
        if (this.cur.t === 'kw' && SHIFTOPS.has(this.cur.v)) { const op = this.cur.v, at = this.cur.at; this.p++; return { k: 'bin', op, l, r: this.simple(), at }; }
        return l;
    }
    simple() {
        let l;
        if (this.op('+') || this.op('-')) { const op = this.cur.v, at = this.cur.at; this.p++; l = { k: 'un', op, e: this.term(), at }; }
        else l = this.term();
        while (this.op('+') || this.op('-') || this.op('&')) {
            const op = this.cur.v, at = this.cur.at;
            this.p++;
            if (this.op('+') || this.op('-')) fail(`write ${op} (${this.cur.v}x): a sign right after '${op}' needs parentheses in VHDL`, this.cur.at);
            l = { k: 'bin', op, l, r: this.term(), at };
        }
        return l;
    }
    term() {
        let l = this.factor();
        while (this.op('*') || this.op('/') || this.kw('mod') || this.kw('rem')) {
            const op = this.cur.v, at = this.cur.at;
            this.p++;
            l = { k: 'bin', op, l, r: this.factor(), at };
        }
        return l;
    }
    factor() {
        const c = this.cur;
        if (c.t === 'kw' && (c.v === 'not' || c.v === 'abs')) { this.p++; return { k: 'un', op: c.v, e: this.primary(), at: c.at }; }
        if (c.t === 'kw' && LOGICAL.has(c.v)) { this.p++; return { k: 'un', op: c.v, e: this.primary(), at: c.at }; }
        const p = this.primary();
        if (this.op('**')) { const at = this.cur.at; this.p++; return { k: 'bin', op: '**', l: p, r: this.primary(), at }; }
        return p;
    }
    primary() {
        const c = this.cur, at = c.at;
        switch (c.t) {
            case 'int': case 'real':
                this.p++;
                if (this.cur.t === 'id' && PHYS.has(this.cur.v)) { this.p++; return { k: 'phys', v: c.v, at }; }
                return { k: c.t, v: c.v, raw: c.raw, at };
            case 'char': this.p++; return { k: 'char', v: c.v, at };
            case 'str': this.p++; return { k: 'str', v: c.v, at };
            case 'bits': this.p++; return { k: 'bits', v: c.v, raw: c.raw, at };
            case 'id': return this.name();
            case 'op':
                if (c.v === '(') return this.parenOrAgg();
                break;
            case 'kw':
                if (c.v === 'others') fail("'others' only works inside an aggregate, e.g. (others => '0')", at);
                if (c.v === 'open') fail("'open' only works in a port map", at);
                if (c.v === 'null') fail("'null' is not supported in expressions here", at);
                if (c.v === 'in' || c.v === 'out') fail(`'${c.raw}' is a reserved word in VHDL and cannot name a port or signal`, at);
                break;
        }
        this.err('expected a value or an expression');
    }
    name() {
        const t = this.ident();
        let n = { k: 'name', id: t.v, raw: t.raw, at: t.at };
        for (;;) {
            if (this.op('.') && (this.peek().t === 'id' || (this.peek().t === 'kw' && this.peek().v === 'all'))) {
                this.p++;
                const s = this.toks[this.p++];
                n = { k: 'sel', pfx: n, id: s.v, raw: n.raw + '.' + s.raw, at: n.at };
                continue;
            }
            if (this.op('(')) { n = { k: 'call', pfx: n, args: this.callArgs(), raw: n.raw, at: n.at }; continue; }
            if (this.is('tick')) {
                this.p++;
                if (this.op('(')) { n = { k: 'qual', mark: n, e: this.parenOrAgg(), raw: n.raw, at: n.at }; continue; }
                const a = this.cur;
                if (a.t === 'id' || a.t === 'kw') {
                    this.p++;
                    let arg = null;
                    if (this.op('(') && ATTR_ARG.has(a.v)) { this.p++; arg = this.expr(); this.expect('op', ')'); }
                    n = { k: 'attr', pfx: n, attr: a.v, arg, raw: n.raw + "'" + a.raw, at: n.at };
                    continue;
                }
                this.err("expected an attribute name after '");
            }
            return n;
        }
    }
    callArgs() {
        this.expect('op', '(');
        const args = [];
        if (this.op(')')) this.err('expected a value');
        do {
            if (this.accept('kw', 'open')) { args.push({ val: { k: 'open' } }); continue; }
            const e = this.expr();
            if (this.kw('to') || this.kw('downto')) { const dir = this.toks[this.p++].v; args.push({ val: { k: 'range', l: e, dir, r: this.expr(), at: e.at } }); continue; }
            if (this.accept('op', '=>')) { args.push({ formal: e, val: this.expr() }); continue; }
            args.push({ val: e });
        } while (this.accept('op', ','));
        this.expect('op', ')', "')'");
        return args;
    }
    parenOrAgg() {
        const at = this.expect('op', '(').at;
        const items = [];
        do {
            if (this.accept('kw', 'others')) {
                this.expect('op', '=>', "'=>' after others");
                items.push({ choices: [{ k: 'others' }], val: this.expr() });
                continue;
            }
            let e = this.expr();
            if (this.kw('to') || this.kw('downto')) { const dir = this.toks[this.p++].v; e = { k: 'range', l: e, dir, r: this.expr(), at: e.at }; }
            if (this.op('|') || this.op('=>')) {
                const choices = [e];
                while (this.accept('op', '|')) {
                    if (this.accept('kw', 'others')) { choices.push({ k: 'others' }); continue; }
                    let c = this.expr();
                    if (this.kw('to') || this.kw('downto')) { const dir = this.toks[this.p++].v; c = { k: 'range', l: c, dir, r: this.expr(), at: c.at }; }
                    choices.push(c);
                }
                this.expect('op', '=>', "'=>'");
                items.push({ choices, val: this.expr() });
                continue;
            }
            if (e.k === 'range') this.err("expected '=>'");
            items.push({ choices: null, val: e });
        } while (this.accept('op', ','));
        this.expect('op', ')', "')'");
        if (items.length === 1 && !items[0].choices) return { k: 'paren', e: items[0].val, at };
        return { k: 'agg', items, at };
    }
}

/* =============================================================== types */
function mkEnum(name, lits) { const t = { k: 'enum', name, lits, map: new Map(lits.map((l, i) => [l, i])) }; t.base = t; return t; }
function sub(base, props) { const t = Object.assign({}, base, props); t.base = base.base; return t; }
function mkArr(name, elem, idx) { const t = { k: 'arr', name, elem, idx, rng: null }; t.base = t; return t; }

const STD_ULOGIC = mkEnum('std_ulogic', [...'UX01ZWLH-'].map(c => `'${c}'`));
const STD_LOGIC = sub(STD_ULOGIC, { name: 'std_logic', resolved: true });
const BIT = mkEnum('bit', ["'0'", "'1'"]);
const BOOLEAN = mkEnum('boolean', ['false', 'true']);
const CHARS = [];
for (let i = 0; i < 256; i++) CHARS.push("'" + String.fromCharCode(i) + "'");
const CHARACTER = mkEnum('character', CHARS);
const SEVERITY = mkEnum('severity_level', ['note', 'warning', 'error', 'failure']);
const INTEGER = { k: 'int', name: 'integer', lo: -2147483648, hi: 2147483647 };
INTEGER.base = INTEGER;
const NATURAL = sub(INTEGER, { name: 'natural', lo: 0 });
const POSITIVE = sub(INTEGER, { name: 'positive', lo: 1 });
const UNIV = sub(INTEGER, { name: 'integer', univ: true });
const TIME = { k: 'time', name: 'time' };
TIME.base = TIME;
const SULV = mkArr('std_ulogic_vector', STD_ULOGIC, NATURAL);
const SLV = sub(SULV, { name: 'std_logic_vector', elem: STD_LOGIC });
const UNSIGNED = mkArr('unsigned', STD_LOGIC, NATURAL);
UNSIGNED.num = 'u';
const SIGNED = mkArr('signed', STD_LOGIC, NATURAL);
SIGNED.num = 's';
const BIT_VECTOR = mkArr('bit_vector', BIT, NATURAL);
const STRING = mkArr('string', CHARACTER, POSITIVE);

const isArr = t => !!t && t.k === 'arr';
const isInt = t => !!t && t.k === 'int';
const isEnum = t => !!t && t.k === 'enum';
const isLogic = t => isEnum(t) && t.base === STD_ULOGIC;
const isLogicArr = t => isArr(t) && isLogic(t.elem);
const isNum = t => isArr(t) && !!t.base.num;
const rlen = r => { const n = r.dir === 'downto' ? r.l - r.r + 1 : r.r - r.l + 1; return n < 0 ? 0 : n; };
const tlen = t => (t.rng ? rlen(t.rng) : null);
function leafCount(t) {
    if (!isArr(t)) return 1;
    const n = tlen(t), e = leafCount(t.elem);
    return n === null || e === null ? null : n * e;
}
function constrain(t, rng) { return sub(t, { rng }); }
function mkRange(l, dir, len) { return { l, dir, r: dir === 'downto' ? l - len + 1 : l + len - 1 }; }
function tname(t) {
    if (!t) return '?';
    if (isArr(t) && t.rng) return `${t.name}(${t.rng.l} ${t.rng.dir} ${t.rng.r})`;
    return t.name;
}
function resolvedType(t) { return isArr(t) ? resolvedType(t.elem) : !!t.resolved; }
function idxLo(t) { return t.idx && t.idx.lo > 0 ? t.idx.lo : 0; }

/* =========================================================== std_logic */
const is0 = v => v === 2 || v === 6;
const is1 = v => v === 3 || v === 7;
function sAnd(a, b) { if (is0(a) || is0(b)) return 2; if (is1(a) && is1(b)) return 3; return a === 0 || b === 0 ? 0 : 1; }
function sOr(a, b) { if (is1(a) || is1(b)) return 3; if (is0(a) && is0(b)) return 2; return a === 0 || b === 0 ? 0 : 1; }
function sXor(a, b) { if (a === 0 || b === 0) return 0; if ((is0(a) || is1(a)) && (is0(b) || is1(b))) return is1(a) !== is1(b) ? 3 : 2; return 1; }
function sNot(a) { return a === 0 ? 0 : is0(a) ? 3 : is1(a) ? 2 : 1; }
const RES = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 2, 1, 2, 2, 2, 2, 1],
    [0, 1, 1, 3, 3, 3, 3, 3, 1],
    [0, 1, 2, 3, 4, 5, 6, 7, 1],
    [0, 1, 2, 3, 5, 5, 5, 5, 1],
    [0, 1, 2, 3, 6, 5, 6, 5, 1],
    [0, 1, 2, 3, 7, 5, 5, 7, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1]
];
const SL_FN = {
    and: sAnd, or: sOr, xor: sXor,
    nand: (a, b) => sNot(sAnd(a, b)), nor: (a, b) => sNot(sOr(a, b)), xnor: (a, b) => sNot(sXor(a, b))
};
const B_FN = {
    and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b,
    nand: (a, b) => 1 - (a & b), nor: (a, b) => 1 - (a | b), xnor: (a, b) => 1 - (a ^ b)
};
const SLCH = 'UX01ZWLH-';

/* ============================================================== values */
const copyVal = v => (typeof v === 'object' ? { l: v.l, dir: v.dir, v: v.v.map(copyVal) } : v);
const vRight = a => (a.dir === 'downto' ? a.l - a.v.length + 1 : a.l + a.v.length - 1);
function vPos(a, i, at) {
    const p = a.dir === 'downto' ? a.l - i : i - a.l;
    if (!(p >= 0 && p < a.v.length)) fail(`index ${i} is outside the range ${a.l} ${a.dir} ${vRight(a)}`, at);
    return p;
}
function flat(v, out) { if (typeof v === 'number') out.push(v); else for (const e of v.v) flat(e, out); return out; }
function unflat(t, leaves, off) {
    if (!isArr(t)) return leaves[off];
    const n = tlen(t), per = leafCount(t.elem), v = new Array(n);
    if (per === 1 && !isArr(t.elem)) for (let i = 0; i < n; i++) v[i] = leaves[off + i];
    else for (let i = 0; i < n; i++) v[i] = unflat(t.elem, leaves, off + i * per);
    return { l: t.rng.l, dir: t.rng.dir, v };
}
function defVal(t, at) {
    if (isArr(t)) {
        const n = tlen(t);
        if (n === null) fail(`${t.name} needs a size here, e.g. ${t.name}(7 downto 0)`, at);
        const v = new Array(n);
        for (let i = 0; i < n; i++) v[i] = defVal(t.elem, at);
        return { l: t.rng.l, dir: t.rng.dir, v };
    }
    if (t.k === 'int') return t.lo;
    return 0;
}
function vecBig(a) {
    let r = 0n;
    for (const b of a.v) {
        if (is1(b)) r = (r << 1n) | 1n;
        else if (is0(b)) r <<= 1n;
        else return null;
    }
    return r;
}
function vecSBig(a) {
    const u = vecBig(a);
    if (u === null || !a.v.length) return u;
    return is1(a.v[0]) ? u - (1n << BigInt(a.v.length)) : u;
}
function bigVec(x, n) {
    const v = new Array(n);
    let y = BigInt.asUintN(n, x);
    for (let i = n - 1; i >= 0; i--) { v[i] = y & 1n ? 3 : 2; y >>= 1n; }
    return { l: n - 1, dir: 'downto', v };
}
const xVec = n => ({ l: n - 1, dir: 'downto', v: new Array(n).fill(1) });
const toDown = v => ({ l: v.v.length - 1, dir: 'downto', v: v.v });
function intChk(v, at) {
    if (v > 2147483647 || v < -2147483648 || !Number.isFinite(v)) fail('integer overflow: the result does not fit in a 32-bit integer', at);
    return v;
}
function showVal(t, v) {
    if (isArr(t) && t.elem && isEnum(t.elem)) return '"' + v.v.map(e => t.elem.lits[e].slice(1, -1)).join('') + '"';
    if (isEnum(t)) return t.lits[v];
    return String(v);
}
function strOf(t, v) {
    if (isArr(t) && t.base === STRING) return v.v.map(c => String.fromCharCode(c)).join('');
    if (isArr(t) && isEnum(t.elem)) return v.v.map(e => t.elem.lits[e].length === 3 ? t.elem.lits[e][1] : t.elem.lits[e]).join('');
    if (isEnum(t)) return t.lits[v].length === 3 && t.lits[v][0] === "'" ? t.lits[v][1] : t.lits[v];
    return String(v);
}

/* ============================================================== scopes */
class Scope {
    constructor(parent, kind) { this.parent = parent; this.kind = kind; this.m = new Map(); }
    find(n) { for (let s = this; s; s = s.parent) { const o = s.m.get(n); if (o) return o; } return null; }
    add(n, o, at) {
        const prev = this.m.get(n);
        if (prev) {
            if (prev.cls === 'func' && o.cls === 'func') { prev.list = prev.list.concat(o.list); return; }
            if (prev.cls === 'enumlit' && o.cls === 'enumlit') { prev.list = prev.list.concat(o.list); return; }
            if (this.kind === 'use') { this.m.set(n, o); return; }
            fail(`'${n}' is declared twice here`, at);
        }
        this.m.set(n, o);
    }
}
const K = (t, v) => ({ t, f: () => v, st: true, sv: v });
const CTXR = n => ({ ctx: true, n });

/* ============================================================ packages */
const HINT_PKG = {
    std_logic: 'std_logic_1164', std_ulogic: 'std_logic_1164', std_logic_vector: 'std_logic_1164', std_ulogic_vector: 'std_logic_1164',
    rising_edge: 'std_logic_1164', falling_edge: 'std_logic_1164',
    unsigned: 'numeric_std', signed: 'numeric_std', to_unsigned: 'numeric_std', to_signed: 'numeric_std', to_integer: 'numeric_std',
    resize: 'numeric_std', shift_left: 'numeric_std', shift_right: 'numeric_std', rotate_left: 'numeric_std', rotate_right: 'numeric_std'
};

function builtin(name, impl) { return { cls: 'func', list: [{ builtin: true, name, impl }] }; }

/* the design: analysis, elaboration and the simulation kernel */
class Design {
    constructor() {
        this.units = [];
        this.ents = new Map(); this.archs = new Map(); this.pkgs = new Map(); this.bodies = new Map();
        this.sigs = []; this.procs = []; this.warns = []; this.msgs = [];
        this.cur = null;
        this.delta = 0; this.pending = []; this.extDirty = []; this.iter = 0;
        this.fileNames = [];
        this.std = this.makeStd();
        this.ieee = this.makeIeee();
        this.pkgScopes = new Map();
    }
    warn(msg, at) { if (!this.warns.some(w => w.msg === msg && w.at === at)) this.warns.push({ msg, at }); }
    message(sev, msg, at) { if (this.msgs.length < 30) this.msgs.push({ sev, msg, at }); if (sev === 'failure') fail(`assertion failure: ${msg}`, at); }

    /* ---------- the built-in packages */
    makeStd() {
        const s = new Scope(null, 'std');
        for (const t of [BOOLEAN, BIT, CHARACTER, SEVERITY, INTEGER, NATURAL, POSITIVE, STRING, BIT_VECTOR, TIME]) s.add(t.name, { cls: 'type', t });
        BOOLEAN.lits.forEach((l, i) => s.add(l, { cls: 'enumlit', list: [{ t: BOOLEAN, pos: i }] }));
        SEVERITY.lits.forEach((l, i) => s.add(l, { cls: 'enumlit', list: [{ t: SEVERITY, pos: i }] }));
        s.add('to_string', builtin('to_string', (A, args, want, sc, at) => {
            A.arity(args, 1, 1, 'to_string', at);
            const x = A.exT(args[0].val, null, sc);
            return { t: STRING, f: E => { const s2 = strOf(x.t, x.f(E)); return { l: 1, dir: 'to', v: [...s2].map(c => c.charCodeAt(0)) }; }, st: false };
        }));
        for (const nm of ['minimum', 'maximum']) {
            s.add(nm, builtin(nm, (A, args, want, sc, at) => {
                A.arity(args, 2, 2, nm, at);
                const a = A.exT(args[0].val, INTEGER, sc), b = A.exT(args[1].val, INTEGER, sc);
                if (!isInt(a.t) || !isInt(b.t)) fail(`${nm} works on integers here`, at);
                const f = nm === 'minimum' ? E => Math.min(a.f(E), b.f(E)) : E => Math.max(a.f(E), b.f(E));
                return A.mk(INTEGER, f, [a, b]);
            }));
        }
        return s;
    }
    makeIeee() {
        const P = { std_logic_1164: new Map(), numeric_std: new Map(), numeric_std_unsigned: new Map() };
        const p1 = P.std_logic_1164;
        for (const t of [STD_ULOGIC, STD_LOGIC, SULV, SLV]) p1.set(t.name, { cls: 'type', t });
        for (const nm of ['rising_edge', 'falling_edge']) {
            p1.set(nm, builtin(nm, (A, args, want, sc, at) => {
                A.arity(args, 1, 1, nm, at);
                const r = A.resolve(args[0].val, sc);
                if (r.cls !== 'sig' || !isLogic(r.t)) fail(`${nm} needs a std_logic signal, e.g. ${nm}(clk)`, at);
                if (A.cur && A.cur.func) fail('a function cannot look at signals', at);
                A.noteRead(r);
                A.cur.edge = true;
                const sig = r.sig, off = r.off;
                if (off === undefined) fail(`${nm} needs a plain signal`, at);
                const D = A;
                const f = nm === 'rising_edge'
                    ? () => (sig.chg[off] === D.delta && is1(sig.cur[off]) && is0(sig.last[off]) ? 1 : 0)
                    : () => (sig.chg[off] === D.delta && is0(sig.cur[off]) && is1(sig.last[off]) ? 1 : 0);
                return { t: BOOLEAN, f, st: false };
            }));
        }
        p1.set('to_x01', builtin('to_x01', (A, args, want, sc, at) => {
            A.arity(args, 1, 1, 'to_x01', at);
            const x = A.exT(args[0].val, want, sc);
            const m = v => (is1(v) ? 3 : is0(v) ? 2 : 1);
            if (isLogic(x.t)) return A.mk(x.t, E => m(x.f(E)), [x]);
            if (isLogicArr(x.t)) return A.mk(x.t, E => { const a = x.f(E); return { l: a.l, dir: a.dir, v: a.v.map(m) }; }, [x]);
            fail('to_x01 needs std_logic or a std_logic vector', at);
        }));
        const p2 = P.numeric_std;
        for (const t of [UNSIGNED, SIGNED]) p2.set(t.name, { cls: 'type', t });
        p2.set('to_integer', builtin('to_integer', (A, args, want, sc, at) => {
            A.arity(args, 1, 1, 'to_integer', at);
            const x = A.exT(args[0].val, null, sc);
            const slvOk = isLogicArr(x.t) && !isNum(x.t) && A.nsu(sc);
            if (!isNum(x.t) && !slvOk) {
                if (isLogicArr(x.t)) fail(`to_integer needs unsigned or signed, not ${x.t.name}: write to_integer(unsigned(v))`, at);
                fail(`to_integer needs unsigned or signed, not ${tname(x.t)}`, at);
            }
            const sg = x.t.base === SIGNED;
            return A.mk(sg ? INTEGER : NATURAL, E => {
                const a = x.f(E), b = sg ? vecSBig(a) : vecBig(a);
                if (b === null) { A.message('warning', 'to_integer: the value contains U, X, Z or -, so 0 is returned', at); return 0; }
                if (b > 2147483647n || b < -2147483648n) fail('to_integer: the value does not fit in an integer', at);
                return Number(b);
            }, [x]);
        }));
        for (const [nm, T] of [['to_unsigned', UNSIGNED], ['to_signed', SIGNED]]) {
            p2.set(nm, builtin(nm, (A, args, want, sc, at) => {
                A.arity(args, 2, 2, nm, at);
                const x = A.exT(args[0].val, INTEGER, sc), n = A.exT(args[1].val, NATURAL, sc);
                if (!isInt(x.t)) fail(`${nm} converts an integer; this argument is ${tname(x.t)}`, args[0].val.at);
                if (!isInt(n.t)) fail(`the second argument of ${nm} is the number of bits`, args[1].val.at);
                const t = n.st ? constrain(T, mkRange(n.sv - 1, 'downto', n.sv)) : T;
                return A.mk(t, E => {
                    const v = x.f(E), w = n.f(E);
                    if (T === UNSIGNED && v < 0) fail(`to_unsigned cannot convert the negative number ${v}`, at);
                    const lim = 2n ** BigInt(T === UNSIGNED ? w : Math.max(w - 1, 0));
                    const b = BigInt(v);
                    if ((T === UNSIGNED && b >= lim) || (T === SIGNED && (b >= lim || b < -lim))) A.message('warning', `${nm}: ${v} does not fit in ${w} bits and is truncated`, at);
                    return bigVec(b, w);
                }, [x, n]);
            }));
        }
        p2.set('resize', builtin('resize', (A, args, want, sc, at) => {
            A.arity(args, 2, 2, 'resize', at);
            const x = A.exT(args[0].val, null, sc), n = A.exT(args[1].val, NATURAL, sc);
            if (!isNum(x.t)) fail(`resize works on unsigned and signed, not ${tname(x.t)}`, at);
            const sg = x.t.base === SIGNED;
            const t = n.st ? constrain(x.t.base, mkRange(n.sv - 1, 'downto', n.sv)) : x.t.base;
            return A.mk(t, E => {
                const a = x.f(E), w = n.f(E), L = a.v.length, v = new Array(w);
                if (!sg) for (let i = 0; i < w; i++) v[w - 1 - i] = i < L ? a.v[L - 1 - i] : 2;
                else {
                    if (!L) return { l: w - 1, dir: 'downto', v: v.fill(2) };
                    for (let i = 0; i < w; i++) v[w - 1 - i] = i < L ? a.v[L - 1 - i] : a.v[0];
                    if (w > 0 && w < L) v[0] = a.v[0];
                }
                return { l: w - 1, dir: 'downto', v };
            }, [x, n]);
        }));
        for (const nm of ['shift_left', 'shift_right', 'rotate_left', 'rotate_right']) {
            p2.set(nm, builtin(nm, (A, args, want, sc, at) => {
                A.arity(args, 2, 2, nm, at);
                const x = A.exT(args[0].val, null, sc), n = A.exT(args[1].val, NATURAL, sc);
                if (!isNum(x.t) && !(isLogicArr(x.t) && A.nsu(sc))) fail(`${nm} works on unsigned and signed, not ${tname(x.t)}`, at);
                const sg = x.t.base === SIGNED;
                return A.mk(sub(x.t, { rng: x.t.rng }), E => {
                    const a = x.f(E), k = n.f(E), L = a.v.length, v = new Array(L);
                    for (let i = 0; i < L; i++) {
                        if (nm === 'shift_left') v[i] = i + k < L ? a.v[i + k] : 2;
                        else if (nm === 'shift_right') v[i] = i - k >= 0 ? a.v[i - k] : (sg ? a.v[0] : 2);
                        else if (nm === 'rotate_left') v[i] = a.v[(i + k) % L];
                        else v[i] = a.v[(((i - k) % L) + L) % L];
                    }
                    return { l: a.l, dir: a.dir, v };
                }, [x, n]);
            }));
        }
        p2.set('std_match', builtin('std_match', (A, args, want, sc, at) => {
            A.arity(args, 2, 2, 'std_match', at);
            let a = A.ex(args[0].val, null, sc), b = A.ex(args[1].val, null, sc);
            if (a.ctx && b.ctx) fail('std_match needs at least one typed argument', at);
            if (a.ctx) a = A.exT(args[0].val, b.t, sc);
            if (b.ctx) b = A.exT(args[1].val, a.t, sc);
            const m = (x, y) => x === 8 || y === 8 || (is1(x) && is1(y)) || (is0(x) && is0(y));
            if (isLogic(a.t) && isLogic(b.t)) return A.mk(BOOLEAN, E => (m(a.f(E), b.f(E)) ? 1 : 0), [a, b]);
            if (isLogicArr(a.t) && isLogicArr(b.t)) return A.mk(BOOLEAN, E => { const x = a.f(E), y = b.f(E); return x.v.length === y.v.length && x.v.every((e, i) => m(e, y.v[i])) ? 1 : 0; }, [a, b]);
            fail('std_match compares std_logic values or vectors', at);
        }));
        const p3 = P.numeric_std_unsigned;
        p3.set('to_integer', p2.get('to_integer'));
        for (const nm of ['to_slv', 'to_stdlogicvector', 'to_std_logic_vector']) {
            p3.set(nm, builtin(nm, (A, args, want, sc, at) => {
                A.arity(args, 2, 2, nm, at);
                const x = A.exT(args[0].val, NATURAL, sc), n = A.exT(args[1].val, NATURAL, sc);
                const t = n.st ? constrain(SLV, mkRange(n.sv - 1, 'downto', n.sv)) : SLV;
                return A.mk(t, E => bigVec(BigInt(x.f(E)), n.f(E)), [x, n]);
            }));
        }
        p3.marker = true;
        return P;
    }
    nsu(sc) { return !!sc.find('__numeric_std_unsigned'); }

    /* ---------- design units */
    addFile(text, idx, name) {
        this.fileNames[idx] = name;
        const units = new Parser(lex(text, idx)).file();
        for (const u of units) {
            u.file = idx;
            if (u.k === 'entity') {
                if (this.ents.has(u.name)) {
                    const prev = this.ents.get(u.name);
                    fail(`entity '${u.name}' is already defined${prev.file !== idx ? ' by this problem (you only write the other parts)' : ''}`, u.at);
                }
                this.ents.set(u.name, u);
            } else if (u.k === 'arch') {
                if (!this.archs.has(u.ent)) this.archs.set(u.ent, []);
                this.archs.get(u.ent).push(u);
            } else if (u.k === 'pkg') this.pkgs.set(u.name, u);
            else if (u.k === 'pbody') this.bodies.set(u.name, u);
            this.units.push(u);
        }
    }
    contextScope(unit) {
        const s = new Scope(this.std, 'use');
        const ctxs = [];
        if (unit.k === 'arch') {
            const e = this.ents.get(unit.ent);
            if (e) ctxs.push(...e.ctx);
        }
        if (unit.k === 'pbody') { const p = this.pkgs.get(unit.name); if (p) ctxs.push(...p.ctx); }
        ctxs.push(...unit.ctx);
        const libs = new Set(['std', 'work']);
        for (const c of ctxs) {
            if (c.k === 'library') { c.names.forEach(n => libs.add(n)); continue; }
            for (const parts of c.names) {
                const [lib, pkg, item] = parts;
                if (!libs.has(lib)) fail(`'${lib}' is not visible here: add 'library ${lib};' before this use clause`, c.at);
                if (parts.length < 3) fail(`write 'use ${lib}.${pkg || 'package'}.all;'`, c.at);
                const entries = this.pkgEntries(lib, pkg, c.at);
                if (item === 'all') for (const [k, v] of entries) s.add(k, v);
                else {
                    const v = entries.get(item);
                    if (!v) fail(`package ${lib}.${pkg} has no '${item}'`, c.at);
                    s.add(item, v);
                }
            }
        }
        return s;
    }
    pkgEntries(lib, pkg, at) {
        if (lib === 'ieee') {
            if (pkg === 'std_logic_arith' || pkg === 'std_logic_unsigned' || pkg === 'std_logic_signed') fail(`ieee.${pkg} is an old, non-standard package. Use ieee.numeric_std and the types unsigned/signed instead`, at);
            const p = this.ieee[pkg];
            if (!p) fail(`package ieee.${pkg} is not available here (supported: std_logic_1164, numeric_std, numeric_std_unsigned)`, at);
            if (pkg === 'numeric_std_unsigned') { const m = new Map(p); m.set('__numeric_std_unsigned', { cls: 'marker' }); return m; }
            return p;
        }
        if (lib === 'std') {
            if (pkg === 'standard') return this.std.m;
            fail(`package std.${pkg} is not available here`, at);
        }
        if (lib === 'work') {
            const pu = this.pkgs.get(pkg);
            if (!pu) fail(`there is no package '${pkg}' in work`, at);
            return this.packageScope(pu).m;
        }
        fail(`library '${lib}' is not available here`, at);
    }
    packageScope(pu) {
        if (this.pkgScopes.has(pu)) return this.pkgScopes.get(pu);
        const s = new Scope(this.contextScope(pu), 'pkg');
        this.pkgScopes.set(pu, s);
        const saved = this.cur;
        this.cur = { func: false, slots: 0, reads: new Map(), drives: new Map(), edge: false, inits: [], pkg: true };
        for (const d of pu.decls) this.declare(d, s);
        const body = this.bodies.get(pu.name);
        if (body) {
            const bs = new Scope(s, 'pkgbody');
            for (const d of body.decls) {
                if (d.k === 'function') {
                    const o = s.m.get(d.name);
                    const fd = o && o.cls === 'func' && o.list.find(f => !f.builtin && !f.decl.body && f.decl.params.length === d.params.length);
                    if (fd) { fd.decl = d; fd.scope = bs; continue; }
                }
                this.declare(d, bs);
            }
        }
        this.cur = saved;
        return s;
    }

    /* ---------- subtypes and ranges */
    typeMark(mark, sc) {
        const o = sc.find(mark.name);
        if (!o) {
            const pk = HINT_PKG[mark.name];
            fail(`'${mark.raw}' is not declared${pk ? `: add 'library ieee; use ieee.${pk}.all;' above this design unit (each entity and package needs its own)` : ''}`, mark.at);
        }
        if (o.cls !== 'type') fail(`'${mark.raw}' is not a type`, mark.at);
        return o.t;
    }
    subtype(st, sc, opt) {
        let t = this.typeMark(st.mark, sc);
        if (!st.cons) return t;
        if (st.cons.k === 'range') {
            const r = this.staticRange(st.cons.r, sc);
            if (isInt(t)) return sub(t, { lo: Math.min(r.l, r.r), hi: Math.max(r.l, r.r), name: t.name });
            fail(`a range constraint does not fit ${t.name}`, st.at);
        }
        if (!isArr(t)) fail(`${t.name} is not an array type, so it takes no (… downto …)`, st.at);
        if (t.rng) fail(`${t.name} already has a size`, st.at);
        if (st.cons.rs.length !== 1) fail('arrays with more than one dimension are not supported here', st.at);
        const rs = st.cons.rs[0];
        if (rs.k === 'box') return t;
        const r = this.rangeOf(rs, sc);
        if (r.st) return constrain(t, r.sv);
        if (opt && opt.dyn) return Object.assign(sub(t, { rng: null }), { rngF: r.f });
        fail('the size here must be a constant', st.at);
    }
    // a range: { st, sv: {l, dir, r}, f: E => {l, dir, r}, t: index type }
    rangeOf(rs, sc) {
        if (rs.k === 'range' || (rs.k === 'range' && rs.mark)) {
            const l = this.exT(rs.l, INTEGER, sc), r = this.exT(rs.r, INTEGER, sc);
            const dir = rs.dir;
            if (!((isInt(l.t) && isInt(r.t)) || (isEnum(l.t) && l.t.base === r.t.base))) fail('the bounds of a range must be integers', rs.at);
            const it = isInt(l.t) ? INTEGER : l.t;
            if (l.st && r.st) { const sv = { l: l.sv, dir, r: r.sv }; return { st: true, sv, f: () => sv, t: it }; }
            return { st: false, f: E => ({ l: l.f(E), dir, r: r.f(E) }), t: it };
        }
        if (rs.k === 'rexpr') {
            const e = rs.e;
            if (e.k === 'attr' && (e.attr === 'range' || e.attr === 'reverse_range')) {
                const r = this.resolve(e.pfx, sc);
                const rev = e.attr === 'reverse_range';
                const flip = x => (rev ? { l: x.r, dir: x.dir === 'to' ? 'downto' : 'to', r: x.l } : x);
                let t = r.t;
                if (r.cls === 'type') t = r.t;
                if (isArr(t) && t.rng) { const sv = flip(t.rng); return { st: true, sv, f: () => sv, t: INTEGER }; }
                if (isArr(t) && t.rngF) return { st: false, f: E => flip(t.rngF(E)), t: INTEGER };
                if (isArr(t)) {
                    const x = this.valueOf(r, e.pfx, sc);
                    return { st: false, f: E => { const a = x.f(E); return flip({ l: a.l, dir: a.dir, r: vRight(a) }); }, t: INTEGER };
                }
                if (r.cls === 'type' && isInt(t)) { const sv = flip({ l: t.lo, dir: 'to', r: t.hi }); return { st: true, sv, f: () => sv, t }; }
                if (r.cls === 'type' && isEnum(t)) { const sv = flip({ l: 0, dir: 'to', r: t.lits.length - 1 }); return { st: true, sv, f: () => sv, t }; }
                fail(`'${e.raw}' is not a range`, rs.at);
            }
            if (e.k === 'name' || e.k === 'sel') {
                const r = this.resolve(e, sc);
                if (r.cls === 'type') {
                    const t = r.t;
                    if (isInt(t)) { const sv = { l: t.lo, dir: 'to', r: t.hi }; return { st: true, sv, f: () => sv, t }; }
                    if (isEnum(t)) { const sv = { l: 0, dir: 'to', r: t.lits.length - 1 }; return { st: true, sv, f: () => sv, t }; }
                    if (isArr(t) && t.rng) { const sv = t.rng; return { st: true, sv, f: () => sv, t: INTEGER }; }
                }
            }
            fail('expected a range like 0 to 7 or 7 downto 0', rs.at);
        }
        if (rs.k === 'box') fail("'range <>' is only allowed in an array type declaration", rs.at);
        fail('expected a range', rs.at);
    }
    staticRange(rs, sc) {
        const r = this.rangeOf(rs, sc);
        if (!r.st) fail('this range must be a constant here', rs.at);
        return r.sv;
    }
    staticInt(n, sc) {
        const x = this.exT(n, INTEGER, sc);
        if (!x.st) fail('this value must be a constant here', n.at);
        return x.sv;
    }

    /* ---------- declarations */
    declare(d, sc) {
        switch (d.k) {
            case 'use': {
                const s2 = this.contextScope({ k: 'x', ctx: [{ k: 'library', names: ['ieee'] }, d] });
                for (const [k, v] of s2.m) sc.add(k, v, d.at);
                return;
            }
            case 'signal': {
                if (this.cur && (this.cur.proc || this.cur.func)) fail('signals are declared in the architecture (before begin), not inside a process or function', d.at);
                const t = this.subtype(d.st, sc);
                if (leafCount(t) === null) fail(`signal ${d.names.join(', ')} needs a size: ${t.name}(N-1 downto 0)`, d.at);
                let init = null;
                if (d.init) {
                    const x = this.exT(d.init, t, sc);
                    const cv = this.fit(x, t, d.init.at, `signal '${d.names[0]}'`);
                    if (!x.st) fail('the initial value of a signal must be a constant', d.init.at);
                    init = cv(x.sv);
                }
                for (const nm of d.names) {
                    const sig = this.newSig((this.path || '') + nm, t, init !== null ? init : defVal(t, d.at), d.at);
                    sc.add(nm, { cls: 'sig', sig, off: 0, t, mode: 'sig', name: nm }, d.at);
                }
                return;
            }
            case 'constant': {
                let t = this.subtype(d.st, sc);
                if (!d.init) fail(`constant ${d.names.join(', ')} needs a value: constant ${d.names[0]} : ${t.name} := ...;`, d.at);
                const x = this.exT(d.init, t, sc);
                const cv = this.fit(x, t, d.init.at, `constant '${d.names[0]}'`);
                if (isArr(t) && !t.rng) t = x.t;
                if (x.st) { const v = cv(x.sv); for (const nm of d.names) sc.add(nm, { cls: 'const', t, v, name: nm }, d.at); return; }
                if (!this.cur || !(this.cur.proc || this.cur.func)) fail('the value of this constant must be computable before the simulation starts', d.init.at);
                for (const nm of d.names) {
                    const slot = this.cur.slots++;
                    this.cur.inits.push({ slot, f: E => copyVal(cv(x.f(E))) });
                    sc.add(nm, { cls: 'param', slot, t, name: nm }, d.at);
                }
                return;
            }
            case 'variable': {
                if (!this.cur || !(this.cur.proc || this.cur.func)) fail('variables live inside a process or a function; in the architecture declare a signal', d.at);
                const t = this.subtype(d.st, sc, { dyn: true });
                let x = null, cv = null;
                if (d.init) { x = this.exT(d.init, t, sc); cv = this.fit(x, t, d.init.at, `variable '${d.names[0]}'`); }
                for (const nm of d.names) {
                    const slot = this.cur.slots++;
                    const mk = t.rngF ? E => defVal(constrain(t, t.rngF(E)), d.at) : () => defVal(t, d.at);
                    this.cur.inits.push({ slot, f: x ? E => copyVal(cv(x.f(E))) : mk });
                    sc.add(nm, { cls: 'var', slot, t, name: nm }, d.at);
                }
                return;
            }
            case 'type': {
                const df = d.def;
                if (df.k === 'enum') {
                    const t = mkEnum(d.name, df.lits);
                    sc.add(d.name, { cls: 'type', t }, d.at);
                    df.lits.forEach((l, i) => { if (l[0] !== "'") sc.add(l, { cls: 'enumlit', list: [{ t, pos: i }] }, d.at); });
                    return;
                }
                if (df.k === 'int') {
                    const r = this.staticRange(df.r, sc);
                    const t = { k: 'int', name: d.name, lo: Math.min(r.l, r.r), hi: Math.max(r.l, r.r) };
                    t.base = t;
                    sc.add(d.name, { cls: 'type', t }, d.at);
                    return;
                }
                if (df.rs.length !== 1) fail('arrays with more than one dimension are not supported here', d.at);
                const elem = this.subtype(df.elem, sc);
                if (isArr(elem) && !elem.rng) fail('the element type of an array needs a size here', d.at);
                const rs = df.rs[0];
                const t = mkArr(d.name, elem, NATURAL);
                if (rs.k === 'box') {
                    const it = this.typeMark({ name: rs.mark.id || (rs.mark.k === 'name' ? rs.mark.id : ''), raw: rs.mark.raw, at: rs.at }, sc);
                    t.idx = it;
                } else t.rng = this.staticRange(rs, sc);
                sc.add(d.name, { cls: 'type', t }, d.at);
                return;
            }
            case 'subtype': sc.add(d.name, { cls: 'type', t: Object.assign(this.subtype(d.st, sc), { name: d.name }) }, d.at); return;
            case 'component': sc.add(d.name, { cls: 'comp', decl: d, scope: sc }, d.at); return;
            case 'function': sc.add(d.name, { cls: 'func', list: [{ builtin: false, decl: d, scope: sc, compiled: null }] }, d.at); return;
            case 'alias': sc.add(d.name, { cls: 'alias', target: d.target, scope: sc, st: d.st }, d.at); return;
        }
        fail(`unsupported declaration '${d.k}'`, d.at);
    }

    newSig(name, t, init, at) {
        const leaves = flat(init, []);
        const s = {
            name, t, at, n: leaves.length, init: leaves, cur: leaves.slice(), last: leaves.slice(),
            chg: new Int32Array(leaves.length).fill(-1), drivers: [], procs: [], resolved: resolvedType(t), ext: null
        };
        this.sigs.push(s);
        return s;
    }

    /* ---------- names */
    resolve(n, sc) {
        switch (n.k) {
            case 'name': {
                const o = sc.find(n.id);
                if (!o) {
                    const pk = HINT_PKG[n.id];
                    fail(`'${n.raw}' is not declared${pk ? `: add 'library ieee; use ieee.${pk}.all;' above this design unit` : ''}`, n.at);
                }
                if (o.cls === 'alias') {
                    const r = this.resolve(o.target, o.scope);
                    return Object.assign({}, r, { name: n.raw });
                }
                if (o.cls === 'marker') fail(`'${n.raw}' is not declared`, n.at);
                return Object.assign({ name: n.raw }, o);
            }
            case 'sel': {
                if (n.pfx.k === 'name' && (n.pfx.id === 'ieee' || n.pfx.id === 'work' || n.pfx.id === 'std')) return { cls: 'lib', lib: n.pfx.id, pkg: n.id };
                const p = this.resolve(n.pfx, sc);
                if (p.cls === 'lib') {
                    if (p.pkg) {
                        const entries = this.pkgEntries(p.lib, p.pkg, n.at);
                        const o = entries.get(n.id);
                        if (!o) fail(`'${n.raw}' is not declared`, n.at);
                        return Object.assign({ name: n.raw }, o);
                    }
                }
                fail(`'${n.raw}': records and selected names are not supported here`, n.at);
            }
            case 'call': {
                const p = this.resolve(n.pfx, sc);
                if (p.cls === 'sig' || p.cls === 'var' || p.cls === 'const' || p.cls === 'param' || p.cls === 'loopvar' || p.cls === 'val') {
                    if (!isArr(p.t)) fail(`'${n.pfx.raw || p.name}' is not an array and cannot be indexed`, n.at);
                    if (n.args.length !== 1) fail('only one index is allowed here: arrays of arrays are indexed like m(i)(j)', n.at);
                    const a = n.args[0];
                    if (a.formal) fail('named association is not allowed in an index', n.at);
                    const rs = this.sliceRange(a.val, sc);
                    if (rs) return this.sliceWith(p, this.rangeOf(rs, sc), n.at);
                    return this.index(p, this.exT(a.val, p.t.idx && isEnum(p.t.idx) ? p.t.idx : INTEGER, sc), n.at);
                }
                if (p.cls === 'type') { const x = this.conversion(p.t, n, sc); return { cls: 'val', x, t: x.t, name: n.raw }; }
                if (p.cls === 'func') { const x = this.call(p, n.args, null, sc, n.at); return { cls: 'val', x, t: x.t, name: n.raw }; }
                fail(`'${n.pfx.raw}' cannot be called or indexed`, n.at);
            }
            case 'attr': { const x = this.attribute(n, sc); return { cls: 'val', x, t: x.t, name: n.raw }; }
            case 'qual': {
                const tr = this.resolve(n.mark, sc);
                if (tr.cls !== 'type') fail(`'${n.mark.raw}' is not a type`, n.at);
                const x = this.exT(n.e, tr.t, sc);
                this.fit(x, tr.t, n.at, `the type ${tr.t.name}`);
                const qx = Object.assign({}, x, { t: isArr(tr.t) && !tr.t.rng ? x.t : tr.t });
                return { cls: 'val', x: qx, t: qx.t, name: n.raw };
            }
        }
        fail('expected a name', n.at);
    }
    sliceRange(v, sc) {
        if (v.k === 'range') return v;
        if (v.k === 'attr' && (v.attr === 'range' || v.attr === 'reverse_range')) return { k: 'rexpr', e: v, at: v.at };
        if (v.k === 'name') { const o = sc.find(v.id); if (o && o.cls === 'type' && !isEnum(o.t)) return { k: 'rexpr', e: v, at: v.at }; }
        return null;
    }
    index(p, ix, at) {
        const t = p.t;
        if (!isInt(ix.t) && !(isEnum(ix.t) && t.idx && t.idx.base === ix.t.base)) fail(`an index must be an integer, not ${tname(ix.t)}${isLogicArr(ix.t) ? ': convert it with to_integer(unsigned(...))' : ''}`, at);
        if (p.cls === 'sig') {
            if (!t.rng) fail('internal: unconstrained signal', at);
            const rng = t.rng, per = leafCount(t.elem), len = rlen(rng);
            const pos = i => { const q = rng.dir === 'downto' ? rng.l - i : i - rng.l; if (!(q >= 0 && q < len)) fail(`index ${i} is outside the range ${rng.l} ${rng.dir} ${rng.r} of '${p.name}'`, at); return q; };
            const name = `${p.name}(${ix.st ? ix.sv : '…'})`;
            if (ix.st && p.off !== undefined) return Object.assign({}, p, { t: t.elem, off: p.off + pos(ix.sv) * per, name, whole: false });
            const base = p.off !== undefined ? () => p.off : p.offF;
            return Object.assign({}, p, { t: t.elem, off: undefined, offF: E => base(E) + pos(ix.f(E)) * per, name, dyn: true, whole: false, region: p.region || { off: p.off, n: leafCount(t) } });
        }
        const get = this.valueGetter(p, at);
        const x = { t: t.elem, f: E => { const a = get(E); return a.v[vPos(a, ix.f(E), at)]; }, st: false };
        if (p.cls === 'var') {
            return { cls: 'var', t: t.elem, name: `${p.name}(…)`, get: x.f, set: (E, v) => { const a = get(E); a.v[vPos(a, ix.f(E), at)] = v; } };
        }
        return { cls: 'val', x, name: `${p.name}(…)` };
    }
    sliceWith(p, r, at) {
        const t = p.t;
        if (p.cls === 'sig') {
            const rng = t.rng, per = leafCount(t.elem), len = rlen(rng);
            if (r.st) {
                const s = r.sv, n = rlen(s);
                if (n > 0) {
                    if (s.dir !== rng.dir) fail(`'${p.name}' is declared ${rng.l} ${rng.dir} ${rng.r}, so its slices must use '${rng.dir}' too: ${p.name}(${s.r} ${rng.dir} ${s.l})`, at);
                    for (const b of [s.l, s.r]) { const q = rng.dir === 'downto' ? rng.l - b : b - rng.l; if (!(q >= 0 && q < len)) fail(`the slice ${s.l} ${s.dir} ${s.r} goes outside ${rng.l} ${rng.dir} ${rng.r} of '${p.name}'`, at); }
                }
                const q0 = n > 0 ? (rng.dir === 'downto' ? rng.l - s.l : s.l - rng.l) : 0;
                const st = constrain(t, s);
                const name = `${p.name}(${s.l} ${s.dir} ${s.r})`;
                if (p.off !== undefined) return Object.assign({}, p, { t: st, off: p.off + q0 * per, name, whole: false });
                const base = p.offF;
                return Object.assign({}, p, { t: st, offF: E => base(E) + q0 * per, name, whole: false });
            }
            // bounds known only while the process runs (a loop variable)
            const baseOff = p.off !== undefined ? () => p.off : p.offF;
            const rf = r.f;
            const posD = b => { const q = rng.dir === 'downto' ? rng.l - b : b - rng.l; if (!(q >= 0 && q < len)) fail(`the slice reaches index ${b}, outside ${rng.l} ${rng.dir} ${rng.r} of '${p.name}'`, at); return q; };
            return Object.assign({}, p, {
                t: sub(t, { rng: null }), off: undefined, name: `${p.name}(…)`, whole: false, dyn: true,
                rngF: rf, per,
                offF: E => {
                    const s = rf(E);
                    if (!rlen(s)) return baseOff(E);
                    if (s.dir !== rng.dir) fail(`'${p.name}' is declared ${rng.l} ${rng.dir} ${rng.r}, so its slices must use '${rng.dir}' too`, at);
                    posD(s.r);
                    return baseOff(E) + posD(s.l) * per;
                },
                region: p.region || { off: p.off, n: leafCount(t) }
            });
        }
        const get = this.valueGetter(p, at);
        const f = E => {
            const a = get(E), s = r.f(E), n = rlen(s);
            if (n === 0) return { l: s.l, dir: s.dir, v: [] };
            if (s.dir !== a.dir) fail(`slice direction '${s.dir}' does not match the '${a.dir}' range of '${p.name}'`, at);
            const q0 = vPos(a, s.l, at);
            vPos(a, s.r, at);
            return { l: s.l, dir: s.dir, v: a.v.slice(q0, q0 + n) };
        };
        const st = r.st ? constrain(t, r.sv) : sub(t, { rng: null });
        const x = { t: st, f, st: false };
        if (p.cls === 'var') {
            return { cls: 'var', t: st, name: `${p.name}(…)`, get: f, set: (E, v) => { const a = get(E), s = r.f(E), n = rlen(s); if (!n) return; const q0 = vPos(a, s.l, at); for (let k = 0; k < n; k++) a.v[q0 + k] = v.v[k]; } };
        }
        return { cls: 'val', x, name: `${p.name}(…)` };
    }
    valueGetter(p, at) {
        if (p.cls === 'var') return p.get || (E => E.fr[p.slot]);
        if (p.cls === 'param' || p.cls === 'loopvar') return E => E.fr[p.slot];
        if (p.cls === 'const') { const v = p.v; return () => v; }
        if (p.cls === 'val') return p.x.f;
        fail('internal: no value', at);
    }
    // read a resolved name as a value
    valueOf(r, n, sc) {
        switch (r.cls) {
            case 'sig': {
                if (this.cur && this.cur.func) fail(`a function cannot read the signal '${r.name}': pass it as a parameter`, n.at);
                this.noteRead(r);
                const sig = r.sig, t = r.t;
                if (r.off !== undefined) {
                    const off = r.off;
                    if (!isArr(t)) return { t, f: () => sig.cur[off], st: false, sig: r };
                    return { t, f: () => unflat(t, sig.cur, off), st: false, sig: r };
                }
                const offF = r.offF;
                if (!isArr(t)) return { t, f: E => sig.cur[offF(E)], st: false };
                if (r.rngF) { const rf = r.rngF; return { t, f: E => unflat(constrain(t, rf(E)), sig.cur, offF(E)), st: false }; }
                return { t, f: E => unflat(t, sig.cur, offF(E)), st: false };
            }
            case 'var': return { t: r.t, f: r.get || (E => E.fr[r.slot]), st: false };
            case 'param': case 'loopvar': { const slot = r.slot; return { t: r.t, f: E => E.fr[slot], st: false }; }
            case 'const': return K(r.t, r.v);
            case 'val': return r.x;
            case 'type': fail(`'${n.raw}' is a type, not a value`, n.at);
            case 'func': return this.call(r, [], null, sc, n.at);
            case 'comp': fail(`'${n.raw}' is a component; instantiate it with a label: u1: ${n.raw} port map (...)`, n.at);
            case 'lib': fail(`'${n.raw}' is a library`, n.at);
        }
        fail(`'${n.raw}' cannot be used as a value here`, n.at);
    }
    noteRead(r) {
        if (!this.cur || !this.cur.reads) return;
        const s = r.sig;
        if (!this.cur.reads.has(s)) this.cur.reads.set(s, r.name);
    }

    /* ---------- expressions */
    mk(t, f, parts) {
        const st = parts.every(p => p.st);
        if (st) { const sv = f(null); return { t, f: () => sv, st: true, sv }; }
        return { t, f, st: false };
    }
    arity(args, lo, hi, nm, at) {
        if (args.length < lo || args.length > hi) fail(`${nm} takes ${lo === hi ? lo : `${lo} to ${hi}`} argument${hi > 1 ? 's' : ''}`, at);
        for (const a of args) if (a.formal) fail(`write the arguments of ${nm} by position`, at);
    }
    exT(n, want, sc) {
        const x = this.ex(n, want, sc);
        if (x.ctx) {
            const what = n.k === 'char' ? `'${n.v}'` : n.k === 'agg' ? 'this aggregate' : n.k === 'str' || n.k === 'bits' ? `"${n.v}"` : 'this expression';
            fail(`the type of ${what} cannot be worked out here; give it one, e.g. std_logic_vector'(${n.k === 'agg' ? '...' : what})`, n.at);
        }
        return x;
    }
    ex(n, want, sc) {
        switch (n.k) {
            case 'paren': return this.ex(n.e, want, sc);
            case 'int':
                if (want && !isInt(want) && want.k !== 'time') {
                    if (isLogic(want)) fail(`${n.v} is an integer, but a ${want.name} is expected: write '${n.v}' (with single quotes)`, n.at);
                    if (isLogicArr(want)) fail(`${n.v} is an integer, but a ${tname(want)} is expected: write a bit string such as "0101", or convert: ${isNum(want) ? `to_${want.base.name}(${n.v}, ${tlen(want) || 'N'})` : `std_logic_vector(to_unsigned(${n.v}, ${tlen(want) || 'N'}))`}`, n.at);
                    if (want === BOOLEAN || want.base === BOOLEAN) fail(`${n.v} is an integer, but a boolean is expected`, n.at);
                }
                return K(want && isInt(want) && !want.univ ? want.base : UNIV, n.v);
            case 'real': fail('real numbers are not supported here', n.at);
            case 'phys': return K(TIME, n.v);
            case 'char': return this.charLit(n, want);
            case 'str': case 'bits': return this.strLit(n, want);
            case 'agg': return this.aggregate(n, want, sc);
            case 'name': case 'sel': case 'call': case 'attr': case 'qual': {
                if (n.k === 'name') {
                    const o = sc.find(n.id);
                    if (o && o.cls === 'enumlit') return this.enumLit(o, n, want);
                }
                const r = this.resolve(n, sc);
                if (r.cls === 'enumlit') return this.enumLit(r, n, want);
                return this.valueOf(r, n, sc);
            }
            case 'bin': return this.binary(n, want, sc);
            case 'un': return this.unary(n, want, sc);
            case 'range': fail('a range (… to …) is not a value', n.at);
            case 'open': fail("'open' only works in a port map", n.at);
            case 'unaffected': fail("'unaffected' is not supported here", n.at);
        }
        fail('unsupported expression', n.at);
    }
    enumLit(o, n, want) {
        const list = o.list;
        if (want && isEnum(want)) {
            const m = list.find(e => e.t.base === want.base);
            if (m) return K(want, m.pos);
            fail(`'${n.raw}' is not a value of ${want.name}`, n.at);
        }
        if (list.length === 1) return K(list[0].t, list[0].pos);
        return CTXR(n);
    }
    charLit(n, want) {
        const lit = `'${n.v}'`;
        if (want) {
            if (isEnum(want)) {
                const p = want.map.get(lit);
                if (p !== undefined) return K(want, p);
                const up = want.map.get(`'${n.v.toUpperCase()}'`);
                fail(`'${n.v}' is not a value of ${want.name}${up !== undefined ? ` (the values of std_logic are upper case: '${n.v.toUpperCase()}')` : ''}`, n.at);
            }
            if (isArr(want) && isEnum(want.elem) && want.elem.map.has(lit)) fail(`${tname(want)} is expected here, but '${n.v}' is a single bit. Write a vector: (others => '${n.v}') fills every bit, "${n.v}" is a one-bit vector`, n.at);
            if (isInt(want)) fail(`'${n.v}' is a bit (character), but an integer is expected`, n.at);
            fail(`'${n.v}' does not fit a ${tname(want)}`, n.at);
        }
        return CTXR(n);
    }
    strLit(n, want) {
        if (!want) return CTXR(n);
        if (!isArr(want) || !isEnum(want.elem)) {
            if (isLogic(want) && n.v.length === 1) fail(`"${n.v}" is a vector of one bit; a single std_logic is written '${n.v}' (single quotes)`, n.at);
            if (isInt(want)) fail(`"${n.v}" is a vector, but an integer is expected${/^[01]+$/.test(n.v) ? `: write the number, or to_integer(unsigned'("${n.v}"))` : ''}`, n.at);
            fail(`"${n.v}" is a vector, but a ${tname(want)} is expected`, n.at);
        }
        const el = want.elem, vals = [];
        for (const ch of n.v) {
            const p = el.map.get(`'${ch}'`);
            if (p === undefined) fail(`'${ch}' in "${n.v}" is not a value of ${el.name}${el.map.has(`'${ch.toUpperCase()}'`) ? ` (use '${ch.toUpperCase()}')` : ''}`, n.at);
            vals.push(p);
        }
        const len = vals.length;
        let t, l, dir;
        if (want.rng && rlen(want.rng) === len) { t = want; l = want.rng.l; dir = want.rng.dir; }
        else { l = idxLo(want); dir = 'to'; t = constrain(want, mkRange(l, dir, len)); }
        const v = { l, dir, v: vals };
        return { t, f: () => v, st: true, sv: v };
    }
    aggregate(n, want, sc) {
        if (!want) return CTXR(n);
        if (!isArr(want)) {
            const oth = n.items.length === 1 && n.items[0].choices && n.items[0].choices[0].k === 'others';
            fail(`${oth ? '(others => ...) builds a vector' : 'an aggregate ( ... ) builds an array'}, but a ${tname(want)} is expected here${oth && isLogic(want) ? ": for a single bit just write the value, e.g. '0'" : ''}`, n.at);
        }
        const el = want.elem;
        const items = n.items.map(it => {
            const x = this.exT(it.val, el, sc);
            const cv = this.fit(x, el, it.val.at, 'an element of this aggregate');
            return { choices: it.choices, x, cv, at: it.val.at };
        });
        const named = items.some(it => it.choices);
        const hasOthers = items.some(it => it.choices && it.choices.some(c => c.k === 'others'));
        items.forEach((it, k) => {
            if (it.choices && it.choices.some(c => c.k === 'others') && k !== items.length - 1) fail("'others' must be the last choice of an aggregate", it.at);
            if (!it.choices && named && !(hasOthers && items.slice(0, k + 1).every(x => !x.choices))) fail('do not mix positional and named elements in an aggregate (except a final others => ...)', it.at);
        });
        let L, D, N;
        const rng = want.rng;
        if (rng) { L = rng.l; D = rng.dir; N = rlen(rng); }
        else if (!named) { L = idxLo(want); D = 'to'; N = items.length; }
        else {
            if (hasOthers) fail("the size of (others => ...) is unknown here; give it a type with a size, e.g. std_logic_vector'(7 downto 0 => '0')", n.at);
            const idxs = [];
            let dirHint = null;
            for (const it of items) for (const c of it.choices) {
                if (c.k === 'range') { const r = this.staticRange(c, sc); dirHint = r.dir; idxs.push(r.l, r.r); }
                else idxs.push(this.staticInt(c, sc));
            }
            const lo = Math.min(...idxs), hi = Math.max(...idxs);
            D = dirHint || 'to'; L = D === 'downto' ? hi : lo; N = hi - lo + 1;
        }
        const posOf = i => (D === 'downto' ? L - i : i - L);
        const slots = new Array(N).fill(-1);
        let next = 0;
        items.forEach((it, k) => {
            if (!it.choices) {
                if (next >= N) fail(`this aggregate has more than the ${N} elements of ${tname(want)}`, it.at);
                slots[next++] = k;
                return;
            }
            for (const c of it.choices) {
                if (c.k === 'others') { for (let q = 0; q < N; q++) if (slots[q] < 0) slots[q] = k; continue; }
                let list;
                if (c.k === 'range') { const r = this.staticRange(c, sc); list = []; const st = r.dir === 'to' ? 1 : -1; for (let i = r.l; st > 0 ? i <= r.r : i >= r.r; i += st) list.push(i); }
                else list = [this.staticInt(c, sc)];
                for (const i of list) {
                    const q = posOf(i);
                    if (q < 0 || q >= N) fail(`index ${i} is outside ${L} ${D} ${D === 'downto' ? L - N + 1 : L + N - 1}`, c.at || it.at);
                    if (slots[q] >= 0) fail(`index ${i} is given twice in this aggregate`, c.at || it.at);
                    slots[q] = k;
                }
            }
        });
        if (slots.some(s => s < 0)) fail(`this aggregate does not give every one of the ${N} elements a value; add others => ...`, n.at);
        const xs = items.map(it => ({ f: it.x.f, cv: it.cv }));
        const t = rng ? want : constrain(want, mkRange(L, D, N));
        const f = E => { const vals = xs.map(x => x.cv(x.f(E))); return { l: L, dir: D, v: slots.map(s => vals[s]) }; };
        return this.mk(t, f, items.map(it => it.x));
    }
    conversion(T, n, sc) {
        if (n.args.length !== 1 || n.args[0].formal) fail(`a type conversion takes one value: ${T.name}(x)`, n.at);
        const a = n.args[0].val;
        let x = this.ex(a, null, sc);
        if (x.ctx) x = this.exT(a, T, sc);
        const xt = x.t, at = n.at;
        if (isArr(T)) {
            if (!isArr(xt) || xt.elem.base !== T.elem.base) {
                if (isInt(xt) && isLogicArr(T)) fail(`${T.name}(...) cannot convert an integer: use ${T.base === SIGNED ? 'to_signed' : 'to_unsigned'}(x, N)${isNum(T) ? '' : ` inside: std_logic_vector(to_unsigned(x, N))`}`, at);
                fail(`cannot convert ${tname(xt)} to ${T.name}`, at);
            }
            const tl = tlen(T);
            if (tl !== null && tlen(xt) !== null && tl !== tlen(xt)) fail(`${T.name} has ${tl} elements but the value has ${tlen(xt)}`, at);
            const t = T.rng ? T : (xt.rng ? constrain(T, xt.rng) : sub(T, { rng: null }));
            if (T.rng) { const r = T.rng; return this.mk(t, E => { const v = x.f(E); if (v.v.length !== tl) fail(`${T.name} has ${tl} elements but the value has ${v.v.length}`, at); return { l: r.l, dir: r.dir, v: v.v }; }, [x]); }
            return this.mk(t, x.f, [x]);
        }
        if (isInt(T)) {
            if (!isInt(xt)) {
                if (isLogicArr(xt)) fail(`integer(...) cannot convert a vector: use to_integer(unsigned(v)) or to_integer(signed(v))`, at);
                fail(`cannot convert ${tname(xt)} to ${T.name}`, at);
            }
            return this.mk(T, E => { const v = x.f(E); if (v < T.lo || v > T.hi) fail(`${v} is outside ${T.name}`, at); return v; }, [x]);
        }
        if (xt.base === T.base) return this.mk(T, x.f, [x]);
        if (isLogic(T) && isLogicArr(xt)) fail(`a vector cannot be converted to a single ${T.name}: pick one bit, e.g. v(0)`, at);
        fail(`cannot convert ${tname(xt)} to ${T.name}`, at);
    }
    attribute(n, sc) {
        const a = n.attr, at = n.at;
        if (['event', 'last_value', 'stable', 'active', 'last_event', 'quiet', 'transaction', 'delayed'].includes(a)) {
            const r = this.resolve(n.pfx, sc);
            if (r.cls !== 'sig') fail(`'${a} only applies to signals`, at);
            if (this.cur && this.cur.func) fail('a function cannot look at signals', at);
            this.noteRead(r);
            const sig = r.sig, off = r.off, cnt = leafCount(r.t);
            if (off === undefined) fail(`'${a} needs a plain signal name`, at);
            const D = this;
            if (a === 'event') {
                this.cur.edge = true;
                return { t: BOOLEAN, f: () => { for (let i = 0; i < cnt; i++) if (sig.chg[off + i] === D.delta) return 1; return 0; }, st: false };
            }
            if (a === 'last_value') return { t: r.t, f: () => (isArr(r.t) ? unflat(r.t, sig.last, off) : sig.last[off]), st: false };
            fail(`the attribute '${a} is not supported here`, at);
        }
        const r = this.resolve(n.pfx, sc);
        let t = r.cls === 'type' ? r.t : (r.cls === 'val' ? r.x.t : r.t);
        if (r.cls === 'enumlit') fail(`'${a} does not apply to a literal`, at);
        if (isArr(t)) {
            const rngF = t.rng ? (() => t.rng) : t.rngF ? t.rngF : (() => { const x = r.cls === 'type' ? null : this.valueOf(r, n.pfx, sc); if (!x) fail(`'${a} needs an array with a size`, at); return E => { const v = x.f(E); return { l: v.l, dir: v.dir, r: vRight(v) }; }; })();
            const stat = !!t.rng;
            const mkI = g => (stat ? K(INTEGER, g(t.rng)) : { t: INTEGER, f: E => g(rngF(E)), st: false });
            switch (a) {
                case 'length': return mkI(x => rlen(x));
                case 'left': return mkI(x => x.l);
                case 'right': return mkI(x => x.r);
                case 'high': return mkI(x => Math.max(x.l, x.r));
                case 'low': return mkI(x => Math.min(x.l, x.r));
                case 'ascending': return stat ? K(BOOLEAN, t.rng.dir === 'to' ? 1 : 0) : { t: BOOLEAN, f: E => (rngF(E).dir === 'to' ? 1 : 0), st: false };
                case 'range': case 'reverse_range': fail(`'${a} gives a range: use it in a loop or a slice, e.g. for i in v'range loop`, at);
            }
            fail(`the attribute '${a} is not supported on arrays here`, at);
        }
        if (r.cls === 'type' && (isInt(t) || isEnum(t))) {
            const lo = isInt(t) ? t.lo : 0, hi = isInt(t) ? t.hi : t.lits.length - 1;
            switch (a) {
                case 'high': return K(t, hi);
                case 'low': case 'left': return K(t, lo);
                case 'right': return K(t, hi);
                case 'pos': { const x = this.exT(n.arg, t, sc); return this.mk(INTEGER, x.f, [x]); }
                case 'val': { const x = this.exT(n.arg, INTEGER, sc); return this.mk(t, E => { const v = x.f(E); if (v < lo || v > hi) fail(`${v} is outside ${t.name}`, at); return v; }, [x]); }
                case 'image': { const x = this.exT(n.arg, t, sc); return this.mk(STRING, E => { const s2 = strOf(t, x.f(E)); return { l: 1, dir: 'to', v: [...s2].map(c => c.charCodeAt(0)) }; }, [x]); }
                case 'succ': case 'pred': { const x = this.exT(n.arg, t, sc), d = a === 'succ' ? 1 : -1; return this.mk(t, E => { const v = x.f(E) + d; if (v < lo || v > hi) fail(`'${a} goes past the end of ${t.name}`, at); return v; }, [x]); }
            }
        }
        fail(`the attribute '${a} is not supported here`, at);
    }

    /* ---------- function calls */
    call(fo, args, want, sc, at) {
        const list = fo.list;
        if (list[0].builtin) return list[0].impl(this, args, want, sc, at);
        let cand = list.filter(f => {
            const ps = this.paramList(f.decl);
            return args.length <= ps.length && ps.slice(args.length).every(p => p.def);
        });
        if (!cand.length) fail(`no version of '${list[0].decl.name}' takes ${args.length} argument${args.length === 1 ? '' : 's'}`, at);
        if (cand.length > 1) {
            const types = args.map(a => { const x = a.formal ? null : this.ex(a.val, null, sc); return x && !x.ctx ? x.t : null; });
            const ok = cand.filter(f => this.paramList(f.decl).every((p, i) => {
                if (i >= types.length || !types[i]) return true;
                const pt = this.subtype(p.st, f.scope, { dyn: true });
                return pt.base === types[i].base || (isInt(pt) && isInt(types[i]));
            }));
            if (ok.length) cand = ok;
        }
        return this.userCall(cand[0], args, sc, at);
    }
    paramList(decl) {
        const ps = [];
        for (const it of decl.params) {
            if (it.mode !== 'in') fail(`function parameters can only be 'in'`, it.at);
            for (const nm of it.names) ps.push({ name: nm, st: it.st, def: it.def, at: it.at });
        }
        return ps;
    }
    userCall(fd, args, sc, at) {
        const decl = fd.decl, ps = this.paramList(decl);
        const vals = new Array(ps.length).fill(null);
        let pos = 0;
        for (const a of args) {
            let i;
            if (a.formal) {
                if (a.formal.k !== 'name') fail('a named argument looks like name => value', at);
                i = ps.findIndex(p => p.name === a.formal.id);
                if (i < 0) fail(`'${decl.name}' has no parameter '${a.formal.raw}'`, at);
            } else i = pos++;
            if (vals[i]) fail(`the parameter '${ps[i].name}' is given twice`, at);
            vals[i] = a.val;
        }
        const xs = ps.map((p, i) => {
            const pt = this.subtype(p.st, fd.scope, { dyn: true });
            const node = vals[i] || p.def;
            if (!node) fail(`the parameter '${p.name}' of '${decl.name}' has no value`, at);
            const x = this.exT(node, pt, vals[i] ? sc : fd.scope);
            const cv = this.fit(x, pt.rngF ? sub(pt, { rng: null }) : pt, node.at, `the parameter '${p.name}' of '${decl.name}'`);
            return { x, cv };
        });
        const body = this.funcBody(fd);
        const ret = this.typeMark(decl.ret, fd.scope);
        const D = this;
        const f = E => {
            const depth = (E && E.depth) || 0;
            if (depth > 200) fail(`'${decl.name}' calls itself too deeply`, at);
            const fr = new Array(body.size);
            for (let i = 0; i < xs.length; i++) fr[i] = xs[i].cv(xs[i].x.f(E));
            const E2 = { fr, P: E && E.P, depth: depth + 1 };
            for (const it of body.inits) fr[it.slot] = it.f(E2);
            const r = body.run(E2);
            if (!r || r.k !== 'return') fail(`'${decl.name}' ended without a return statement`, decl.at);
            return r.v;
        };
        let t = ret;
        if (isArr(ret) && !ret.rng) t = sub(ret, { rng: null });
        const res = this.mk(t, f, xs.map(o => o.x));
        void D;
        return res;
    }
    funcBody(fd) {
        if (fd.compiled) return fd.compiled;
        const decl = fd.decl;
        if (!decl.body) fail(`the function '${decl.name}' has no body`, decl.at);
        const c = { size: 0, inits: [], run: null };
        fd.compiled = c;
        const fs = new Scope(fd.scope, 'func');
        const saved = this.cur;
        this.cur = { func: true, slots: 0, reads: null, drives: null, edge: false, inits: [], ret: this.typeMark(decl.ret, fd.scope), fname: decl.name };
        for (const p of this.paramList(decl)) {
            const slot = this.cur.slots++;
            fs.add(p.name, { cls: 'param', slot, t: this.subtype(p.st, fd.scope, { dyn: true }), name: p.name }, p.at);
        }
        for (const d of decl.decls) this.declare(d, fs);
        const body = this.seq(decl.body, fs);
        c.size = this.cur.slots;
        c.inits = this.cur.inits;
        c.run = body;
        this.cur = saved;
        return c;
    }

    /* ---------- operators */
    pairCtx(n, sc, want, pick) {
        let a = this.ex(n.l, null, sc), b = this.ex(n.r, null, sc);
        if (a.ctx && b.ctx) {
            if (!want) fail(`the types in '${n.op}' cannot be worked out: give one side a type, e.g. std_logic_vector'("0101")`, n.at);
            a = this.exT(n.l, pick(n.l, want, true), sc);
            b = this.exT(n.r, pick(n.r, want, true), sc);
        } else if (a.ctx) a = this.exT(n.l, pick(n.l, b.t, false), sc);
        else if (b.ctx) b = this.exT(n.r, pick(n.r, a.t, false), sc);
        return [a, b];
    }
    binary(n, want, sc) {
        const op = n.op, at = n.at;
        if (LOGICAL.has(op)) {
            const [a, b] = this.pairCtx(n, sc, want, (node, T) => (isArr(T) && node.k === 'char' ? T.elem : T));
            return this.logical(op, a, b, at);
        }
        if (RELOPS.has(op)) {
            const [a, b] = this.pairCtx(n, sc, null, (node, T) => (isNum(T) && node.k === 'int' ? INTEGER : T));
            return this.relational(op, a, b, at);
        }
        if (op === '&') {
            const [a, b] = this.pairCtx(n, sc, want, (node, T, both) => {
                if (both) return node.k === 'char' && isArr(T) ? T.elem : (isArr(T) ? sub(T, { rng: null }) : T);
                if (isArr(T)) return node.k === 'char' ? T.elem : sub(T, { rng: null });
                if (isEnum(T)) {
                    if (node.k === 'char') return T;
                    if (want && isArr(want) && want.elem.base === T.base) return sub(want, { rng: null });
                    const vt = T.base === STD_ULOGIC ? SLV : T.base === BIT ? BIT_VECTOR : null;
                    if (vt) return vt;
                }
                return T;
            });
            return this.concat(a, b, want, at);
        }
        if (['+', '-', '*', '/', 'mod', 'rem', '**'].includes(op)) {
            const [a, b] = this.pairCtx(n, sc, want, (node, T) => (isNum(T) && node.k === 'char' ? STD_ULOGIC : T));
            return this.arith(op, a, b, at, sc);
        }
        if (SHIFTOPS.has(op)) {
            const a = this.exT(n.l, want, sc), b = this.exT(n.r, INTEGER, sc);
            if (!isArr(a.t) || !isEnum(a.t.elem)) fail(`'${op}' shifts a vector, not ${tname(a.t)}`, at);
            if (!isInt(b.t)) fail(`the shift amount of '${op}' must be an integer`, at);
            const zero = isLogic(a.t.elem) ? 2 : 0;
            const sg = a.t.base === SIGNED;
            return this.mk(sub(a.t, {}), E => {
                const x = a.f(E), k0 = b.f(E), L = x.v.length, v = new Array(L);
                let o = op, k = k0;
                if (k < 0) { k = -k; o = { sll: 'srl', srl: 'sll', sla: 'sra', sra: 'sla', rol: 'ror', ror: 'rol' }[op]; }
                for (let i = 0; i < L; i++) {
                    if (o === 'sll') v[i] = i + k < L ? x.v[i + k] : zero;
                    else if (o === 'srl') v[i] = i - k >= 0 ? x.v[i - k] : zero;
                    else if (o === 'sla') v[i] = i + k < L ? x.v[i + k] : (sg ? zero : x.v[L - 1]);
                    else if (o === 'sra') v[i] = i - k >= 0 ? x.v[i - k] : x.v[0];
                    else if (o === 'rol') v[i] = x.v[(i + k) % L];
                    else v[i] = x.v[(((i - k) % L) + L) % L];
                }
                return { l: x.l, dir: x.dir, v };
            }, [a, b]);
        }
        fail(`unsupported operator ${op}`, at);
    }
    typeErr(op, a, b, at) {
        const ta = a.t, tb = b.t;
        let hint = '';
        if (isLogicArr(ta) && isLogicArr(tb) && ta.base !== tb.base) hint = ` Both sides must have the same type: convert one, e.g. ${tb.base === SULV ? 'std_logic_vector' : tb.base.name}(...)`;
        else if ((ta === BOOLEAN || ta.base === BOOLEAN) && isLogic(tb) || (tb.base === BOOLEAN && isLogic(ta))) hint = " A comparison like (a = '1') is a boolean, while a std_logic is a bit: combine bits with bits, or conditions with conditions.";
        else if (isLogic(ta) && isLogicArr(tb) || isLogic(tb) && isLogicArr(ta)) hint = ' One side is a single bit and the other a vector.';
        fail(`'${op}' does not work between ${tname(ta)} and ${tname(tb)}.${hint}`, at);
    }
    logical(op, a, b, at) {
        const ta = a.t, tb = b.t;
        if (isEnum(ta) && ta.base === tb.base) {
            if (isLogic(ta)) { const g = SL_FN[op]; return this.mk(STD_LOGIC, E => g(a.f(E), b.f(E)), [a, b]); }
            if (ta.base === BOOLEAN) {
                const af = a.f, bf = b.f;
                const f = op === 'and' ? E => (af(E) ? bf(E) : 0) : op === 'or' ? E => (af(E) ? 1 : bf(E)) : op === 'nand' ? E => (af(E) ? 1 - bf(E) : 1) : op === 'nor' ? E => (af(E) ? 0 : 1 - bf(E)) : E => B_FN[op](af(E), bf(E));
                return this.mk(BOOLEAN, f, [a, b]);
            }
            if (ta.base === BIT) { const g = B_FN[op]; return this.mk(BIT, E => g(a.f(E), b.f(E)), [a, b]); }
            fail(`'${op}' does not work on ${ta.name}`, at);
        }
        const elemFn = t => (isLogic(t) ? SL_FN[op] : (t.base === BIT || t.base === BOOLEAN) ? B_FN[op] : null);
        if (isArr(ta) && ta.base === tb.base && elemFn(ta.elem)) {
            const g = elemFn(ta.elem);
            const la = tlen(ta), lb = tlen(tb);
            if (la !== null && lb !== null && la !== lb) fail(`the two sides of '${op}' have different widths (${la} and ${lb})`, at);
            const t = la !== null ? constrain(ta.base === SULV ? (isLogic(ta.elem) && ta.elem.resolved ? SLV : SULV) : ta.base, mkRange(la - 1, 'downto', la)) : sub(ta, { rng: null });
            return this.mk(t, E => {
                const x = a.f(E), y = b.f(E);
                if (x.v.length !== y.v.length) fail(`the two sides of '${op}' have different widths (${x.v.length} and ${y.v.length})`, at);
                return { l: x.v.length - 1, dir: 'downto', v: x.v.map((e, i) => g(e, y.v[i])) };
            }, [a, b]);
        }
        if (isArr(ta) && isEnum(tb) && ta.elem.base === tb.base && elemFn(tb)) {
            const g = elemFn(tb);
            return this.mk(sub(ta, {}), E => { const x = a.f(E), y = b.f(E); return { l: x.l, dir: x.dir, v: x.v.map(e => g(e, y)) }; }, [a, b]);
        }
        if (isArr(tb) && isEnum(ta) && tb.elem.base === ta.base && elemFn(ta)) {
            const g = elemFn(ta);
            return this.mk(sub(tb, {}), E => { const x = a.f(E), y = b.f(E); return { l: y.l, dir: y.dir, v: y.v.map(e => g(x, e)) }; }, [a, b]);
        }
        this.typeErr(op, a, b, at);
    }
    relational(op, a, b, at) {
        const ta = a.t, tb = b.t;
        const cmp = (x, y) => (op === '=' ? x === 0 : op === '/=' ? x !== 0 : op === '<' ? x < 0 : op === '<=' ? x <= 0 : op === '>' ? x > 0 : x >= 0);
        // numeric_std
        const numA = isNum(ta), numB = isNum(tb);
        if ((numA || numB) && (numA ? (numB ? ta.base === tb.base : isInt(tb)) : isInt(ta))) {
            const sgn = (numA ? ta : tb).base === SIGNED;
            const big = (x, t) => (isInt(t) ? BigInt(x) : sgn ? vecSBig(x) : vecBig(x));
            return this.mk(BOOLEAN, E => {
                const x = big(a.f(E), ta), y = big(b.f(E), tb);
                if (x === null || y === null) { this.message('warning', `a comparison with U, X, Z or - in a ${sgn ? 'signed' : 'unsigned'} value is false`, at); return op === '/=' ? 1 : 0; }
                return cmp(x < y ? -1 : x > y ? 1 : 0) ? 1 : 0;
            }, [a, b]);
        }
        if (isInt(ta) && isInt(tb)) {
            if (!ta.univ && !tb.univ && ta.base !== tb.base) this.typeErr(op, a, b, at);
            return this.mk(BOOLEAN, E => { const x = a.f(E), y = b.f(E); return cmp(x < y ? -1 : x > y ? 1 : 0) ? 1 : 0; }, [a, b]);
        }
        if (ta.base !== tb.base) {
            if (isLogicArr(ta) && isInt(tb) || isLogicArr(tb) && isInt(ta)) fail(`a ${isLogicArr(ta) ? ta.name : tb.name} cannot be compared with an integer: compare unsigned(v) with the number, or the vector with a bit string like "0101"`, at);
            if (isLogic(ta) && isLogicArr(tb) || isLogic(tb) && isLogicArr(ta)) fail(`'${op}' compares a single bit with a vector: compare the bit with '1', or the vector with "…"`, at);
            if (isLogic(ta) && isInt(tb) || isLogic(tb) && isInt(ta)) fail(`a std_logic is compared with '0' or '1' (in single quotes), not with the number ${isInt(ta) ? '' : ''}0 or 1`, at);
            this.typeErr(op, a, b, at);
        }
        if (isEnum(ta)) return this.mk(BOOLEAN, E => { const x = a.f(E), y = b.f(E); return cmp(x < y ? -1 : x > y ? 1 : 0) ? 1 : 0; }, [a, b]);
        if (isArr(ta)) {
            if (op === '=' || op === '/=') {
                if (isArr(ta.elem)) return this.mk(BOOLEAN, E => (cmp(JSON.stringify(a.f(E).v) === JSON.stringify(b.f(E).v) ? 0 : 1) ? 1 : 0), [a, b]);
                return this.mk(BOOLEAN, E => { const x = a.f(E).v, y = b.f(E).v; const eq = x.length === y.length && x.every((e, i) => e === y[i]); return cmp(eq ? 0 : 1) ? 1 : 0; }, [a, b]);
            }
            if (!isEnum(ta.elem)) fail(`'${op}' does not work on ${ta.name}`, at);
            return this.mk(BOOLEAN, E => {
                const x = a.f(E).v, y = b.f(E).v, L = Math.min(x.length, y.length);
                let c = 0;
                for (let i = 0; i < L && !c; i++) c = x[i] < y[i] ? -1 : x[i] > y[i] ? 1 : 0;
                if (!c) c = x.length < y.length ? -1 : x.length > y.length ? 1 : 0;
                return cmp(c) ? 1 : 0;
            }, [a, b]);
        }
        fail(`'${op}' does not work on ${tname(ta)}`, at);
    }
    concat(a, b, want, at) {
        const ta = a.t, tb = b.t;
        let T = null;
        if (isArr(ta) && isArr(tb) && ta.base === tb.base) T = ta;
        else if (isArr(ta) && !isArr(tb) && ta.elem.base === tb.base) T = ta;
        else if (isArr(tb) && !isArr(ta) && tb.elem.base === ta.base) T = tb;
        else if (!isArr(ta) && !isArr(tb) && ta.base === tb.base) {
            if (want && isArr(want) && want.elem.base === ta.base) T = want;
            else if (isLogic(ta)) T = SLV;
            else if (ta.base === BIT) T = BIT_VECTOR;
            else if (ta.base === CHARACTER) T = STRING;
        }
        if (!T) {
            if (isArr(ta) && isArr(tb)) fail(`'&' joins vectors of the same type; here ${tname(ta)} and ${tname(tb)}: convert one of them`, at);
            this.typeErr('&', a, b, at);
        }
        const la = isArr(ta) ? tlen(ta) : 1, lb = isArr(tb) ? tlen(tb) : 1;
        const L0 = idxLo(T);
        const t = la !== null && lb !== null ? constrain(T.base === SULV && isLogic(T.elem) && T.elem.resolved ? SLV : T.base, mkRange(L0, 'to', la + lb)) : sub(T, { rng: null });
        const aa = isArr(ta), bb = isArr(tb);
        return this.mk(t, E => {
            const x = a.f(E), y = b.f(E);
            const v = (aa ? x.v : [x]).concat(bb ? y.v : [y]);
            return { l: L0, dir: 'to', v };
        }, [a, b]);
    }
    arith(op, a, b, at, sc) {
        const ta = a.t, tb = b.t;
        if (isInt(ta) && isInt(tb)) {
            if (!ta.univ && !tb.univ && ta.base !== tb.base) this.typeErr(op, a, b, at);
            const t = ta.univ && tb.univ ? UNIV : (ta.univ ? tb.base : ta.base);
            const g = {
                '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y,
                '/': (x, y) => { if (!y) fail('division by zero', at); return Math.trunc(x / y); },
                mod: (x, y) => { if (!y) fail('division by zero', at); return x - y * Math.floor(x / y); },
                rem: (x, y) => { if (!y) fail('division by zero', at); return x - y * Math.trunc(x / y); },
                '**': (x, y) => { if (y < 0) fail('a negative exponent is not allowed for integers', at); return Math.pow(x, y); }
            }[op];
            return this.mk(t, E => intChk(g(a.f(E), b.f(E)), at), [a, b]);
        }
        const nsu = this.nsu(sc) && (isLogicArr(ta) || isLogicArr(tb)) && !isNum(ta) && !isNum(tb);
        const vecA = isNum(ta) || (nsu && isLogicArr(ta)), vecB = isNum(tb) || (nsu && isLogicArr(tb));
        const okPair = (vecA && vecB && ta.base === tb.base) || (vecA && isInt(tb)) || (vecB && isInt(ta)) || (vecA && isLogic(tb) && (op === '+' || op === '-')) || (vecB && isLogic(ta) && (op === '+' || op === '-'));
        if (!okPair || op === '**') {
            if (isLogicArr(ta) && !isNum(ta) || isLogicArr(tb) && !isNum(tb)) fail(`'${op}' is not defined for std_logic_vector: it has no numeric meaning. Convert to unsigned or signed (ieee.numeric_std), e.g. std_logic_vector(unsigned(a) ${op} unsigned(b))`, at);
            if (isLogic(ta) && isLogic(tb)) fail(`'${op}' does not work on single bits; the sum bit of two bits is a xor b`, at);
            if (isNum(ta) && isNum(tb)) fail(`'${op}' cannot mix unsigned and signed: convert one side`, at);
            this.typeErr(op, a, b, at);
        }
        const T = vecA ? ta : tb;
        const sg = T.base === SIGNED;
        const lenOf = t => (isArr(t) ? tlen(t) : null);
        const la = lenOf(ta), lb = lenOf(tb);
        let wS = null;
        if (vecA && vecB) wS = la !== null && lb !== null ? (op === '*' ? la + lb : op === '/' ? la : (op === 'mod' || op === 'rem') ? lb : Math.max(la, lb)) : null;
        else if (vecA) wS = la !== null ? (op === '*' ? 2 * la : la) : null;
        else wS = lb !== null ? (op === '*' ? 2 * lb : lb) : null;
        const base = nsu ? SLV : T.base;
        const t = wS !== null ? constrain(base, mkRange(wS - 1, 'downto', wS)) : sub(base, { rng: null });
        const big = (x, t2) => (isInt(t2) ? BigInt(x) : isLogic(t2) ? (is1(x) ? 1n : is0(x) ? 0n : null) : sg ? vecSBig(x) : vecBig(x));
        return this.mk(t, E => {
            const x = a.f(E), y = b.f(E);
            const lx = isArr(ta) ? x.v.length : null, ly = isArr(tb) ? y.v.length : null;
            let w;
            if (lx !== null && ly !== null) w = op === '*' ? lx + ly : op === '/' ? lx : (op === 'mod' || op === 'rem') ? ly : Math.max(lx, ly);
            else w = op === '*' ? 2 * (lx !== null ? lx : ly) : (lx !== null ? lx : ly);
            if (!isArr(tb) && isInt(tb) && !sg && y < 0 && (op === '+' || op === '-')) {
                // unsigned +/- a negative integer: numeric_std takes a natural
                fail(`${y} is negative, but unsigned ${op} takes a natural number`, at);
            }
            const p = big(x, ta), q = big(y, tb);
            if (p === null || q === null) { this.message('warning', `'${op}' on a value with U, X, Z or -: the result is all X`, at); return xVec(w); }
            let r;
            switch (op) {
                case '+': r = p + q; break;
                case '-': r = p - q; break;
                case '*': r = p * q; break;
                case '/': if (q === 0n) fail('division by zero', at); r = p / q; break;
                case 'rem': if (q === 0n) fail('division by zero', at); r = p % q; break;
                case 'mod': if (q === 0n) fail('division by zero', at); r = ((p % q) + q) % q; break;
            }
            return bigVec(r, w);
        }, [a, b]);
    }
    unary(n, want, sc) {
        const op = n.op, at = n.at;
        if (op === 'not') {
            const x = this.exT(n.e, want, sc);
            if (isLogic(x.t)) return this.mk(STD_LOGIC, E => sNot(x.f(E)), [x]);
            if (x.t.base === BOOLEAN || x.t.base === BIT) return this.mk(x.t.base, E => 1 - x.f(E), [x]);
            if (isArr(x.t) && isLogic(x.t.elem)) return this.mk(sub(x.t, {}), E => { const a = x.f(E); return { l: a.l, dir: a.dir, v: a.v.map(sNot) }; }, [x]);
            if (isArr(x.t) && (x.t.elem.base === BIT || x.t.elem.base === BOOLEAN)) return this.mk(sub(x.t, {}), E => { const a = x.f(E); return { l: a.l, dir: a.dir, v: a.v.map(e => 1 - e) }; }, [x]);
            if (isInt(x.t)) fail("'not' works on bits and booleans; to negate a number write -x", at);
            fail(`'not' does not work on ${tname(x.t)}`, at);
        }
        if (LOGICAL.has(op)) {
            const x = this.exT(n.e, null, sc);
            if (!isArr(x.t) || !(isLogic(x.t.elem) || x.t.elem.base === BIT)) fail(`'${op} v' reduces a vector to one bit; ${tname(x.t)} is not a vector of bits`, at);
            const lg = isLogic(x.t.elem);
            const g = lg ? SL_FN[op === 'nand' ? 'and' : op === 'nor' ? 'or' : op === 'xnor' ? 'xor' : op] : B_FN[op === 'nand' ? 'and' : op === 'nor' ? 'or' : op === 'xnor' ? 'xor' : op];
            const inv = op === 'nand' || op === 'nor' || op === 'xnor';
            const id = op === 'and' || op === 'nand' ? (lg ? 3 : 1) : (lg ? 2 : 0);
            return this.mk(lg ? STD_LOGIC : BIT, E => {
                let r = id;
                for (const e of x.f(E).v) r = g(r, e);
                return inv ? (lg ? sNot(r) : 1 - r) : r;
            }, [x]);
        }
        const x = this.exT(n.e, want, sc);
        if (isInt(x.t)) {
            if (op === '-') return this.mk(x.t, E => intChk(-x.f(E), at), [x]);
            if (op === '+') return x;
            if (op === 'abs') return this.mk(x.t, E => intChk(Math.abs(x.f(E)), at), [x]);
        }
        if (x.t.base === SIGNED && (op === '-' || op === 'abs')) {
            return this.mk(sub(x.t, {}), E => {
                const a = x.f(E), v = vecSBig(a);
                if (v === null) return xVec(a.v.length);
                return bigVec(op === '-' ? -v : (v < 0n ? -v : v), a.v.length);
            }, [x]);
        }
        if (op === '+' && isNum(x.t)) return x;
        if (x.t.base === UNSIGNED && op === '-') fail("unsigned numbers cannot be negated; use signed", at);
        fail(`'${op}' does not work on ${tname(x.t)}`, at);
    }

    /* ---------- assignment compatibility */
    fit(x, t, at, what) {
        const xt = x.t;
        if (isInt(t)) {
            if (!isInt(xt) || (!xt.univ && xt.base !== t.base)) this.mismatch(xt, t, at, what);
            const lo = t.lo, hi = t.hi;
            if (x.st && (x.sv < lo || x.sv > hi)) fail(`${x.sv} is outside the range ${lo} to ${hi} of ${what}`, at);
            return v => { if (v < lo || v > hi) fail(`the value ${v} is outside the range ${lo} to ${hi} of ${what}`, at); return v; };
        }
        if (!xt || xt.base !== t.base) this.mismatch(xt, t, at, what);
        if (isArr(t)) {
            const tl = tlen(t), xl = tlen(xt);
            if (tl !== null && xl !== null && tl !== xl) fail(`width mismatch: ${what} has ${tl} ${tl === 1 ? 'element' : 'elements'}, but the value has ${xl}`, at);
            if (isArr(t.elem) && isArr(xt.elem) && tlen(t.elem) !== null && tlen(xt.elem) !== null && tlen(t.elem) !== tlen(xt.elem)) fail(`width mismatch in the elements of ${what}`, at);
            if (tl === null) return v => v;
            const r = t.rng;
            return v => {
                if (v.v.length !== tl) fail(`width mismatch: ${what} has ${tl} elements, but the value has ${v.v.length}`, at);
                return v.l === r.l && v.dir === r.dir ? v : { l: r.l, dir: r.dir, v: v.v };
            };
        }
        return v => v;
    }
    mismatch(xt, t, at, what) {
        let hint = '';
        if (isLogicArr(t) && isLogicArr(xt)) hint = ` Convert it: ${t.base === SULV ? 'std_logic_vector' : t.base.name}(...)`;
        else if (isLogic(t) && isLogicArr(xt)) hint = ' A vector does not fit into a single bit; pick one element, e.g. v(0)';
        else if (isLogicArr(t) && isLogic(xt)) hint = " A single bit does not fit into a vector; use (others => x), or join bits with &";
        else if (isLogicArr(t) && isInt(xt)) hint = ` Convert the integer: ${isNum(t) ? `to_${t.base.name}(x, ${tlen(t) || 'N'})` : `std_logic_vector(to_unsigned(x, ${tlen(t) || 'N'}))`}`;
        else if (isInt(t) && isLogicArr(xt)) hint = ` Convert it: to_integer(unsigned(v))${xt.base === SIGNED ? ' or to_integer(v)' : ''}`;
        else if (isLogic(t) && xt && xt.base === BOOLEAN) hint = " A comparison is a boolean, not a std_logic: write y <= '1' when a = b else '0'";
        else if (t.base === BOOLEAN && isLogic(xt)) hint = " Compare it: (s = '1')";
        fail(`type mismatch: ${what} is ${tname(t)}, but the value is ${tname(xt)}.${hint}`, at);
    }

    /* ---------- sequential statements */
    cond(n, sc) {
        const x = this.exT(n, null, sc);
        if (x.t.base === BOOLEAN) return x.f;
        if (isLogic(x.t)) return E => (is1(x.f(E)) ? 1 : 0);
        if (isLogicArr(x.t)) fail(`a condition must be true or false; this is a ${tname(x.t)}: compare it, e.g. v = "0000"`, n.at);
        if (isInt(x.t)) fail(`a condition must be true or false, not an integer: compare it, e.g. n = 0`, n.at);
        fail(`a condition must be a boolean, not ${tname(x.t)}`, n.at);
    }
    seq(stmts, sc) {
        const fs = stmts.map(s => this.stmt(s, sc));
        if (fs.length === 1) return fs[0];
        return E => { for (let i = 0; i < fs.length; i++) { const r = fs[i](E); if (r) return r; } };
    }
    target(n, sc) {
        const r = this.resolve(n, sc);
        if (r.cls === 'sig') return r;
        if (r.cls === 'var') return r;
        if (r.cls === 'const') fail(`'${r.name}' is a constant and cannot be assigned`, n.at);
        if (r.cls === 'param') fail(`'${r.name}' is ${this.cur && this.cur.func ? 'a parameter of this function' : 'a constant'} and cannot be assigned`, n.at);
        if (r.cls === 'loopvar') fail(`the loop variable '${r.name}' cannot be assigned`, n.at);
        fail(`'${n.raw || 'this'}' cannot be assigned`, n.at);
    }
    sigTarget(n, sc, at) {
        if (this.cur && this.cur.func) fail('a function cannot assign signals', at);
        const r = this.target(n, sc);
        if (r.cls === 'var') fail(`'${r.name}' is a variable: assign it with :=`, at);
        if (r.mode === 'in') fail(`'${r.name.replace(/\(.*$/, '')}' is an input port and cannot be assigned`, at);
        const drives = this.cur.drives;
        const reg = r.off !== undefined ? { off: r.off, n: leafCount(r.t) } : r.region;
        if (!drives.has(r.sig)) drives.set(r.sig, []);
        drives.get(r.sig).push(reg);
        return r;
    }
    driveFn(r, x, at, what) {
        const cv = this.fit(x, r.t, at, what);
        const sig = r.sig, P = this.cur.proc, D = this;
        const scalar = !isArr(r.t);
        if (r.off !== undefined) {
            const off = r.off;
            if (scalar) return E => D.write(P, sig, off, [cv(x.f(E))]);
            return E => D.write(P, sig, off, flat(cv(x.f(E)), []));
        }
        const offF = r.offF;
        if (scalar) return E => D.write(P, sig, offF(E), [cv(x.f(E))]);
        if (r.rngF) {
            const rf = r.rngF, per = r.per;
            return E => {
                const leaves = flat(cv(x.f(E)), []), want = rlen(rf(E)) * per;
                if (leaves.length !== want) fail(`width mismatch: ${what} has ${want / per} elements, but the value has ${leaves.length / per}`, at);
                D.write(P, sig, offF(E), leaves);
            };
        }
        return E => D.write(P, sig, offF(E), flat(cv(x.f(E)), []));
    }
    stmt(s, sc) {
        const at = s.at;
        switch (s.k) {
            case 'sasgn': {
                const r = this.sigTarget(s.target, sc, at);
                s._sig = r.sig;
                const what = `'${r.name}'`;
                if (!s.alts) return this.driveFn(r, this.exT(s.val, r.t, sc), at, what);
                const conds = [], acts = [];
                for (const al of s.alts) {
                    conds.push(al.cond ? this.cond(al.cond, sc) : null);
                    acts.push(al.val.k === 'unaffected' ? () => {} : this.driveFn(r, this.exT(al.val, r.t, sc), at, what));
                }
                return E => { for (let i = 0; i < conds.length; i++) if (!conds[i] || conds[i](E)) { acts[i](E); return; } };
            }
            case 'ssel': {
                const r = this.sigTarget(s.target, sc, at);
                s._sig = r.sig;
                const alts = s.alts.map(al => ({ choices: al.choices, body: [], act: this.driveFn(r, this.exT(al.val, r.t, sc), al.at || at, `'${r.name}'`) }));
                return this.caseOn(s.sel, alts, s.matching, sc, at, true);
            }
            case 'vasgn': {
                if (!this.cur.proc && !this.cur.func) fail('variables can only be assigned inside a process or a function', at);
                const r = this.target(s.target, sc);
                if (r.cls === 'sig') fail(`'${r.name}' is a signal: assign it with <=`, at);
                const x = this.exT(s.val, r.t, sc);
                const cv = this.fit(x, r.t.rngF ? sub(r.t, { rng: null }) : r.t, at, `'${r.name}'`);
                if (r.set) return E => { r.set(E, copyVal(cv(x.f(E)))); };
                const slot = r.slot;
                if (r.t.rngF) {
                    const tt = r.t;
                    return E => { const v = x.f(E), want = tt.rngF(E); if (v.v.length !== rlen(want)) fail(`width mismatch: '${r.name}' has ${rlen(want)} elements, but the value has ${v.v.length}`, at); E.fr[slot] = { l: want.l, dir: want.dir, v: v.v.map(copyVal) }; };
                }
                return E => { E.fr[slot] = copyVal(cv(x.f(E))); };
            }
            case 'if': {
                const conds = s.branches.map(b => this.cond(b.cond, sc));
                const bodies = s.branches.map(b => this.seq(b.body, sc));
                const els = s.els ? this.seq(s.els, sc) : null;
                return E => {
                    for (let i = 0; i < conds.length; i++) if (conds[i](E)) return bodies[i](E);
                    if (els) return els(E);
                };
            }
            case 'case': {
                const alts = s.alts.map(al => ({ choices: al.choices, body: this.seq(al.body, sc), at: al.at }));
                return this.caseOn(s.expr, alts, s.matching, sc, at, false);
            }
            case 'for': {
                const rg = this.rangeOf(s.range, sc);
                const ls = new Scope(sc, 'loop');
                const slot = this.cur.slots++;
                ls.add(s.param, { cls: 'loopvar', slot, t: rg.t || INTEGER, name: s.param }, at);
                const body = this.seq(s.body, ls);
                const label = s.label, D = this;
                return E => {
                    const r = rg.f(E), step = r.dir === 'to' ? 1 : -1;
                    for (let i = r.l; step > 0 ? i <= r.r : i >= r.r; i += step) {
                        if (++D.iter > 2000000) fail('this loop runs too long', at);
                        E.fr[slot] = i;
                        const c = body(E);
                        if (c) {
                            if (c.k === 'exit' && (!c.label || c.label === label)) break;
                            if (c.k === 'next' && (!c.label || c.label === label)) continue;
                            return c;
                        }
                    }
                };
            }
            case 'while': case 'loop': {
                const cnd = s.k === 'while' ? this.cond(s.cond, sc) : null;
                const body = this.seq(s.body, sc);
                const label = s.label, D = this;
                return E => {
                    while (!cnd || cnd(E)) {
                        if (++D.iter > 2000000) fail('this loop runs too long (does it ever stop?)', at);
                        const c = body(E);
                        if (c) {
                            if (c.k === 'exit' && (!c.label || c.label === label)) break;
                            if (c.k === 'next' && (!c.label || c.label === label)) continue;
                            return c;
                        }
                    }
                };
            }
            case 'exit': case 'next': {
                const c = s.cond ? this.cond(s.cond, sc) : null;
                const tok = { k: s.k, label: s.label };
                return E => (!c || c(E) ? tok : undefined);
            }
            case 'return': {
                if (!this.cur.func) fail("'return' only works inside a function", at);
                if (!s.val) fail('a function must return a value', at);
                const x = this.exT(s.val, this.cur.ret, sc);
                const cv = this.fit(x, this.cur.ret, at, `the result of '${this.cur.fname}'`);
                return E => ({ k: 'return', v: cv(x.f(E)) });
            }
            case 'null': return () => {};
            case 'assert': case 'report': {
                const c = s.k === 'assert' ? this.cond(s.cond, sc) : () => 0;
                const msg = s.report ? this.exT(s.report, STRING, sc) : null;
                const sev = s.severity ? this.exT(s.severity, SEVERITY, sc) : null;
                const D = this;
                return E => {
                    if (c(E)) return;
                    const text = msg ? strOf(msg.t, msg.f(E)) : 'Assertion violation.';
                    D.message(sev ? SEVERITY.lits[sev.f(E)] : (s.k === 'report' ? 'note' : 'error'), text, at);
                };
            }
            case 'pcall': fail(`'${s.target.raw || 'this'}' is not a statement: procedures are not supported here`, at);
        }
        fail(`unsupported statement '${s.k}'`, at);
    }
    caseOn(selNode, alts, matching, sc, at, isAssign) {
        const sel = this.exT(selNode, null, sc);
        const t = sel.t;
        if (!(isEnum(t) || isInt(t) || (isArr(t) && isEnum(t.elem)))) fail(`case needs an enumeration, an integer or a vector, not ${tname(t)}`, selNode.at);
        const isA = isArr(t);
        const slen = isA ? tlen(t) : null;
        const map = new Map();
        const pats = [];
        let others = -1;
        const key = v => (isA ? v.v.join(',') : v);
        alts.forEach((al, k) => {
            for (const c of al.choices) {
                if (c.k === 'others') { if (others >= 0) fail("'others' appears twice", al.at || at); others = k; continue; }
                if (c.k === 'range') {
                    if (isA) fail('a range is not a choice for a vector', al.at || at);
                    const r = this.staticRange(c, sc), st = r.dir === 'to' ? 1 : -1;
                    for (let i = r.l; st > 0 ? i <= r.r : i >= r.r; i += st) { if (map.has(i)) fail(`the value ${i} appears twice in this case`, c.at); map.set(i, k); }
                    continue;
                }
                const x = this.exT(c, isA ? (slen !== null ? t : sub(t, { rng: null })) : t, sc);
                if (!x.st) fail('a choice must be a constant', c.at);
                if (x.t.base !== t.base && !(isInt(t) && isInt(x.t))) this.mismatch(x.t, t, c.at, 'this choice');
                if (isA && slen !== null && x.sv.v.length !== slen) fail(`this choice has ${x.sv.v.length} bits but the case expression has ${slen}`, c.at);
                if (matching) { pats.push({ v: x.sv, k }); continue; }
                const kk = key(x.sv);
                if (map.has(kk)) fail(`the value ${showVal(t, x.sv)} appears twice in this case`, c.at);
                map.set(kk, k);
            }
        });
        if (others < 0 && !matching) {
            let full = false;
            if (isEnum(t)) full = map.size === t.lits.length;
            else if (isInt(t)) full = t.hi - t.lo + 1 === map.size;
            if (!full) {
                let hint = '';
                if (isLogic(t)) hint = ": a std_logic has nine values ('U', 'X', '0', '1', 'Z', 'W', 'L', 'H', '-'), so add when others =>";
                else if (isA && isLogic(t.elem)) hint = ': each bit of a std_logic_vector has nine possible values, so add when others =>';
                fail(`this case does not cover every possible value${hint || ': add when others =>'}`, at);
            }
        }
        if (matching && others < 0) fail('a case? needs when others =>', at);
        const acts = alts.map(al => (isAssign ? al.act : al.body));
        const sf = sel.f;
        const m = (p, v) => p === 8 || (is1(p) && is1(v)) || (is0(p) && is0(v)) || p === v;
        if (matching) {
            return E => {
                const v = sf(E);
                const vv = isA ? v.v : [v];
                for (const p of pats) { const pv = isA ? p.v.v : [p.v]; if (pv.every((e, i) => m(e, vv[i]))) return acts[p.k](E); }
                return acts[others](E);
            };
        }
        return E => {
            const v = sf(E);
            const k = map.get(key(v));
            if (k !== undefined) return acts[k](E);
            if (others >= 0) return acts[others](E);
            fail(`no choice matches the value ${showVal(t, v)}`, at);
        };
    }

    /* ---------- elaboration */
    elaborate(top) {
        const ent = this.ents.get(top);
        if (!ent) fail(`there is no entity named '${top}': the top entity must be called ${top}`, 0);
        const arch = this.pickArch(ent, null, ent.at);
        const es = new Scope(this.contextScope(arch), 'inst');
        this.path = '';
        for (const g of ent.generics) for (const nm of g.names) {
            if (!g.def) fail(`the generic '${nm}' of the top entity needs a default value`, g.at);
            const t = this.subtype(g.st, es);
            const x = this.exT(g.def, t, es);
            if (!x.st) fail('a generic default must be a constant', g.at);
            es.add(nm, { cls: 'const', t, v: this.fit(x, t, g.at, `generic '${nm}'`)(x.sv), name: nm }, g.at);
        }
        this.topPorts = [];
        for (const p of ent.ports) {
            const t = this.subtype(p.st, es);
            if (leafCount(t) === null) fail(`the port ${p.names.join(', ')} needs a size: ${t.name}(N-1 downto 0)`, p.at);
            for (const nm of p.names) {
                const sig = this.newSig(nm, t, defVal(t, p.at), p.at);
                if (p.mode === 'in') sig.ext = sig.init.slice();
                es.add(nm, { cls: 'sig', sig, off: 0, t, mode: p.mode, name: nm }, p.at);
                this.topPorts.push({ name: nm, mode: p.mode, sig, t });
            }
        }
        this.elabArch(arch, es, '');
        this.finish();
    }
    pickArch(ent, name, at) {
        const list = this.archs.get(ent.name) || [];
        if (!list.length) fail(`the entity '${ent.name}' has no architecture: write 'architecture rtl of ${ent.name} is ... begin ... end architecture;'`, at);
        if (name) { const a = list.find(x => x.name === name); if (!a) fail(`'${ent.name}' has no architecture named '${name}'`, at); return a; }
        return list[list.length - 1];
    }
    elabArch(arch, sc, path) {
        const saved = this.path;
        this.path = path;
        const s = new Scope(sc, 'arch');
        for (const d of arch.decls) this.declare(d, s);
        for (const st of arch.stmts) this.elabConc(st, s, path);
        this.path = saved;
    }
    elabConc(st, sc, path) {
        switch (st.k) {
            case 'process': return this.elabProcess(st, sc, path);
            case 'casgn': case 'csel': return this.elabConcAssign(st, sc, path);
            case 'cassert': {
                const p = { k: 'process', label: st.label, sens: 'all', decls: [], body: [{ k: 'assert', cond: st.cond, report: st.report, severity: st.severity, at: st.at }], at: st.at };
                return this.elabProcess(p, sc, path);
            }
            case 'inst': return this.elabInstance(st, sc, path);
            case 'forgen': {
                const r = this.staticRange(st.range, sc), step = r.dir === 'to' ? 1 : -1;
                let count = 0;
                for (let i = r.l; step > 0 ? i <= r.r : i >= r.r; i += step) {
                    if (++count > 5000) fail('this generate makes too many copies', st.at);
                    const gs = new Scope(sc, 'gen');
                    gs.add(st.param, { cls: 'const', t: INTEGER, v: i, name: st.param }, st.at);
                    const p2 = `${path}${st.label}(${i}).`;
                    const sv = this.path;
                    this.path = p2;
                    for (const d of st.decls) this.declare(d, gs);
                    for (const c of st.stmts) this.elabConc(c, gs, p2);
                    this.path = sv;
                }
                return;
            }
            case 'ifgen': {
                for (const b of st.branches) {
                    const c = this.exT(b.cond, BOOLEAN, sc);
                    if (!c.st) fail('the condition of an if ... generate must be a constant', b.cond.at);
                    if (c.t.base !== BOOLEAN) fail('the condition of an if ... generate must be a boolean', b.cond.at);
                    if (c.sv) return this.elabGenBody(b, sc, `${path}${st.label}.`);
                }
                if (st.els) return this.elabGenBody(st.els, sc, `${path}${st.label}.`);
                return;
            }
        }
        fail(`unsupported statement '${st.k}'`, st.at);
    }
    elabGenBody(b, sc, path) {
        const gs = new Scope(sc, 'gen');
        const sv = this.path;
        this.path = path;
        for (const d of b.decls) this.declare(d, gs);
        for (const c of b.stmts) this.elabConc(c, gs, path);
        this.path = sv;
    }
    newProc(name, at) { const P = { name, at, drv: new Map(), sens: [], frame: null, run: null }; this.procs.push(P); return P; }
    elabProcess(st, sc, path) {
        if (st.sens === null) fail('this process has no sensitivity list: write process(all) for combinational logic, or process(clk) for a clocked process (wait statements are not supported here)', st.at);
        const P = this.newProc(path + (st.label || `process at line ${st.at % FILE}`), st.at);
        const saved = this.cur;
        this.cur = { proc: P, func: false, slots: 0, reads: new Map(), drives: new Map(), edge: false, inits: [] };
        const ps = new Scope(sc, 'proc');
        for (const d of st.decls) this.declare(d, ps);
        const body = this.seq(st.body, ps);
        const cur = this.cur;
        P.frame = new Array(cur.slots);
        const E0 = { fr: P.frame, P, depth: 0 };
        for (const it of cur.inits) P.frame[it.slot] = it.f(E0);
        P.run = body;
        P.drives = cur.drives;
        let sens;
        if (st.sens === 'all') sens = [...cur.reads.keys()];
        else {
            this.cur = { proc: P, func: false, slots: 0, reads: new Map(), drives: new Map(), edge: false, inits: [] };
            sens = st.sens.map(nm => {
                const r = this.resolve(nm, sc);
                if (r.cls !== 'sig') fail(`'${nm.raw}' in the sensitivity list is not a signal`, nm.at);
                return r.sig;
            });
        }
        this.cur = saved;
        P.sens = [...new Set(sens)];
        if (st.sens !== 'all' && !cur.edge) {
            const missing = [...cur.reads.entries()].filter(([s2]) => !P.sens.includes(s2)).map(([s2, nm]) => `'${nm.replace(/\(.*$/, '')}'`);
            if (missing.length) this.warn(`this process reads ${[...new Set(missing)].join(', ')}, which ${missing.length > 1 ? 'are' : 'is'} missing from its sensitivity list, so the simulation does not react when ${missing.length > 1 ? 'they change' : 'it changes'}. Write process(all).`, st.at);
        }
        if (!cur.edge) this.latchCheck(st.body, st.at);
        P.edge = cur.edge;
    }
    latchCheck(body, at) {
        const all = new Map();
        const walk = list => { for (const s of list) {
            if (s.k === 'sasgn' || s.k === 'ssel') { if (s._sig) all.set(s._sig, s); }
            else if (s.k === 'if') { s.branches.forEach(b => walk(b.body)); if (s.els) walk(s.els); }
            else if (s.k === 'case') s.alts.forEach(a => walk(a.body));
            else if (s.k === 'for' || s.k === 'while' || s.k === 'loop') walk(s.body);
        } };
        walk(body);
        const definite = list => {
            const d = new Set();
            for (const s of list) {
                if ((s.k === 'sasgn' && (!s.alts || s.alts[s.alts.length - 1].cond === null)) || s.k === 'ssel') { if (s._sig) d.add(s._sig); }
                else if (s.k === 'if' && s.els) {
                    let acc = null;
                    for (const b of s.branches.map(x => x.body).concat([s.els])) { const x = definite(b); acc = acc ? new Set([...acc].filter(v => x.has(v))) : x; }
                    acc.forEach(v => d.add(v));
                } else if (s.k === 'case') {
                    let acc = null;
                    for (const a of s.alts) { const x = definite(a.body); acc = acc ? new Set([...acc].filter(v => x.has(v))) : x; }
                    if (acc) acc.forEach(v => d.add(v));
                } else if (s.k === 'for') definite(s.body).forEach(v => d.add(v));   // synthesizable loops run at least once
            }
            return d;
        };
        const d = definite(body);
        for (const [sig] of all) if (!d.has(sig)) this.warn(`'${sig.name}' is not assigned on every path through this process, so it keeps its old value when no assignment runs: that is a latch. Give it a value at the top of the process, or in every branch.`, at);
    }
    elabConcAssign(st, sc, path) {
        const body = st.k === 'casgn'
            ? [{ k: 'sasgn', target: st.target, val: st.val, alts: st.alts, at: st.at }]
            : [{ k: 'ssel', target: st.target, sel: st.sel, alts: st.alts, matching: st.matching, at: st.at }];
        const p = { k: 'process', label: st.label, sens: 'all', decls: [], body, at: st.at };
        this.elabProcess(p, sc, path);
        if (st.k === 'casgn' && st.alts && st.alts[st.alts.length - 1].cond !== null) {
            // a final "when c" without else keeps the old value
        }
    }
    elabInstance(st, sc, path) {
        const u = st.unit, at = st.at;
        let ent, archName = null, comp = null;
        const nm = u.parts[u.parts.length - 1];
        if (u.kind === 'entity') {
            if (u.parts.length > 1 && u.parts[0] !== 'work') fail(`library '${u.parts[0]}' is not available here; use work.${nm}`, at);
            ent = this.ents.get(nm);
            if (!ent) fail(`there is no entity '${nm}' in work`, at);
            archName = u.arch;
        } else {
            const o = sc.find(nm);
            if (!o || o.cls !== 'comp') {
                const e = this.ents.get(nm);
                if (e) fail(`'${nm}' is an entity: instantiate it with '${st.label}: entity work.${nm} port map (...)', or declare 'component ${nm}' in the architecture first`, at);
                fail(`'${u.raw}' is not declared: there is no component or entity with this name`, at);
            }
            comp = o.decl;
            ent = this.ents.get(nm);
            if (!ent) fail(`the component '${nm}' has no matching entity '${nm}'`, at);
        }
        if (this.depth > 60) fail('the hierarchy is too deep (does an entity instantiate itself?)', at);
        const arch = this.pickArch(ent, archName, at);
        const es = new Scope(this.contextScope(arch), 'inst');
        // generics
        const gl = [];
        ent.generics.forEach(g => g.names.forEach(n2 => gl.push({ name: n2, g })));
        const gvals = this.associate(gl.map(x => x.name), st.gmap, 'generic', at);
        for (const { name, g } of gl) {
            const t = this.subtype(g.st, es);
            let x;
            if (gvals.has(name)) x = this.exT(gvals.get(name), t, sc);
            else if (g.def) x = this.exT(g.def, t, es);
            else fail(`the generic '${name}' of ${ent.name} needs a value: generic map (${name} => ...)`, at);
            if (!x.st) fail(`the value of the generic '${name}' must be a constant`, at);
            es.add(name, { cls: 'const', t, v: this.fit(x, t, at, `generic '${name}'`)(x.sv), name }, at);
        }
        if (comp) this.checkComponent(comp, ent, at);
        // ports
        const pl = [];
        ent.ports.forEach(p => p.names.forEach(n2 => pl.push({ name: n2, p })));
        const pvals = this.associate(pl.map(x => x.name), st.pmap, 'port', at);
        for (const { name, p } of pl) {
            const t = this.subtype(p.st, es);
            if (leafCount(t) === null) fail(`the port '${name}' of ${ent.name} needs a size`, p.at);
            const actual = pvals.get(name);
            const full = `${path}${st.label}.${name}`;
            if (!actual || actual.k === 'open') {
                if (p.mode === 'in') {
                    if (!p.def && !actual) fail(`the input '${name}' of ${st.label} is not connected`, at);
                    if (!p.def) fail(`the input '${name}' of ${st.label} cannot be left open`, at);
                    const x = this.exT(p.def, t, es);
                    const sig = this.newSig(full, t, this.fit(x, t, p.at, name)(x.sv), at);
                    es.add(name, { cls: 'sig', sig, off: 0, t, mode: 'in', name }, at);
                } else {
                    const sig = this.newSig(full, t, defVal(t, at), at);
                    es.add(name, { cls: 'sig', sig, off: 0, t, mode: p.mode, name }, at);
                }
                continue;
            }
            let baseNode = actual;
            while (baseNode.k === 'call') baseNode = baseNode.pfx;
            const baseObj = baseNode.k === 'name' ? sc.find(baseNode.id) : null;
            const isName = ['name', 'call'].includes(actual.k) && baseObj && (baseObj.cls === 'sig' || baseObj.cls === 'alias');
            if (isName && this.resolve(actual, sc).cls === 'sig') {
                const r = this.resolve(actual, sc);
                if (r.off === undefined) fail(`the signal connected to '${name}' must have constant indices`, actual.at);
                if (r.t.base !== t.base) this.mismatch(r.t, t, actual.at, `the port '${name}' of ${st.label}`);
                if (leafCount(r.t) !== leafCount(t)) fail(`width mismatch: the port '${name}' of ${st.label} has ${leafCount(t)} bits, but '${r.name}' has ${leafCount(r.t)}`, actual.at);
                if (p.mode !== 'in' && r.mode === 'in') fail(`the output '${name}' of ${st.label} cannot drive '${r.name}', which is an input port`, actual.at);
                es.add(name, { cls: 'sig', sig: r.sig, off: r.off, t, mode: p.mode, name, region: { off: r.off, n: leafCount(t) } }, at);
                continue;
            }
            if (p.mode !== 'in') fail(`the output '${name}' of ${st.label} must be connected to a signal, not to an expression`, actual.at);
            // an expression on an input: an implicit signal driven by its own process
            const sig = this.newSig(full, t, defVal(t, at), at);
            const P = this.newProc(`${full} (port map)`, actual.at);
            const saved = this.cur;
            this.cur = { proc: P, func: false, slots: 0, reads: new Map(), drives: new Map(), edge: false, inits: [] };
            const x = this.exT(actual, t, sc);
            const cv = this.fit(x, t, actual.at, `the port '${name}' of ${st.label}`);
            const D = this;
            P.run = isArr(t) ? E => D.write(P, sig, 0, flat(cv(x.f(E)), [])) : E => D.write(P, sig, 0, [cv(x.f(E))]);
            P.frame = [];
            P.drives = new Map([[sig, [{ off: 0, n: sig.n }]]]);
            P.sens = [...this.cur.reads.keys()];
            this.cur = saved;
            es.add(name, { cls: 'sig', sig, off: 0, t, mode: 'in', name }, at);
        }
        this.depth = (this.depth || 0) + 1;
        this.elabArch(arch, es, `${path}${st.label}.`);
        this.depth--;
    }
    associate(names, list, kind, at) {
        const m = new Map();
        let pos = 0, named = false;
        for (const a of list) {
            if (a.formal) {
                named = true;
                if (a.formal.k !== 'name') fail(`connect whole ${kind}s here: ${kind === 'port' ? 'name => signal' : 'name => value'}`, a.at);
                const f = a.formal.id;
                if (!names.includes(f)) fail(`there is no ${kind} named '${a.formal.raw}'`, a.at);
                if (m.has(f)) fail(`the ${kind} '${f}' is connected twice`, a.at);
                m.set(f, a.val);
            } else {
                if (named) fail(`positional ${kind}s must come before the named ones`, a.at);
                if (pos >= names.length) fail(`there are more values than ${kind}s (${names.length})`, a.at);
                m.set(names[pos++], a.val);
            }
        }
        return m;
    }
    checkComponent(comp, ent, at) {
        const flatP = list => { const r = []; list.forEach(p => p.names.forEach(n2 => r.push({ n: n2, mode: p.mode, st: p.st }))); return r; };
        const a = flatP(comp.ports), b = flatP(ent.ports);
        if (a.length !== b.length || a.some((p, i) => p.n !== b[i].n || p.mode !== b[i].mode)) fail(`the component '${comp.name}' does not match the entity '${ent.name}': it must have the same ports, in the same order and with the same modes`, comp.at);
    }

    finish() {
        for (const P of this.procs) {
            for (const [sig, regs] of P.drives) {
                const d = { P, sig, val: sig.init.slice(), next: null, cover: new Uint8Array(sig.n) };
                for (const r of regs) d.cover.fill(1, r.off, r.off + r.n);
                sig.drivers.push(d);
                P.drv.set(sig, d);
            }
            for (const s of P.sens) s.procs.push(P);
        }
        for (const sig of this.sigs) {
            if (sig.drivers.length < 2 && !(sig.drivers.length === 1 && sig.ext)) continue;
            const cnt = new Uint8Array(sig.n);
            for (const d of sig.drivers) for (let i = 0; i < sig.n; i++) if (d.cover[i]) cnt[i]++;
            const multi = [];
            for (let i = 0; i < sig.n; i++) if (cnt[i] > 1) multi.push(i);
            if (!multi.length) continue;
            const lines = [...new Set(sig.drivers.filter(d => multi.some(i => d.cover[i])).map(d => d.P.at % FILE))].sort((x, y) => x - y);
            if (!sig.resolved) fail(`'${sig.name}' is assigned in more than one process or statement (lines ${lines.join(', ')}). Each signal of type ${tname(sig.t)} may only have one driver: assign it in one place`, sig.drivers[1].P.at);
            this.warn(`'${sig.name}' is driven from more than one place (lines ${lines.join(', ')}). VHDL resolves the drivers, and wherever they disagree the result is 'X'.`, sig.drivers[1].P.at);
        }
        for (const p of this.topPorts) if (p.mode !== 'in' && !p.sig.drivers.length) this.warn(`the output '${p.name}' is never assigned, so it stays 'U'`, p.sig.at);
    }

    /* ---------- the simulation kernel */
    write(P, sig, off, leaves) {
        const d = P.drv.get(sig);
        if (!d.next) { d.next = d.val.slice(); this.pending.push(d); }
        for (let k = 0; k < leaves.length; k++) d.next[off + k] = leaves[k];
    }
    update(s) {
        let changed = false;
        const ds = s.drivers, n = s.n;
        for (let i = 0; i < n; i++) {
            let v = -1;
            if (s.resolved) {
                if (s.ext) v = s.ext[i];
                for (const d of ds) if (d.cover[i]) v = v < 0 ? d.val[i] : RES[v][d.val[i]];
                if (v < 0) v = s.init[i];
            } else {
                for (const d of ds) if (d.cover[i]) { v = d.val[i]; break; }
                if (v < 0) v = s.ext ? s.ext[i] : s.init[i];
            }
            if (v !== s.cur[i]) { s.last[i] = s.cur[i]; s.cur[i] = v; s.chg[i] = this.delta; changed = true; }
        }
        return changed;
    }
    runProc(P) {
        this.iter = 0;
        P.run({ fr: P.frame, P, depth: 0 });
    }
    reset() {
        for (const s of this.sigs) {
            s.cur = s.init.slice(); s.last = s.init.slice(); s.chg.fill(-1);
            if (s.ext) s.ext = s.init.slice();
            for (const d of s.drivers) { d.val = s.init.slice(); d.next = null; }
        }
        this.pending = []; this.extDirty = []; this.delta = 0; this.msgs = [];
        for (const P of this.procs) this.runProc(P);
        this.settle();
        this.msgs = [];               // warnings from time 0, while the inputs are still 'U'
    }
    settle() {
        let guard = 0;
        while (this.pending.length || this.extDirty.length) {
            if (++guard > 5000) fail('the design never settles: some signal keeps changing (a combinational loop, such as y <= not y?)', 0);
            this.delta++;
            const touched = new Set();
            for (const d of this.pending) { d.val = d.next; d.next = null; touched.add(d.sig); }
            this.pending = [];
            for (const s of this.extDirty) touched.add(s);
            this.extDirty = [];
            const run = new Set();
            for (const s of touched) if (this.update(s)) for (const P of s.procs) run.add(P);
            for (const P of run) this.runProc(P);
        }
    }
    port(name) {
        const p = this.topPorts.find(x => x.name === name);
        if (!p) throw new Error(`no port ${name}`);
        return p;
    }
    set(name, str) {
        const p = this.port(name);
        const s = p.sig;
        if (str.length !== s.n) throw new Error(`port ${name}: ${str.length} values for ${s.n} bits`);
        for (let i = 0; i < s.n; i++) s.ext[i] = SLCH.indexOf(str[i]);
        this.extDirty.push(s);
    }
    get(name) {
        const s = this.port(name).sig;
        let r = '';
        for (let i = 0; i < s.n; i++) r += SLCH[s.cur[i]] || '?';
        return r;
    }
}

/* ================================================================= api */
function locate(e, names) {
    const at = e.at || 0;
    return { file: names[Math.floor(at / FILE)] || null, fileIdx: Math.floor(at / FILE), line: at % FILE, msg: e.message || e.msg };
}
function compile(files, top) {
    const D = new Design();
    const names = files.map(f => f.name);
    try {
        files.forEach((f, i) => D.addFile(f.text, i, f.name));
        D.elaborate(top);
    } catch (e) {
        if (e instanceof VError) return { ok: false, errors: [locate(e, names)], warnings: D.warns.map(w => locate(w, names)) };
        return { ok: false, errors: [{ file: null, fileIdx: -1, line: 0, msg: 'internal error: ' + e.message, stack: e.stack }], warnings: [] };
    }
    const wrap = fn => (...a) => {
        try { return fn(...a); } catch (e) {
            if (e instanceof VError) { const r = locate(e, names); const err = new Error(r.msg); err.where = r; throw err; }
            throw e;
        }
    };
    return {
        ok: true,
        errors: [],
        warnings: D.warns.map(w => locate(w, names)),
        ports: D.topPorts.map(p => ({ name: p.name, mode: p.mode, width: p.sig.n, vector: isArr(p.t), type: tname(p.t), dir: isArr(p.t) ? p.t.rng.dir : null })),
        reset: wrap(() => D.reset()),
        set: wrap((n, v) => D.set(n, v)),
        settle: wrap(() => D.settle()),
        get: wrap(n => D.get(n)),
        messages: () => D.msgs.map(m => Object.assign(locate(m, names), { sev: m.sev }))
    };
}

G.VHDL = { compile, lex, Parser, version: '1.0' };
})(typeof window !== 'undefined' ? window : globalThis);
