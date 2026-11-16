/* Mis Finanzas — lógica (sin pantallas). Funciona en el navegador y en Node para pruebas. */
"use strict";

const MESES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const SERVICIOS = {
  Agua: ["agua", "japac"],
  Luz: ["luz", "electricidad", "cfe"],
  Internet: ["internet", "totalplay", "telmex", "izzi", "megacable", "infinitum"],
};
const ICONO_SERVICIO = { Agua: "💧", Luz: "⚡", Internet: "🌐" };
const TIPOS_INGRESO = ["Nómina", "Extra fijo", "Extra eventual", "Otro"];
const FRECUENCIAS = ["Cada mes", "Cada quincena", "Cada 2 meses (bimestral)"];

// ---------------------------------------------------------------- fechas (siempre 'aaaa-mm-dd')
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const partes = (s) => s.split("-").map(Number);
const diasMes = (y, m) => new Date(y, m, 0).getDate();
let _hoyFijo = null;  // para pruebas
function hoy() {
  if (_hoyFijo) return _hoyFijo;
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
function eom(s) { const [y, m] = partes(s); return ymd(y, m, diasMes(y, m)); }
function quincenaDe(s) { const [y, m, d] = partes(s); return d <= 15 ? ymd(y, m, 15) : eom(s); }
function siguienteCorte(c) {
  const [y, m, d] = partes(c);
  if (d === 15) return eom(c);
  return m === 12 ? ymd(y + 1, 1, 15) : ymd(y, m + 1, 15);
}
function sumarMeses(s, n) {
  const [y, m, d] = partes(s);
  let mm = m - 1 + n;
  const yy = y + Math.floor(mm / 12);
  mm = ((mm % 12) + 12) % 12 + 1;
  return ymd(yy, mm, Math.min(d, diasMes(yy, mm)));
}
function avanzar(corte, n, freq) {
  freq = freq || "Cada quincena";
  if (freq === "Cada mes") return quincenaDe(sumarMeses(corte, n));
  if (freq.startsWith("Cada 2 meses")) return quincenaDe(sumarMeses(corte, 2 * n));
  let c = corte;
  for (let i = 0; i < n; i++) c = siguienteCorte(c);
  return c;
}
function fmtFecha(s) {
  if (!s) return "";
  const [y, m, d] = partes(s);
  return `${pad(d)}/${MESES[m]}/${y}`;
}
function fmtCorto(s) { const [y, m, d] = partes(s); return `${d} ${MESES[m]}`; }
function parseFecha(s) {
  s = String(s || "").trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/([a-zé]{3})[a-z]*\/(\d{4})$/);
  if (m && MESES.indexOf(m[2]) > 0) return ymd(+m[3], MESES.indexOf(m[2]), +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  throw new Error(`Fecha no válida: '${s}'`);
}
/** Quincenas desde el mes actual hasta 3 años adelante (+ las extra que se pidan). */
function listaQuincenas(...extra) {
  const [y, m] = partes(hoy());
  let c = ymd(y, m, 15);
  const fin = ymd(y + 3, 12, 31);
  const set = new Set();
  while (c <= fin) { set.add(c); c = siguienteCorte(c); }
  extra.filter(Boolean).forEach((e) => set.add(quincenaDe(e)));
  return [...set].sort();
}

// ---------------------------------------------------------------- dinero
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
function money(x) {
  x = x || 0;
  const neg = x < -0.004;
  return (neg ? "-" : "") + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneyCorto(v) {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 10000) return `${s}$${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(1)}k`;
  return `${s}$${Math.round(a)}`;
}
const LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const NUM = /\d[\d,]*(?:\.\d+)?|\.\d+/;
/** '=778.26 celular + 383.25 tablet' → [{sig, monto, etiqueta}] ; null si no trae texto. */
function desglose(s) {
  if (typeof s !== "string" || !LETRAS.test(s)) return null;
  s = s.trim().replace(/^=/, "").replace(/\$/g, "");
  const out = [];
  const re = /([+-]?)\s*([^+-]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const term = m[2].trim();
    if (!term) continue;
    const nums = term.match(new RegExp(NUM.source, "g")) || [];
    if (nums.length !== 1) throw new Error(`En '${term}' pon un solo monto. Ejemplo: =778.26 celular + 383.25 tablet`);
    const monto = parseFloat(nums[0].replace(/,/g, ""));
    const etiqueta = term.replace(NUM, "").replace(/^[\s:-]+|[\s:-]+$/g, "");
    out.push({ sig: m[1] === "-" ? -1 : 1, monto, etiqueta });
  }
  if (!out.length) throw new Error("Escribe al menos un monto.");
  return out;
}
function textoDesglose(s) {
  const p = desglose(s);
  if (!p) return "";
  return p.map((x, i) => {
    const pieza = `${x.etiqueta} ${money(x.monto)}`.trim();
    if (i === 0) return (x.sig < 0 ? "- " : "") + pieza;
    return (x.sig < 0 ? " - " : " + ") + pieza;
  }).join("");
}
function ponerDesglose(notas, desg) {
  const base = String(notas || "").replace(/\s*\|?\s*Desglose:.*$/, "").trim();
  return (base ? base + " | " : "") + "Desglose: " + desg;
}
/** Acepta 1500, $1,500.50, =778.26+383.25, (200+50)*2, '=778 celular + 383 tablet'. */
function parseMoney(s) {
  if (typeof s === "number") return s;
  const p = desglose(s);
  if (p) return r2(p.reduce((a, x) => a + x.sig * x.monto, 0));
  let t = String(s || "").replace(/\$/g, "").replace(/,/g, "").trim().replace(/^=/, "").trim();
  if (!t) return 0;
  if (!/^[\d+\-*/().\s]+$/.test(t)) throw new Error(`Monto no válido: '${s}'. Ejemplos: 1500  ó  =778.26+383.25`);
  let v;
  try { v = Function(`"use strict"; return (${t});`)(); } catch (e) { v = NaN; }
  if (!isFinite(v)) throw new Error(`Monto no válido: '${s}'. Ejemplos: 1500  ó  =778.26+383.25`);
  return r2(v);
}
function esOperacion(s) {
  s = String(s || "").trim().replace(/^=/, "");
  return /[+\-*/]/.test(s.slice(1)) || s.includes("(") || LETRAS.test(s);
}
function dividir(total, n) {
  if (!n) return [total, total];
  const per = r2(total / n);
  return [per, r2(total - per * (n - 1))];
}
function servicioDe(g) {
  const t = `${g.concepto || ""} ${g.a_quien || ""}`.toLowerCase();
  for (const [nom, claves] of Object.entries(SERVICIOS)) if (claves.some((c) => t.includes(c))) return nom;
  return null;
}
function frecuenciaSerie(serie) {
  const pagos = serie.filter((x) => x.pago).sort((a, b) => a.pago - b.pago);
  for (let i = 0; i + 1 < pagos.length; i++) {
    const a = pagos[i], b = pagos[i + 1];
    if (b.pago !== a.pago + 1) continue;
    if (b.fecha === siguienteCorte(a.fecha)) return "Cada quincena";
    if (b.fecha === avanzar(a.fecha, 1, "Cada mes")) return "Cada mes";
    if (b.fecha === avanzar(a.fecha, 1, "Cada 2 meses")) return "Cada 2 meses (bimestral)";
  }
  return pagos.length > 1 ? "Cada mes" : null;
}
function ahoraISO() { return new Date().toISOString(); }
function marcar(r, hecho) { if (hecho) r.marcado_en = ahoraISO(); else delete r.marcado_en; }

// ---------------------------------------------------------------- datos
const CLAVE = "misfinanzas_datos_v1";
function datosNuevos() {
  return { config: { tarjetas: [], servicios: {}, no_contar: [] }, gastos: [], ingresos: [], cargos: [] };
}

class Datos {
  constructor(obj, guardar) {
    this._guardar = guardar || (() => {});
    this.cargar(obj || datosNuevos());
  }
  cargar(obj) {
    this.d = obj;
    for (const k of ["gastos", "ingresos", "cargos"]) this.d[k] = this.d[k] || [];
    this.d.config = this.d.config || {};
    const c = this.d.config;
    c.tarjetas = c.tarjetas || [];
    c.servicios = c.servicios || {};
    c.no_contar = c.no_contar || [];
    this.normalizar();
    this._next = Math.max(0, ...["gastos", "ingresos", "cargos", "tarjeta"].flatMap((k) => (this.d[k] || []).map((r) => r.id || 0))) + 1;
  }
  get cfg() { return this.d.config; }
  yo() { return this.cfg.mi_nombre || "Yo"; }
  newId() { return this._next++; }
  normalizar() {
    for (const k of ["gastos", "ingresos", "cargos"]) {
      for (const r of this.d[k]) {
        r.fecha = quincenaDe(r.fecha);
        if (k === "ingresos" && r.tipo === "Reposición aire") r.tipo = "Extra eventual";
        if (k !== "ingresos" && !r.propietario && !r.auto_tarjeta) r.propietario = this.yo();
        if (typeof r.monto !== "number") r.monto = parseFloat(r.monto) || 0;
      }
    }
  }
  save() {
    this.syncTarjetas();
    this._guardar(this.d);
  }
  cambiarNombre(nuevo) {
    const viejo = this.yo();
    nuevo = String(nuevo || "").trim();
    if (!nuevo || nuevo === viejo) return;
    for (const k of ["gastos", "cargos"]) for (const r of this.d[k]) if ((r.propietario || viejo) === viejo) r.propietario = nuevo;
    this.cfg.no_contar = this.cfg.no_contar.map((x) => (x === viejo ? nuevo : x));
    this.cfg.mi_nombre = nuevo;
    this.save();
  }

  // --- quién paga qué
  noContar() { return new Set(this.cfg.no_contar || []); }
  propietarios() {
    const s = new Set([this.yo()]);
    this.d.gastos.forEach((g) => { if (!g.auto_tarjeta) s.add(g.propietario || this.yo()); });
    this.d.cargos.forEach((c) => s.add(c.propietario || this.yo()));
    return [...s].sort((a, b) => (a === this.yo() ? -1 : b === this.yo() ? 1 : a.localeCompare(b)));
  }
  modoServicio(g) {
    if (g.auto_tarjeta) return null;
    const sv = servicioDe(g);
    if (!sv) return null;
    return this.cfg.servicios[sv] || "No";
  }
  activo(g) {
    return !this.noContar().has(g.propietario || this.yo()) && this.modoServicio(g) !== "No";
  }
  otrosDe(g) {
    if (!g.auto_tarjeta) return [];
    return this.cargosDe(g.auto_tarjeta, g.fecha)
      .filter((c) => (c.propietario || this.yo()) !== this.yo())
      .map((c) => ({ concepto: c.concepto, monto: c.monto, quien: c.propietario, pago: c.pago, de: c.de }));
  }
  parteOtros(g) { return g.auto_tarjeta ? r2(Math.max(g.monto - this.miParte(g), 0)) : 0; }
  miParte(g) {
    if (g.auto_tarjeta) {
      const fuera = this.otrosDe(g).reduce((a, o) => a + o.monto, 0);
      return r2(Math.max(g.monto - fuera, 0));
    }
    if (this.modoServicio(g) === "Mitad") return r2(g.monto / 2);
    return r2(g.monto);
  }

  // --- tarjetas
  saldoActual(tarjeta, fecha) {
    const s = (this.cfg.saldos_tarjeta || {})[tarjeta];
    if (!s || s.fecha < quincenaDe(hoy())) return null;
    if (fecha !== undefined && s.fecha !== fecha) return null;
    return s;
  }
  cargosDe(tarjeta, fecha) { return this.d.cargos.filter((c) => c.tarjeta === tarjeta && c.fecha === fecha); }
  tarjetas() {
    const l = [...this.cfg.tarjetas];
    this.d.cargos.forEach((c) => { if (c.tarjeta && !l.includes(c.tarjeta)) l.push(c.tarjeta); });
    return l;
  }
  syncTarjetas() {
    const sumas = new Map(), cuenta = new Map();
    const key = (t, f) => t + "\u0001" + f;
    for (const c of this.d.cargos) {
      const k = key(c.tarjeta, quincenaDe(c.fecha));
      sumas.set(k, (sumas.get(k) || 0) + c.monto);
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    const registrados = new Map(sumas);
    for (const [t, sa] of Object.entries(this.cfg.saldos_tarjeta || {})) {
      if (this.saldoActual(t)) { sumas.set(key(t, sa.fecha), sa.monto); if (!cuenta.has(key(t, sa.fecha))) cuenta.set(key(t, sa.fecha), 0); }
    }
    const existentes = new Map();
    this.d.gastos.forEach((g) => { if (g.auto_tarjeta) existentes.set(key(g.auto_tarjeta, g.fecha), g); });
    for (const [k, total] of sumas) {
      const [t, f] = k.split("\u0001");
      let g = existentes.get(k);
      existentes.delete(k);
      if (!g) {
        g = { id: this.newId(), fecha: f, auto_tarjeta: t, pagado: false, propietario: this.yo(), pago: null, de: null };
        this.d.gastos.push(g);
      }
      let notas = `${cuenta.get(k)} cargo(s) · toca para ver el detalle`;
      if (this.saldoActual(t, f)) notas = `SALDO ACTUAL capturado · cargos registrados: ${money(registrados.get(k) || 0)}`;
      Object.assign(g, { concepto: `Pago ${t}`, a_quien: t, monto: r2(total), notas, propietario: this.yo() });
    }
    if (existentes.size) {
      const quitar = new Set([...existentes.values()].map((g) => g.id));
      this.d.gastos = this.d.gastos.filter((g) => !quitar.has(g.id));
    }
  }

  // --- vista
  mostrarDesde() {
    const f = this.cfg.mostrar_desde;
    return f ? [f, true] : [quincenaDe(hoy()), false];
  }
  ocultoPorFecha(fecha, hecho) {
    const [corte, aMano] = this.mostrarDesde();
    if (fecha >= corte) return false;
    return aMano || hecho;
  }

  // --- cálculos
  deudas() {
    const grupos = new Map();
    const agregar = (k, aQuien, pendiente, monto, fecha, de) => {
      let x = grupos.get(k);
      if (!x) { x = { concepto: k, faltan: 0, pendiente: 0, ultimo: null, de: 0, a_quien: aQuien }; grupos.set(k, x); }
      if (pendiente) { x.faltan++; x.pendiente += monto; }
      x.ultimo = !x.ultimo || fecha > x.ultimo ? fecha : x.ultimo;
      x.de = Math.max(x.de, +de || 0);
    };
    for (const g of this.d.gastos) {
      if (!g.de || !this.activo(g)) continue;
      agregar(g.concepto.trim(), g.a_quien || "", !g.pagado, g.monto, g.fecha, g.de);
    }
    const pagadoAuto = new Map();
    this.d.gastos.forEach((g) => { if (g.auto_tarjeta) pagadoAuto.set(g.auto_tarjeta + "|" + g.fecha, !!g.pagado); });
    const nc = this.noContar();
    for (const c of this.d.cargos) {
      if (!c.de || nc.has(c.propietario || this.yo())) continue;
      agregar(`${c.concepto.trim()} (💳 ${c.tarjeta})`, c.tarjeta, !pagadoAuto.get(c.tarjeta + "|" + c.fecha), c.monto, c.fecha, c.de);
    }
    const res = [...grupos.values()].map((x) => ({ ...x, avance: x.de ? 1 - x.faltan / x.de : 0 }));
    res.sort((a, b) => (a.faltan === 0) - (b.faltan === 0) || b.pendiente - a.pendiente);
    return res;
  }
  tengoActual() {
    const base = +this.cfg.tengo || 0;
    const ts = this.cfg.tengo_ts || "";
    if (!ts) return { base, recibido: 0, pagado: 0, ahora: base };
    const rec = this.d.ingresos.filter((i) => i.recibido && (i.marcado_en || "") > ts).reduce((a, i) => a + i.monto, 0);
    const pag = this.d.gastos.filter((g) => g.pagado && this.activo(g) && (g.marcado_en || "") > ts).reduce((a, g) => a + this.miParte(g), 0);
    return { base, recibido: rec, pagado: pag, ahora: base + rec - pag };
  }
  /** Saldo por quincena desde hoy. extra = [[fecha, monto]] gastos de prueba. */
  proyeccion(extra) {
    const actual = quincenaDe(hoy());
    const cortes = new Map();
    const add = (f, i, v) => { const c = quincenaDe(f) < actual ? actual : quincenaDe(f); const x = cortes.get(c) || [0, 0]; x[i] += v; cortes.set(c, x); };
    this.d.ingresos.forEach((i) => { if (!i.recibido) add(i.fecha, 0, i.monto); });
    this.d.gastos.forEach((g) => { if (!g.pagado && this.activo(g)) add(g.fecha, 1, this.miParte(g)); });
    (extra || []).forEach(([f, m]) => add(f, 1, m));
    let saldo = this.tengoActual().ahora;
    const ultimo = cortes.size ? [...cortes.keys()].sort().pop() : actual;
    const out = [];
    for (let c = actual; c <= ultimo; c = siguienteCorte(c)) {
      const [ing, gas] = cortes.get(c) || [0, 0];
      const ini = saldo;
      saldo = saldo + ing - gas;
      out.push({ corte: c, inicio: ini, ingresos: ing, gastos: gas, saldo });
    }
    return out;
  }
  parteOtrosPendiente() {
    const out = {};
    this.d.gastos.forEach((g) => {
      if (g.auto_tarjeta && !g.pagado) this.otrosDe(g).forEach((o) => { out[o.quien] = (out[o.quien] || 0) + o.monto; });
    });
    return out;
  }
}

if (typeof module !== "undefined") {
  module.exports = { MESES, MESES_LARGO, SERVICIOS, ICONO_SERVICIO, TIPOS_INGRESO, FRECUENCIAS, hoy, eom, quincenaDe,
    siguienteCorte, sumarMeses, avanzar, fmtFecha, fmtCorto, parseFecha, listaQuincenas, r2, money, moneyCorto, desglose,
    textoDesglose, ponerDesglose, parseMoney, esOperacion, dividir, servicioDe, frecuenciaSerie, marcar, datosNuevos,
    Datos, CLAVE, _setHoy: (s) => { _hoyFijo = s; } };
}
