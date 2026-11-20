/* Leonida Map — fan-made interactive map. All state lives in localStorage. */
(function () {
  "use strict";

  const DATA = window.LEONIDA_DATA;
  const [W, H] = DATA.meta.size;
  const STORE_KEY = "leonida-map-v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------ indexes
  const types = {};      // id -> {id,name,icon,section,group,color}
  const typeOrder = [];
  DATA.sections.forEach((sec) => sec.groups.forEach((g) => g.types.forEach((t) => {
    types[t.id] = { ...t, section: sec.name, group: g.name, color: sec.color };
    typeOrder.push(t.id);
  })));
  const markersByType = {};
  DATA.markers.forEach((m) => (markersByType[m.type] ||= []).push(m));
  const markerById = Object.fromEntries(DATA.markers.map((m) => [m.id, m]));

  // ------------------------------------------------------------ state
  const defaults = {
    found: {}, notes: {}, custom: [], off: [], status: "all", hideFound: false, onlyNotes: false,
    regions: true, labels: true, theme: null, collapsed: {},
  };
  let state = load();
  function load() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }
  const isOn = (tid) => !state.off.includes(tid);
  function setType(tid, on) {
    const i = state.off.indexOf(tid);
    if (on && i >= 0) state.off.splice(i, 1);
    if (!on && i < 0) state.off.push(tid);
  }

  if (state.theme) document.documentElement.dataset.theme = state.theme;

  // ------------------------------------------------------------ map
  const bounds = [[0, 0], [H, W]];
  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -1.5,
    maxZoom: 3,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    zoomControl: false,
    attributionControl: true,
    maxBounds: [[-250, -250], [H + 250, W + 250]],
    maxBoundsViscosity: 0.8,
  });
  map.attributionControl.setPrefix(false).addAttribution("Unofficial fan map · original stylized artwork");
  L.imageOverlay("assets/leonida.svg", bounds, { interactive: false }).addTo(map);

  const regionLayer = L.layerGroup();
  const regionShapes = {};
  DATA.regions.forEach((r) => {
    regionShapes[r.name] = L.polygon(r.points, {
      color: "#e0f2fe", weight: 1.2, opacity: 0.35, fillOpacity: 0, dashArray: "5 6", interactive: false,
    }).addTo(regionLayer);
  });

  map.createPane("labels");
  map.getPane("labels").style.zIndex = 650;
  map.getPane("labels").style.pointerEvents = "none";
  const labelLayer = L.layerGroup();
  DATA.labels.forEach((l) => {
    L.marker([l.lat, l.lng], {
      interactive: false, keyboard: false, pane: "labels",
      icon: L.divIcon({ className: `map-label ${l.kind}`, html: `<span>${esc(l.name)}</span>`, iconSize: [0, 0] }),
    }).addTo(labelLayer);
  });

  const pinLayer = L.layerGroup().addTo(map);
  const customLayer = L.layerGroup().addTo(map);
  const leafletMarkers = {}; // id -> L.Marker

  function pinHtml(m) {
    const t = types[m.type];
    const cls = ["pin", state.found[m.id] ? "found" : "", state.notes[m.id] ? "noted" : ""].join(" ");
    return `<div class="${cls}" style="--c:${t.color}" title="${esc(m.title)}">${t.icon}</div>`;
  }
  function makeIcon(m) {
    return L.divIcon({ className: "pin-wrap", html: pinHtml(m), iconSize: [0, 0] });
  }
  DATA.markers.forEach((m) => {
    const lm = L.marker([m.lat, m.lng], { icon: makeIcon(m), riseOnHover: true, keyboard: false });
    lm.bindPopup(() => popupHtml(m), { maxWidth: 300, autoPanPadding: [40, 60] });
    lm.on("popupopen", (e) => wirePopup(e.popup, m));
    leafletMarkers[m.id] = lm;
  });

  function refreshPin(id) {
    const m = markerById[id];
    if (m && leafletMarkers[id]) leafletMarkers[id].setIcon(makeIcon(m));
  }

  function visible(m) {
    if (!isOn(m.type)) return false;
    const f = !!state.found[m.id];
    if (state.status === "done" && !f) return false;
    if ((state.status === "todo" || state.hideFound) && f) return false;
    if (state.onlyNotes && !state.notes[m.id]) return false;
    return true;
  }
  function applyFilters() {
    DATA.markers.forEach((m) => {
      const lm = leafletMarkers[m.id];
      const v = visible(m);
      if (v && !pinLayer.hasLayer(lm)) pinLayer.addLayer(lm);
      else if (!v && pinLayer.hasLayer(lm)) pinLayer.removeLayer(lm);
    });
  }

  // ------------------------------------------------------------ popups
  function popupHtml(m) {
    const t = types[m.type];
    const f = !!state.found[m.id];
    return `<div class="pop" style="--c:${t.color}">
      <div class="pop-type"><span>${t.icon}</span>${esc(t.name)} · ${esc(t.group)}</div>
      <div class="pop-title">${esc(m.title)}</div>
      <p class="pop-desc">${esc(m.desc || "")}</p>
      <textarea placeholder="Add a note…" data-role="note">${esc(state.notes[m.id] || "")}</textarea>
      <div class="pop-actions">
        <button class="btn ${f ? "is-found" : ""}" data-role="found">${f ? "✓ Found" : "Mark as found"}</button>
        <button class="btn" data-role="link" title="Copy link to this marker">🔗 Link</button>
      </div>
      <div class="pop-coords">x ${Math.round(m.lng)}, y ${Math.round(H - m.lat)}</div>
    </div>`;
  }
  function wirePopup(popup, m) {
    const el = popup.getElement();
    $('[data-role="found"]', el).onclick = (e) => {
      toggleFound(m.id);
      const f = !!state.found[m.id];
      e.currentTarget.classList.toggle("is-found", f);
      e.currentTarget.textContent = f ? "✓ Found" : "Mark as found";
    };
    $('[data-role="note"]', el).oninput = (e) => {
      const v = e.target.value;
      if (v.trim()) state.notes[m.id] = v; else delete state.notes[m.id];
      save();
      refreshPin(m.id);
    };
    $('[data-role="link"]', el).onclick = () => copyLink(`#marker/${encodeURIComponent(m.id)}`);
  }

  function toggleFound(id) {
    if (state.found[id]) delete state.found[id]; else state.found[id] = 1;
    save();
    refreshPin(id);
    updateCounts();
    if (!visible(markerById[id])) {
      map.closePopup();
      applyFilters();
    }
  }

  function copyLink(hash) {
    const url = location.href.split("#")[0] + hash;
    (navigator.clipboard?.writeText(url) || Promise.reject()).then(
      () => toast("Link copied"),
      () => { window.prompt("Copy this link:", url); },
    );
  }

  // ------------------------------------------------------------ custom markers
  let adding = false;
  function setAdding(on) {
    adding = on;
    document.body.classList.toggle("adding", on);
    $("#addHint").hidden = !on;
    $("#addMarkerBtn").textContent = on ? "Cancel" : "+ Add a marker";
    if (on && window.innerWidth <= 760) document.body.classList.remove("drawer-open");
  }
  $("#addMarkerBtn").onclick = () => setAdding(!adding);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && adding) setAdding(false); });

  map.on("click", (e) => {
    if (!adding) return;
    setAdding(false);
    const c = { id: "c" + Date.now().toString(36), lat: +e.latlng.lat.toFixed(1), lng: +e.latlng.lng.toFixed(1), title: "", note: "" };
    state.custom.push(c);
    save();
    renderCustom();
    customMarkers[c.id].openPopup();
  });

  const customMarkers = {};
  function customPopup(c) {
    return `<div class="pop" style="--c:#f59e0b">
      <div class="pop-type"><span>📍</span>My marker</div>
      <input type="text" data-role="title" placeholder="Name this marker" value="${esc(c.title)}" style="margin:6px 0">
      <textarea placeholder="Notes…" data-role="note">${esc(c.note)}</textarea>
      <div class="pop-actions">
        <button class="btn" data-role="del">Delete</button>
        <button class="btn" data-role="link">🔗 Link</button>
      </div>
      <div class="pop-coords">x ${Math.round(c.lng)}, y ${Math.round(H - c.lat)}</div>
    </div>`;
  }
  function renderCustom() {
    customLayer.clearLayers();
    Object.keys(customMarkers).forEach((k) => delete customMarkers[k]);
    state.custom.forEach((c) => {
      const lm = L.marker([c.lat, c.lng], {
        draggable: true,
        icon: L.divIcon({ className: "pin-wrap", html: `<div class="pin custom" title="${esc(c.title || "My marker")}">📍</div>`, iconSize: [0, 0] }),
      }).addTo(customLayer);
      lm.bindPopup(() => customPopup(c), { maxWidth: 300 });
      lm.on("popupopen", (e) => {
        const el = e.popup.getElement();
        const ti = $('[data-role="title"]', el);
        if (!c.title) setTimeout(() => ti.focus(), 50);
        ti.oninput = () => { c.title = ti.value; save(); renderMyList(); };
        $('[data-role="note"]', el).oninput = (ev) => { c.note = ev.target.value; save(); };
        $('[data-role="del"]', el).onclick = () => deleteCustom(c.id);
        $('[data-role="link"]', el).onclick = () => copyLink(`#${map.getZoom()}/${c.lat}/${c.lng}`);
      });
      lm.on("dragend", () => {
        const p = lm.getLatLng();
        c.lat = +p.lat.toFixed(1); c.lng = +p.lng.toFixed(1); save();
      });
      customMarkers[c.id] = lm;
    });
    renderMyList();
  }
  function deleteCustom(id) {
    state.custom = state.custom.filter((c) => c.id !== id);
    save();
    map.closePopup();
    renderCustom();
  }
  function renderMyList() {
    $("#myCount").textContent = state.custom.length;
    $("#myList").innerHTML = state.custom.map((c) =>
      `<li data-id="${c.id}"><span class="dot"></span><span class="name">${esc(c.title || "Untitled marker")}</span><button class="x" data-del="${c.id}" aria-label="Delete">✕</button></li>`).join("")
      || `<li style="cursor:default;color:var(--muted)">No markers yet.</li>`;
  }
  $("#myList").onclick = (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { deleteCustom(del.dataset.del); return; }
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const lm = customMarkers[li.dataset.id];
    map.flyTo(lm.getLatLng(), Math.max(map.getZoom(), 1.5), { duration: 0.6 });
    setTimeout(() => lm.openPopup(), 650);
    closeDrawerOnMobile();
  };

  // ------------------------------------------------------------ sidebar tree
  function renderTree() {
    const html = DATA.sections.map((sec, si) => {
      const key = `s${si}`;
      return `<div class="sec ${state.collapsed[key] ? "collapsed" : ""}" data-key="${key}" style="--c:${sec.color}">
        <div class="node-head">
          <span class="caret">▾</span>
          <input type="checkbox" class="cb" data-scope="sec" data-i="${si}" style="--c:${sec.color}" aria-label="Toggle ${esc(sec.name)}">
          <span class="grow sec-name">${esc(sec.name)}</span>
          <span class="frac" data-frac="sec" data-i="${si}"></span>
          <span class="acts">
            <button class="mini" data-act="all" data-scope="sec" data-i="${si}">All</button>
            <button class="mini" data-act="none" data-scope="sec" data-i="${si}">None</button>
            <button class="mini" data-act="only" data-scope="sec" data-i="${si}">Only</button>
          </span>
        </div>
        <div class="node-body">
        ${sec.groups.map((g, gi) => {
          const gk = `${key}g${gi}`;
          return `<div class="grp ${state.collapsed[gk] ? "collapsed" : ""}" data-key="${gk}">
            <div class="node-head">
              <span class="caret">▾</span>
              <input type="checkbox" class="cb" data-scope="grp" data-i="${si}.${gi}" style="--c:${sec.color}" aria-label="Toggle ${esc(g.name)}">
              <span class="grow grp-name">${esc(g.name)}</span>
              <span class="frac" data-frac="grp" data-i="${si}.${gi}"></span>
              <span class="acts">
                <button class="mini" data-act="all" data-scope="grp" data-i="${si}.${gi}">All</button>
                <button class="mini" data-act="none" data-scope="grp" data-i="${si}.${gi}">None</button>
                <button class="mini" data-act="only" data-scope="grp" data-i="${si}.${gi}">Only</button>
              </span>
            </div>
            <div class="node-body">
              ${g.types.map((t) => `<label class="type-row" data-type="${t.id}">
                <input type="checkbox" class="cb" data-scope="type" data-i="${t.id}" style="--c:${sec.color}">
                <span class="ico">${t.icon}</span>
                <span class="nm">${esc(t.name)}</span>
                <span class="frac" data-frac="type" data-i="${t.id}"></span>
              </label>`).join("")}
            </div>
          </div>`;
        }).join("")}
        </div>
      </div>`;
    }).join("");
    $("#tree").innerHTML = html;

    // section chips on the map
    $("#sectionChips").innerHTML = DATA.sections.map((s, i) =>
      `<button data-sec="${i}" style="--c:${s.color}"><i></i>${esc(s.name)}</button>`).join("");

    // jump-to select
    $("#jumpType").innerHTML = `<option value="">Jump to type…</option>` + typeOrder.map((id) =>
      `<option value="${id}">${types[id].icon} ${esc(types[id].name)} (${(markersByType[id] || []).length})</option>`).join("");

    // county chips
    $("#countyChips").innerHTML = `<button class="chip" data-county="">Leonida</button>` +
      DATA.regions.map((r) => `<button class="chip" data-county="${esc(r.name)}">${esc(r.name)}</button>`).join("");
  }

  const secTypes = (si) => DATA.sections[si].groups.flatMap((g) => g.types.map((t) => t.id));
  const grpTypes = (si, gi) => DATA.sections[si].groups[gi].types.map((t) => t.id);
  function scopeTypes(scope, i) {
    if (scope === "sec") return secTypes(+i);
    if (scope === "grp") { const [s, g] = i.split(".").map(Number); return grpTypes(s, g); }
    return [i];
  }

  $("#tree").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) {
      e.preventDefault(); e.stopPropagation();
      const ids = scopeTypes(act.dataset.scope, act.dataset.i);
      if (act.dataset.act === "only") typeOrder.forEach((t) => setType(t, ids.includes(t)));
      else ids.forEach((t) => setType(t, act.dataset.act === "all"));
      changed();
      return;
    }
    if (e.target.matches(".cb")) return; // handled by change
    const head = e.target.closest(".node-head");
    if (head) {
      const node = head.parentElement;
      node.classList.toggle("collapsed");
      state.collapsed[node.dataset.key] = node.classList.contains("collapsed");
      save();
    }
  });
  $("#tree").addEventListener("change", (e) => {
    const cb = e.target.closest(".cb");
    if (!cb) return;
    scopeTypes(cb.dataset.scope, cb.dataset.i).forEach((t) => setType(t, cb.checked));
    changed();
  });
  $$("[data-all]").forEach((b) => (b.onclick = () => { typeOrder.forEach((t) => setType(t, b.dataset.all === "on")); changed(); }));
  $("#sectionChips").onclick = (e) => {
    const b = e.target.closest("[data-sec]");
    if (!b) return;
    const ids = secTypes(+b.dataset.sec);
    const anyOn = ids.some(isOn);
    ids.forEach((t) => setType(t, !anyOn));
    changed();
  };
  $("#jumpType").onchange = (e) => {
    const id = e.target.value;
    if (!id) return;
    setType(id, true);
    changed();
    const pts = (markersByType[id] || []).map((m) => [m.lat, m.lng]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 1.5, duration: 0.7 });
    const row = $(`.type-row[data-type="${id}"]`);
    if (row) {
      row.closest(".grp")?.classList.remove("collapsed");
      row.closest(".sec")?.classList.remove("collapsed");
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    e.target.value = "";
    closeDrawerOnMobile();
  };
  $("#countyChips").onclick = (e) => {
    const b = e.target.closest("[data-county]");
    if (!b) return;
    $$("#countyChips .chip").forEach((c) => c.classList.toggle("active", c === b));
    const shape = regionShapes[b.dataset.county];
    if (shape) map.flyToBounds(shape.getBounds(), { duration: 0.7, padding: [20, 20] });
    else map.flyToBounds(bounds, { duration: 0.7 });
    closeDrawerOnMobile();
  };

  function changed() {
    save();
    applyFilters();
    updateCounts();
  }

  // ------------------------------------------------------------ counts
  function updateCounts() {
    const total = DATA.markers.length;
    let foundTotal = 0;
    const perType = {};
    DATA.markers.forEach((m) => {
      const p = (perType[m.type] ||= [0, 0]);
      p[1]++;
      if (state.found[m.id]) { p[0]++; foundTotal++; }
    });
    const pct = total ? Math.round((foundTotal / total) * 1000) / 10 : 0;
    $("#foundLine").textContent = `${foundTotal.toLocaleString()} / ${total.toLocaleString()} found`;
    $("#foundPct").textContent = `${pct}%`;
    $("#barFill").style.width = `${pct}%`;
    $("#remainLine").textContent = `${(total - foundTotal).toLocaleString()} remaining`;
    $("#metaLine").textContent = `${total.toLocaleString()} markers · ${typeOrder.length} types · ${DATA.sections.length} sections`;
    $("#cAll").textContent = total.toLocaleString();
    $("#cDone").textContent = foundTotal.toLocaleString();
    $("#cTodo").textContent = (total - foundTotal).toLocaleString();

    const sum = (ids) => ids.reduce((a, id) => [a[0] + (perType[id]?.[0] || 0), a[1] + (perType[id]?.[1] || 0)], [0, 0]);
    $$("[data-frac]").forEach((el) => {
      const ids = scopeTypes(el.dataset.frac, el.dataset.i);
      const [f, t] = sum(ids);
      el.innerHTML = `<b>${f}</b>/${t}`;
    });
    $$("#tree .cb").forEach((cb) => {
      const ids = scopeTypes(cb.dataset.scope, cb.dataset.i);
      const on = ids.filter(isOn).length;
      cb.checked = on === ids.length;
      cb.indeterminate = on > 0 && on < ids.length;
      if (cb.dataset.scope === "type") cb.closest(".type-row").classList.toggle("off", !cb.checked);
    });
    $$("#sectionChips [data-sec]").forEach((b) => b.classList.toggle("off", !secTypes(+b.dataset.sec).some(isOn)));
  }

  // ------------------------------------------------------------ filters
  $("#statusSeg").onclick = (e) => {
    const b = e.target.closest("[data-status]");
    if (!b) return;
    state.status = b.dataset.status;
    syncFilterUI();
    changed();
  };
  $("#hideFound").onchange = (e) => { state.hideFound = e.target.checked; changed(); };
  $("#onlyNotes").onchange = (e) => { state.onlyNotes = e.target.checked; changed(); };
  function syncFilterUI() {
    $$("#statusSeg button").forEach((b) => b.classList.toggle("on", b.dataset.status === state.status));
    $("#hideFound").checked = state.hideFound;
    $("#onlyNotes").checked = state.onlyNotes;
    $("#regionToggle").classList.toggle("on", state.regions);
    $("#regionToggle").textContent = `${state.regions ? "✓ " : ""}Region shapes`;
    $("#labelToggle").classList.toggle("on", state.labels);
    $("#labelToggle").textContent = `${state.labels ? "✓ " : ""}Labels`;
    if (state.regions) regionLayer.addTo(map); else regionLayer.remove();
    if (state.labels) labelLayer.addTo(map); else labelLayer.remove();
  }
  $("#regionToggle").onclick = () => { state.regions = !state.regions; save(); syncFilterUI(); };
  $("#labelToggle").onclick = () => { state.labels = !state.labels; save(); syncFilterUI(); };

  // ------------------------------------------------------------ search
  const searchEl = $("#search");
  let searchTimer;
  searchEl.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); });
  function runSearch() {
    const q = searchEl.value.trim().toLowerCase();
    const box = $("#searchResults");
    $("#mainPanel").hidden = !!q;
    box.hidden = !q;
    if (!q) return;
    const hits = [];
    for (const m of DATA.markers) {
      const t = types[m.type];
      const hay = `${m.title} ${t.name} ${t.group} ${t.section} ${m.desc || ""} ${state.notes[m.id] || ""}`.toLowerCase();
      if (hay.includes(q)) hits.push({ kind: "m", m, t });
      if (hits.length >= 80) break;
    }
    state.custom.forEach((c) => {
      if (`${c.title} ${c.note}`.toLowerCase().includes(q)) hits.unshift({ kind: "c", c });
    });
    box.innerHTML = hits.length ? hits.map((h, i) => h.kind === "m"
      ? `<div class="res" data-i="${i}"><span class="ico">${h.t.icon}</span><div><div class="t">${esc(h.m.title)}${state.found[h.m.id] ? " ✓" : ""}</div><div class="s">${esc(h.t.group)} · ${esc(h.m.desc || "")}</div></div></div>`
      : `<div class="res" data-i="${i}"><span class="ico">📍</span><div><div class="t">${esc(h.c.title || "Untitled marker")}</div><div class="s">My marker</div></div></div>`).join("")
      : `<div class="empty">No matches for “${esc(q)}”.</div>`;
    box.onclick = (e) => {
      const r = e.target.closest(".res");
      if (!r) return;
      const h = hits[+r.dataset.i];
      if (h.kind === "m") focusMarker(h.m.id);
      else { const lm = customMarkers[h.c.id]; map.flyTo(lm.getLatLng(), 1.5, { duration: 0.6 }); setTimeout(() => lm.openPopup(), 650); }
      closeDrawerOnMobile();
    };
  }

  function focusMarker(id) {
    const m = markerById[id];
    if (!m) return;
    setType(m.type, true);
    if (!visible(m)) { state.status = "all"; state.hideFound = false; state.onlyNotes = false; syncFilterUI(); }
    changed();
    const lm = leafletMarkers[id];
    map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 1.75), { duration: 0.6 });
    map.once("moveend", () => {
      lm.openPopup();
      const pin = lm.getElement()?.querySelector(".pin");
      if (pin) { pin.classList.remove("flash"); void pin.offsetWidth; pin.classList.add("flash"); }
    });
  }

  // ------------------------------------------------------------ import / export / reset
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "leonida-map", version: 1, state }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leonida-map-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const s = json.state || json;
      if (typeof s !== "object" || !s.found) throw new Error("bad file");
      state = { ...defaults, ...s };
      save();
      boot();
      toast("Progress imported");
    } catch {
      toast("That file isn't a Leonida map export");
    }
  };
  $("#resetBtn").onclick = () => {
    if (!confirm("Reset all progress, notes and your markers? This can't be undone (export first if unsure).")) return;
    const theme = state.theme;
    state = { ...defaults, theme };
    save();
    boot();
    toast("Everything reset");
  };

  // ------------------------------------------------------------ tools
  $("#zoomIn").onclick = () => map.zoomIn();
  $("#zoomOut").onclick = () => map.zoomOut();
  $("#fsBtn").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  $("#themeBtn").onclick = () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    state.theme = cur === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = state.theme;
    save();
  };
  $("#drawerToggle").onclick = () => document.body.classList.toggle("drawer-open");
  function closeDrawerOnMobile() { if (window.innerWidth <= 760) document.body.classList.remove("drawer-open"); }

  map.on("mousemove", (e) => {
    $("#coords").textContent = `x ${Math.round(e.latlng.lng)} · y ${Math.round(H - e.latlng.lat)}`;
  });

  // pin size follows zoom
  function sizePins() {
    const z = map.getZoom();
    const px = Math.round(Math.min(32, Math.max(12, 19 + z * 6)));
    map.getContainer().style.setProperty("--pin", px + "px");
  }
  map.on("zoomend", sizePins);

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ------------------------------------------------------------ URL hash (#zoom/lat/lng or #marker/id)
  let hashLock = false;
  function writeHash() {
    if (hashLock) return;
    const c = map.getCenter();
    history.replaceState(null, "", `#${+map.getZoom().toFixed(2)}/${c.lat.toFixed(1)}/${c.lng.toFixed(1)}`);
  }
  function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith("marker/")) {
      const id = h.slice(7);
      if (markerById[id]) {
        const m = markerById[id];
        map.setView([m.lat, m.lng], 1.75);
        setTimeout(() => focusMarker(id), 100);
        return true;
      }
    }
    const [z, lat, lng] = h.split("/").map(Number);
    if ([z, lat, lng].every(Number.isFinite)) { map.setView([lat, lng], z); return true; }
    return false;
  }
  map.on("moveend", writeHash);
  window.addEventListener("hashchange", () => { hashLock = true; readHash(); hashLock = false; });

  // ------------------------------------------------------------ boot
  function boot() {
    renderTree();
    renderCustom();
    syncFilterUI();
    applyFilters();
    updateCounts();
  }
  boot();
  if (!readHash()) map.fitBounds(bounds);
  sizePins();
})();
