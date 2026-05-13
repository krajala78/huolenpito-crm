// =========================================
// State
// =========================================
let allProperties = [];
let allArchived   = [];
let lastFiltered  = [];  // filtteröity lista Vie Excel -toiminnolle
let editingId     = null;
let viewingId     = null;
let currentUser   = null;
let selectedKaupungit = [];
let colFilters = {};

// =========================================
// Init
// =========================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});

// =========================================
// Auth
// =========================================
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { showLoginOverlay(); return; }
    currentUser = await res.json();
    hideLoginOverlay();
    onAuthSuccess();
  } catch (e) { showLoginOverlay(); }
}

function showLoginOverlay() { document.getElementById('login-overlay').classList.remove('d-none'); }
function hideLoginOverlay()  { document.getElementById('login-overlay').classList.add('d-none'); }

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  errEl.classList.add('d-none');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Kirjaudutaan...';
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) { errEl.classList.remove('d-none'); return; }
    currentUser = await res.json();
    hideLoginOverlay();
    onAuthSuccess();
  } catch (e) {
    errEl.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Kirjaudu sisään';
  }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null; allProperties = []; allArchived = []; selectedKaupungit = [];
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showLoginOverlay();
  showTab('dashboard');
}

function onAuthSuccess() {
  updateNavbarUser();
  loadStats(); loadProperties(); loadFilters(); loadArchive(); initTilitysForm();
  showTab('dashboard');
}

function updateNavbarUser() {
  const u = currentUser; if (!u) return;
  document.getElementById('navbar-user').classList.remove('d-none');
  document.getElementById('nav-avatar').textContent   = u.fullname[0].toUpperCase();
  document.getElementById('nav-fullname').textContent = u.fullname;
  const badge = document.getElementById('nav-role-badge');
  if (u.role === 'admin') {
    badge.textContent = 'Admin'; badge.className = 'nav-role-badge nav-role-admin';
    document.getElementById('nav-kayttajat').classList.remove('d-none');
  } else {
    badge.textContent = 'Käyttäjä'; badge.className = 'nav-role-badge nav-role-user';
    document.getElementById('nav-kayttajat').classList.add('d-none');
  }
}

// =========================================
// Tab navigation
// =========================================
function showTab(tab) {
  ['dashboard','kohteet','tuonti','kayttajat','arkisto','tilitys'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('d-none', t !== tab);
  });
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  const map = { dashboard:0, kohteet:1, arkisto:3, tilitys:4, tuonti:5 };
  if (map[tab] !== undefined && navLinks[map[tab]]) navLinks[map[tab]].classList.add('active');
  if (tab === 'kayttajat' && currentUser?.role === 'admin') loadUsers();
  if (tab === 'arkisto') renderArchiveTable(allArchived);
}

// =========================================
// Stats / Dashboard
// =========================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.status === 401) { showLoginOverlay(); return; }
    const d = await res.json();
    document.getElementById('stat-total').textContent             = d.total ?? '-';
    document.getElementById('stat-vuokrattu').textContent         = d.vuokrattu ?? '-';
    document.getElementById('stat-vapaat').textContent            = d.vapaat ?? '-';
    document.getElementById('stat-vuokramarkkinalla').textContent = d.vuokramarkkinalla ?? '-';
    const huolEl = document.getElementById('stat-huolenpidossa');
    if (huolEl) huolEl.textContent = d.huolenpidossa ?? '-';
    const laskEl = document.getElementById('stat-laskutus');
    if (laskEl) laskEl.textContent = formatEur(d.laskutus_sum);
    // Näytä admin-kortit vain adminille
    const isAdmin = currentUser?.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin));
    renderVastuuhenkiloStats(d.per_vastuuhenkilo || []);
    renderTilaStats(d.per_tila || []);
  } catch (e) { console.error('Stats error:', e); }
}

function renderVastuuhenkiloStats(items) {
  const el = document.getElementById('vastuuhenkilo-stats'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-3">Ei dataa.</div>'; return; }
  const max = Math.max(...items.map(i => i.total || 0), 1);
  el.innerHTML = items.map(i => {
    const pct = Math.round(((i.total || 0) / max) * 100);
    const vPct = i.total ? Math.round((i.vuokrattu / i.total) * 100) : 0;
    return '<div class="mb-3"><div class="d-flex justify-content-between align-items-center mb-1">'
      + '<span class="small fw-semibold">' + esc(i.vastuuhenkilo || '(ei asetettu)') + '</span>'
      + '<span class="small text-muted">' + i.total + ' kpl &bull; ' + vPct + '% vuokrattu</span></div>'
      + '<div class="progress"><div class="progress-bar bg-primary" style="width:' + pct + '%"></div></div></div>';
  }).join('');
}

function renderTilaStats(items) {
  const el = document.getElementById('tila-stats'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-3">Ei dataa.</div>'; return; }
  const total = items.reduce((s, i) => s + (i.count || 0), 0) || 1;
  const colors = ['bg-success','bg-warning','bg-danger','bg-info','bg-secondary','bg-primary'];
  el.innerHTML = items.map((i, idx) => {
    const pct = Math.round(((i.count || 0) / total) * 100);
    return '<div class="mb-3"><div class="d-flex justify-content-between align-items-center mb-1">'
      + '<span class="small fw-semibold">' + esc(i.asunnon_tila || '(ei asetettu)') + '</span>'
      + '<span class="small text-muted">' + i.count + ' kpl (' + pct + '%)</span></div>'
      + '<div class="progress"><div class="progress-bar ' + colors[idx % colors.length] + '" style="width:' + pct + '%"></div></div></div>';
  }).join('');
}

// =========================================
// Properties list
// =========================================
async function loadProperties() {
  try {
    const res = await fetch('/api/properties');
    if (res.status === 401) { showLoginOverlay(); return; }
    allProperties = await res.json();
    renderTable(allProperties);
    populateColFilterSelects(allProperties);
  } catch (e) { showToast('Kohteiden lataus epäonnistui', 'danger'); }
}

function cell(v) { return '<td>' + esc(v || '-') + '</td>'; }
function cellC(v) { return '<td class="text-center">' + esc(v || '-') + '</td>'; }
function cellE(v) { return '<td class="text-end">' + esc(v || '-') + '</td>'; }
function cellEur(v) { return '<td class="text-end">' + (v != null && v !== '' ? formatEur(v) : '-') + '</td>'; }

function renderTable(props) {
  const tbody   = document.getElementById('properties-tbody');
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = props.length + ' kohdetta';
  if (!props.length) {
    tbody.innerHTML = '<tr><td colspan="43" class="text-center py-5 text-muted">Ei kohteita.</td></tr>';
    return;
  }
  var stickyTd = 'style="position:sticky;left:0;background:#fff;border-right:2px solid #dee2e6;z-index:1"';
  var stickyAct = 'style="position:sticky;right:0;background:#fff;border-left:2px solid #dee2e6;z-index:1"';
  tbody.innerHTML = props.map(p =>
    '<tr onclick="viewProperty(' + p.id + ')" style="cursor:pointer">'
    // 1. Kohde / Osoite — sticky left
    + '<td ' + stickyTd + '>'
    +   '<div class="fw-semibold">' + esc(p.kohde_osoite || '-') + '</div>'
    +   (p.postinumero ? '<small class="text-muted">' + esc(p.postinumero) + '</small>' : '')
    + '</td>'
    // 2. Omistaja
    + cell(p.omistaja)
    // 3. Tyyppi
    + cell(p.tyyppi)
    // 4. Koko
    + '<td class="text-center">' + (p.koko != null ? p.koko + ' m²' : '-') + '</td>'
    // 5. Kaupunki
    + cell(p.kaupunki)
    // 6. Vastuuhenkilö
    + cell(p.vastuuhenkilo)
    // 7. Huolenpitosopimus
    + cell(p.huolenpitosopimus)
    // 8. Huolenpidossa
    + cellC(p.huolenpidossa)
    // 9. Vuokrauksessa
    + cellC(p.vuokrauksessa)
    // 10. Vuokravälittäjä
    + cell(p.vuokravalittaja)
    // 11. Vuokrattu
    + '<td class="text-center">' + vuokrattuBadge(p.vuokrattu) + '</td>'
    // 12. Vuokralla
    + cellC(p.vuokramarkkinalla)
    // 13. Asunnon tila
    + '<td>' + tilaBadge(p.asunnon_tila) + '</td>'
    // 14. Vuokralainen
    + cell(p.vuokralaisen_nimi)
    // 15. Vuokralaisen puhelin
    + cell(p.vuokralaisen_puhelin)
    // 16. Vuokralaisen sähköposti
    + cell(p.vuokralaisen_sahkoposti)
    // 17. Vuokrasopimus alkaen
    + cell(p.vuokrasopimus_alkaen)
    // 18. Vuokrasopimus päättyy
    + cell(p.vuokrasopimus_paattyy)
    // 19. Vuokra alussa
    + cellEur(p.vuokra_alussa)
    // 20. Vuokra tänään
    + cellEur(p.vuokra_tanaan)
    // 21. Vesimaksut
    + cellEur(p.vesimaksut)
    // 22. Muut maksut
    + cell(p.muut_maksut)
    // 23. Saunamaksut
    + cell(p.saunamaksut)
    // 24. Kokonaisumma
    + '<td class="text-end fw-semibold">' + (p.kokonaisumma != null ? formatEur(p.kokonaisumma) : '-') + '</td>'
    // 25. Vuokravakuus
    + cellEur(p.vuokravakuus)
    // 26. Vakuuden maksupv
    + cell(p.vakuuden_maksupv)
    // 27. Kenen tilillä vakuus
    + cell(p.kenen_tililla_vakuus)
    // 28. Avaimet luovutettu
    + cell(p.avaimet_luovutettu)
    // 29. Avainten lkm
    + cellC(p.avainten_lkm)
    // 30. Avainten luovutettu lkm
    + cellC(p.avainten_luovutettu_lkm)
    // 31. Vesimittari luettu
    + cell(p.vesimittari_luettu)
    // 32. Välitys laskutettu
    + cell(p.valitys_laskutettu)
    // 33. Välityshinta
    + cellEur(p.valityshinta)
    // 34. Välitys laskutettu pvm
    + cell(p.valitys_laskutettu_pvm)
    // 35. Takuupalvelu
    + cell(p.takuupalvelu)
    // 36. Vuokratilitykset
    + cell(p.vuokratilitykset)
    // 37. Laskutusperuste
    + cell(p.laskutusperuste)
    // 38. Laskutuksen status
    + cell(p.laskutuksen_status)
    // 39. Vuokranantajan kontakti
    + cell(p.vuokranantajan_kontakti)
    // 40. Vuokranantajan sähköposti
    + cell(p.vuokranantajan_sahkoposti)
    // 41. Vuokranantajan puhelin
    + cell(p.vuokranantajan_puhelin)
    // 42. Lisätietoja
    + '<td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(p.lisatietoja || '') + '">' + esc(p.lisatietoja || '-') + '</td>'
    // 43. Toiminnot — sticky right
    + '<td class="text-center" ' + stickyAct + ' onclick="event.stopPropagation()">'
    + '<button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(' + p.id + ')" title="Muokkaa"><i class="bi bi-pencil"></i></button>'
    + '<button class="btn btn-sm btn-outline-warning" onclick="archiveProperty(' + p.id + ')" title="Arkistoi"><i class="bi bi-archive"></i></button>'
    + '</td>'
    + '</tr>'
  ).join('');
  renderCards(props);
}

// =========================================
// Mobile card view
// =========================================
function renderCards(props) {
  var el = document.getElementById('properties-cards');
  if (!el) return;
  if (!props.length) {
    el.innerHTML = '<div class="text-center text-muted py-5">Ei kohteita.</div>';
    return;
  }
  el.innerHTML = props.map(function(p) {
    var vuokraBadge = p.vuokrattu && p.vuokrattu.toLowerCase() === 'kyllä'
      ? '<span class="pc-badge" style="background:#d1fae5;color:#065f46">Vuokrattu</span>'
      : p.vuokrattu && p.vuokrattu.toLowerCase().startsWith('neuvottelu')
        ? '<span class="pc-badge" style="background:#fef3c7;color:#92400e">Neuvottelussa</span>'
        : '<span class="pc-badge" style="background:#fee2e2;color:#991b1b">Ei vuokrattu</span>';
    var tila = p.asunnon_tila ? '<span class="badge bg-secondary ms-1" style="font-size:11px">' + esc(p.asunnon_tila) + '</span>' : '';
    var rent = p.kokonaisumma ? '<span class="fw-bold text-primary">' + formatEur(p.kokonaisumma) + '/kk</span>'
             : p.vuokra_tanaan ? '<span class="fw-bold text-primary">' + formatEur(p.vuokra_tanaan) + '/kk</span>' : '-';
    return '<div class="prop-card" onclick="viewProperty(' + p.id + ')">'
      + '<div class="pc-addr">' + esc(p.kohde_osoite || '-') + '</div>'
      + '<div class="pc-sub">' + esc(p.kaupunki || '') + (p.postinumero ? ' ' + esc(p.postinumero) : '') + (p.tyyppi ? ' &bull; ' + esc(p.tyyppi) : '') + (p.koko ? ' &bull; ' + p.koko + ' m²' : '') + '</div>'
      + '<div class="pc-row">'
      +   '<div>' + vuokraBadge + tila + '</div>'
      +   '<div>' + rent + '</div>'
      + '</div>'
      + (p.vuokralaisen_nimi ? '<div class="pc-row"><span class="pc-label">Vuokralainen</span><span>' + esc(p.vuokralaisen_nimi) + '</span></div>' : '')
      + '<div class="pc-row"><span class="pc-label">Omistaja</span><span>' + esc(p.omistaja || '-') + '</span></div>'
      + '<div class="pc-row"><span class="pc-label">Vastuuhenkilö</span><span>' + esc(p.vastuuhenkilo || '-') + '</span></div>'
      + '<div class="pc-actions" onclick="event.stopPropagation()">'
      +   '<button class="btn btn-sm btn-outline-primary flex-fill" onclick="openEditModal(' + p.id + ')"><i class="bi bi-pencil me-1"></i>Muokkaa</button>'
      +   '<button class="btn btn-sm btn-outline-warning flex-fill" onclick="archiveProperty(' + p.id + ')"><i class="bi bi-archive me-1"></i>Arkistoi</button>'
      + '</div>'
      + '</div>';
  }).join('');
}


// =========================================
// Filters
// =========================================
async function loadFilters() {
  try {
    const res = await fetch('/api/filters'); if (!res.ok) return;
    const d = await res.json();
    const menu = document.getElementById('kaupunki-menu');
    if (menu) {
      while (menu.children.length > 2) menu.removeChild(menu.lastChild);
      d.kaupungit.forEach(k => {
        const li = document.createElement('li');
        li.innerHTML = '<label class="dropdown-item small py-1 d-flex align-items-center gap-2" style="cursor:pointer">'
          + '<input type="checkbox" class="form-check-input mt-0" value="' + esc(k) + '" onchange="toggleKaupunki(\'' + esc(k) + '\')">'
          + esc(k) + '</label>';
        menu.appendChild(li);
      });
    }
    const vSel = document.getElementById('filter-vastuuhenkilo');
    if (vSel) {
      while (vSel.options.length > 1) vSel.remove(1);
      d.vastuuhenkilot.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v; vSel.appendChild(opt);
      });
    }

  } catch (e) { /* silent */ }
}

function toggleKaupunkiMenu() {
  var menu = document.getElementById('kaupunki-menu');
  var btn  = document.getElementById('kaupunki-btn');
  if (!menu || !btn) return;
  if (menu.style.display === 'none' || !menu.style.display) {
    var r = btn.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top  = (r.bottom + 4) + 'px';
    menu.style.width = Math.max(r.width, 220) + 'px';
    menu.style.display = 'block';
  } else {
    menu.style.display = 'none';
  }
}

function closeKaupunkiMenu() {
  var menu = document.getElementById('kaupunki-menu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('click', function(e) {
  var btn  = document.getElementById('kaupunki-btn');
  var menu = document.getElementById('kaupunki-menu');
  if (!btn || !menu) return;
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function toggleKaupunki(k) {
  const idx = selectedKaupungit.indexOf(k);
  if (idx === -1) selectedKaupungit.push(k); else selectedKaupungit.splice(idx, 1);
  updateKaupunkiLabel(); filterProperties();
}

function updateKaupunkiLabel() {
  const lbl = document.getElementById('kaupunki-label'); if (!lbl) return;
  lbl.textContent = selectedKaupungit.length === 0 ? 'Kaikki'
    : selectedKaupungit.length === 1 ? selectedKaupungit[0]
    : selectedKaupungit.length + ' kaupunkia';
}

function clearKaupunkiFilter() {
  selectedKaupungit = [];
  document.querySelectorAll('#kaupunki-menu input[type=checkbox]').forEach(cb => { cb.checked = false; });
  updateKaupunkiLabel(); filterProperties();
}

// =========================================
// Column filters
// =========================================
function toggleColFilters() {
  var row = document.getElementById('col-filter-row');
  var btn = document.getElementById('col-filter-toggle-btn');
  if (!row) return;
  var hidden = row.classList.contains('d-none');
  row.classList.toggle('d-none', !hidden);
  if (btn) {
    btn.classList.toggle('btn-outline-secondary', !hidden);
    btn.classList.toggle('btn-secondary', hidden);
  }
  if (!hidden) {
    // Clearing filters when hiding
    clearColFilters();
  }
}

function applyColFilter(input) {
  var col = input.getAttribute('data-col');
  var val = input.value.trim().toLowerCase();
  if (val) {
    colFilters[col] = val;
  } else {
    delete colFilters[col];
  }
  filterProperties();
}

function clearColFilters() {
  colFilters = {};
  var inputs = document.querySelectorAll('#col-filter-row [data-col]');
  inputs.forEach(function(inp) { inp.value = ''; });
  filterProperties();
}

function populateColFilterSelects(props) {
  var selects = document.querySelectorAll('#col-filter-row select[data-col]');
  selects.forEach(function(sel) {
    var col = sel.getAttribute('data-col');
    var current = sel.value;
    var seen = {};
    props.forEach(function(p) {
      var v = p[col];
      if (v != null && v !== '') seen[String(v)] = true;
    });
    var sorted = Object.keys(seen).sort(function(a, b) {
      return a.localeCompare(b, 'fi');
    });
    sel.innerHTML = '<option value="">Kaikki</option>';
    sorted.forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function applyColFiltersToList(props) {
  var keys = Object.keys(colFilters);
  if (keys.length === 0) return props;
  return props.filter(function(p) {
    return keys.every(function(col) {
      var val = colFilters[col];
      var pval = (p[col] != null ? String(p[col]) : '');
      return pval.toLowerCase().includes(val.toLowerCase());
    });
  });
}


function filterProperties() {
  const search    = (document.getElementById('search-input')?.value || '').toLowerCase();
  const vuokrattu = document.getElementById('filter-vuokrattu')?.value || '';
  const vastuu    = document.getElementById('filter-vastuuhenkilo')?.value || '';
  const filtered  = allProperties.filter(p => {
    const ms = !search || [p.kohde_osoite,p.omistaja,p.vuokralaisen_nimi,p.vuokranantajan_kontakti,
      p.kaupunki,p.tyyppi,p.asunnon_tila,p.vastuuhenkilo,p.postinumero,p.lisatietoja]
      .some(v => v && v.toLowerCase().includes(search));
    const mv = !vuokrattu || (p.vuokrattu || '').toLowerCase() === vuokrattu.toLowerCase();
    const mk = selectedKaupungit.length === 0 || selectedKaupungit.includes(p.kaupunki);
    const mh = !vastuu || p.vastuuhenkilo === vastuu;
    return ms && mv && mk && mh;
  });
  var colFiltered = applyColFiltersToList(filtered);
  lastFiltered = colFiltered;
  renderTable(colFiltered);
  // Päivitä Vuokratulot/kk (admin-only) filtteröidyn listan mukaan
  var vuokraSum = colFiltered.reduce(function(s, p) { return s + (parseFloat(p.kokonaisumma) || 0); }, 0);
  var vuokraEl = document.getElementById('stat-vuokra');
  if (vuokraEl) vuokraEl.textContent = formatEur(vuokraSum);
  var vuokraBox = document.getElementById('vuokratulot-kohteet-box');
  if (vuokraBox) vuokraBox.classList.toggle('d-none', !(currentUser?.role === 'admin'));
  if (vuokraBox) vuokraBox.classList.toggle('d-flex', currentUser?.role === 'admin');
  // Päivitä tilastolaatikot filtteröidyn listan mukaan
  var ksTotal      = colFiltered.length;
  var ksVuokrattu  = colFiltered.filter(function(p){ return (p.vuokrattu||'').toLowerCase() === 'kyllä'; }).length;
  var ksVapaat     = ksTotal - ksVuokrattu;
  var ksMarkkinalla = colFiltered.filter(function(p){ return (p.vuokramarkkinalla||'').toLowerCase() === 'kyllä'; }).length;
  var el = document.getElementById('ks-total');      if (el) el.textContent = ksTotal;
  el = document.getElementById('ks-vuokrattu');      if (el) el.textContent = ksVuokrattu;
  el = document.getElementById('ks-vapaat');         if (el) el.textContent = ksVapaat;
  el = document.getElementById('ks-markkinalla');    if (el) el.textContent = ksMarkkinalla;
}

function recalcKokonaisumma() {
  var vuokra = parseFloat(document.getElementById('f-vuokra_tanaan')?.value) || 0;
  var vesi   = parseFloat(document.getElementById('f-vesimaksut')?.value) || 0;
  var muut_raw = (document.getElementById('f-muut_maksut')?.value || '').trim();
  var sauna_raw = (document.getElementById('f-saunamaksut')?.value || '').trim();
  var muut  = parseFloat(muut_raw) || 0;
  var sauna = parseFloat(sauna_raw) || 0;
  var total = vuokra + vesi + muut + sauna;
  var el = document.getElementById('f-kokonaisumma');
  if (el) el.value = total > 0 ? total.toFixed(2) : '';
}

function clearFilters() {
  const si = document.getElementById('search-input');
  const fv = document.getElementById('filter-vuokrattu');
  const fh = document.getElementById('filter-vastuuhenkilo');
  if (si) si.value = ''; if (fv) fv.value = ''; if (fh) fh.value = '';
  clearKaupunkiFilter();
}

// =========================================
// Archive
// =========================================
async function loadArchive() {
  try {
    const res = await fetch('/api/properties?arkisto=1');
    if (res.status === 401) { showLoginOverlay(); return; }
    allArchived = await res.json();
    renderArchiveTable(allArchived);
  } catch (e) { console.error('Archive error:', e); }
}

function renderArchiveTable(items) {
  const tbody   = document.getElementById('archive-tbody');
  const countEl = document.getElementById('archive-count');
  if (!tbody) return;
  if (countEl) countEl.textContent = items.length + ' arkistoitua kohdetta';
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">Ei arkistoituja kohteita.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(p =>
    '<tr><td><div class="fw-semibold">' + esc(p.kohde_osoite || '-') + '</div></td>'
    + '<td>' + esc(p.omistaja || '-') + '</td>'
    + '<td>' + esc(p.kaupunki || '-') + '</td>'
    + '<td>' + esc(p.vuokralaisen_nimi || '-') + '</td>'
    + '<td>' + esc(p.vastuuhenkilo || '-') + '</td>'
    + '<td class="text-center">'
    + '<button class="btn btn-sm btn-outline-success me-1" onclick="restoreProperty(' + p.id + ')"><i class="bi bi-arrow-counterclockwise me-1"></i>Palauta</button>'
    + '<button class="btn btn-sm btn-outline-danger" onclick="hardDeleteProperty(' + p.id + ')"><i class="bi bi-trash me-1"></i>Poista pysyvästi</button>'
    + '</td></tr>'
  ).join('');
}

function filterArchive() {
  const search = (document.getElementById('archive-search')?.value || '').toLowerCase();
  if (!search) { renderArchiveTable(allArchived); return; }
  renderArchiveTable(allArchived.filter(p =>
    [p.kohde_osoite,p.omistaja,p.kaupunki,p.vuokralaisen_nimi,p.vastuuhenkilo].some(v => v && v.toLowerCase().includes(search))
  ));
}


// =========================================
// Confirm Modal helper
// =========================================
function showConfirm(title, text, okLabel, okClass, onOk) {
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalText').textContent = text;
  var btn = document.getElementById('confirmModalOk');
  btn.textContent = okLabel;
  btn.className = 'btn btn-sm ' + (okClass || 'btn-primary');
  var modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  var handler = function() {
    modal.hide();
    btn.removeEventListener('click', handler);
    onOk();
  };
  btn.addEventListener('click', handler);
  // Clean up if dismissed without clicking OK
  document.getElementById('confirmModal').addEventListener('hidden.bs.modal', function cleanup() {
    btn.removeEventListener('click', handler);
    document.getElementById('confirmModal').removeEventListener('hidden.bs.modal', cleanup);
  });
  modal.show();
}

async function archiveProperty(id) {
  const p = allProperties.find(x => x.id === id);
  showConfirm(
    'Arkistoi kohde',
    'Arkistoidaanko kohde "' + (p ? p.kohde_osoite : '') + '"? Se häviää päälistalta.',
    'Arkistoi', 'btn-warning',
    async function() {
      try {
        const res = await fetch('/api/properties/' + id + '/archive', { method: 'PUT' });
        if (!res.ok) { const t = await res.text(); throw new Error('Arkistointi epäonnistui (' + res.status + ')'); }
        showToast('Kohde arkistoitu', 'success');
        await loadProperties(); await loadArchive(); await loadStats();
      } catch (e) { showToast('Virhe: ' + e.message, 'danger'); }
    }
  );
}

async function restoreProperty(id) {
  const p = allArchived.find(x => x.id === id);
  showConfirm(
    'Palauta kohde',
    'Palautetaanko "' + (p ? p.kohde_osoite : '') + '" takaisin aktiiviseksi?',
    'Palauta', 'btn-success',
    async function() {
      try {
        const res = await fetch('/api/properties/' + id + '/restore', { method: 'PUT' });
        if (!res.ok) { await res.text(); throw new Error('Palautus epäonnistui (' + res.status + ')'); }
        showToast('Kohde palautettu', 'success');
        await loadProperties(); await loadArchive(); await loadStats();
      } catch (e) { showToast('Virhe: ' + e.message, 'danger'); }
    }
  );
}

async function hardDeleteProperty(id) {
  const p = allArchived.find(x => x.id === id);
  showConfirm(
    'Poista pysyvästi',
    'POISTETAANKO PYSYVÄSTI "' + (p ? p.kohde_osoite : '') + '"? Tätä toimintoa ei voi peruuttaa!',
    'Poista pysyvästi', 'btn-danger',
    async function() {
      try {
        const res = await fetch('/api/properties/' + id, { method: 'DELETE' });
        if (!res.ok) { await res.text(); throw new Error('Poisto epäonnistui (' + res.status + ')'); }
        showToast('Kohde poistettu pysyvästi', 'success');
        await loadArchive(); await loadStats();
      } catch (e) { showToast('Virhe: ' + e.message, 'danger'); }
    }
  );
}

// =========================================
// Excel export & Tilitysraportit
// =========================================
function exportExcel() { window.location = '/api/export'; }

function exportExcelFiltered() {
  var ids = (lastFiltered.length ? lastFiltered : allProperties).map(function(p){ return p.id; });
  window.location = '/api/export?ids=' + ids.join(',');
}

function initTilitysForm() {
  const sel = document.getElementById('tilitys-vuosi'); if (!sel) return;
  const now = new Date(); const year = now.getFullYear();
  sel.innerHTML = '';
  for (let y = year - 2; y <= year + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y; if (y === year) opt.selected = true;
    sel.appendChild(opt);
  }
  const kSel = document.getElementById('tilitys-kuukausi');
  if (kSel) kSel.value = String(now.getMonth() + 1);
}

function generateTilitysraportti() {
  const vuosi    = document.getElementById('tilitys-vuosi')?.value;
  const kuukausi = document.getElementById('tilitys-kuukausi')?.value;
  if (!vuosi || !kuukausi) { showToast('Valitse vuosi ja kuukausi', 'warning'); return; }
  window.location = '/api/tilitysraportti?vuosi=' + vuosi + '&kuukausi=' + kuukausi;
}

// =========================================
// View property
// =========================================
function viewProperty(id) {
  const p = allProperties.find(x => x.id === id); if (!p) return;
  viewingId = id;
  document.getElementById('view-modal-title').innerHTML =
    '<i class="bi bi-house-door me-2 text-primary"></i>' + esc(p.kohde_osoite || 'Kohde');

  const sections = [
    { title: 'Kohteen tiedot', icon: 'bi-geo-alt', fields: [
      ['Osoite',p.kohde_osoite],['Tyyppi',p.tyyppi],
      ['Koko',p.koko ? p.koko+' m2' : null],['Kaupunki',p.kaupunki],
      ['Postinumero',p.postinumero],['Asunnon tila',p.asunnon_tila]]},
    { title: 'Omistajatiedot', icon: 'bi-person-vcard', fields: [
      ['Omistaja',p.omistaja],['Kontakti',p.vuokranantajan_kontakti],
      ['Sahkoposti',p.vuokranantajan_sahkoposti],['Puhelin',p.vuokranantajan_puhelin],
      ['Vuokravalittaja',p.vuokravalittaja],['Vastuuhenkilo',p.vastuuhenkilo]]},
    { title: 'Sopimus & laskutus', icon: 'bi-file-text', fields: [
      ['Huolenpitosopimus',p.huolenpitosopimus],['Huolenpidossa',p.huolenpidossa],
      ['Vuokrauksessa',p.vuokrauksessa],['Laskutusperuste',p.laskutusperuste],
      ['Laskutuksen status',p.laskutuksen_status],['Vuokratilitykset',p.vuokratilitykset]]},
    { title: 'Vuokrasopimus', icon: 'bi-calendar-range', fields: [
      ['Alkaa',p.vuokrasopimus_alkaen],['Paattyy',p.vuokrasopimus_paattyy],
      ['Vuokrattu',p.vuokrattu],['Vuokralla',p.vuokramarkkinalla]]},
    { title: 'Vuokralaistiedot', icon: 'bi-people', fields: [
      ['Nimi',p.vuokralaisen_nimi],['Puhelin',p.vuokralaisen_puhelin],
      ['Sahkoposti',p.vuokralaisen_sahkoposti]]},
    { title: 'Maksutiedot', icon: 'bi-currency-euro', fields: [
      ['Vuokra alussa',p.vuokra_alussa ? formatEur(p.vuokra_alussa) : null],
      ['Vuokra tanaan',p.vuokra_tanaan ? formatEur(p.vuokra_tanaan) : null],
      ['Vesimaksut',p.vesimaksut ? formatEur(p.vesimaksut) : null],
      ['Muut maksut',p.muut_maksut],['Saunamaksut',p.saunamaksut],
      ['Kokonaissumma',p.kokonaisumma ? formatEur(p.kokonaisumma) : null]]},
    { title: 'Vakuus & avaimet', icon: 'bi-shield-lock', fields: [
      ['Vuokravakuus',p.vuokravakuus ? formatEur(p.vuokravakuus) : null],
      ['Vakuuden maksupv',p.vakuuden_maksupv],['Kenen tililla vakuus',p.kenen_tililla_vakuus],
      ['Avaimet luovutettu',p.avaimet_luovutettu],['Avainten lkm',p.avainten_lkm],
      ['Avainten luovutettu lkm',p.avainten_luovutettu_lkm],['Takuupalvelu',p.takuupalvelu],
      ['Vesimittari luettu',p.vesimittari_luettu]]},
    { title: 'Valitystiedot', icon: 'bi-receipt', fields: [
      ['Valitys laskutettu',p.valitys_laskutettu],
      ['Valityslaskun paivamaara',p.valitys_laskutettu_pvm],
      ['Valityshinta',p.valityshinta ? formatEur(p.valityshinta) : null]]},
  ];

  const html = sections.map(s => {
    const rows = s.fields.filter(function(f) { return f[1] !== null && f[1] !== undefined && f[1] !== ''; })
      .map(function(f) {
        return '<div class="col-6 col-md-4 mb-2"><div class="text-muted small">' + f[0] + '</div>'
          + '<div class="fw-semibold">' + esc(String(f[1])) + '</div></div>';
      }).join('');
    if (!rows) return '';
    return '<div class="form-section mb-3"><h6 class="form-section-title">'
      + '<i class="bi ' + s.icon + ' me-2 text-primary"></i>' + s.title + '</h6>'
      + '<div class="row">' + rows + '</div></div>';
  }).join('');

  document.getElementById('view-modal-body').innerHTML = html
    + (p.lisatietoja ? '<div class="form-section mb-3"><h6 class="form-section-title">'
      + '<i class="bi bi-chat-text me-2 text-primary"></i>Lisatiedot</h6>'
      + '<p class="mb-0">' + esc(p.lisatietoja) + '</p></div>' : '');

  document.getElementById('view-edit-btn').onclick = function() {
    bootstrap.Modal.getInstance(document.getElementById('viewModal')).hide();
    openEditModal(id);
  };
  new bootstrap.Modal(document.getElementById('viewModal')).show();
}

// =========================================
// Add / Edit property modal
// =========================================
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').innerHTML = '<i class="bi bi-house-add me-2"></i>Lisää uusi kohde';
  document.getElementById('property-form').reset();
  document.getElementById('f-id').value = '';
  showTab('kohteet');
  new bootstrap.Modal(document.getElementById('propertyModal')).show();
}

function openEditModal(id) {
  const p = allProperties.find(x => x.id === id); if (!p) return;
  editingId = id;
  document.getElementById('modal-title').innerHTML = '<i class="bi bi-pencil me-2"></i>Muokkaa: ' + esc(p.kohde_osoite || '');
  document.getElementById('f-id').value = id;
  const fields = [
    'kohde_osoite','omistaja','vuokranantajan_kontakti','vuokranantajan_sahkoposti','vuokranantajan_puhelin',
    'tyyppi','koko','kaupunki','postinumero','huolenpitosopimus','huolenpidossa','vuokrauksessa',
    'vuokravalittaja','vastuuhenkilo','laskutusperuste','laskutuksen_status','vuokratilitykset',
    'vuokrasopimus_alkaen','vuokrasopimus_paattyy','vuokrattu','vuokramarkkinalla','asunnon_tila',
    'vuokralaisen_nimi','vuokralaisen_puhelin','vuokralaisen_sahkoposti','vuokra_alussa','vuokra_tanaan',
    'vesimaksut','muut_maksut','saunamaksut','kokonaisumma','vuokravakuus','vakuuden_maksupv',
    'kenen_tililla_vakuus','avaimet_luovutettu','avainten_lkm','avainten_luovutettu_lkm','takuupalvelu',
    'vesimittari_luettu','valitys_laskutettu','valitys_laskutettu_pvm','valityshinta','lisatietoja',
  ];
  fields.forEach(f => {
    const el = document.getElementById('f-' + f); if (!el) return;
    const v = p[f]; el.value = (v !== null && v !== undefined) ? v : '';
  });
  new bootstrap.Modal(document.getElementById('propertyModal')).show();
}

async function saveProperty() {
  const form = document.getElementById('property-form');
  if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
  form.classList.remove('was-validated');
  const numFields = ['koko','vuokra_alussa','vuokra_tanaan','vesimaksut','kokonaisumma','vuokravakuus','valityshinta','avainten_lkm','avainten_luovutettu_lkm'];
  const fields = [
    'kohde_osoite','omistaja','vuokranantajan_kontakti','vuokranantajan_sahkoposti','vuokranantajan_puhelin',
    'tyyppi','koko','kaupunki','postinumero','huolenpitosopimus','huolenpidossa','vuokrauksessa',
    'vuokravalittaja','vastuuhenkilo','laskutusperuste','laskutuksen_status','vuokratilitykset',
    'vuokrasopimus_alkaen','vuokrasopimus_paattyy','vuokrattu','vuokramarkkinalla','asunnon_tila',
    'vuokralaisen_nimi','vuokralaisen_puhelin','vuokralaisen_sahkoposti','vuokra_alussa','vuokra_tanaan',
    'vesimaksut','muut_maksut','saunamaksut','kokonaisumma','vuokravakuus','vakuuden_maksupv',
    'kenen_tililla_vakuus','avaimet_luovutettu','avainten_lkm','avainten_luovutettu_lkm','takuupalvelu',
    'vesimittari_luettu','valitys_laskutettu','valitys_laskutettu_pvm','valityshinta','lisatietoja',
  ];
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById('f-' + f); if (!el) return;
    const v = el.value.trim();
    data[f] = v === '' ? null : numFields.includes(f) ? (parseFloat(v) || null) : v;
  });
  const isEdit = !!editingId;
  const url = isEdit ? '/api/properties/' + editingId : '/api/properties';
  try {
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Virhe');
    bootstrap.Modal.getInstance(document.getElementById('propertyModal')).hide();
    showToast(isEdit ? 'Kohde päivitetty!' : 'Kohde lisätty!', 'success');
    await loadProperties(); await loadStats(); await loadFilters();
  } catch (e) { showToast('Virhe: ' + e.message, 'danger'); }
}

// =========================================
// Excel import
// =========================================
let selectedFile = null;

function handleFileSelect(event) { selectedFile = event.target.files[0]; updateFileDisplay(); }
function handleDrop(event) { event.preventDefault(); selectedFile = event.dataTransfer.files[0]; updateFileDisplay(); }

function updateFileDisplay() {
  const btn = document.getElementById('import-btn');
  const nameEl = document.getElementById('selected-filename');
  if (selectedFile) { nameEl.textContent = selectedFile.name; btn.disabled = false; }
  else { nameEl.textContent = 'Ei tiedostoa valittuna'; btn.disabled = true; }
}

async function importExcel() {
  if (!selectedFile) return;
  const resultEl = document.getElementById('import-result');
  resultEl.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Tuodaan...';
  const formData = new FormData();
  formData.append('file', selectedFile);
  try {
    const res  = await fetch('/api/import', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tuonti epäonnistui');
    let html = '<div class="alert alert-success mb-2"><i class="bi bi-check-circle me-1"></i><strong>' + data.message + '</strong></div>';
    if (data.errors && data.errors.length > 0) {
      html += '<div class="alert alert-warning mb-0"><strong>Varoitukset:</strong><ul class="mb-0 mt-1">'
        + data.errors.map(function(e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    resultEl.innerHTML = html;
    selectedFile = null;
    document.getElementById('selected-filename').textContent = 'Ei tiedostoa valittuna';
    document.getElementById('import-btn').disabled = true;
    document.getElementById('excel-file-input').value = '';
    await loadProperties(); await loadStats(); await loadFilters();
    showToast('Tuotu ' + data.count + ' kohdetta!', 'success');
  } catch (e) {
    resultEl.innerHTML = '<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-1"></i>' + esc(e.message) + '</div>';
  }
}

// =========================================
// User management (admin only)
// =========================================
let allUsers = [];

async function loadUsers() {
  try {
    const res = await fetch('/api/users'); if (!res.ok) return;
    allUsers = await res.json(); renderUsersTable();
  } catch (e) { showToast('Käyttäjien lataus epäonnistui', 'danger'); }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody'); if (!tbody) return;
  if (!allUsers.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Ei käyttäjiä.</td></tr>'; return; }
  tbody.innerHTML = allUsers.map(u => {
    const isSelf = u.id === currentUser?.id;
    const roleBadge   = u.role === 'admin' ? '<span class="badge bg-primary">Admin</span>' : '<span class="badge bg-secondary">Käyttäjä</span>';
    const statusBadge = u.active ? '<span class="badge bg-success">Aktiivinen</span>' : '<span class="badge bg-warning text-dark">Ei-aktiivinen</span>';
    return '<tr>'
      + '<td><strong>' + esc(u.username) + '</strong>' + (isSelf ? ' <span class="text-primary small">(sinä)</span>' : '') + '</td>'
      + '<td>' + esc(u.fullname) + '</td><td>' + roleBadge + '</td><td>' + statusBadge + '</td>'
      + '<td class="text-muted small">' + (u.created || '-') + '</td>'
      + '<td class="text-center"><button class="btn btn-sm btn-outline-primary me-1" onclick="openUserModal(' + u.id + ')"><i class="bi bi-pencil"></i></button>'
      + (isSelf ? '' : '<button class="btn btn-sm btn-outline-danger" onclick="deleteUser(' + u.id + ',\'' + esc(u.username) + '\')"><i class="bi bi-trash"></i></button>')
      + '</td></tr>';
  }).join('');
}

function openUserModal(id) {
  const errEl = document.getElementById('user-modal-error');
  errEl.classList.add('d-none');
  document.getElementById('edit-user-id').value = id || '';
  if (id) {
    const u = allUsers.find(x => x.id === id); if (!u) return;
    document.getElementById('user-modal-title').innerHTML = '<i class="bi bi-pencil me-2"></i>Muokkaa käyttäjää';
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-fullname').value = u.fullname;
    document.getElementById('u-password').value = '';
    document.getElementById('u-role').value     = u.role;
    document.getElementById('u-active').value   = u.active ? '1' : '0';
    document.getElementById('u-pw-hint').style.display = '';
  } else {
    document.getElementById('user-modal-title').innerHTML = '<i class="bi bi-person-plus me-2"></i>Uusi käyttäjä';
    document.getElementById('u-username').value = '';
    document.getElementById('u-fullname').value = '';
    document.getElementById('u-password').value = '';
    document.getElementById('u-role').value     = 'user';
    document.getElementById('u-active').value   = '1';
    document.getElementById('u-pw-hint').style.display = 'none';
  }
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function saveUser() {
  const id       = document.getElementById('edit-user-id').value;
  const username = document.getElementById('u-username').value.trim();
  const fullname = document.getElementById('u-fullname').value.trim();
  const password = document.getElementById('u-password').value;
  const role     = document.getElementById('u-role').value;
  const active   = document.getElementById('u-active').value === '1';
  const errEl    = document.getElementById('user-modal-error');
  errEl.classList.add('d-none');
  const body = { username, fullname, role, active };
  if (password) body.password = password;
  if (!id) body.password = password;
  const url = id ? '/api/users/' + id : '/api/users';
  try {
    const res  = await fetch(url, { method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Virhe'; errEl.classList.remove('d-none'); return; }
    bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
    showToast(id ? 'Käyttäjä päivitetty!' : 'Käyttäjä luotu!', 'success');
    await loadUsers();
    if (id && parseInt(id) === currentUser?.id) {
      const meRes = await fetch('/api/me');
      if (meRes.ok) { currentUser = await meRes.json(); updateNavbarUser(); }
    }
  } catch (e) { errEl.textContent = 'Verkkovirhe: ' + e.message; errEl.classList.remove('d-none'); }
}

async function deleteUser(id, username) {
  if (!confirm('Poistetaanko käyttäjä "' + username + '"?')) return;
  try {
    const res  = await fetch('/api/users/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Poisto epäonnistui');
    showToast('Käyttäjä "' + username + '" poistettu', 'success');
    await loadUsers();
  } catch (e) { showToast('Virhe: ' + e.message, 'danger'); }
}

// =========================================
// Change password
// =========================================
async function changePassword() {
  const old = document.getElementById('pw-old').value;
  const nw  = document.getElementById('pw-new').value;
  const nw2 = document.getElementById('pw-new2').value;
  const errEl = document.getElementById('pw-error');
  errEl.classList.add('d-none');
  if (nw !== nw2) { errEl.textContent = 'Salasanat eivät täsmää'; errEl.classList.remove('d-none'); return; }
  try {
    const res  = await fetch('/api/change-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ old_password: old, new_password: nw }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Virhe'; errEl.classList.remove('d-none'); return; }
    bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide();
    showToast('Salasana vaihdettu!', 'success');
  } catch (e) { errEl.textContent = 'Verkkovirhe'; errEl.classList.remove('d-none'); }
}

// =========================================
// Helpers
// =========================================
function formatEur(n) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vuokrattuBadge(v) {
  if (!v) return '<span class="badge bg-secondary">-</span>';
  return v.toLowerCase() === 'kyllä'
    ? '<span class="badge badge-vuokrattu">Kyllä</span>'
    : '<span class="badge badge-vapaa">Ei</span>';
}

function tilaBadge(v) {
  if (!v) return '<span class="text-muted">-</span>';
  if (v.toLowerCase() === 'ok') return '<span class="badge badge-ok">OK</span>';
  if (v.toLowerCase().includes('selvitys')) return '<span class="badge badge-selvitys" title="' + esc(v) + '">Selvityksessä</span>';
  return '<span class="badge bg-secondary" title="' + esc(v) + '">' + esc(v.length > 14 ? v.substring(0, 14) + '...' : v) + '</span>';
}

function showToast(msg, type) {
  if (!type) type = 'success';
  const toast = document.getElementById('toast');
  const body  = document.getElementById('toast-body');
  toast.className = 'toast align-items-center text-white border-0 bg-' + type;
  body.textContent = msg;
  new bootstrap.Toast(toast, { delay: 3500 }).show();
}
