/* board.js - a virtual FPGA board. A design written for the board's pins runs on the
   VHDL simulator (sim.js), one clock cycle at a time, and the board turns its pins into
   LEDs, switches, buttons, a 7-segment display and a serial terminal. */
(function (G) {
'use strict';

// the pins of the board: a design declares the ones it uses, with these names
const PINS = [
    { name: 'clk', dir: 'in', scalar: true, doc: 'The board clock. Its frequency is set on the board.' },
    { name: 'sw', dir: 'in', width: 16, doc: '16 slide switches; sw(0) is on the right.' },
    { name: 'btn', dir: 'in', width: 5, doc: '5 push buttons: 0 centre, 1 up, 2 left, 3 right, 4 down. A button reads 1 while pressed.' },
    { name: 'led', dir: 'out', width: 16, doc: '16 LEDs; led(0) is on the right. A 1 lights an LED.' },
    { name: 'seg', dir: 'out', width: 7, exact: true, doc: 'The segments gfedcba of the display, shared by all four digits. A 1 lights a segment.' },
    { name: 'dp', dir: 'out', scalar: true, doc: 'The decimal point of the selected digits.' },
    { name: 'an', dir: 'out', width: 4, doc: 'Selects the digits that show seg; an(0) is the rightmost digit. A 1 selects a digit.' },
    { name: 'tx', dir: 'out', scalar: true, doc: 'Serial data from the design to the terminal: 8 data bits, no parity, 1 stop bit.' },
    { name: 'rx', dir: 'in', scalar: true, doc: 'Serial data from the terminal to the design. It rests at 1.' }
];
const PIN = Object.fromEntries(PINS.map(p => [p.name, p]));
const L0 = 2, L1 = 3;                          // the std_logic positions of '0' and '1'
const is1 = v => v === 3 || v === 7;           // '1' or 'H'

/* ---------- programming: compile the design and connect its ports to the pins */
function program(text, opt) {
    const top = VHDLCheck.topOf(text);
    if (!top) return { ok: false, errors: [{ line: 0, msg: 'There is no entity to program: write one with the board pins it uses.' }], warnings: [] };
    const d = VHDL.compile([{ name: 'design', text }], top, { generics: { clk_hz: opt.clkHz, baud: opt.baud } });
    if (!d.ok) return { ok: false, errors: d.errors, warnings: d.warnings || [] };
    const errors = [], used = {};
    for (const p of d.ports) {
        const pin = PIN[p.name];
        const bad = msg => errors.push({ line: 0, msg: `The port '${p.name}' ${msg}` });
        if (!pin) { bad(`is not a pin of the board. Its pins are ${PINS.map(x => x.name).join(', ')}.`); continue; }
        if (p.mode !== pin.dir && !(pin.dir === 'out' && p.mode === 'buffer')) { bad(`must be an ${pin.dir} port.`); continue; }
        if (pin.scalar) { if (p.vector || p.type !== 'std_logic') { bad('must be a std_logic.'); continue; } }
        else if (!p.vector || p.dir !== 'downto' || !/^std_logic_vector/.test(p.type) || p.width > pin.width || (pin.exact && p.width !== pin.width)) {
            bad(`must be a std_logic_vector(${pin.exact ? pin.width - 1 : 'N'} downto 0)${pin.exact ? '' : ` with up to ${pin.width} bits`}.`);
            continue;
        }
        used[p.name] = p;
    }
    if (errors.length) return { ok: false, errors, warnings: d.warnings };
    try {
        const dev = new Device(d, used, opt);
        return { ok: true, dev, top, used, generics: d.generics, warnings: d.warnings };
    } catch (e) {
        return { ok: false, errors: [e.where || { line: 0, msg: e.message }], warnings: d.warnings };
    }
}

/* ---------- the board with a design on it */
class Device {
    constructor(d, used, opt) {
        this.d = d; this.used = used;
        this.clkHz = opt.clkHz; this.baud = opt.baud;
        this.cpb = Math.max(1, Math.floor(opt.clkHz / opt.baud));       // clock cycles per serial bit, as CLK_HZ / BAUD in VHDL
        this.w = {};
        for (const n of ['sw', 'btn', 'led', 'an']) this.w[n] = used[n] ? used[n].width : 0;
        this.sw = new Array(16).fill(0);
        this.btn = new Array(5).fill(0);                                 // what the user does
        this.btnLevel = new Array(5).fill(0);                            // what the pin shows, with bounce
        this.bounceLeft = new Array(5).fill(0);
        this.bounce = false;
        this.inDirty = true;
        this.drv = {};
        for (const n of ['clk', 'sw', 'btn', 'rx']) if (used[n]) this.drv[n] = d.driver(n);
        this.rd = {};
        for (const n of ['led', 'seg', 'dp', 'an', 'tx']) if (used[n]) this.rd[n] = d.reader(n);
        this.text = '';                                                  // what the terminal received
        this.got = 0;
        this.u = { state: 0, count: 0, bit: 0, byte: 0, prev: 1 };
        this.rxq = []; this.rxCur = null; this.rxLevel = 1;
        this.cycles = 0;
        this.resetAcc();
        d.reset();
        if (this.drv.clk) this.drv.clk([L0]);
        if (this.drv.rx) this.drv.rx([L1]);
        this.applyInputs();
        d.step();
    }
    resetAcc() { this.n = 0; this.ledAcc = new Float64Array(16); this.segAcc = Array.from({ length: 4 }, () => new Float64Array(8)); }
    setSwitch(i, v) { this.sw[i] = v ? 1 : 0; this.inDirty = true; }
    setButton(i, v) {
        this.btn[i] = v ? 1 : 0;
        // a mechanical contact bounces for a few milliseconds
        if (this.bounce) this.bounceLeft[i] = Math.max(8, Math.round(this.clkHz * 0.004));
        this.inDirty = true;
    }
    send(bytes) { for (const b of bytes) this.rxq.push(b & 255); }
    applyInputs() {
        if (this.drv.sw) { const w = this.w.sw, a = new Array(w); for (let i = 0; i < w; i++) a[w - 1 - i] = this.sw[i] ? L1 : L0; this.drv.sw(a); }
        if (this.drv.btn) { const w = this.w.btn, a = new Array(w); for (let i = 0; i < w; i++) a[w - 1 - i] = this.btnLevel[i] ? L1 : L0; this.drv.btn(a); }
    }
    // one clock cycle: the inputs change between the edges, then a rising and a falling edge
    cycle() {
        let dirty = this.inDirty;
        this.inDirty = false;
        for (let i = 0; i < 5; i++) {
            let lv = this.btn[i];
            if (this.bounceLeft[i] > 0) { this.bounceLeft[i]--; if (Math.random() < 0.5) lv = 1 - lv; }
            if (lv !== this.btnLevel[i]) { this.btnLevel[i] = lv; dirty = true; }
        }
        if (dirty) this.applyInputs();
        if (this.drv.rx) {
            if (!this.rxCur && this.rxq.length) {
                const b = this.rxq.shift();
                this.rxCur = { bits: [0, 1 & b, 1 & (b >> 1), 1 & (b >> 2), 1 & (b >> 3), 1 & (b >> 4), 1 & (b >> 5), 1 & (b >> 6), 1 & (b >> 7), 1, 1], k: 0, c: 0 };
            }
            const lv = this.rxCur ? this.rxCur.bits[this.rxCur.k] : 1;
            if (lv !== this.rxLevel) { this.rxLevel = lv; this.drv.rx([lv ? L1 : L0]); }
            if (this.rxCur && ++this.rxCur.c === this.cpb) { this.rxCur.c = 0; if (++this.rxCur.k === this.rxCur.bits.length) this.rxCur = null; }
        }
        const d = this.d;
        d.step();
        if (this.drv.clk) { this.drv.clk([L1]); d.step(); }
        this.sample();
        if (this.drv.clk) { this.drv.clk([L0]); d.step(); }
        this.cycles++;
    }
    sample() {
        this.n++;
        if (this.rd.led) {
            const v = this.rd.led(), w = this.w.led;
            for (let i = 0; i < w; i++) if (is1(v[w - 1 - i])) this.ledAcc[i]++;
        }
        if (this.rd.seg) {
            const sv = this.rd.seg(), av = this.rd.an ? this.rd.an() : null, dv = this.rd.dp ? this.rd.dp() : null, wa = this.w.an;
            for (let dg = 0; dg < 4; dg++) {
                if (av && !(dg < wa && is1(av[wa - 1 - dg]))) continue;           // without an, every digit shows seg
                const acc = this.segAcc[dg];
                for (let s = 0; s < 7; s++) if (is1(sv[6 - s])) acc[s]++;
                if (dv && is1(dv[0])) acc[7]++;
            }
        }
        if (this.rd.tx) this.serialIn(is1(this.rd.tx()[0]) ? 1 : 0);
    }
    // the terminal's receiver: finds a start bit and samples every bit in its middle
    serialIn(t) {
        const u = this.u, cpb = this.cpb;
        switch (u.state) {
            case 0: if (u.prev === 1 && t === 0) { u.state = 1; u.count = 0; } break;
            case 1: if (++u.count >= Math.max(1, cpb >> 1)) { if (t === 0) { u.state = 2; u.count = 0; u.bit = 0; u.byte = 0; } else u.state = 0; } break;
            case 2: if (++u.count === cpb) { u.count = 0; u.byte |= t << u.bit; if (++u.bit === 8) u.state = 3; } break;
            case 3: if (++u.count === cpb) { this.received(t === 1 ? u.byte : -1); u.state = 0; } break;
        }
        u.prev = t;
    }
    received(b) {
        this.got++;
        let c;
        if (b < 0) c = '�';                                          // no stop bit: a framing error
        else if (b === 13) c = '\n';
        else if (b === 10) c = this.lastByte === 13 ? '' : '\n';
        else if (b === 8) { this.text = this.text.slice(0, -1); c = ''; }
        else if (b < 32 || b > 126) c = '·';
        else c = String.fromCharCode(b);
        this.lastByte = b;
        this.text = (this.text + c).slice(-6000);
    }
    // what the board shows: the share of the cycles since the last frame for which each LED
    // and segment was lit, so that PWM dims an LED and a scanned display looks steady
    frame() {
        const n = this.n, f = { cycles: this.cycles, led: null, seg: null };
        if (n) {
            f.led = Array.from(this.ledAcc, a => a / n);
            const k = this.rd.an ? Math.max(1, this.w.an) : 1;
            f.seg = this.segAcc.map(acc => Array.from(acc, a => Math.min(1, (a / n) * k)));
        }
        this.resetAcc();
        return f;
    }
    messages() { return this.d.messages(); }
}

/* ---------- example designs */
const HDR = 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n';
const SEG_TABLE = `  with nib select
    seg <= "0111111" when "0000", "0000110" when "0001", "1011011" when "0010", "1001111" when "0011",
           "1100110" when "0100", "1101101" when "0101", "1111101" when "0110", "0000111" when "0111",
           "1111111" when "1000", "1101111" when "1001", "1110111" when "1010", "1111100" when "1011",
           "0111001" when "1100", "1011110" when "1101", "1111001" when "1110", "1110001" when others;`;
const EXAMPLES = [
    {
        id: 'switches', title: 'Switches to LEDs', clkHz: 1000,
        note: 'The smallest design: each LED shows its switch. Flip the switches.',
        code: `${HDR}
-- Each LED shows the switch below it.
entity board_top is
  port (
    sw  : in  std_logic_vector(15 downto 0);
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
begin
  led <= sw;
end architecture;
`
    },
    {
        id: 'blinky', title: 'Blinky', clkHz: 1000,
        note: 'led(0) blinks once a second and the upper LEDs count the seconds. The centre button resets.',
        code: `${HDR}
-- led(0) blinks once a second, led(15 downto 8) count the seconds.
-- The board fills in CLK_HZ with its clock frequency.
entity board_top is
  generic (CLK_HZ : positive := 1000);
  port (
    clk : in  std_logic;
    btn : in  std_logic_vector(4 downto 0);
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant HALF : positive := maximum(1, CLK_HZ / 2);   -- clock cycles in half a second
  signal count   : integer range 0 to HALF - 1 := 0;
  signal blink   : std_logic := '0';
  signal seconds : unsigned(7 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if btn(0) = '1' then
        count   <= 0;
        blink   <= '0';
        seconds <= (others => '0');
      elsif count = HALF - 1 then
        count <= 0;
        blink <= not blink;
        if blink = '1' then
          seconds <= seconds + 1;
        end if;
      else
        count <= count + 1;
      end if;
    end if;
  end process;

  led(0)           <= blink;
  led(7 downto 1)  <= (others => '0');
  led(15 downto 8) <= std_logic_vector(seconds);
end architecture;
`
    },
    {
        id: 'scanner', title: 'Running light', clkHz: 1000,
        note: 'One LED runs from side to side, 16 steps a second; sw(0) doubles the speed.',
        code: `${HDR}
-- One lit LED runs from side to side. sw(0) doubles the speed.
entity board_top is
  generic (CLK_HZ : positive := 1000);
  port (
    clk : in  std_logic;
    sw  : in  std_logic_vector(15 downto 0);
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant STEP : positive := maximum(1, CLK_HZ / 16);  -- 16 steps a second
  signal count : integer range 0 to STEP - 1 := 0;
  signal pos   : integer range 0 to 15 := 0;
  signal up    : boolean := true;
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if count >= STEP - 1 or (sw(0) = '1' and count >= STEP / 2) then
        count <= 0;
        if up then
          if pos = 15 then up <= false; pos <= 14; else pos <= pos + 1; end if;
        else
          if pos = 0 then up <= true; pos <= 1; else pos <= pos - 1; end if;
        end if;
      else
        count <= count + 1;
      end if;
    end if;
  end process;

  process(all)
  begin
    led <= (others => '0');
    led(pos) <= '1';
  end process;
end architecture;
`
    },
    {
        id: 'hexcount', title: 'Counter on the display', clkHz: 1000,
        note: 'Counts in hex, ten steps a second, on the four digits. The digits take turns, 100 times a second each; set the clock to 10 Hz to watch them take turns. The centre button resets.',
        code: `${HDR}
-- A hex counter on the four digits. Only one digit is lit at a time:
-- the design selects them in turn, faster than the eye can follow.
entity board_top is
  generic (CLK_HZ : positive := 1000);
  port (
    clk : in  std_logic;
    btn : in  std_logic_vector(4 downto 0);
    seg : out std_logic_vector(6 downto 0);
    an  : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant TENTH       : positive := maximum(1, CLK_HZ / 10);   -- a count every 0.1 s
  constant SCAN_CYCLES : positive := maximum(1, CLK_HZ / 400);  -- each digit 100 times a second
  signal tick  : integer range 0 to TENTH - 1 := 0;
  signal scan  : integer range 0 to SCAN_CYCLES - 1 := 0;
  signal value : unsigned(15 downto 0) := (others => '0');
  signal digit : unsigned(1 downto 0) := "00";
  signal nib   : std_logic_vector(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if btn(0) = '1' then
        value <= (others => '0');
        tick  <= 0;
      elsif tick = TENTH - 1 then
        tick  <= 0;
        value <= value + 1;
      else
        tick <= tick + 1;
      end if;
      if scan = SCAN_CYCLES - 1 then
        scan  <= 0;
        digit <= digit + 1;
      else
        scan <= scan + 1;
      end if;
    end if;
  end process;

  with digit select
    nib <= std_logic_vector(value(3 downto 0))   when "00",
           std_logic_vector(value(7 downto 4))   when "01",
           std_logic_vector(value(11 downto 8))  when "10",
           std_logic_vector(value(15 downto 12)) when others;

  with digit select
    an <= "0001" when "00", "0010" when "01", "0100" when "10", "1000" when others;

${SEG_TABLE}
end architecture;
`
    },
    {
        id: 'stopwatch', title: 'Stopwatch', clkHz: 1000,
        note: 'Minutes, seconds and tenths. The centre button starts and stops, the up button resets.',
        code: `${HDR}
-- A stopwatch: M SS.t on the four digits.
-- btn(0), the centre button, starts and stops; btn(1), up, resets.
entity board_top is
  generic (CLK_HZ : positive := 1000);
  port (
    clk : in  std_logic;
    btn : in  std_logic_vector(4 downto 0);
    seg : out std_logic_vector(6 downto 0);
    dp  : out std_logic;
    an  : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant TENTH       : positive := maximum(1, CLK_HZ / 10);
  constant SCAN_CYCLES : positive := maximum(1, CLK_HZ / 400);
  type digits_t is array (0 to 3) of unsigned(3 downto 0);   -- tenths, seconds, tens of seconds, minutes
  signal d       : digits_t := (others => (others => '0'));
  signal tick    : integer range 0 to TENTH - 1 := 0;
  signal scan    : integer range 0 to SCAN_CYCLES - 1 := 0;
  signal sel     : integer range 0 to 3 := 0;
  signal running : boolean := false;
  signal prev    : std_logic := '0';
  signal nib     : std_logic_vector(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      prev <= btn(0);
      if btn(0) = '1' and prev = '0' then     -- a press of the centre button
        running <= not running;
      end if;
      if btn(1) = '1' then
        d <= (others => (others => '0'));
        tick <= 0;
      elsif running then
        if tick = TENTH - 1 then
          tick <= 0;
          -- a chain of decimal counters: each one carries into the next
          if d(0) = 9 then
            d(0) <= (others => '0');
            if d(1) = 9 then
              d(1) <= (others => '0');
              if d(2) = 5 then
                d(2) <= (others => '0');
                if d(3) = 9 then d(3) <= (others => '0'); else d(3) <= d(3) + 1; end if;
              else
                d(2) <= d(2) + 1;
              end if;
            else
              d(1) <= d(1) + 1;
            end if;
          else
            d(0) <= d(0) + 1;
          end if;
        else
          tick <= tick + 1;
        end if;
      end if;
      if scan = SCAN_CYCLES - 1 then
        scan <= 0;
        if sel = 3 then sel <= 0; else sel <= sel + 1; end if;
      else
        scan <= scan + 1;
      end if;
    end if;
  end process;

  nib <= std_logic_vector(d(sel));
  dp  <= '1' when sel = 1 or sel = 3 else '0';   -- M.SS.t
  with sel select
    an <= "0001" when 0, "0010" when 1, "0100" when 2, "1000" when others;

${SEG_TABLE}
end architecture;
`
    },
    {
        id: 'pwm', title: 'PWM: LED brightness', clkHz: 10000,
        note: 'The LEDs show 16 brightness levels, and sw(3 downto 0) sets the brightness of led(15). The board shows how long each LED was on, as your eye would.',
        code: `${HDR}
-- Pulse-width modulation: led(i) is on for i of every 16 clock cycles,
-- and led(15) for as many as sw(3 downto 0) says.
entity board_top is
  port (
    clk : in  std_logic;
    sw  : in  std_logic_vector(15 downto 0);
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
  signal count : unsigned(3 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      count <= count + 1;
    end if;
  end process;

  process(all)
  begin
    for i in 0 to 14 loop
      if count < i then led(i) <= '1'; else led(i) <= '0'; end if;
    end loop;
    if count < unsigned(sw(3 downto 0)) then led(15) <= '1'; else led(15) <= '0'; end if;
  end process;
end architecture;
`
    },
    {
        id: 'uart_hello', title: 'UART: hello', clkHz: 100000, baud: 9600,
        note: 'Press the centre button and the design sends a line to the terminal: the UART transmitter of chapter 12, with its own bit timer.',
        code: `${HDR}
-- Sends "Hello from VHDL!" to the terminal at every press of the centre button.
-- The board fills in CLK_HZ and BAUD: a bit lasts CLK_HZ / BAUD clock cycles.
entity board_top is
  generic (CLK_HZ : positive := 100000; BAUD : positive := 9600);
  port (
    clk : in  std_logic;
    btn : in  std_logic_vector(4 downto 0);
    tx  : out std_logic;
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant BIT_CYCLES : positive := maximum(1, CLK_HZ / BAUD);
  constant MSG : string := "Hello from VHDL!";
  signal prev   : std_logic := '0';
  signal idx    : integer range 0 to MSG'length + 2 := 0;    -- the next character to send
  signal active : boolean := false;                         -- sending a line
  signal busy   : boolean := false;                         -- sending one character
  signal sh     : std_logic_vector(9 downto 0) := (others => '1');
  signal nbits  : integer range 0 to 9 := 0;
  signal timer  : integer range 0 to BIT_CYCLES - 1 := 0;
  signal lines  : unsigned(15 downto 0) := (others => '0');
begin
  process(clk)
    variable c : integer range 0 to 255;
  begin
    if rising_edge(clk) then
      prev <= btn(0);
      if btn(0) = '1' and prev = '0' and not active then
        active <= true;
        idx    <= 0;
      end if;
      if busy then
        -- one bit time per bit: start bit, eight data bits, stop bit
        if timer = BIT_CYCLES - 1 then
          timer <= 0;
          sh    <= '1' & sh(9 downto 1);
          if nbits = 9 then busy <= false; else nbits <= nbits + 1; end if;
        else
          timer <= timer + 1;
        end if;
      elsif active then
        -- load the next character: the message, then CR and LF
        if idx < MSG'length then
          c := character'pos(MSG(idx + 1));
        elsif idx = MSG'length then
          c := 13;
        else
          c := 10;
        end if;
        sh    <= '1' & std_logic_vector(to_unsigned(c, 8)) & '0';
        busy  <= true;
        nbits <= 0;
        timer <= 0;
        if idx = MSG'length + 1 then
          active <= false;
          lines  <= lines + 1;
        else
          idx <= idx + 1;
        end if;
      end if;
    end if;
  end process;

  tx  <= sh(0);
  led <= std_logic_vector(lines);    -- how many lines were sent
end architecture;
`
    },
    {
        id: 'uart_echo', title: 'UART: echo', clkHz: 100000, baud: 9600,
        note: 'Type in the terminal: the design receives each character, shows its code on the LEDs and sends it back.',
        code: `${HDR}
-- A serial echo: every character that arrives on rx is shown on the LEDs and sent back on tx.
entity board_top is
  generic (CLK_HZ : positive := 100000; BAUD : positive := 9600);
  port (
    clk : in  std_logic;
    rx  : in  std_logic;
    tx  : out std_logic;
    led : out std_logic_vector(15 downto 0)
  );
end entity;

architecture rtl of board_top is
  constant BIT_CYCLES : positive := maximum(2, CLK_HZ / BAUD);
  -- the receiver
  signal rx1, rx2 : std_logic := '1';                -- a synchronizer: rx comes from outside
  signal rbusy    : boolean := false;
  signal rtimer   : integer range 0 to BIT_CYCLES - 1 := 0;
  signal rbits    : integer range 0 to 9 := 0;
  signal rsh      : std_logic_vector(7 downto 0) := (others => '0');
  signal got      : std_logic_vector(7 downto 0) := (others => '0');
  signal fresh    : boolean := false;                -- a character has just arrived
  -- the transmitter
  signal tbusy    : boolean := false;
  signal ttimer   : integer range 0 to BIT_CYCLES - 1 := 0;
  signal tbits    : integer range 0 to 9 := 0;
  signal tsh      : std_logic_vector(9 downto 0) := (others => '1');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      rx1 <= rx;
      rx2 <= rx1;
      fresh <= false;
      if not rbusy then
        if rx2 = '0' then                            -- a start bit: wait half a bit to its middle
          rbusy  <= true;
          rtimer <= BIT_CYCLES / 2;
          rbits  <= 0;
        end if;
      elsif rtimer = BIT_CYCLES - 1 then
        rtimer <= 0;
        if rbits = 0 then
          if rx2 /= '0' then rbusy <= false; end if; -- only a glitch
          rbits <= 1;
        elsif rbits <= 8 then
          rsh   <= rx2 & rsh(7 downto 1);            -- the least significant bit comes first
          rbits <= rbits + 1;
        else                                         -- the middle of the stop bit
          rbusy <= false;
          got   <= rsh;
          fresh <= true;
        end if;
      else
        rtimer <= rtimer + 1;
      end if;

      if tbusy then
        if ttimer = BIT_CYCLES - 1 then
          ttimer <= 0;
          tsh    <= '1' & tsh(9 downto 1);
          if tbits = 9 then tbusy <= false; else tbits <= tbits + 1; end if;
        else
          ttimer <= ttimer + 1;
        end if;
      elsif fresh then
        tsh    <= '1' & got & '0';
        tbusy  <= true;
        tbits  <= 0;
        ttimer <= 0;
      end if;
    end if;
  end process;

  tx               <= tsh(0);
  led(7 downto 0)  <= got;
  led(15 downto 8) <= (others => '0');
end architecture;
`
    }
];

G.VHDLBoard = { PINS, program, EXAMPLES, CLOCKS: [10, 100, 1000, 10000, 100000, 1000000], BAUDS: [300, 1200, 2400, 4800, 9600, 19200] };
})(typeof window !== 'undefined' ? window : globalThis);
