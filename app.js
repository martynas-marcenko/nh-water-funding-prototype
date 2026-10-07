(function () {
  "use strict";
  const P = window.PROJECTS;
  const SOURCES = ["ARPA", "PFAS", "DWSRF", "CWSRF", "DWGW Trust"];
  const SOURCE_NAME = {
    "ARPA": "American Rescue Plan Act (ARPA)",
    "PFAS": "PFAS funding",
    "DWSRF": "Drinking Water State Revolving Fund (DWSRF)",
    "CWSRF": "Clean Water State Revolving Fund (CWSRF)",
    "DWGW Trust": "Drinking Water and Groundwater Trust Fund"
  };
  const SRC_COLOR = { "ARPA": "#2a78d6", "PFAS": "#eb6834", "DWSRF": "#1baf7a", "CWSRF": "#eda100", "DWGW Trust": "#e87ba4" };
  // Water system: color plus shape, so color is never the only cue.
  const SYS = {
    "Drinking Water": { c: "#2a78d6", shape: "circle" },
    "Wastewater": { c: "#eb6834", shape: "square" },
    "Stormwater": { c: "#1baf7a", shape: "triangle" },
    "Drinking Water & Wastewater": { c: "#4a3aa7", shape: "diamond" }
  };
  const BAR = "#353895";

  const money = v => "$" + Math.round(v).toLocaleString("en-US");
  const short = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M"
    : v >= 1e3 ? "$" + Math.round(v / 1e3) + "k" : "$" + v;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const year = p => p.date.slice(0, 4);
  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const andList = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const uniq = (arr) => [...new Set(arr)].sort();
  const $ = id => document.getElementById(id);

  function shapeSvg(shape, color, size) {
    const s = size, h = s / 2;
    const ring = 'stroke="#fff" stroke-width="2"';
    let g;
    if (shape === "circle") g = `<circle cx="${h}" cy="${h}" r="${h - 2}" fill="${color}" ${ring}/>`;
    else if (shape === "square") g = `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="2" fill="${color}" ${ring}/>`;
    else if (shape === "triangle") g = `<polygon points="${h},2 ${s - 2},${s - 2} 2,${s - 2}" fill="${color}" ${ring}/>`;
    else g = `<polygon points="${h},1 ${s - 1},${h} ${h},${s - 1} 1,${h}" fill="${color}" ${ring}/>`;
    return `<svg class="mk" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${g}</svg>`;
  }
  const sizeFor = v => Math.round(14 + Math.sqrt(v / 11562868) * 22);

  // ---------- filters ----------
  const F = { q: $("q"), source: $("f-source"), cat: $("f-cat"), sys: $("f-sys"), county: $("f-county"), year: $("f-year") };
  const fill = (sel, vals, label) => vals.forEach(v => sel.add(new Option(label ? label(v) : v, v)));
  fill(F.source, SOURCES.filter(s => P.some(p => p.sources[s])), s => SOURCE_NAME[s]);
  fill(F.cat, uniq(P.map(p => p.category)));
  fill(F.sys, uniq(P.map(p => p.system)));
  fill(F.county, uniq(P.map(p => p.county)));
  fill(F.year, uniq(P.map(year)));

  function filtered() {
    const q = F.q.value.trim().toLowerCase();
    return P.filter(p =>
      (!q || [p.party, p.town, p.place, p.county, p.desc, p.id, p.category, p.system].join(" ").toLowerCase().includes(q)) &&
      (!F.source.value || p.sources[F.source.value]) &&
      (!F.cat.value || p.category === F.cat.value) &&
      (!F.sys.value || p.system === F.sys.value) &&
      (!F.county.value || p.county === F.county.value) &&
      (!F.year.value || year(p) === F.year.value));
  }
  // When a funding source is selected, dollar figures count that source only.
  const amt = p => F.source.value ? (p.sources[F.source.value] || 0) : p.total;

  // ---------- map ----------
  const map = L.map("map", { scrollWheelZoom: false, zoomSnap: 0.25 }).fitBounds([[42.7, -72.56], [45.31, -70.6]], { padding: [12, 12] });
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  const tiles = () => L.layerGroup([
    L.tileLayer(ESRI + "World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Basemap: Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community", maxZoom: 16 }),
    L.tileLayer(ESRI + "World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "overlayPane" })
  ]);
  tiles().addTo(map);
  let counties;
  fetch("nh-counties.geojson").then(r => r.json()).then(gj => {
    counties = gj;
    L.geoJSON(gj, { style: { color: "#6b6e72", weight: 1, fillOpacity: 0, dashArray: "3 3" }, interactive: false }).addTo(map);
    L.geoJSON(gj, { style: { color: "#6b6e72", weight: 1, fillOpacity: 0, dashArray: "3 3" }, interactive: false }).addTo(storyMap);
  });
  const layer = L.layerGroup().addTo(map);
  const markers = {};
  // projects in the same place are fanned out slightly so each stays clickable
  const offsets = {};
  P.forEach(p => {
    const k = p.lat + "," + p.lon; offsets[k] = (offsets[k] || 0) + 1;
    const n = offsets[k] - 1;
    p._ll = [p.lat + n * 0.035, p.lon + n * 0.045];
  });

  $("legend").innerHTML = Object.entries(SYS).map(([k, v]) => `<li>${shapeSvg(v.shape, v.c, 16)}${esc(k)}</li>`).join("") +
    '<li>Marker size: dollars committed</li>';

  function drawMarkers(list) {
    layer.clearLayers();
    list.slice().sort((a, b) => amt(b) - amt(a)).forEach(p => {
      const s = SYS[p.system] || SYS["Drinking Water"];
      const size = sizeFor(Math.max(amt(p), 5000));
      const m = L.marker(p._ll, {
        icon: L.divIcon({ html: shapeSvg(s.shape, s.c, size), className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title: `${p.party}, ${p.town}: ${money(amt(p))}`, alt: `${p.party}, ${p.town}`, keyboard: true, riseOnHover: true
      });
      m.bindTooltip(`<strong>${esc(p.party)}</strong><br>${esc(p.place)} &middot; ${money(amt(p))}`, { direction: "top", offset: [0, -size / 2] });
      m.on("click keypress", () => show(p.id, true));
      m.addTo(layer); markers[p.id] = m;
    });
  }

  // ---------- detail panel ----------
  function show(id, fromMap, still) {
    const p = P.find(x => x.id === id);
    const parts = SOURCES.filter(s => p.sources[s]);
    const placeLine = p.place !== p.town ? `${esc(p.place)}, ${esc(p.town)}` : esc(p.town);
    $("detail").innerHTML = `
      <h3>${esc(p.party)}</h3>
      <p class="meta">${placeLine}, ${esc(p.county)} County &middot; Project ${esc(p.id)}</p>
      <ul class="tags"><li>${esc(p.category)}</li><li>${esc(p.system)}</li><li>Committed ${fmtDate(p.date)}</li></ul>
      <p class="big">${money(p.total)}</p>
      <div class="stack" role="img" aria-label="Funding split: ${parts.map(s => s + " " + money(p.sources[s])).join(", ")}">
        ${parts.map(s => `<span style="flex:${p.sources[s]};background:${SRC_COLOR[s]}"></span>`).join("")}</div>
      <ul class="src-list">${parts.map(s => `<li><span class="sw" style="background:${SRC_COLOR[s]}"></span>${esc(SOURCE_NAME[s])}<span class="amt">${money(p.sources[s])}</span></li>`).join("")}</ul>
      <h4>What the funding paid for</h4>
      <p class="narr">${esc(p.desc)}</p>
      <div class="media"><strong>Photos and video.</strong> NHDES plans three to six photos and one or two videos per project. They show here as a gallery with alt text and captioned video.</div>`;
    if (still) return;
    if (fromMap) $("detail").focus({ preventScroll: true });
    else { map.flyTo(p._ll, 9, { duration: 0.6 }); $("detail").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }

  // ---------- KPIs ----------
  function kpis(list) {
    const total = list.reduce((a, p) => a + amt(p), 0);
    const arpa = list.reduce((a, p) => a + (p.sources.ARPA || 0), 0);
    const towns = new Set(list.map(p => p.town)).size;
    $("kpis").innerHTML = [
      [short(total), F.source.value ? `committed from ${F.source.value}` : "committed, all sources"],
      [list.length, list.length === 1 ? "project" : "projects"],
      [towns, towns === 1 ? "city or town" : "cities and towns"],
      [short(arpa), "of it from ARPA"]
    ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  }

  // ---------- charts (horizontal bars, one series) ----------
  function barChart(el, rows, label) {
    rows = rows.filter(r => r[1] > 0);
    const W = 340, rowH = 30, padL = 128, padR = 60, H = Math.max(rows.length, 1) * rowH + 6;
    const max = Math.max(1, ...rows.map(r => r[1]));
    const bars = rows.map((r, i) => {
      const w = Math.max(3, (W - padL - padR) * r[1] / max), y = i * rowH + 6;
      return `<g><title>${esc(r[0])}: ${money(r[1])}</title>
        <text x="${padL - 8}" y="${y + 13}" text-anchor="end" font-size="12" fill="#1c1e1b">${esc(label ? label(r[0]) : r[0])}</text>
        <rect x="${padL}" y="${y + 2}" width="${w}" height="16" rx="4" fill="${BAR}"/>
        <text x="${padL + w + 6}" y="${y + 14}" font-size="12" fill="#4a4b47">${short(r[1])}</text></g>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart. ${rows.map(r => r[0] + " " + money(r[1])).join("; ")}">
      <line x1="${padL}" x2="${padL}" y1="0" y2="${H}" stroke="#c9c8c2"/>${bars}</svg>
      <details><summary>View as table</summary><table><thead><tr><th scope="col">Group</th><th scope="col">Committed</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${money(r[1])}</td></tr>`).join("")}</tbody></table></details>`;
  }
  const sumBy = (list, key) => { const m = {}; list.forEach(p => { const k = key(p); m[k] = (m[k] || 0) + amt(p); }); return Object.entries(m); };
  const catShort = c => ({ "Infrastructure (Construction)": "Construction" }[c] || c);

  function charts(list) {
    const bySrc = SOURCES.map(s => [s, list.reduce((a, p) => a + ((!F.source.value || F.source.value === s) ? (p.sources[s] || 0) : 0), 0)]);
    barChart($("c-source"), bySrc.sort((a, b) => b[1] - a[1]));
    barChart($("c-cat"), sumBy(list, p => p.category).sort((a, b) => b[1] - a[1]), catShort);
    barChart($("c-year"), sumBy(list, year).sort((a, b) => a[0].localeCompare(b[0])));
  }

  // ---------- ARPA spotlight ----------
  function arpa() {
    const a = P.filter(p => p.sources.ARPA);
    const tot = a.reduce((s, p) => s + p.sources.ARPA, 0);
    const coops = a.filter(p => /cooperative/i.test(p.party));
    $("arpa").innerHTML = `<div class="arpa-grid">
      <div><p class="big">${money(tot)}</p><p class="sub">ARPA dollars in ${a.length} of the ${P.length} sample projects: construction, but also design, planning, asset management, energy efficiency and cybersecurity.</p>
      <figure class="chart"><figcaption>ARPA dollars by project type</figcaption><div id="c-arpa"></div></figure></div>
      <div><h3 style="margin:0 0 6px;font-size:18px">Community-owned housing</h3>
      <p class="sub">ARPA also funded water and wastewater work at community-owned mobile home and condominium associations (the Disadvantaged category). The public label is still to be agreed with NHDES; this prototype groups the cooperatives in the sample by name.</p>
      <div class="cards">${coops.map(p => `<div class="card"><h4>${esc(p.party)}</h4><p>${esc(p.place)}</p>
        <div class="amt">${money(p.sources.ARPA)}</div><p>${esc(p.system)}</p><button type="button" data-id="${esc(p.id)}">Show on map</button></div>`).join("")}</div></div></div>`;
    const byCat = {}; a.forEach(p => byCat[p.category] = (byCat[p.category] || 0) + p.sources.ARPA);
    const el = $("c-arpa");
    const saved = F.source.value; F.source.value = "";
    barChart(el, Object.entries(byCat).sort((x, y) => y[1] - x[1]), catShort);
    F.source.value = saved;
    $("arpa").querySelectorAll("button[data-id]").forEach(b => b.addEventListener("click", () => {
      document.getElementById("h-explore").scrollIntoView({ behavior: "smooth" }); show(b.dataset.id);
    }));
  }

  // ---------- list ----------
  let sortKey = "total", sortDir = -1;
  const COLS = [["party", "Recipient"], ["town", "City or town"], ["county", "County"], ["category", "Type"], ["system", "System"], ["date", "Committed"], ["total", "Amount", "num"]];
  function table(list) {
    const t = $("list");
    t.tHead.innerHTML = "<tr>" + COLS.map(([k, l, c]) => `<th scope="col" class="${c || ""}" aria-sort="${sortKey === k ? (sortDir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-k="${k}">${l}${sortKey === k ? (sortDir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("") + '<th scope="col"><span class="sr">Details</span></th></tr>';
    const rows = list.slice().sort((a, b) => { const x = sortKey === "total" ? amt(a) : a[sortKey], y = sortKey === "total" ? amt(b) : b[sortKey]; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    t.tBodies[0].innerHTML = rows.map(p => `<tr><td>${esc(p.party)}</td><td>${esc(p.town)}</td><td>${esc(p.county)}</td><td>${esc(catShort(p.category))}</td><td>${esc(p.system)}</td><td>${p.date}</td><td class="num">${money(amt(p))}</td><td><button type="button" data-id="${esc(p.id)}">Details<span class="sr"> for ${esc(p.party)}</span></button></td></tr>`).join("");
    t.tHead.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      sortDir = sortKey === b.dataset.k ? -sortDir : (b.dataset.k === "total" ? -1 : 1); sortKey = b.dataset.k; table(filtered());
    }));
    t.tBodies[0].querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      document.getElementById("h-explore").scrollIntoView({ behavior: "smooth" }); show(b.dataset.id);
    }));
  }

  function update() {
    const list = filtered();
    $("count").textContent = `Showing ${list.length} of ${P.length} projects` + (F.source.value ? `; amounts count ${F.source.value} funding only` : "");
    drawMarkers(list); kpis(list); charts(list); table(list);
  }
  Object.values(F).forEach(el => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", update));
  $("reset").addEventListener("click", () => { Object.values(F).forEach(el => el.value = ""); update(); });

  // ---------- story map ----------
  const storyMap = L.map("story-map", { scrollWheelZoom: false, zoomControl: false, keyboard: false, dragging: true, zoomSnap: 1 }).setView([43.85, -71.6], 7);
  tiles().addTo(storyMap);
  const storyMk = {};
  P.forEach(p => {
    const s = SYS[p.system], size = sizeFor(p.total);
    storyMk[p.id] = L.marker(p._ll, { icon: L.divIcon({ html: shapeSvg(s.shape, s.c, size), className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), keyboard: false, interactive: false }).addTo(storyMap);
  });
  const byId = id => P.find(p => p.id === id);
  const total = P.reduce((a, p) => a + p.total, 0);
  const coops = P.filter(p => /cooperative/i.test(p.party));
  const STEPS = [
    { view: [[43.85, -71.6], 7], h: `${money(total)} across ${new Set(P.map(p => p.town)).size} communities`,
      t: `The ${P.length} sample projects run from the Seacoast to the North Country. Larger markers mean more money committed.`, src: "All sample projects, 2021 to 2026." },
    { id: "PRLF-21", z: 9, h: "Jaffrey: four funding sources, one treatment plant",
      t: `${money(byId("PRLF-21").total)} for a new water treatment building at the Turnpike well pump station, with greensand and granulated activated carbon filters. ARPA, PFAS and DWSRF money together.`, src: "Project PRLF-21, committed November 29, 2023." },
    { id: "0411010", z: 9, h: "Charlestown: joining two water systems to deal with arsenic",
      t: `${money(byId("0411010").total)} to interconnect the Charlestown and North Charlestown water systems and build a new booster station.`, src: "Project 0411010, committed March 23, 2022." },
    { bounds: coops.map(p => p._ll), h: "Community-owned housing",
      t: `${andList(coops.map(p => p.party.replace(", Inc.", "") + " in " + p.place + " (" + money(p.total) + ")"))} used ARPA grants for wells and well houses, water mains, septic replacement and a new sewer connection.`, src: "Projects 334403-01, 334421-01, 334434-01D.", ids: coops.map(p => p.id) },
    { id: "CYB-ARPA-028", ids: ["CYB-ARPA-028", "AM-129"], z: 9, h: "Not only pipes: cybersecurity and planning",
      t: `Small grants matter too: ${money(byId("CYB-ARPA-028").total)} for cybersecurity improvements at Cogswell Spring Water Works in Henniker, and ${money(byId("AM-129").total)} for asset management in Contoocook.`, src: "Projects CYB-ARPA-028 and AM-129." }
  ];
  $("steps").innerHTML = STEPS.map((s, i) => `<li class="step" data-i="${i}"><h3>${esc(s.h)}</h3><p>${esc(s.t)}</p><p class="src">${esc(s.src)}</p></li>`).join("");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("only");
  function go(i) {
    const s = STEPS[i];
    document.querySelectorAll(".step").forEach(el => el.classList.toggle("on", +el.dataset.i === i));
    const focus = s.ids || (s.id ? [s.id] : null);
    Object.entries(storyMk).forEach(([id, m]) => m.setOpacity(!focus || focus.includes(id) ? 1 : 0.3));
    const opt = { duration: reduce ? 0 : 1.1 };
    const fly = !reduce;
    if (s.bounds) fly ? storyMap.flyToBounds(L.latLngBounds(s.bounds).pad(0.4), opt) : storyMap.fitBounds(L.latLngBounds(s.bounds).pad(0.4), { animate: false });
    else if (s.id) fly ? storyMap.flyTo(byId(s.id)._ll, s.z, opt) : storyMap.setView(byId(s.id)._ll, s.z, { animate: false });
    else fly ? storyMap.flyTo(s.view[0], s.view[1], opt) : storyMap.setView(s.view[0], s.view[1], { animate: false });
  }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) go(+e.target.dataset.i); }), { rootMargin: "-45% 0px -45% 0px" });
  document.querySelectorAll(".step").forEach(el => io.observe(el));

  arpa();
  update();
  const params = new URLSearchParams(location.search);
  if (params.get("project")) show(params.get("project"), false, true);
  if (params.get("only")) document.body.dataset.only = params.get("only");
  if (params.get("story")) setTimeout(() => { storyMap.invalidateSize(); go(+params.get("story")); }, 50);
})();
