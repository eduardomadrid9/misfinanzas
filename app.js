/* Mis Finanzas — pantallas */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------------ guardado (en esta tablet)
function cargarLocal() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } }
function guardarLocal(d) {
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) { toast("No se pudo guardar en la tablet", true); }
}
let D = new Datos(cargarLocal(), guardarLocal);
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* nada */ }

const S = {
  vista: "resumen",
  gastos: { q: "Todas", buscar: "", filtros: {}, sel: new Set() },
  cargos: { q: "Todas", buscar: "", filtros: {}, sel: new Set() },
  ingSel: null,
  tarjeta: null,
  sub: "comprar",
  alc: { que: "", precio: "", entre: "1", forma: "De contado", n: "12", freq: "Cada mes", cuando: "", colchon: "0" },
  max: { cuando: "", colchon: "0", entre: "1", freq: "Cada mes", n: "" },
  alcRes: null, maxRes: null,
};

// ------------------------------------------------------------------ utilidades de pantalla
let _toastT;
function toast(msg, malo) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast on" + (malo ? " malo" : "");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => (t.className = "toast"), 2600);
}
function abrirModal(html, ancho) {
  const root = $("#modal-root");
  const f = document.createElement("div");
  f.className = "fondo-modal";
  f.innerHTML = `<div class="modal ${ancho ? "ancho" : ""}">${html}</div>`;
  f.addEventListener("click", (e) => { if (e.target === f) cerrarModal(f); });
  root.appendChild(f);
  return f.firstElementChild;
}
function cerrarModal(f) {
  f = f || $("#modal-root").lastElementChild;
  if (f) f.remove();
}
function confirmar(texto, si = "Sí", peligro = false) {
  return new Promise((res) => {
    const m = abrirModal(`<h2>¿Seguro?</h2><p style="font-weight:700">${texto}</p>
      <div class="botones"><button class="btn" data-r="0">Cancelar</button>
      <button class="btn ${peligro ? "rojo" : "verde"}" data-r="1">${esc(si)}</button></div>`);
    $$("[data-r]", m).forEach((b) => b.addEventListener("click", () => { cerrarModal(); res(b.dataset.r === "1"); }));
  });
}
function avisar(titulo, texto) {
  const m = abrirModal(`<h2>${titulo}</h2><div style="font-weight:700;white-space:pre-line">${texto}</div>
    <div class="botones"><button class="btn verde" data-act="cerrar">Entendido</button></div>`);
  return m;
}
const opcionesQuincena = (sel, ...extra) => listaQuincenas(sel, ...extra)
  .map((q) => `<option value="${q}" ${q === sel ? "selected" : ""}>${fmtFecha(q)}</option>`).join("");
const opciones = (lista, sel) => lista.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
const datalist = (id, valores) => `<datalist id="${id}">${[...new Set(valores.filter(Boolean))].sort().map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
function toggleHTML(name, texto, on, extra = "") {
  return `<label class="toggle ${extra}"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="sw"></span><span>${texto}</span></label>`;
}
function moneyInput(name, valor, attrs = "") {
  return `<div class="fila" style="flex-wrap:nowrap"><input name="${name}" data-money inputmode="decimal" autocomplete="off" value="${esc(valor)}" ${attrs}>
    <span class="prev mprev" style="white-space:nowrap"></span></div>`;
}
/** Muestra "= $x" mientras escribes una operación; al salir del campo deja el total (y el desglose en Notas). */
document.addEventListener("input", (e) => {
  const i = e.target;
  if (i.matches("[data-money]")) {
    const p = i.parentElement.querySelector(".mprev");
    if (!p) return;
    if (esOperacion(i.value)) {
      try { p.textContent = "= " + money(parseMoney(i.value)); p.classList.remove("malo"); }
      catch (err) { p.textContent = "revisa"; p.classList.add("malo"); }
    } else p.textContent = "";
  }
  const h = i.closest("[data-in]");
  if (h && IN[h.dataset.in]) IN[h.dataset.in](h, e);
});
document.addEventListener("focusout", (e) => { if (e.target.matches("[data-money]")) resolverMonto(e.target); });
function resolverMonto(i) {
  if (!esOperacion(i.value)) return;
  let total, desg;
  try { total = parseMoney(i.value); desg = textoDesglose(i.value); } catch (err) { return; }
  i.value = total.toFixed(2);
  const p = i.parentElement.querySelector(".mprev");
  if (p) p.textContent = "";
  const form = i.closest("form, .modal");
  const notas = form && form.querySelector("[name=notas]");
  if (desg && notas) notas.value = ponerDesglose(notas.value, desg);
  i.dispatchEvent(new Event("input", { bubbles: true }));
}
function leerMonto(v) { return parseMoney(v); }

// ------------------------------------------------------------------ gráfica (SVG)
function pasoBonito(rango) {
  const crudo = rango > 0 ? rango / 4 : 1;
  const mag = Math.pow(10, Math.floor(Math.log10(crudo)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= crudo) return m * mag;
  return 10 * mag;
}
function grafica(puntos, o = {}) {
  const W = 1000, H = o.alto || 260, izq = 62, der = 18, arr = 30, aba = 30;
  if (puntos.length < 2) return `<div class="vacio"><div class="e">📈</div>Aquí verás cómo va tu saldo cuando captures ingresos y gastos.</div>`;
  const comp = o.comparar || [];
  const vals = puntos.map((p) => p.v).concat(comp.map((p) => p.v), [0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const paso = pasoBonito(hi - lo);
  lo = Math.floor(lo / paso) * paso; hi = Math.ceil(hi / paso) * paso; if (hi === lo) hi = lo + paso;
  const n = puntos.length, an = W - izq - der, al = H - arr - aba;
  const X = (i) => izq + (n > 1 ? (an * i) / (n - 1) : an / 2);
  const Y = (v) => arr + (al * (hi - v)) / (hi - lo);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,Segoe UI,Roboto,sans-serif">`;
  for (let v = lo; v <= hi + 1e-6; v += paso) {
    s += `<line x1="${izq}" x2="${W - der}" y1="${Y(v)}" y2="${Y(v)}" stroke="#F0F0F0" stroke-width="2"/>`;
    s += `<text x="${izq - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" font-weight="700" fill="#AFAFAF">${moneyCorto(v)}</text>`;
  }
  if (lo < 0 && hi > 0) s += `<line x1="${izq}" x2="${W - der}" y1="${Y(0)}" y2="${Y(0)}" stroke="#FF4B4B" stroke-dasharray="6 5" stroke-width="2"/>`;
  const pts = puntos.map((p, i) => [X(i), Y(p.v)]);
  const base = Y(Math.max(lo, 0) > 0 ? lo : 0);
  if (n > 1) {
    s += `<path d="M${pts[0][0]},${base} ${pts.map((p) => `L${p[0]},${p[1]}`).join(" ")} L${pts[n - 1][0]},${base} Z" fill="#E5F8D4"/>`;
  }
  if (comp.length) {
    const idx = new Map(puntos.map((p, i) => [p.f, i]));
    const cp = comp.filter((p) => idx.has(p.f)).map((p) => [X(idx.get(p.f)), Y(p.v)]);
    if (cp.length > 1) s += `<polyline points="${cp.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#AFAFAF" stroke-width="3" stroke-dasharray="8 6"/>`;
  }
  if (n > 1) s += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#58CC02" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${puntos[i].v < 0 ? "#FF4B4B" : "#58A700"}"/>`; });
  let ult = -999;
  puntos.forEach((p, i) => {
    if (+p.f.slice(8) <= 15 && X(i) - ult >= 56) {
      s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="#AFAFAF">${MESES[+p.f.slice(5, 7)]} ${p.f.slice(2, 4)}</text>`;
      ult = X(i);
    }
  });
  if (o.marca) {
    const i = puntos.findIndex((p) => p.f >= o.marca[0]);
    if (i >= 0) s += `<line x1="${X(i)}" x2="${X(i)}" y1="${arr}" y2="${H - aba}" stroke="#FF9600" stroke-width="2.5" stroke-dasharray="6 5"/>
      <text x="${X(i) + 6}" y="${arr + 12}" font-size="13" font-weight="900" fill="#FF9600">${esc(o.marca[1])}</text>`;
  }
  let cands = puntos.map((p, i) => i).filter((i) => !o.minDesde || puntos[i].f >= o.minDesde);
  if (!cands.length) cands = puntos.map((p, i) => i);
  const iMin = cands.reduce((a, i) => (puntos[i].v < puntos[a].v ? i : a), cands[0]);
  const [mx, my] = pts[iMin];
  const etq = `${o.minDesde ? "Más bajo después de comprar" : "Más bajo"}: ${money(puntos[iMin].v)} (${fmtFecha(puntos[iMin].f)})`;
  const tx = Math.min(Math.max(mx, izq + 150), W - der - 150), ty = my < H - aba - 34 ? my + 26 : my - 18;
  s += `<circle cx="${mx}" cy="${my}" r="9" fill="none" stroke="#FF4B4B" stroke-width="3"/>`;
  s += `<rect x="${tx - etq.length * 3.6 - 8}" y="${ty - 15}" width="${etq.length * 7.2 + 16}" height="22" rx="8" fill="#fff" stroke="#FFB2B2" stroke-width="2"/>`;
  s += `<text x="${tx}" y="${ty + 1}" text-anchor="middle" font-size="13" font-weight="900" fill="#FF4B4B">${esc(etq)}</text>`;
  const [lx, ly] = pts[n - 1];
  s += `<text x="${lx - 6}" y="${ly - 12}" text-anchor="end" font-size="13" font-weight="900" fill="#4B4B4B">${money(puntos[n - 1].v)}</text>`;
  if (o.etiquetas) {
    s += `<line x1="${izq}" x2="${izq + 26}" y1="12" y2="12" stroke="#58CC02" stroke-width="5" stroke-linecap="round"/>
      <text x="${izq + 34}" y="17" font-size="13" font-weight="900" fill="#4B4B4B">${o.etiquetas[0]}</text>
      <line x1="${izq + 150}" x2="${izq + 176}" y1="12" y2="12" stroke="#AFAFAF" stroke-width="3" stroke-dasharray="8 6"/>
      <text x="${izq + 184}" y="17" font-size="13" font-weight="900" fill="#777">${o.etiquetas[1]}</text>`;
  }
  // zonas para tocar / pasar el dedo
  const w = n > 1 ? an / (n - 1) : an;
  pts.forEach((p, i) => {
    s += `<rect class="hit" x="${p[0] - w / 2}" y="${arr}" width="${w}" height="${al}" fill="transparent"
      data-tip="${fmtFecha(puntos[i].f)}: ${money(puntos[i].v)}${comp.length ? "" : ""}"/>`;
  });
  return `<div class="graf">${s}</svg></div>`;
}
function mostrarTip(e) {
  const t = $("#tip");
  const h = e.target.closest && e.target.closest(".hit");
  if (!h) { t.style.opacity = 0; return; }
  t.textContent = h.dataset.tip;
  t.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + "px";
  t.style.top = e.clientY - 40 + "px";
  t.style.opacity = 1;
}
document.addEventListener("pointermove", mostrarTip);
document.addEventListener("pointerdown", mostrarTip);

// ------------------------------------------------------------------ navegación / dibujo
function render() {
  $$(".nav-item").forEach((b) => b.classList.toggle("activo", b.dataset.v === S.vista));
  $("#nav-user").textContent = "👤 " + D.yo();
  const y = $("#main").scrollTop;
  $("#main").innerHTML = VISTAS[S.vista]();
  $("#main").scrollTop = y;
}
function guardar(msg) { D.save(); render(); if (msg) toast(msg); }

// ------------------------------------------------------------------ RESUMEN
function vResumen() {
  const t = D.tengoActual(), qs = D.proyeccion(), actual = quincenaDe(hoy()), c = D.cfg;
  const q0 = qs[0];
  const vacio = !D.d.ingresos.length && !D.d.gastos.length;
  let info;
  if (c.tengo_ts) {
    const d = new Date(c.tengo_ts);
    info = `Lo capturaste el ${d.toLocaleDateString("es-MX")} a las ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }).replace(/\.$/, "")}.`;
    info += t.recibido || t.pagado ? ` Desde entonces: +${money(t.recibido)} recibido, −${money(t.pagado)} pagado → ahora tienes ${money(t.ahora)}.`
      : " Al marcar algo como pagado o recibido, se ajusta solo.";
  } else info = "Escribe lo que tienes en tu cuenta y en efectivo, y dale Guardar. De ahí parte todo el cálculo.";
  const stat = (t1, v, col, signo = true) => `<div class="stat" style="border-top-color:${col}"><div class="t" style="color:${col}">${t1}</div>
    <div class="v ${signo && v < -0.004 ? "malo" : ""}">${money(v)}</div></div>`;
  const otros = Object.values(D.parteOtrosPendiente()).reduce((a, b) => a + b, 0);
  const deudas = D.deudas();
  // rango de la gráfica
  const hasta = c.grafica_hasta; let desde = c.grafica_desde; if (desde && desde < actual) desde = null;
  let vista = qs.filter((q) => (!hasta || q.corte <= hasta) && (!desde || q.corte >= desde));
  if (!vista.length) vista = qs;
  const ultimoResp = c.ultimo_respaldo ? (Date.now() - new Date(c.ultimo_respaldo)) / 864e5 : 999;
  const banner = !vacio && ultimoResp > 30 ? `<div class="card naranja banner"><span style="font-size:30px">📤</span>
     <div class="esp"><b>Haz un respaldo de tus datos</b><div class="muted">${c.ultimo_respaldo ? "Hace más de un mes que no lo haces." : "Todavía no has hecho ninguno."} Tus datos solo viven en esta tablet.</div></div>
     <button class="btn verde chico" data-act="exportar">Respaldar</button></div>` : "";
  const bienvenida = vacio ? `<div class="card verde"><h2>👋 ¡Bienvenida! Así empiezas:</h2>
     <div class="lineas"><div>1️⃣ En <b>💰 Ingresos</b>, dale <b>💼 Sueldo por rango</b> y pon cuánto ganas por quincena.</div>
     <div>2️⃣ En <b>🧾 Gastos</b>, agrega lo que pagas (renta, carro, préstamos a meses…).</div>
     <div>3️⃣ Si tienes tarjetas, captura sus compras en <b>💳 Tarjetas</b>.</div>
     <div>4️⃣ Aquí arriba pon <b>cuánto dinero tienes hoy</b>.</div></div></div>` : "";
  return `<h1>Hola, ${esc(D.yo())} 👋</h1><p class="sub">Así van tus cuentas · quincena del ${fmtFecha(actual)}</p>
  ${bienvenida}${banner}
  <div class="card azul"><div class="fila"><div class="big">💵 ¿Cuánto dinero tengo hoy?</div>
    <div style="width:200px" data-in="nada">${moneyInput("tengo", c.tengo_ts ? (+c.tengo).toFixed(2) : "", 'id="tengo" placeholder="0.00"')}</div>
    <button class="btn verde" data-act="guardarTengo">Guardar</button></div>
    <div class="muted" style="margin-top:8px">${esc(info)}</div></div>
  <div class="stats">
    ${stat("💵 Tengo ahora", t.ahora, "#1CB0F6")}
    ${stat("📥 Me falta recibir", q0 ? q0.ingresos : 0, "#58CC02", false)}
    ${stat("📤 Me falta pagar", q0 ? q0.gastos : 0, "#FF4B4B", false)}
    ${stat("🎯 Me queda esta qna.", q0 ? q0.saldo : t.ahora, "#FF9600")}
    ${stat("📉 Saldo más bajo", qs.length ? Math.min(...qs.map((q) => q.saldo)) : t.ahora, "#CE82FF")}
    ${stat("🏁 Saldo al final", qs.length ? qs[qs.length - 1].saldo : t.ahora, "#58CC02")}
    ${stat("💳 Deudas a meses", deudas.reduce((a, x) => a + x.pendiente, 0), "#FF4B4B", false)}
    ${stat("👥 Parte otros", otros, "#1CB0F6", false)}
  </div>
  <div class="card"><div class="fila" style="margin-bottom:8px"><h2 style="margin:0">📈 Mi saldo por quincena</h2><span class="esp"></span>
    <span class="muted">De</span><select style="width:150px" data-ch="rangoDesde"><option value="">Hoy</option>${qs.map((q) => `<option value="${q.corte}" ${q.corte === desde ? "selected" : ""}>${fmtFecha(q.corte)}</option>`).join("")}</select>
    <span class="muted">hasta</span><select style="width:150px" data-ch="rangoHasta"><option value="">Todo</option>${qs.map((q) => `<option value="${q.corte}" ${q.corte === hasta ? "selected" : ""}>${fmtFecha(q.corte)}</option>`).join("")}</select>
    ${[[3, "3 meses"], [6, "6 meses"], [12, "1 año"], [0, "Todo"]].map(([m, t1]) => `<button class="chip sm" data-act="rangoRapido" data-m="${m}">${t1}</button>`).join("")}
  </div>${grafica(vista.map((q) => ({ f: q.corte, v: q.saldo })))}
  <div class="muted">Mostrando ${vista.length} de ${qs.length} quincenas · toca la gráfica para ver cada quincena</div></div>
  <div class="grid g-3-2">
    <div class="card"><h2>🗓️ Quincena por quincena</h2><div class="muted" style="margin-bottom:8px">Lo que tengo + lo que me falta recibir − lo que me falta pagar. Toca una para ver sus gastos.</div>
      <div class="tabla-wrap"><table><thead><tr><th>Quincena</th><th class="num">Empiezo con</th><th class="num">+ Ingresos</th><th class="num">− Gastos</th><th class="num">= Saldo</th><th>Estado</th></tr></thead><tbody>
      ${vista.map((q) => `<tr class="click ${q.saldo < 0 ? "rojo" : ""}" data-act="irQuincena" data-q="${q.corte}"><td><b>${fmtFecha(q.corte)}</b>${q.corte === actual ? " ◀ hoy" : ""}</td>
        <td class="num">${money(q.inicio)}</td><td class="num ok">${money(q.ingresos)}</td><td class="num malo">${money(q.gastos)}</td>
        <td class="num"><b>${money(q.saldo)}</b></td><td><span class="estado ${q.saldo < 0 ? "rojo" : "si"}">${q.saldo < 0 ? "⚠ No alcanza" : "✔ Alcanza"}</span></td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Sin quincenas todavía</td></tr>`}
      </tbody></table></div></div>
    <div class="card"><h2>💳 Deudas a meses</h2><div class="muted" style="margin-bottom:8px">Se arma sola con lo que tiene "Pago # de #".</div>
      ${deudas.map((x) => `<div class="lista-item"><div class="esp"><div style="font-weight:900">${esc(x.concepto)}</div>
        <div class="muted">${x.faltan ? `Faltan ${x.faltan} · ${money(x.pendiente)} · último ${fmtFecha(x.ultimo)}` : "✔ Liquidada"}</div>
        <div class="barra" style="margin-top:6px"><div style="width:${Math.round(x.avance * 100)}%"></div></div></div>
        <div style="font-weight:900;color:var(--verde-osc)">${Math.round(x.avance * 100)}%</div></div>`).join("") || `<div class="vacio"><div class="e">🎉</div>No tienes deudas a meses</div>`}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ INGRESOS
const GRUPO = { "Nómina": "nomina", "Extra fijo": "fijo", "Extra eventual": "extras", "Otro": "extras" };
const grupoDe = (i) => GRUPO[i.tipo] || "extras";
const deCorte = (c, grupos) => D.d.ingresos.filter((i) => i.fecha === c && (!grupos || grupos.includes(grupoDe(i))));
function ponerIngreso(c, tipo, monto, recibido) {
  let items = deCorte(c, [GRUPO[tipo]]).filter((i) => i.tipo === tipo);
  if (monto <= 0) { const ids = new Set(items.map((i) => i.id)); D.d.ingresos = D.d.ingresos.filter((i) => !ids.has(i.id)); return; }
  let it = items[0];
  items.slice(1).forEach((x) => (D.d.ingresos = D.d.ingresos.filter((i) => i !== x)));
  if (!it) { it = { id: D.newId(), fecha: c, concepto: tipo, tipo, recibido: false, monto: 0 }; D.d.ingresos.push(it); }
  it.monto = monto;
  if (!!it.recibido !== recibido) { it.recibido = recibido; marcar(it, recibido); }
}
function vIngresos() {
  const cortes = [...new Set(D.d.ingresos.map((i) => i.fecha))].sort()
    .filter((c) => !D.ocultoPorFecha(c, deCorte(c).every((i) => i.recibido)));
  const actual = quincenaDe(hoy());
  if (!S.ingSel || !cortes.includes(S.ingSel)) S.ingSel = cortes.includes(actual) ? actual : cortes[0] || actual;
  const tot = { nomina: 0, fijo: 0, extras: 0 };
  const filas = cortes.map((c) => {
    const v = { nomina: 0, fijo: 0, extras: 0 };
    const items = deCorte(c);
    items.forEach((i) => (v[grupoDe(i)] += i.monto));
    Object.keys(v).forEach((k) => (tot[k] += v[k]));
    const nrec = items.filter((i) => i.recibido).length;
    const est = items.length && nrec === items.length ? ["si", "✔ Sí"] : nrec ? ["parcial", "Parcial"] : ["no", "No"];
    const m = (x) => (x ? money(x) : "–");
    return `<tr class="click ${c === S.ingSel ? "sel" : ""} ${+c.slice(8) <= 15 ? "b0" : "b1"} ${est[0] === "si" ? "hecho" : ""}" data-act="ingSel" data-c="${c}">
      <td><b>${fmtFecha(c)}</b></td><td class="num">${m(v.nomina)}</td><td class="num">${m(v.fijo)}</td><td class="num">${m(v.extras)}</td>
      <td class="num"><b>${money(v.nomina + v.fijo + v.extras)}</b></td><td><span class="estado ${est[0]}">${est[1]}</span></td></tr>`;
  }).join("");
  const det = deCorte(S.ingSel).sort((a, b) => ["nomina", "fijo", "extras"].indexOf(grupoDe(a)) - ["nomina", "fijo", "extras"].indexOf(grupoDe(b)));
  const ext = D.d.ingresos.filter((i) => grupoDe(i) === "extras" && !D.ocultoPorFecha(i.fecha, !!i.recibido)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  const item = (i) => `<div class="lista-item"><div class="esp"><div style="font-weight:900">${esc(i.concepto)}</div>
      <div class="muted">${fmtFecha(i.fecha)} · ${esc(i.tipo)}</div></div><div style="font-weight:900">${money(i.monto)}</div>
      <button class="chip sm ${i.recibido ? "on" : ""}" data-act="ingToggle" data-id="${i.id}">${i.recibido ? "✔ Recibido" : "Por recibir"}</button>
      <button class="icon-btn" data-act="ingEditarItem" data-id="${i.id}">✏️</button></div>`;
  return `<h1>💰 Ingresos</h1><p class="sub">Tu sueldo por quincena y el dinero que te llega por fuera.</p>
  <div class="fila" style="margin-bottom:14px"><button class="btn verde" data-act="sueldoRango">💼 Sueldo por rango</button>
    <button class="btn" data-act="ingSiguiente">+ Siguiente quincena</button></div>
  <div class="grid g-3-2"><div>
    <div class="card"><div class="fila entre" style="margin-bottom:10px"><h2 style="margin:0">Por quincena</h2>
      <div class="fila"><button class="btn azul chico" data-act="ingRecibido">✔ Recibido</button><button class="btn chico" data-act="ingEditarQ">✏️ Editar</button>
      <button class="btn chico" data-act="ingBorrarQ">🗑 Borrar nómina</button></div></div>
      <div class="tabla-wrap"><table><thead><tr><th>Quincena</th><th class="num">Nómina</th><th class="num">Extra fijo</th><th class="num">Extras</th><th class="num">Total</th><th>Recibido</th></tr></thead>
      <tbody>${filas || `<tr><td colspan="6"><div class="vacio"><div class="e">💼</div>Pon tu sueldo con “Sueldo por rango”</div></td></tr>`}
      ${cortes.length ? `<tr class="total"><td>TOTAL</td><td class="num">${money(tot.nomina)}</td><td class="num">${money(tot.fijo)}</td><td class="num">${money(tot.extras)}</td><td class="num">${money(tot.nomina + tot.fijo + tot.extras)}</td><td></td></tr>` : ""}
      </tbody></table></div></div>
    <div class="card"><h2>🔎 Detalle de la quincena ${fmtFecha(S.ingSel)}</h2>
      ${det.map(item).join("") || `<div class="muted">Sin ingresos en esta quincena.</div>`}
      ${det.length ? `<div class="pie"><span>Total ${money(det.reduce((a, i) => a + i.monto, 0))}</span><span>Recibido ${money(det.filter((i) => i.recibido).reduce((a, i) => a + i.monto, 0))}</span></div>` : ""}</div>
  </div><div>
    <div class="card verde"><h2>+ Dinero por fuera</h2><form class="form" data-in="prevExtra" onsubmit="return false">
      <label class="campo">Quincena<select name="fecha">${opcionesQuincena(actual)}</select></label>
      <label class="campo">Monto${moneyInput("monto", "", 'placeholder="0.00"')}</label>
      <label class="campo full">Concepto<input name="concepto" list="dl-extras" placeholder="Ej. Venta, aguinaldo…">${datalist("dl-extras", D.d.ingresos.filter((i) => grupoDe(i) === "extras").map((i) => i.concepto.replace(/ \d+\/\d+$/, "")))}</label>
      <div class="full">${toggleHTML("recibido", "Ya lo recibí", false)}</div>
      <div class="full dentro off" id="rep-extra">${toggleHTML("repite", "🔁 Se repite", false)}
        <div class="fila"><input name="rep_n" type="number" min="2" value="3" style="width:90px"> <span class="muted">veces,</span>
        <select name="rep_fq" style="width:auto">${opciones(FRECUENCIAS, "Cada mes")}</select></div><div class="prev" id="prev-extra"></div></div>
      <div class="full"><button class="btn verde" data-act="agregarExtra" style="width:100%">Agregar</button></div></form></div>
    <div class="card"><h2>✨ Extras eventuales</h2>${ext.map(item).join("") || `<div class="muted">Aún no tienes extras.</div>`}
      ${ext.length ? `<div class="pie"><span>Total extras</span><span>${money(ext.reduce((a, i) => a + i.monto, 0))}</span></div>` : ""}</div>
  </div></div>`;
}

// ------------------------------------------------------------------ TABLAS (Gastos y cargos de tarjeta)
const TAB = {
  gastos: {
    key: "gastos", rows: () => D.d.gastos, filtro: () => true, toggle: "pagado",
    cols: [["fecha", "Fecha"], ["concepto", "Concepto", 1], ["propietario", "Propietario", 1], ["a_quien", "A quién", 1], ["pago", "Pago"],
      ["monto", "Monto", 0, 1], ["otros", "Parte otros 🔍", 0, 1], ["mi", "Mi parte", 0, 1], ["pagado", "Pagado"], ["notas", "Notas"]],
  },
  cargos: {
    key: "cargos", rows: () => D.d.cargos, filtro: (r) => r.tarjeta === S.tarjeta, toggle: null, alternar: true,
    cols: [["fecha", "Se paga en"], ["concepto", "Concepto", 1], ["propietario", "Propietario", 1], ["pago", "Pago"], ["monto", "Monto", 0, 1], ["notas", "Notas"]],
  },
};
const valorCol = (r, c) => (c === "propietario" ? r.propietario || D.yo() : String(r[c] ?? "").trim() || "(vacío)");
function esHecho(T, x) {
  if (T.key === "cargos") return D.d.gastos.some((g) => g.auto_tarjeta === x.tarjeta && g.fecha === x.fecha && g.pagado);
  return !!x[T.toggle];
}
function visibles(T) {
  const st = S[T.key];
  const txt = st.buscar.trim().toLowerCase();
  return T.rows().filter((r) => T.filtro(r))
    .filter((r) => st.q === "Todas" || r.fecha === st.q)
    .filter((r) => st.q !== "Todas" || !D.ocultoPorFecha(r.fecha, esHecho(T, r)))
    .filter((r) => T.key !== "gastos" || D.activo(r))
    .filter((r) => Object.entries(st.filtros).every(([c, vals]) => vals.includes(valorCol(r, c))))
    .filter((r) => !txt || JSON.stringify(Object.values(r)).toLowerCase().includes(txt))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
}
function seleccion(T) { const st = S[T.key]; return T.rows().filter((r) => st.sel.has(r.id)); }
function celda(T, r, c) {
  const pago = r.de ? `${r.pago}/${r.de}` : "";
  switch (c) {
    case "fecha": return `<td>${fmtFecha(r.fecha)}</td>`;
    case "concepto": return `<td class="wrap"><b>${r.auto_tarjeta ? "💳 " : ""}${esc(r.concepto)}</b></td>`;
    case "propietario": return `<td>${esc(r.propietario || D.yo())}</td>`;
    case "a_quien": return `<td>${esc(r.a_quien || "")}</td>`;
    case "pago": return `<td>${pago}</td>`;
    case "monto": return `<td class="num"><b>${money(r.monto)}</b></td>`;
    case "otros": { const po = D.parteOtros(r); return `<td class="num">${po ? `<span class="link" data-act="parteOtros" data-id="${r.id}">${money(po)}</span>` : ""}</td>`; }
    case "mi": return `<td class="num">${money(D.miParte(r))}${D.modoServicio(r) === "Mitad" ? " (½)" : ""}</td>`;
    case "pagado": return `<td><button class="chip sm ${r.pagado ? "on" : ""}" data-act="pagarUno" data-t="${T.key}" data-id="${r.id}">${r.pagado ? "✔ Pagado" : "Pendiente"}</button></td>`;
    case "notas": {
      let n = r.notas || "";
      if (r.auto_tarjeta && D.otrosDe(r).length) n = "Parte otros: " + D.otrosDe(r).map((o) => `${o.concepto} ${money(o.monto)}`).join(" + ") + " · " + n;
      return `<td class="wrap muted">${esc(n)}</td>`;
    }
  }
  return "<td></td>";
}
function tabla(T) {
  const st = S[T.key], vis = visibles(T), h = hoy();
  let banda = 0, ant = null;
  const filas = vis.map((r) => {
    let cls;
    if (T.alternar) { if (ant && r.fecha !== ant) banda = 1 - banda; ant = r.fecha; cls = banda ? "br" : "bv"; }
    else cls = +r.fecha.slice(8) <= 15 ? "b0" : "b1";
    if (st.sel.has(r.id)) cls += " sel";
    else if (esHecho(T, r)) cls += " hecho";
    else if (r.fecha < h) cls += " vencido";
    return `<tr class="click ${cls}" data-act="tSel" data-t="${T.key}" data-id="${r.id}"><td><span class="cb">✓</span></td>
      ${T.cols.map(([c]) => celda(T, r, c)).join("")}<td><button class="icon-btn" data-act="tEditar" data-t="${T.key}" data-id="${r.id}">✏️</button></td></tr>`;
  }).join("");
  const head = T.cols.map(([c, t, f, num]) => `<th class="${f ? "filtro" : ""} ${st.filtros[c] ? "activo" : ""} ${num ? "num" : ""}" ${f ? `data-act="tFiltro" data-t="${T.key}" data-c="${c}"` : ""}>${t}${f ? (st.filtros[c] ? " 🔽" : " ▾") : ""}</th>`).join("");
  const sel = seleccion(T);
  let pie;
  if (T.key === "gastos") {
    const tot = vis.reduce((a, r) => a + D.miParte(r), 0), pag = vis.filter((r) => r.pagado).reduce((a, r) => a + D.miParte(r), 0);
    pie = `<span>${vis.length} gastos · Mi parte ${money(tot)} · Pagado ${money(pag)} · Por pagar ${money(tot - pag)}</span>`;
  } else pie = `<span>${vis.length} cargo(s) · Total ${money(vis.reduce((a, r) => a + r.monto, 0))}</span>`;
  if (sel.length > 1) pie += `<span style="color:var(--azul-osc)">${sel.length} seleccionados · suman ${money(sel.reduce((a, r) => a + r.monto, 0))}</span>`;
  const filtros = Object.keys(st.filtros).map((c) => T.cols.find((x) => x[0] === c)[1]).join(", ");
  const cortes = [...new Set(T.rows().filter(T.filtro).map((r) => r.fecha))].sort();
  return `<div class="fila" style="margin-bottom:10px">
      <select style="width:170px" data-ch="tQuincena" data-t="${T.key}"><option value="Todas">Todas las quincenas</option>${cortes.map((c) => `<option value="${c}" ${c === st.q ? "selected" : ""}>${fmtFecha(c)}</option>`).join("")}</select>
      <input style="width:200px" placeholder="🔍 Buscar…" value="${esc(st.buscar)}" data-in="tBuscar" data-t="${T.key}">
      <span class="esp"></span>
      <button class="btn verde chico" data-act="tNuevo" data-t="${T.key}">+ Nuevo</button>
      <button class="btn chico" data-act="tTodos" data-t="${T.key}">☑ Todos</button>
      ${T.toggle ? `<button class="btn azul chico" data-act="tPagado" data-t="${T.key}">✔ Pagado</button>` : ""}
      <button class="btn chico" data-act="tDuplicar" data-t="${T.key}">⧉ Duplicar</button>
      <button class="btn chico" data-act="tEliminar" data-t="${T.key}">🗑 Eliminar</button></div>
    ${filtros ? `<div class="muted" style="margin-bottom:8px">🔽 Filtrado por: ${esc(filtros)} · <span class="link" data-act="tQuitarFiltros" data-t="${T.key}">quitar filtros</span></div>` : ""}
    <div class="tabla-wrap"><table><thead><tr><th></th>${head}<th></th></tr></thead><tbody>
    ${filas || `<tr><td colspan="${T.cols.length + 2}"><div class="vacio"><div class="e">${T.key === "gastos" ? "🧾" : "💳"}</div>Nada por aquí. Toca “+ Nuevo”.</div></td></tr>`}
    </tbody></table></div><div class="pie">${pie}</div>`;
}

// ------------------------------------------------------------------ GASTOS
function vGastos() {
  const lista = D.propietarios(), nc = D.noContar(), serv = D.cfg.servicios || {};
  const [corte, aMano] = D.mostrarDesde();
  const conRecibos = Object.keys(SERVICIOS).filter((s) => D.d.gastos.some((g) => !g.auto_tarjeta && servicioDe(g) === s));
  const fuera = lista.filter((o) => nc.has(o)).concat(conRecibos.filter((s) => (serv[s] || "No") === "No"));
  const mitad = conRecibos.filter((s) => serv[s] === "Mitad");
  const sinPagar = aMano ? D.d.gastos.filter((g) => g.fecha < corte && !g.pagado && D.activo(g)).length : 0;
  return `<h1>🧾 Gastos</h1><p class="sub">Toca un renglón para seleccionarlo · ✏️ para editarlo · “Pendiente” para marcarlo pagado.</p>
  <div class="card azul"><div class="fila"><b>Tomar en cuenta gastos de:</b>
    ${lista.map((o) => `<button class="chip ${nc.has(o) ? "" : "on"}" data-act="toggleDueno" data-o="${esc(o)}">${nc.has(o) ? "○" : "✔"} ${esc(o)}</button>`).join("")}
    <span class="esp"></span><b>📅 Mostrar desde:</b>
    <select style="width:210px" data-ch="mostrarDesde"><option value="">Quincena actual (automático)</option>${listaQuincenas(aMano ? corte : null).map((q) => `<option value="${q}" ${aMano && q === corte ? "selected" : ""}>${fmtFecha(q)}</option>`).join("")}</select></div>
    <div class="muted" style="margin-top:6px">${fuera.length ? "No se suman: " + esc(fuera.join(", ")) : "Se suman todos"}${mitad.length ? " · A la mitad: " + mitad.join(", ") : ""}${sinPagar ? ` · ⚠ ${sinPagar} sin pagar antes del ${fmtFecha(corte)} (siguen contando)` : ""}</div>
    <div class="fila" style="margin-top:8px"><button class="btn chico" data-act="pasarTarjeta">💳 Pasar a tarjeta</button>
      <button class="btn chico" data-act="cambiarDueno">👤 Cambiar propietario</button></div></div>
  ${tabla(TAB.gastos)}`;
}

// ------------------------------------------------------------------ editor de gasto / cargo
function serieDe(T, r) {
  if (!r.de) return [r];
  return T.rows().filter((x) => x.concepto === r.concepto && x.de === r.de && x.tarjeta === r.tarjeta);
}
function siguientesDe(T, r) {
  if (!r.de || !r.pago) return [];
  return T.rows().filter((x) => x.id !== r.id && x.concepto === r.concepto && x.tarjeta === r.tarjeta && x.de === r.de && (x.pago || 0) > r.pago && !esHecho(T, x));
}
function abrirEditor(tkey, r, base) {
  const T = TAB[tkey], nuevo = !r;
  if (r && r.auto_tarjeta) return detalleTarjeta(r.auto_tarjeta, r.fecha);
  const v = r || Object.assign({ fecha: quincenaDe(hoy()), propietario: D.yo(), pagado: false }, base || {});
  let serie = null, sig = [];
  if (!nuevo) {
    sig = siguientesDe(T, r);
    const sr = serieDe(T, r);
    if (sr.length > 1 || r.de) {
      const pend = sr.filter((x) => !esHecho(T, x));
      serie = { total: r2(sr.reduce((a, x) => a + x.monto, 0)), n: sr.length, pendientes: pend.length,
        pagado: r2(sr.filter((x) => esHecho(T, x)).reduce((a, x) => a + x.monto, 0)), freq: frecuenciaSerie(sr) };
    }
  }
  const todos = T.rows();
  const m = abrirModal(`<h2>${nuevo ? "Nuevo" : "Editar"} ${T.key === "gastos" ? "gasto" : "cargo de " + esc(S.tarjeta)}</h2>
   <form class="form" id="ed" data-in="prevEd" onsubmit="return false">
    <label class="campo">${T.key === "gastos" ? "Quincena" : "Quincena en que se paga"}<select name="fecha">${opcionesQuincena(v.fecha)}</select></label>
    <label class="campo">Monto (de cada pago)${moneyInput("monto", v.monto != null ? (+v.monto).toFixed(2) : "", 'placeholder="0.00"')}</label>
    <label class="campo full">Concepto<input name="concepto" list="dl-c" value="${esc(v.concepto || "")}" placeholder="¿Qué es?">${datalist("dl-c", todos.map((x) => x.concepto))}</label>
    <label class="campo">Propietario<input name="propietario" list="dl-p" value="${esc(v.propietario || D.yo())}">${datalist("dl-p", D.propietarios())}</label>
    ${T.key === "gastos" ? `<label class="campo">A quién<input name="a_quien" list="dl-a" value="${esc(v.a_quien || "")}">${datalist("dl-a", todos.map((x) => x.a_quien))}</label>` : "<div></div>"}
    <label class="campo full">Notas<input name="notas" value="${esc(v.notas || "")}"></label>
    ${T.key === "gastos" ? `<div class="full">${toggleHTML("pagado", "Pagado", v.pagado)}</div>` : ""}
    <div class="full dentro ${v.de ? "" : "off"}" id="sec-meses"><div class="titulo">📆 Pagos a meses</div>${toggleHTML("meses", "Es a pagos / meses", !!v.de)}
      ${nuevo ? toggleHTML("empezado", "Ya lo empecé a pagar (no voy en el primero)", (v.pago || 1) > 1) : ""}
      <div class="fila"><span class="muted">Pago #</span><input name="pago" type="number" min="1" value="${v.pago || 1}" style="width:90px">
        <span class="muted">de</span><input name="de" type="number" min="1" value="${v.de || ""}" style="width:90px"><span class="muted">pagos en total</span></div>
      ${nuevo ? `<div class="fila">${toggleHTML("crear", "Crear también los pagos que siguen,", true)}<select name="freq" style="width:auto">${opciones(FRECUENCIAS, "Cada mes")}</select></div>
        ${toggleHTML("es_total", "El monto que puse es el TOTAL de la compra (dividirlo entre los pagos)", false)}` : ""}
      ${!nuevo && sig.length ? `${toggleHTML("ligar", `Aplicar también a los ${sig.length} pagos que siguen (los que no están pagados)`, false)}<div class="muted">Copia monto, concepto, a quién, propietario y notas.</div>` : ""}
      ${serie ? `<div class="card azul" style="margin:0"><div class="fila"><b>Total de la compra:</b><div style="width:180px">${moneyInput("total_compra", serie.total.toFixed(2))}</div>
         <span class="muted">(suma de los ${serie.n} pagos)</span></div><div class="prev" id="prev-total"></div></div>
         ${serie.freq ? `<div class="fila"><b>Frecuencia de los pagos:</b><select name="refreq" style="width:auto">${opciones(FRECUENCIAS, serie.freq)}</select></div><div class="prev" id="prev-freq"></div>` : ""}` : ""}
      <div class="prev" id="prev-meses"></div></div>
    <div class="full dentro off" id="sec-rep"><div class="titulo">🔁 Gasto fijo (se repite)</div>${toggleHTML("repite", "Repetir este gasto", false)}
      <div class="fila"><select name="rep_fq" style="width:auto">${opciones(FRECUENCIAS, "Cada mes")}</select><span class="muted">¿cuántas veces más?</span>
        <input name="rep_n" type="number" min="1" value="12" style="width:90px"></div><div class="prev" id="prev-rep"></div></div>
   </form>
   <div class="botones">${nuevo ? "" : `<button class="btn rojo" data-act="edBorrar" style="margin-right:auto">🗑 Borrar</button>`}
     <button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" data-act="edGuardar">Guardar</button></div>`, true);
  m._ctx = { T, r, nuevo, serie, sig };
  IN.prevEd(m.querySelector("#ed"));
}
function leerEditor(m) {
  const f = m.querySelector("#ed").elements, { nuevo, serie } = m._ctx;
  const out = {
    fecha: f.fecha.value, concepto: f.concepto.value.trim(), propietario: f.propietario.value.trim() || D.yo(),
    monto: leerMonto(f.monto.value), notas: f.notas.value.trim(),
  };
  if (f.a_quien) out.a_quien = f.a_quien.value.trim();
  if (f.pagado) out.pagado = f.pagado.checked;
  if (!out.concepto) throw new Error("Escribe el concepto.");
  const meses = f.meses.checked;
  const x = { crear: false, freq: "Cada mes", ultimo: null, ligar: false, nuevoTotal: null, refreq: null, repetir: null };
  if (meses) {
    const p = parseInt(f.pago.value || "0", 10), d = parseInt(f.de.value || "0", 10);
    if (!(d >= 1 && p >= 1 && p <= d)) throw new Error("El pago # debe ir de 1 al total de pagos.");
    out.pago = p; out.de = d;
    if (nuevo) {
      x.crear = f.crear.checked; x.freq = f.freq.value;
      if (f.es_total.checked) { const [per, ult] = dividir(out.monto, d); out.monto = per; x.ultimo = ult; }
    } else {
      x.ligar = f.ligar ? f.ligar.checked : false;
      if (serie && f.total_compra) {
        const t = leerMonto(f.total_compra.value);
        if (Math.abs(t - serie.total) > 0.004 && serie.pendientes) x.nuevoTotal = t;
      }
      if (f.refreq && serie && f.refreq.value !== serie.freq) x.refreq = f.refreq.value;
    }
  } else { out.pago = null; out.de = null; }
  if (f.repite.checked && !meses) {
    const n = parseInt(f.rep_n.value || "0", 10);
    if (n < 1) throw new Error("En 'Repetir' pon cuántas veces (1 o más).");
    x.repetir = [n, f.rep_fq.value];
  }
  return [out, x];
}
function repetirGasto(T, base, rep) {
  if (!rep) return 0;
  const [n, fq] = rep;
  let hechos = 0;
  for (let k = 1; k <= n; k++) {
    const f = avanzar(base.fecha, k, fq);
    if (T.rows().some((x) => x.fecha === f && x.concepto === base.concepto && x.tarjeta === base.tarjeta)) continue;
    const c = { ...base, id: D.newId(), fecha: f, pago: null, de: null };
    delete c.marcado_en;
    if (T.toggle) c[T.toggle] = false;
    T.rows().push(c);
    hechos++;
  }
  return hechos;
}
function guardarEditor(m) {
  const { T, r, nuevo } = m._ctx;
  let res, x;
  try { [res, x] = leerEditor(m); } catch (e) { return toast(e.message, true); }
  if (nuevo) {
    if (T.key === "cargos") res.tarjeta = S.tarjeta;
    res.id = D.newId();
    if (x.ultimo != null && res.pago === res.de) res.monto = x.ultimo;
    if (res.pagado) marcar(res, true);
    T.rows().push(res);
    if (x.crear && res.de && res.pago) {
      for (let k = 1; k <= res.de - res.pago; k++) {
        const c = { ...res, id: D.newId(), pago: res.pago + k, fecha: avanzar(res.fecha, k, x.freq) };
        delete c.marcado_en;
        if (T.toggle) c[T.toggle] = false;
        if (x.ultimo != null && c.pago === res.de) c.monto = x.ultimo;
        T.rows().push(c);
      }
    }
    repetirGasto(T, res, x.repetir);
  } else {
    const sig = siguientesDe(T, r);
    const antes = !!r.pagado;
    Object.assign(r, res);
    if (T.toggle && !!r.pagado !== antes) marcar(r, r.pagado);
    if (x.ligar) sig.forEach((s) => ["monto", "concepto", "a_quien", "propietario", "notas", "de"].forEach((k) => { if (k in res) s[k] = res[k]; }));
    if (x.repetir) toast(`Se crearon ${repetirGasto(T, r, x.repetir)} copia(s)`);
    if (x.refreq && r.pago) serieDe(T, r).forEach((s) => { if ((s.pago || 0) > r.pago) s.fecha = avanzar(r.fecha, s.pago - r.pago, x.refreq); });
    if (x.nuevoTotal != null) {
      const sr = serieDe(T, r);
      const pagado = sr.filter((s) => esHecho(T, s)).reduce((a, s) => a + s.monto, 0);
      const pend = sr.filter((s) => !esHecho(T, s)).sort((a, b) => (a.pago || 0) - (b.pago || 0));
      const [per, ult] = dividir(x.nuevoTotal - pagado, pend.length);
      pend.forEach((s, i) => (s.monto = i === pend.length - 1 ? ult : per));
    }
  }
  cerrarModal();
  guardar(nuevo ? "✔ Guardado" : "✔ Cambios guardados");
}

// ------------------------------------------------------------------ TARJETAS
function vTarjetas() {
  const lista = D.tarjetas();
  if (!lista.includes(S.tarjeta)) S.tarjeta = lista[0] || null;
  const t = S.tarjeta;
  const auto = D.d.gastos.filter((g) => g.auto_tarjeta === t).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pend = (tj) => D.d.gastos.filter((g) => g.auto_tarjeta === tj && !g.pagado).reduce((a, g) => a + g.monto, 0);
  const sa = t ? D.saldoActual(t) : null;
  const prox = (auto.find((g) => g.fecha >= quincenaDe(hoy()) && !g.pagado) || {}).fecha || quincenaDe(hoy());
  return `<h1>💳 Tarjetas de crédito</h1><p class="sub">Captura aquí las compras de cada tarjeta. En Gastos sale un solo pago por quincena con la suma.</p>
  <div class="fila" style="margin-bottom:14px">${lista.map((x) => `<button class="chip ${x === t ? "on" : ""}" data-act="selTarjeta" data-x="${esc(x)}">💳 ${esc(x)} · ${money(pend(x))}</button>`).join("")}
    <button class="btn verde chico" data-act="nuevaTarjeta">+ Tarjeta</button>
    ${t ? `<button class="btn chico" data-act="renTarjeta">Renombrar</button><button class="btn chico" data-act="borTarjeta">🗑 Borrar</button>` : ""}</div>
  ${!t ? `<div class="card"><div class="vacio"><div class="e">💳</div>Agrega tu primera tarjeta con “+ Tarjeta”.</div></div>` : `
  <div class="grid" style="grid-template-columns:minmax(260px,1fr) 3fr">
    <div>
      <div class="card azul"><h2>Saldo actual</h2><div class="muted" style="margin-bottom:8px">Si abonaste y bajó lo que debes, pon aquí lo que dice la app del banco para ese pago.</div>
        <form class="form" onsubmit="return false" id="f-sa"><label class="campo full">Para el pago del<select name="fecha">${opcionesQuincena(sa ? sa.fecha : prox)}</select></label>
        <label class="campo full">Saldo${moneyInput("monto", sa ? sa.monto.toFixed(2) : "", 'placeholder="0.00"')}</label>
        <div class="full fila"><button class="btn verde chico" data-act="guardarSaldo">Guardar saldo</button>${sa ? `<button class="btn chico" data-act="quitarSaldo">Quitar</button>` : ""}</div></form>
        ${sa ? `<div class="muted ok" style="margin-top:8px">✔ El pago del ${fmtFecha(sa.fecha)} usa ${money(sa.monto)} (lo registrado suma ${money(D.cargosDe(t, sa.fecha).reduce((a, c) => a + c.monto, 0))}).</div>` : ""}</div>
      <div class="card"><h2>Pagos por quincena</h2>${auto.map((g) => `<div class="lista-item ${g.pagado ? "muted" : ""}"><div class="esp"><b>${fmtFecha(g.fecha)}</b>${D.saldoActual(t, g.fecha) ? ' <span class="estado parcial">saldo actual</span>' : ""}<div class="muted">${g.pagado ? "✔ Pagado" : "Pendiente"}</div></div>
        <b>${money(g.monto)}</b><button class="icon-btn" data-act="verDetalle" data-f="${g.fecha}">🔍</button></div>`).join("") || `<div class="muted">Sin pagos todavía.</div>`}</div>
    </div>
    <div class="card"><h2>Compras de ${esc(t)}</h2>${tabla(TAB.cargos)}</div>
  </div>`}`;
}
function detalleTarjeta(t, f) {
  const cargos = D.cargosDe(t, f).sort((a, b) => a.concepto.localeCompare(b.concepto));
  const sa = D.saldoActual(t, f), yo = D.yo();
  const por = {};
  cargos.forEach((c) => (por[c.propietario || yo] = (por[c.propietario || yo] || 0) + c.monto));
  const g = D.d.gastos.find((x) => x.auto_tarjeta === t && x.fecha === f);
  abrirModal(`<h2>💳 ${esc(t)} · ${fmtFecha(f)}</h2>
    ${sa ? `<div class="card azul">Este pago usa el <b>saldo actual</b> que capturaste: <b>${money(sa.monto)}</b></div>` : ""}
    <div class="tabla-wrap"><table><thead><tr><th>Concepto</th><th>Pago</th><th>De quién</th><th class="num">Monto</th></tr></thead><tbody>
    ${cargos.map((c) => `<tr class="${(c.propietario || yo) !== yo ? "hecho" : ""}"><td class="wrap">${esc(c.concepto)}</td><td>${c.de ? c.pago + "/" + c.de : ""}</td><td>${esc(c.propietario || yo)}</td><td class="num">${money(c.monto)}</td></tr>`).join("")}
    <tr class="total"><td>TOTAL</td><td></td><td></td><td class="num">${money(cargos.reduce((a, c) => a + c.monto, 0))}</td></tr></tbody></table></div>
    <div class="pie">${Object.entries(por).map(([k, v]) => `<span>${esc(k)}: ${money(v)}</span>`).join("")}</div>
    ${g ? `<div class="pie"><span>Total del pago ${money(g.monto)} − parte otros ${money(D.parteOtros(g))} = <b>mi parte ${money(D.miParte(g))}</b></span></div>` : ""}
    <div class="botones"><button class="btn" data-act="cerrar">Cerrar</button><button class="btn verde" data-act="irCargos" data-x="${esc(t)}" data-f="${f}">Editar compras</button></div>`, true);
}

// ------------------------------------------------------------------ ¿ME ALCANZA?
function planCompra(a, cuando, n, freq) {
  const total = leerMonto(a.precio);
  if (total <= 0) throw new Error("Escribe el precio.");
  const entre = parseInt(a.entre || "1", 10);
  if (!(entre >= 1)) throw new Error("En 'Entre cuántos' pon 1 o más.");
  const precio = r2(total / entre);
  const f0 = quincenaDe(cuando || a.cuando);
  if (n == null && a.forma === "A meses") { n = parseInt(a.n || "0", 10); if (n < 2) throw new Error("A meses: pon 2 pagos o más."); }
  freq = freq || (a.forma === "A meses" ? a.freq : "Cada mes");
  if (n && n >= 2) { const [per, ult] = dividir(precio, n); return Array.from({ length: n }, (_, k) => [avanzar(f0, k, freq), k === n - 1 ? ult : per, k + 1, n]); }
  return [[f0, precio, null, null]];
}
function evaluar(plan, colchon) {
  const antes = D.proyeccion(), despues = D.proyeccion(plan.map((p) => [p[0], p[1]]));
  const inicio = plan[0][0];
  const fin = [quincenaDe(sumarMeses(inicio, 12)), plan[plan.length - 1][0]].sort().pop();
  const aV = antes.filter((q) => q.corte >= inicio && q.corte <= fin), dV = despues.filter((q) => q.corte >= inicio && q.corte <= fin);
  return { antes, despues, aV, dV, rojo: dV.filter((q) => q.saldo < colchon), inicio, fin };
}
function calcularCompra() {
  const a = S.alc;
  let plan, colchon;
  try { plan = planCompra(a); colchon = leerMonto(a.colchon || "0"); } catch (e) { return toast(e.message, true); }
  const ev = evaluar(plan, colchon);
  const mn = (l) => l.reduce((m, q) => (q.saldo < m.saldo ? q : m), l[0]);
  const mn0 = mn(ev.aV), mn1 = mn(ev.dV);
  const que = a.que.trim() || "esto";
  let ver, cls;
  if (!ev.rojo.length) [ver, cls] = [`✔ Sí te alcanza para ${que}.`, "ok"];
  else if (mn1.saldo >= 0) [ver, cls] = [`⚠ Te alcanza, pero bajas de tu colchón de ${money(colchon)} en ${ev.rojo.length} quincena(s).`, "aviso"];
  else [ver, cls] = [`✖ No te alcanza: el ${fmtFecha(mn1.corte)} quedarías en ${money(mn1.saldo)}.`, "malo"];
  const lineas = [];
  const entre = parseInt(a.entre || "1", 10), total = leerMonto(a.precio);
  if (entre > 1) lineas.push(`👥 ${money(total)} entre ${entre} = tu parte ${money(r2(total / entre))}`);
  lineas.push(`💳 Pagos (tu parte): ${plan.length === 1 ? `1 pago de ${money(plan[0][1])} el ${fmtFecha(plan[0][0])}` : `${plan.length} pagos de ${money(plan[0][1])} (${fmtFecha(plan[0][0])} → ${fmtFecha(plan[plan.length - 1][0])})`}`);
  lineas.push(`📉 Saldo más bajo (desde que compras): sin comprar ${money(mn0.saldo)} (${fmtFecha(mn0.corte)}) → comprando ${money(mn1.saldo)} (${fmtFecha(mn1.corte)})`);
  if (ev.rojo.length) {
    const sin = new Map(ev.aV.map((q) => [q.corte, q.saldo]));
    lineas.push(`⚠ Quincenas por debajo de ${money(colchon)}:`);
    ev.rojo.slice(0, 5).forEach((q) => lineas.push(`&nbsp;&nbsp;&nbsp;${fmtFecha(q.corte)}: sin comprar ${money(sin.get(q.corte))} → comprando ${money(q.saldo)}`));
    if (ev.rojo.length > 5) lineas.push(`&nbsp;&nbsp;&nbsp;… y ${ev.rojo.length - 5} más`);
    const justa = ev.aV.find((q) => q.saldo < colchon);
    if (justa) lineas.push(`ℹ Ojo: aun sin comprar nada ya andas justo el ${fmtFecha(justa.corte)} (${money(justa.saldo)}).`);
    // sugerencias
    const actual = a.forma === "A meses" ? parseInt(a.n || "1", 10) : 1, fq = a.forma === "A meses" ? a.freq : "Cada mes";
    let sug = 0;
    for (let n = Math.max(2, actual + 1); n <= 36; n++) {
      const p = planCompra(a, null, n, fq);
      if (!evaluar(p, colchon).rojo.length) { lineas.push(`💡 Te alcanza si lo pagas en ${n} pagos de ${money(p[0][1])} (${fq.toLowerCase()}), empezando el ${fmtFecha(p[0][0])}.`); sug++; break; }
    }
    let c = siguienteCorte(quincenaDe(a.cuando));
    for (let i = 0; i < 48; i++, c = siguienteCorte(c)) {
      if (!evaluar(planCompra(a, c), colchon).rojo.length) { lineas.push(`💡 O así como está, si lo compras / empiezas el ${fmtFecha(c)}.`); sug++; break; }
    }
    if (!sug) lineas.push("💡 No encontré una forma de que alcance en los próximos 2 años con ese colchón.");
  }
  S.alcRes = { ver, cls, lineas, plan, graf: grafica(ev.despues.filter((q) => q.corte <= ev.fin).map((q) => ({ f: q.corte, v: q.saldo })),
    { comparar: ev.antes.filter((q) => q.corte <= ev.fin).map((q) => ({ f: q.corte, v: q.saldo })), etiquetas: ["Comprando", "Sin comprar"], minDesde: ev.inicio, marca: [ev.inicio, "🛒 1er pago"] }) };
  render();
}
function maxPara(antes, inicio, n, freq, colchon) {
  const fechas = Array.from({ length: n }, (_, k) => avanzar(inicio, k, freq));
  const fin = [quincenaDe(sumarMeses(inicio, 12)), fechas[n - 1]].sort().pop();
  let mejor = null;
  for (const q of antes) {
    if (q.corte < inicio || q.corte > fin) continue;
    const k = fechas.filter((f) => f <= q.corte).length;
    if (!k) continue;
    const tope = ((q.saldo - colchon) * n) / k;
    mejor = mejor == null ? tope : Math.min(mejor, tope);
  }
  return Math.max(0, Math.floor(mejor || 0));
}
function calcularMaximo() {
  const m = S.max;
  let colchon, entre, extra;
  try {
    colchon = leerMonto(m.colchon || "0"); entre = parseInt(m.entre || "1", 10); if (!(entre >= 1)) throw new Error("En 'Entre cuántos' pon 1 o más.");
    extra = m.n ? parseInt(m.n, 10) : null;
  } catch (e) { return toast(e.message, true); }
  const inicio = quincenaDe(m.cuando), antes = D.proyeccion();
  const ops = [1, 3, 6, 12, 18, 24];
  if (extra >= 2 && !ops.includes(extra)) ops.push(extra);
  ops.sort((a, b) => a - b);
  const filas = ops.map((n) => { const v = maxPara(antes, inicio, n, m.freq, colchon); return { n, v }; });
  const cont = filas[0].v;
  S.maxRes = { inicio, colchon, entre, filas, cont,
    graf: grafica(antes.filter((q) => q.corte <= quincenaDe(sumarMeses(inicio, 12))).map((q) => ({ f: q.corte, v: q.saldo })), { minDesde: inicio, marca: [inicio, "🛒 compra"] }) };
  render();
}
function vAlcanza() {
  const a = S.alc, m = S.max;
  if (!a.cuando) a.cuando = quincenaDe(hoy());
  if (!m.cuando) m.cuando = quincenaDe(hoy());
  const pills = `<div class="pills"><button class="${S.sub === "comprar" ? "on" : ""}" data-act="sub" data-s="comprar">🛒 ¿Puedo comprar esto?</button>
    <button class="${S.sub === "max" ? "on" : ""}" data-act="sub" data-s="max">💰 ¿Cuánto puedo gastar?</button></div>`;
  if (S.sub === "max") {
    const r = S.maxRes;
    return `<h1>🛒 ¿Me alcanza?</h1><p class="sub">Haz la prueba sin miedo: nada se guarda hasta que le des “Agregar a mis gastos”.</p>${pills}
    <div class="grid g2"><div class="card naranja"><form class="form" data-in="maxIn" onsubmit="return false">
      <label class="campo">¿Cuándo comprarías?<select name="cuando">${opcionesQuincena(m.cuando)}</select></label>
      <label class="campo">Colchón (lo menos que quiero tener)${moneyInput("colchon", m.colchon)}</label>
      <label class="campo">Entre cuántos (compra compartida)<input name="entre" type="number" min="1" value="${esc(m.entre)}"></label>
      <label class="campo">Pagos<select name="freq">${opciones(["Cada mes", "Cada quincena"], m.freq)}</select></label>
      <label class="campo">Otro número de pagos (opcional)<input name="n" type="number" min="2" value="${esc(m.n)}"></label>
      <div class="full"><button class="btn verde" style="width:100%" data-act="calcMax">💰 Calcular cuánto puedo gastar</button></div></form></div>
    <div class="card">${r ? `<div class="veredicto ${r.cont > 0 ? "ok" : "malo"}">${r.cont > 0 ? `💰 De contado puedes gastar hasta ${money(r.cont)}.` : "💰 De contado no te alcanza para nada en esa quincena."}</div>
      <div class="muted" style="margin-bottom:8px">Empezando el ${fmtFecha(r.inicio)}, sin bajar de ${money(r.colchon)} en los siguientes 12 meses. Toma en cuenta todo lo que ya tienes registrado.</div>
      <div class="tabla-wrap"><table><thead><tr><th>Cómo lo pagas</th><th class="num">Máximo (tu parte)</th><th class="num">Cada pago</th>${r.entre > 1 ? '<th class="num">Compra total</th>' : ""}</tr></thead><tbody>
      ${r.filas.map((f) => `<tr class="${f.n === 1 ? "total" : ""}"><td>${f.n === 1 ? "De contado" : `A ${f.n} pagos (${m.freq.toLowerCase()})`}</td><td class="num"><b>${money(f.v)}</b></td>
        <td class="num">${f.n > 1 && f.v ? money(f.v / f.n) : ""}</td>${r.entre > 1 ? `<td class="num">${money(f.v * r.entre)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`
      : `<div class="vacio"><div class="e">💰</div>Elige la quincena y tu colchón, y dale Calcular.</div>`}</div></div>
    ${r ? `<div class="card">${r.graf}</div>` : ""}`;
  }
  const r = S.alcRes;
  let parte = "";
  try { const t = leerMonto(a.precio), e = parseInt(a.entre || "1", 10); if (e > 1 && t > 0) parte = `→ tu parte: ${money(r2(t / e))}`; } catch (e) { /* nada */ }
  return `<h1>🛒 ¿Me alcanza?</h1><p class="sub">Haz la prueba sin miedo: nada se guarda hasta que le des “Agregar a mis gastos”.</p>${pills}
  <div class="grid g2"><div class="card naranja"><form class="form" data-in="alcIn" onsubmit="return false">
    <label class="campo full">¿Qué quieres comprar?<input name="que" value="${esc(a.que)}" placeholder="Ej. Comedor"></label>
    <label class="campo">Precio total${moneyInput("precio", a.precio, 'placeholder="0.00"')}</label>
    <label class="campo">Entre cuántos<input name="entre" type="number" min="1" value="${esc(a.entre)}"><span class="prev" id="parte">${parte}</span></label>
    <label class="campo">¿Cómo lo pagas?<select name="forma">${opciones(["De contado", "A meses"], a.forma)}</select></label>
    <div class="fila" style="align-items:flex-end"><label class="campo" style="width:90px">Pagos<input name="n" type="number" min="2" value="${esc(a.n)}" ${a.forma === "A meses" ? "" : "disabled"}></label>
      <label class="campo esp">&nbsp;<select name="freq" ${a.forma === "A meses" ? "" : "disabled"}>${opciones(["Cada mes", "Cada quincena"], a.freq)}</select></label></div>
    <label class="campo">¿Cuándo lo compras / primer pago?<select name="cuando">${opcionesQuincena(a.cuando)}</select></label>
    <label class="campo">Lo menos que quiero tener (colchón)${moneyInput("colchon", a.colchon)}</label>
    <div class="full fila"><button class="btn verde" data-act="calcCompra">🧮 Calcular</button><button class="btn" data-act="mejorQuincena">🔎 Mejor quincena</button>
      <button class="btn azul" data-act="agregarCompra" ${r && r.plan ? "" : "disabled"}>+ Agregar a mis gastos</button></div></form></div>
  <div class="card">${r ? `<div class="veredicto ${r.cls}">${esc(r.ver)}</div><div class="lineas">${r.lineas.map((l) => `<div>${l.startsWith("&nbsp;") ? l : esc(l)}</div>`).join("")}</div>`
    : `<div class="vacio"><div class="e">🛒</div>Escribe qué quieres comprar y su precio, y dale Calcular.</div>`}</div></div>
  ${r ? `<div class="card">${r.graf}</div>` : ""}`;
}

// ------------------------------------------------------------------ AJUSTES
function vConfig() {
  const serv = D.cfg.servicios || {};
  const ult = D.cfg.ultimo_respaldo ? new Date(D.cfg.ultimo_respaldo).toLocaleDateString("es-MX") : "nunca";
  return `<h1>⚙️ Ajustes</h1><p class="sub">Tu nombre, servicios y respaldos.</p>
  <div class="card azul"><h2>👤 Tu nombre</h2><div class="fila"><input id="nombre" value="${esc(D.yo())}" style="max-width:320px">
    <button class="btn verde" data-act="guardarNombre">Guardar nombre</button></div>
    <div class="muted" style="margin-top:8px">Todo lo que esté a tu nombre es “lo mío”. Lo de cualquier otra persona va en “Parte otros”.</div></div>
  <div class="card"><h2>💡 Servicios (¿cuánto me toca?)</h2><div class="muted" style="margin-bottom:10px">Se reconocen solos por el concepto (agua/japac, luz/cfe, internet/totalplay…).</div>
    ${Object.keys(SERVICIOS).map((s) => `<div class="lista-item"><span style="font-size:24px">${ICONO_SERVICIO[s]}</span><b class="esp">${s}</b>
      <div class="seg">${["No", "Mitad", "Completo"].map((mo) => `<button class="${(serv[s] || "No") === mo ? "on" : ""}" data-act="servicio" data-s="${s}" data-m="${mo}">${mo}</button>`).join("")}</div></div>`).join("")}
    <button class="btn" style="margin-top:10px" data-act="montosServicios">✏️ Montos de los recibos</button></div>
  <div class="card verde"><h2>🛟 Respaldo</h2><div class="muted" style="margin-bottom:10px">Tus datos se guardan solo en esta tablet. Haz un respaldo de vez en cuando (se descarga un archivo). Último respaldo: <b>${ult}</b>.</div>
    <div class="fila"><button class="btn verde" data-act="exportar">📤 Exportar respaldo</button>
    <label class="btn" style="display:inline-flex;align-items:center">📥 Importar respaldo<input type="file" accept=".json,application/json" data-ch="importar" style="display:none"></label></div></div>
  <div class="card"><h2>🧹 Empezar de cero</h2><div class="muted" style="margin-bottom:10px">Borra todos los datos de esta tablet. Haz un respaldo antes.</div>
    <button class="btn rojo" data-act="borrarTodo">Borrar todo</button></div>`;
}

const VISTAS = { resumen: vResumen, ingresos: vIngresos, gastos: vGastos, tarjetas: vTarjetas, alcanza: vAlcanza, config: vConfig };

// ------------------------------------------------------------------ reacciones al escribir
const IN = {
  nada() {},
  tBuscar(el) { S[el.dataset.t].buscar = el.value; const pos = el.selectionStart; render(); const n = $(`[data-in=tBuscar][data-t=${el.dataset.t}]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } },
  prevExtra(form) {
    const f = form.elements, on = f.repite.checked;
    $("#rep-extra").classList.toggle("off", !on);
    const p = $("#prev-extra");
    if (on) { const n = parseInt(f.rep_n.value || "0", 10); p.textContent = n >= 2 ? `1/${n} el ${fmtFecha(f.fecha.value)} … ${n}/${n} el ${fmtFecha(avanzar(f.fecha.value, n - 1, f.rep_fq.value))}` : ""; }
  },
  prevEd(form) {
    const m = form.closest(".modal"); if (!m || !m._ctx) return;
    const f = form.elements, { nuevo, serie } = m._ctx, meses = f.meses.checked;
    $("#sec-meses", m).classList.toggle("off", !meses);
    $("#sec-rep", m).classList.toggle("off", !f.repite.checked || meses);
    $("#sec-rep .toggle", m).classList.toggle("disabled", meses);
    if (meses && f.repite.checked) f.repite.checked = false;
    if (nuevo) { f.pago.disabled = !f.empezado.checked; if (!f.empezado.checked) f.pago.value = 1; }
    const pm = $("#prev-meses", m);
    let monto = 0; try { monto = leerMonto(f.monto.value); } catch (e) { /* nada */ }
    const p = parseInt(f.pago.value || "0", 10), d = parseInt(f.de.value || "0", 10);
    pm.className = "prev";
    if (meses) {
      if (!(d >= 1 && p >= 1 && p <= d)) { pm.textContent = "El pago # debe ir de 1 al total de pagos"; pm.className = "prev malo"; }
      else if (nuevo) {
        const n = f.crear.checked ? d - p + 1 : 1, fq = f.freq.value;
        const [per, ult] = f.es_total.checked ? dividir(monto, d) : [monto, monto];
        let t = `Se va(n) a crear ${n} pago(s): del ${p}/${d} (${fmtFecha(f.fecha.value)})` + (n > 1 ? ` al ${d}/${d} (${fmtFecha(avanzar(f.fecha.value, n - 1, fq))})` : "");
        if (f.es_total.checked && monto) t += ` · ${money(monto)} ÷ ${d} = ${money(per)} cada pago${Math.abs(ult - per) > 0.001 ? ` (el último ${money(ult)})` : ""}`;
        else if (monto) t += ` · Total que falta: ${money(monto * n)}`;
        pm.textContent = t;
      } else pm.textContent = `Este renglón es el pago ${p} de ${d}.`;
    }
    if (serie && f.total_compra) {
      const pt = $("#prev-total", m); let t = serie.total; try { t = leerMonto(f.total_compra.value); } catch (e) { /* nada */ }
      if (Math.abs(t - serie.total) < 0.005) pt.textContent = "Si ya sabes el monto real, cámbialo y se reparte solo entre los pagos pendientes.";
      else if (!serie.pendientes) pt.textContent = "Todos los pagos ya están pagados.";
      else { const [per, ult] = dividir(t - serie.pagado, serie.pendientes); pt.textContent = `${money(t)} − ya pagado ${money(serie.pagado)} ÷ ${serie.pendientes} pendientes = ${money(per)} cada uno${Math.abs(ult - per) > 0.001 ? ` (el último ${money(ult)})` : ""}`; }
    }
    if (serie && f.refreq) {
      const pf = $("#prev-freq", m);
      pf.textContent = f.refreq.value === serie.freq ? "" : p < d ? `Los pagos ${p + 1} al ${d} se moverán a ${f.refreq.value.toLowerCase()}: del ${fmtFecha(avanzar(f.fecha.value, 1, f.refreq.value))} al ${fmtFecha(avanzar(f.fecha.value, d - p, f.refreq.value))}.` : "Es el último pago.";
    }
    const pr = $("#prev-rep", m);
    if (f.repite.checked && !meses) { const n = parseInt(f.rep_n.value || "0", 10); pr.textContent = n >= 1 ? `Se crearán ${n} copia(s): del ${fmtFecha(avanzar(f.fecha.value, 1, f.rep_fq.value))} al ${fmtFecha(avanzar(f.fecha.value, n, f.rep_fq.value))}.` : ""; }
    else pr.textContent = "";
  },
  alcIn(form) {
    const f = form.elements;
    Object.assign(S.alc, { que: f.que.value, precio: f.precio.value, entre: f.entre.value, forma: f.forma.value, n: f.n.value, freq: f.freq.value, cuando: f.cuando.value, colchon: f.colchon.value });
    f.n.disabled = f.freq.disabled = f.forma.value !== "A meses";
    let parte = ""; try { const t = leerMonto(f.precio.value), e = parseInt(f.entre.value || "1", 10); if (e > 1 && t > 0) parte = `→ tu parte: ${money(r2(t / e))}`; } catch (e) { /* nada */ }
    $("#parte").textContent = parte;
  },
  maxIn(form) {
    const f = form.elements;
    Object.assign(S.max, { cuando: f.cuando.value, colchon: f.colchon.value, entre: f.entre.value, freq: f.freq.value, n: f.n.value });
  },
};
document.addEventListener("change", (e) => {
  const h = e.target.closest("[data-in]");
  if (h && IN[h.dataset.in] && e.target.tagName === "SELECT") IN[h.dataset.in](h, e);
  if (h && IN[h.dataset.in] && e.target.type === "checkbox") IN[h.dataset.in](h, e);
  const c = e.target.closest("[data-ch]");
  if (c && CH[c.dataset.ch]) CH[c.dataset.ch](c, e);
});
const CH = {
  rangoDesde(el) { D.cfg.grafica_desde = el.value || null; if (D.cfg.grafica_hasta && el.value && D.cfg.grafica_hasta < el.value) D.cfg.grafica_hasta = null; guardar(); },
  rangoHasta(el) { D.cfg.grafica_hasta = el.value || null; if (D.cfg.grafica_desde && el.value && el.value < D.cfg.grafica_desde) D.cfg.grafica_desde = null; guardar(); },
  tQuincena(el) { S[el.dataset.t].q = el.value; render(); },
  mostrarDesde(el) { D.cfg.mostrar_desde = el.value || null; guardar(); },
  importar(el) {
    const file = el.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let obj;
      try { obj = JSON.parse(rd.result); if (!obj.config || !Array.isArray(obj.gastos)) throw new Error(); }
      catch (e) { return toast("Ese archivo no es un respaldo válido", true); }
      if (!(await confirmar("Esto reemplaza los datos de esta tablet con los del respaldo.", "Importar"))) return;
      D.cargar(obj); guardar("✔ Respaldo importado");
    };
    rd.readAsText(file);
  },
};

// ------------------------------------------------------------------ acciones al tocar
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  if (!a) return;
  if (a.dataset.act === "tSel" && e.target.closest("button, .link, input, select")) return;
  const fn = ACT[a.dataset.act];
  if (fn) { e.preventDefault(); fn(a, e); }
});
const T_ = (el) => TAB[el.dataset.t];
const rowById = (T, id) => T.rows().find((r) => r.id === +id);
const ACT = {
  ir(el) { S.vista = el.dataset.v; $("#main").scrollTop = 0; render(); },
  cerrar() { cerrarModal(); },
  // resumen
  guardarTengo() {
    const i = $("#tengo"); resolverMonto(i);
    let v; try { v = leerMonto(i.value); } catch (e) { return toast(e.message, true); }
    D.cfg.tengo = v; D.cfg.tengo_ts = new Date().toISOString(); guardar("✔ Guardado");
  },
  rangoRapido(el) {
    const m = +el.dataset.m;
    if (!m) { D.cfg.grafica_desde = null; D.cfg.grafica_hasta = null; }
    else { const base = D.cfg.grafica_desde || hoy(); D.cfg.grafica_hasta = quincenaDe(sumarMeses(base, m)); }
    guardar();
  },
  irQuincena(el) { S.gastos.q = el.dataset.q; S.gastos.buscar = ""; S.vista = "gastos"; render(); },
  // ingresos
  ingSel(el) { S.ingSel = el.dataset.c; render(); },
  ingToggle(el) { const i = D.d.ingresos.find((x) => x.id === +el.dataset.id); i.recibido = !i.recibido; marcar(i, i.recibido); guardar(); },
  ingRecibido() {
    const items = deCorte(S.ingSel); if (!items.length) return;
    const nuevo = !items.every((i) => i.recibido);
    items.forEach((i) => { if (!!i.recibido !== nuevo) { i.recibido = nuevo; marcar(i, nuevo); } });
    guardar(nuevo ? "✔ Marcado como recibido" : "Desmarcado");
  },
  ingEditarQ() {
    const c = S.ingSel, base = deCorte(c, ["nomina", "fijo"]);
    const val = (t) => base.filter((i) => i.tipo === t).reduce((a, i) => a + i.monto, 0);
    const m = abrirModal(`<h2>Quincena ${fmtFecha(c)}</h2><form class="form" onsubmit="return false">
      <label class="campo">Nómina${moneyInput("nomina", val("Nómina").toFixed(2))}</label>
      <label class="campo">Extra fijo${moneyInput("fijo", val("Extra fijo").toFixed(2))}</label>
      <div class="full">${toggleHTML("rec", "Ya lo recibí", base.length && base.every((i) => i.recibido))}</div></form>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => {
      const f = m.querySelector("form").elements;
      try { ponerIngreso(c, "Nómina", leerMonto(f.nomina.value), f.rec.checked); ponerIngreso(c, "Extra fijo", leerMonto(f.fijo.value), f.rec.checked); }
      catch (err) { return toast(err.message, true); }
      cerrarModal(); guardar("✔ Guardado");
    };
  },
  ingSiguiente() {
    const base = D.d.ingresos.filter((i) => i.tipo === "Nómina" || i.tipo === "Extra fijo").sort((a, b) => a.fecha.localeCompare(b.fecha));
    let c, nom = 0, fijo = 0;
    if (!base.length) c = quincenaDe(hoy());
    else {
      const u = base[base.length - 1].fecha, items = deCorte(u, ["nomina", "fijo"]);
      nom = items.filter((i) => i.tipo === "Nómina").reduce((a, i) => a + i.monto, 0);
      fijo = items.filter((i) => i.tipo === "Extra fijo").reduce((a, i) => a + i.monto, 0);
      c = siguienteCorte(u);
    }
    if (!nom && !fijo) return ACT.sueldoRango();
    ponerIngreso(c, "Nómina", nom, false); ponerIngreso(c, "Extra fijo", fijo, false);
    S.ingSel = c; guardar(`✔ Agregada la quincena ${fmtFecha(c)}`);
  },
  async ingBorrarQ() {
    if (!(await confirmar(`¿Borrar nómina y extra fijo de la quincena ${fmtFecha(S.ingSel)}? (Los extras no se borran)`, "Borrar", true))) return;
    ponerIngreso(S.ingSel, "Nómina", 0, false); ponerIngreso(S.ingSel, "Extra fijo", 0, false); guardar("Borrado");
  },
  sueldoRango() {
    const base = D.d.ingresos.filter((i) => i.tipo === "Nómina" || i.tipo === "Extra fijo").sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ult = (t) => (base.filter((i) => i.tipo === t).pop() || {}).monto || 0;
    const h = quincenaDe(hoy()), u = base.length ? base[base.length - 1].fecha : null;
    const hasta0 = u && u > h ? u : quincenaDe(sumarMeses(h, 12));
    const m = abrirModal(`<h2>💼 Sueldo por rango</h2><div class="muted" style="margin-bottom:10px">Pon cuánto ganas por quincena y de cuándo a cuándo. Las quincenas ya recibidas no se tocan.</div>
      <form class="form" onsubmit="return false">
      <label class="campo">Nómina por quincena${moneyInput("nomina", ult("Nómina").toFixed(2))}</label>
      <label class="campo">Extra fijo por quincena (0 = no tengo)${moneyInput("fijo", ult("Extra fijo").toFixed(2))}</label>
      <label class="campo">Desde<select name="desde">${opcionesQuincena(h)}</select></label>
      <label class="campo">Hasta<select name="hasta">${opcionesQuincena(hasta0)}</select></label></form>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => {
      const f = m.querySelector("form").elements;
      let nom, fijo; try { nom = leerMonto(f.nomina.value); fijo = leerMonto(f.fijo.value); } catch (err) { return toast(err.message, true); }
      let d0 = f.desde.value, d1 = f.hasta.value; if (d1 < d0) [d0, d1] = [d1, d0];
      let n = 0, salt = 0;
      for (let c = d0; c <= d1; c = siguienteCorte(c)) {
        const ya = deCorte(c, ["nomina", "fijo"]);
        if (ya.length && ya.every((i) => i.recibido)) { salt++; continue; }
        ponerIngreso(c, "Nómina", nom, false); ponerIngreso(c, "Extra fijo", fijo, false); n++;
      }
      cerrarModal(); guardar(`✔ ${n} quincena(s) con ${money(nom + fijo)}${salt ? ` · ${salt} ya recibidas no se tocaron` : ""}`);
    };
  },
  agregarExtra(el) {
    const form = el.closest("form"), f = form.elements;
    $$("[data-money]", form).forEach(resolverMonto);
    let monto; try { monto = leerMonto(f.monto.value); } catch (e) { return toast(e.message, true); }
    const concepto = f.concepto.value.trim();
    if (!concepto || monto <= 0) return toast("Pon el concepto y un monto mayor a 0", true);
    let n = 1;
    if (f.repite.checked) { n = parseInt(f.rep_n.value || "0", 10); if (n < 2) return toast("Pon cuántas veces (2 o más)", true); }
    for (let k = 0; k < n; k++) {
      const it = { id: D.newId(), fecha: avanzar(f.fecha.value, k, f.rep_fq.value), concepto: n > 1 ? `${concepto} ${k + 1}/${n}` : concepto,
        tipo: "Extra eventual", monto, recibido: f.recibido.checked && k === 0 };
      if (it.recibido) marcar(it, true);
      D.d.ingresos.push(it);
    }
    guardar(`✔ Agregado: ${concepto}`);
  },
  ingEditarItem(el) {
    const it = D.d.ingresos.find((x) => x.id === +el.dataset.id);
    const m = abrirModal(`<h2>Editar ingreso</h2><form class="form" onsubmit="return false">
      <label class="campo">Quincena<select name="fecha">${opcionesQuincena(it.fecha)}</select></label>
      <label class="campo">Monto${moneyInput("monto", it.monto.toFixed(2))}</label>
      <label class="campo">Concepto<input name="concepto" value="${esc(it.concepto)}"></label>
      <label class="campo">Tipo<select name="tipo">${opciones(TIPOS_INGRESO, it.tipo)}</select></label>
      <div class="full">${toggleHTML("rec", "Ya lo recibí", it.recibido)}</div></form>
      <div class="botones"><button class="btn rojo" id="del" style="margin-right:auto">🗑 Borrar</button><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => {
      const f = m.querySelector("form").elements;
      try { it.monto = leerMonto(f.monto.value); } catch (err) { return toast(err.message, true); }
      it.fecha = f.fecha.value; it.concepto = f.concepto.value.trim() || it.concepto; it.tipo = f.tipo.value;
      if (!!it.recibido !== f.rec.checked) { it.recibido = f.rec.checked; marcar(it, it.recibido); }
      cerrarModal(); guardar("✔ Guardado");
    };
    $("#del", m).onclick = async () => {
      if (!(await confirmar("¿Borrar este ingreso?", "Borrar", true))) return;
      D.d.ingresos = D.d.ingresos.filter((x) => x.id !== it.id); cerrarModal(); guardar("Borrado");
    };
  },
  // tablas
  tSel(el) { const st = S[el.dataset.t], id = +el.dataset.id; st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); render(); },
  tTodos(el) {
    const T = T_(el), st = S[T.key], vis = visibles(T);
    const todos = vis.every((r) => st.sel.has(r.id));
    if (todos) st.sel.clear(); else vis.forEach((r) => st.sel.add(r.id));
    render();
  },
  tNuevo(el) { abrirEditor(el.dataset.t, null); },
  tEditar(el) { const T = T_(el); abrirEditor(T.key, rowById(T, el.dataset.id)); },
  edGuardar() { guardarEditor($("#modal-root").lastElementChild.querySelector(".modal")); },
  async edBorrar() {
    const m = $("#modal-root").lastElementChild.querySelector(".modal"), { T, r } = m._ctx;
    if (!(await confirmar("¿Borrar este renglón?", "Borrar", true))) return;
    if (T.key === "gastos") D.d.gastos = D.d.gastos.filter((x) => x.id !== r.id); else D.d.cargos = D.d.cargos.filter((x) => x.id !== r.id);
    S[T.key].sel.delete(r.id); cerrarModal(); guardar("Borrado");
  },
  pagarUno(el) { const r = rowById(T_(el), el.dataset.id); if (r.auto_tarjeta || true) { r.pagado = !r.pagado; marcar(r, r.pagado); } guardar(r.pagado ? "✔ Pagado" : "Pendiente"); },
  tPagado(el) {
    const T = T_(el), sel = seleccion(T); if (!sel.length) return toast("Primero selecciona renglones", true);
    const nuevo = !sel.every((r) => r.pagado);
    sel.forEach((r) => { if (!!r.pagado !== nuevo) { r.pagado = nuevo; marcar(r, nuevo); } });
    S[T.key].sel.clear(); guardar(nuevo ? `✔ ${sel.length} marcado(s) como pagados` : "Desmarcados");
  },
  tDuplicar(el) {
    const T = T_(el), sel = seleccion(T).filter((r) => !r.auto_tarjeta);
    if (sel.length !== 1) return toast("Selecciona un solo renglón para duplicar", true);
    const base = { ...sel[0] }; delete base.id; delete base.marcado_en; if (T.toggle) base[T.toggle] = false;
    abrirEditor(T.key, null, base);
  },
  async tEliminar(el) {
    const T = T_(el); let sel = seleccion(T);
    if (sel.some((r) => r.auto_tarjeta)) { toast("Los pagos 💳 de tarjeta se arman solos: borra sus compras en Tarjetas", true); sel = sel.filter((r) => !r.auto_tarjeta); }
    if (!sel.length) return toast("Primero selecciona renglones", true);
    if (!(await confirmar(`¿Borrar ${sel.length} renglón(es)?`, "Borrar", true))) return;
    const ids = new Set(sel.map((r) => r.id));
    if (T.key === "gastos") D.d.gastos = D.d.gastos.filter((x) => !ids.has(x.id)); else D.d.cargos = D.d.cargos.filter((x) => !ids.has(x.id));
    S[T.key].sel.clear(); guardar(`Borrados ${ids.size}`);
  },
  tFiltro(el) {
    const T = T_(el), c = el.dataset.c, st = S[T.key];
    const todos = [...new Set(T.rows().filter(T.filtro).map((r) => valorCol(r, c)))].sort((a, b) => a.localeCompare(b));
    const marcados = new Set(st.filtros[c] || todos);
    const cuenta = {}; T.rows().filter(T.filtro).forEach((r) => (cuenta[valorCol(r, c)] = (cuenta[valorCol(r, c)] || 0) + 1));
    const titulo = T.cols.find((x) => x[0] === c)[1];
    const m = abrirModal(`<h2>Filtrar ${esc(titulo)}</h2><input id="fb" placeholder="🔍 Buscar…" style="margin-bottom:10px">
      <div id="fl" style="max-height:50vh;overflow:auto"></div>
      <div class="muted" style="margin-top:6px">Toca para marcar · “Solo este” para ver uno nada más</div>
      <div class="botones"><button class="btn" id="todos">Marcar todos</button><button class="btn" id="ning">Ninguno</button>
      <button class="btn" id="quitar">Quitar filtro</button><button class="btn verde" id="ok">Aceptar</button></div>`);
    const pintar = () => {
      const t = $("#fb", m).value.trim().toLowerCase();
      const vis = todos.filter((v) => v.toLowerCase().includes(t));
      $("#fl", m).innerHTML = vis.map((v) => `<div class="lista-item"><label class="toggle esp"><input type="checkbox" data-v="${esc(v)}" ${marcados.has(v) ? "checked" : ""}><span class="sw"></span><span>${esc(v)} <span class="muted">(${cuenta[v]})</span></span></label>
        <button class="btn chico" data-solo="${esc(v)}">Solo este</button></div>`).join("");
      $$("#fl input", m).forEach((i) => (i.onchange = () => (i.checked ? marcados.add(i.dataset.v) : marcados.delete(i.dataset.v))));
      $$("[data-solo]", m).forEach((b) => (b.onclick = () => { st.filtros[c] = [b.dataset.solo]; cerrarModal(); render(); }));
      return vis;
    };
    $("#fb", m).oninput = () => { const t = $("#fb", m).value.trim(); if (t) todos.filter((v) => v.toLowerCase().includes(t.toLowerCase())).forEach((v) => marcados.add(v)); pintar(); };
    pintar();
    $("#todos", m).onclick = () => { pintar().forEach((v) => marcados.add(v)); pintar(); };
    $("#ning", m).onclick = () => { pintar().forEach((v) => marcados.delete(v)); pintar(); };
    $("#quitar", m).onclick = () => { delete st.filtros[c]; cerrarModal(); render(); };
    $("#ok", m).onclick = () => {
      const t = $("#fb", m).value.trim().toLowerCase();
      let elegidos = t ? todos.filter((v) => v.toLowerCase().includes(t) && marcados.has(v)) : todos.filter((v) => marcados.has(v));
      if (!elegidos.length || elegidos.length === todos.length) delete st.filtros[c]; else st.filtros[c] = elegidos;
      cerrarModal(); render();
    };
  },
  tQuitarFiltros(el) { S[el.dataset.t].filtros = {}; render(); },
  parteOtros(el) {
    const g = rowById(TAB.gastos, el.dataset.id), otros = D.otrosDe(g);
    abrirModal(`<h2>Parte otros · ${esc(g.concepto)}</h2><div class="muted" style="margin-bottom:8px">${fmtFecha(g.fecha)}</div>
      <div class="tabla-wrap"><table><thead><tr><th>Concepto</th><th>Pago</th><th>De quién</th><th class="num">Monto</th></tr></thead><tbody>
      ${otros.map((o) => `<tr><td class="wrap">${esc(o.concepto)}</td><td>${o.de ? o.pago + "/" + o.de : ""}</td><td>${esc(o.quien)}</td><td class="num">${money(o.monto)}</td></tr>`).join("")}
      <tr class="total"><td>TOTAL PARTE OTROS</td><td></td><td></td><td class="num">${money(otros.reduce((a, o) => a + o.monto, 0))}</td></tr></tbody></table></div>
      <div class="pie"><span>Total del pago ${money(g.monto)} − parte otros = <b>mi parte ${money(D.miParte(g))}</b></span></div>
      <div class="botones"><button class="btn verde" data-act="cerrar">Cerrar</button></div>`);
  },
  toggleDueno(el) {
    const o = el.dataset.o, nc = D.noContar();
    nc.has(o) ? nc.delete(o) : nc.add(o);
    D.cfg.no_contar = [...nc]; guardar();
  },
  cambiarDueno() {
    const sel = seleccion(TAB.gastos).filter((r) => !r.auto_tarjeta);
    if (!sel.length) return toast("Primero selecciona gastos", true);
    const m = abrirModal(`<h2>👤 Cambiar propietario</h2><label class="campo">Propietario de ${sel.length} gasto(s)
      <input id="p" list="dl-pp" value="${esc(sel[0].propietario || D.yo())}">${datalist("dl-pp", D.propietarios())}</label>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => { const p = $("#p", m).value.trim(); if (!p) return; sel.forEach((r) => (r.propietario = p)); S.gastos.sel.clear(); cerrarModal(); guardar("✔ Listo"); };
  },
  pasarTarjeta() {
    const sel = seleccion(TAB.gastos).filter((r) => !r.auto_tarjeta);
    if (!sel.length) return toast("Primero selecciona los gastos que se pagan con tarjeta", true);
    const m = abrirModal(`<h2>💳 Pasar a tarjeta</h2><label class="campo">¿A qué tarjeta pasan estos ${sel.length} gasto(s)?
      <input id="t" list="dl-t" value="${esc(S.tarjeta || D.tarjetas()[0] || "")}">${datalist("dl-t", D.tarjetas())}</label>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Pasar</button></div>`);
    $("#ok", m).onclick = () => {
      const t = $("#t", m).value.trim(); if (!t) return;
      if (!D.cfg.tarjetas.includes(t)) D.cfg.tarjetas.push(t);
      const movidos = new Map(), porFecha = {};
      sel.forEach((r) => {
        const id = D.newId();
        movidos.set(id, r);
        D.d.cargos.push({ id, tarjeta: t, fecha: r.fecha, concepto: r.concepto, pago: r.pago || null, de: r.de || null, monto: r.monto, propietario: r.propietario || D.yo(), notas: r.notas || "" });
        (porFecha[r.fecha] = porFecha[r.fecha] || []).push(r);
      });
      const ids = new Set(sel.map((r) => r.id));
      D.d.gastos = D.d.gastos.filter((g) => !ids.has(g.id));
      D.syncTarjetas();
      for (const [f, rs] of Object.entries(porFecha)) {
        if (D.cargosDe(t, f).every((c) => movidos.has(c.id) && movidos.get(c.id).pagado)) {
          const g = D.d.gastos.find((x) => x.auto_tarjeta === t && x.fecha === f);
          if (g) { g.pagado = true; const mm = rs.map((x) => x.marcado_en || "").sort().pop(); if (mm) g.marcado_en = mm; }
        }
      }
      S.gastos.sel.clear(); cerrarModal(); guardar(`✔ ${sel.length} gasto(s) pasaron a ${t}`);
    };
  },
  // tarjetas
  selTarjeta(el) { S.tarjeta = el.dataset.x; S.cargos.q = "Todas"; S.cargos.sel.clear(); render(); },
  nuevaTarjeta() {
    const m = abrirModal(`<h2>💳 Nueva tarjeta</h2><label class="campo">Nombre de la tarjeta<input id="n" placeholder="Ej. Nu, BBVA, Liverpool…"></label>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Agregar</button></div>`);
    $("#n", m).focus();
    $("#ok", m).onclick = () => { const n = $("#n", m).value.trim(); if (!n) return; if (!D.cfg.tarjetas.includes(n)) D.cfg.tarjetas.push(n); S.tarjeta = n; cerrarModal(); guardar("✔ Tarjeta agregada"); };
  },
  renTarjeta() {
    const viejo = S.tarjeta;
    const m = abrirModal(`<h2>Renombrar tarjeta</h2><label class="campo">Nuevo nombre<input id="n" value="${esc(viejo)}"></label>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => {
      const n = $("#n", m).value.trim(); if (!n || n === viejo) return cerrarModal();
      D.cfg.tarjetas = D.cfg.tarjetas.map((x) => (x === viejo ? n : x)); if (!D.cfg.tarjetas.includes(n)) D.cfg.tarjetas.push(n);
      D.d.cargos.forEach((c) => { if (c.tarjeta === viejo) c.tarjeta = n; });
      D.d.gastos.forEach((g) => { if (g.auto_tarjeta === viejo) g.auto_tarjeta = n; });
      const st = D.cfg.saldos_tarjeta || {}; if (st[viejo]) { st[n] = st[viejo]; delete st[viejo]; }
      S.tarjeta = n; cerrarModal(); guardar("✔ Renombrada");
    };
  },
  async borTarjeta() {
    const t = S.tarjeta, n = D.d.cargos.filter((c) => c.tarjeta === t).length;
    if (!(await confirmar(`¿Borrar la tarjeta ${esc(t)}?${n ? ` También se borran sus ${n} compra(s).` : ""}`, "Borrar", true))) return;
    D.cfg.tarjetas = D.cfg.tarjetas.filter((x) => x !== t); D.d.cargos = D.d.cargos.filter((c) => c.tarjeta !== t);
    if (D.cfg.saldos_tarjeta) delete D.cfg.saldos_tarjeta[t];
    S.tarjeta = null; guardar("Tarjeta borrada");
  },
  guardarSaldo() {
    const f = $("#f-sa").elements; resolverMonto(f.monto);
    let v; try { v = leerMonto(f.monto.value); } catch (e) { return toast(e.message, true); }
    D.cfg.saldos_tarjeta = D.cfg.saldos_tarjeta || {};
    D.cfg.saldos_tarjeta[S.tarjeta] = { fecha: f.fecha.value, monto: v, capturado: new Date().toISOString() };
    guardar("✔ Saldo actual guardado");
  },
  quitarSaldo() { delete (D.cfg.saldos_tarjeta || {})[S.tarjeta]; guardar("Saldo actual quitado"); },
  verDetalle(el) { detalleTarjeta(S.tarjeta, el.dataset.f); },
  irCargos(el) { cerrarModal(); S.vista = "tarjetas"; S.tarjeta = el.dataset.x; S.cargos.q = el.dataset.f; render(); },
  // me alcanza
  sub(el) { S.sub = el.dataset.s; render(); },
  calcCompra(el) { $$("[data-money]", el.closest("form")).forEach(resolverMonto); IN.alcIn(el.closest("form")); calcularCompra(); },
  mejorQuincena(el) {
    IN.alcIn(el.closest("form"));
    const a = S.alc; let colchon;
    try { planCompra(a); colchon = leerMonto(a.colchon || "0"); } catch (e) { return toast(e.message, true); }
    let c = quincenaDe(hoy());
    for (let i = 0; i < 72; i++, c = siguienteCorte(c)) {
      if (!evaluar(planCompra(a, c), colchon).rojo.length) { a.cuando = c; calcularCompra(); return toast(`Lo más pronto: ${fmtFecha(c)}`); }
    }
    toast("En 3 años no encontré quincena; prueba a más meses", true);
  },
  async agregarCompra() {
    const r = S.alcRes; if (!r || !r.plan) return;
    const que = S.alc.que.trim() || "Compra", entre = parseInt(S.alc.entre || "1", 10);
    if (!(await confirmar(`¿Agregar “${esc(que)}” a tus gastos? ${r.plan.length} pago(s), total ${money(r.plan.reduce((a, p) => a + p[1], 0))}.`, "Agregar"))) return;
    r.plan.forEach(([f, m, p, n]) => D.d.gastos.push({ id: D.newId(), fecha: f, concepto: que, a_quien: "", propietario: D.yo(), monto: m, pagado: false,
      notas: "Agregado desde ¿Me alcanza?" + (entre > 1 ? ` · Total ${money(leerMonto(S.alc.precio))} entre ${entre}` : ""), pago: p, de: n }));
    r.plan = null; guardar(`✔ “${que}” ya está en Gastos`);
  },
  calcMax(el) { $$("[data-money]", el.closest("form")).forEach(resolverMonto); IN.maxIn(el.closest("form")); calcularMaximo(); },
  // ajustes
  guardarNombre() { const n = $("#nombre").value.trim(); if (!n) return toast("Escribe tu nombre", true); D.cambiarNombre(n); guardar("✔ Nombre guardado"); },
  servicio(el) { D.cfg.servicios[el.dataset.s] = el.dataset.m; guardar(); },
  montosServicios() {
    const h = quincenaDe(hoy());
    const recibos = (sv, pend = true) => D.d.gastos.filter((g) => !g.auto_tarjeta && servicioDe(g) === sv && (!pend || (!g.pagado && g.fecha >= h)));
    const actual = {};
    Object.keys(SERVICIOS).forEach((sv) => { const p = recibos(sv).sort((a, b) => a.fecha.localeCompare(b.fecha)); const t = recibos(sv, false); actual[sv] = (p[0] || t[t.length - 1] || { monto: 0 }).monto; });
    const m = abrirModal(`<h2>✏️ Montos de los recibos</h2><div class="muted" style="margin-bottom:10px">El total se aplica a todos los recibos pendientes de ese servicio (de esta quincena en adelante).</div>
      <form class="form" onsubmit="return false">${Object.keys(SERVICIOS).map((sv) => `<label class="campo full">${ICONO_SERVICIO[sv]} ${sv} — total del recibo (${recibos(sv).length} pendientes)${moneyInput(sv, actual[sv].toFixed(2))}</label>`).join("")}</form>
      <div class="botones"><button class="btn" data-act="cerrar">Cancelar</button><button class="btn verde" id="ok">Guardar</button></div>`);
    $("#ok", m).onclick = () => {
      const f = m.querySelector("form").elements, msg = [];
      for (const sv of Object.keys(SERVICIOS)) {
        let v; try { v = leerMonto(f[sv].value); } catch (e) { return toast(e.message, true); }
        if (Math.abs(v - actual[sv]) < 0.005) continue;
        const p = recibos(sv); p.forEach((g) => (g.monto = v));
        msg.push(`${sv}: ${money(v)} en ${p.length}`);
      }
      cerrarModal(); guardar(msg.length ? "✔ " + msg.join(" · ") : null);
    };
  },
  exportar() {
    D.cfg.ultimo_respaldo = new Date().toISOString(); D.save();
    const blob = new Blob([JSON.stringify(D.d, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `misfinanzas_respaldo_${hoy()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    render(); toast("📤 Respaldo descargado (búscalo en Descargas)");
  },
  async borrarTodo() {
    if (!(await confirmar("Se borran TODOS tus datos de esta tablet. ¿Ya hiciste un respaldo?", "Sí, borrar todo", true))) return;
    const nombre = D.yo(); D.cargar(datosNuevos()); D.cfg.mi_nombre = nombre; guardar("Datos borrados");
  },
};

// ------------------------------------------------------------------ inicio
function bienvenida() {
  const m = abrirModal(`<div style="text-align:center"><div style="font-size:60px">👋</div><h2>¡Hola! ¿Cómo te llamas?</h2>
    <p class="muted">Así sabe la app qué gastos son tuyos.</p><input id="nom" placeholder="Tu nombre" style="text-align:center;font-size:18px"></div>
    <div class="botones" style="justify-content:center"><button class="btn verde" id="ok" style="min-width:200px">Empezar</button></div>`);
  const ok = () => { const n = $("#nom", m).value.trim(); if (!n) return toast("Escribe tu nombre", true); D.cfg.mi_nombre = n; cerrarModal(); guardar(`¡Bienvenida, ${n}!`); };
  $("#ok", m).onclick = ok;
  $("#nom", m).addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
  setTimeout(() => $("#nom", m).focus(), 50);
}
render();
if (!D.cfg.mi_nombre) bienvenida();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
