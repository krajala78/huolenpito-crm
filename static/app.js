// =========================================
// State
// =========================================
let allProperties = [];
let allArchived   = [];
let editingId     = null;
let viewingId     = null;
let currentUser   = null;  // { id, username, fullname, role }
let selectedKaupungit = [];

// =========================================
// Init
// =========================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
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
  } catch (e) {
    showLoginOverlay();
  }
}

function showLoginOverlay() {
  document.getElementById('login-overlay').classList.remove('d-none');
}

function hideLoginOverlay() {
  document.getElementById('login-overlay').classList.add('d-none');
}

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// Enter key on login fields
document.addEventListener('DOMContentLoaded', () => {
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  allProperties = [];
  allArchived   = [];
  selectedKaupungit = [];
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showLoginOverlay();
  showTab('dashboard');
}

function onAuthSuccess() {
  updateNavbarUser();
  loadStats();
  loadProperties();
  loadFilters();
  loadArchive();
  initTilitysForm();
  showTab('dashboard');
}

function updateNavbarUser() {
  const u = currentUser;
  if (!u) return;
  const navUser = document.getElementById('navbar-user');
  navUser.classList.remove('d-none');
  document.getElementById('nav-avatar').textContent = u.fullname[0].toUpperCase();
  document.getElementById('nav-fullname').textContent = u.fullname;
  const badge = document.getElementById('nav-role-badge');
  if (u.role === 'admin') {
    badge.textContent = 'Admin';
    badge.className = 'nav-role-badge nav-role-admin';
    document.getElementById('nav-kayttajat').classList.remove('d-none');
  } else {
    badge.textContent = 'Käyttäjä';
    badge.className = 'nav-role-badge nav-role-user';
    document.getElementById('nav-kayttajat').classList.add('d-none');
  }
}

// =========================================
// Tab navigation
// =========================================
function showTab(tab) {
  const tabs = ['dashboard', 'kohteet', 'tuonti', 'kayttajat', 'arkisto', 'tilitys'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('d-none', t !== tab);
  });

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  // Map tab names to nav-link index
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  const map = { dashboard: 0, kohteet: 1, arkisto: 3, tilitys: 4, tuonti: 5 };
  if (map[tab] !== undefined && navLinks[map[tab]]) {
    navLinks[map[tab]].classList.add('active');
  }

  if (tab === 'kayttajat' && currentUser?.role === 'admin') {
    loadUsers();
  }
  if (tab === 'arkisto') {
    renderArchiveTable(allArchived);
  }
}

// =========================================
// Stats / Dashboard
// =========================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.status === 401) { showLoginOverlay(); return; }
    const d = await res.json();
    document.getElementById('stat-total').textContent          = d.total ?? '–';
    document.getElementById('stat-vuokrattu').textContent      = d.vuokrattu ?? '–';
    document.getElementById('stat-vapaat').textContent         = d.vapaat ?? '–';
    document.getElementById('stat-vuokra').textContent         = formatEur(d.vuokra_sum);
    document.getElementById('stat-vuokramarkkinalla').textContent = d.vuokramarkkinalla ?? '–';
    const huolEl = document.getElementById('stat-huolenpidossa');
    if (huolEl) huolEl.textContent = d.huolenpidossa ?? '–';
    renderVastuuhenkiloStats(d.per_vastuuhenkilo || []);
    renderTilaStats(d.per_tila || []);
  } catch (e) {
    console.error('Stats error:', e);
  }
}

function renderVastuuhenkiloStats(items) {
  const el = document.getElementById('vastuuhenkilo-stats');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="text-muted text-center py-3">Ei dataa.</div>';
    return;
  }
  const max = Math.max(...items.map(i => i.total || 0), 1);
  el.innerHTML = items.map(i => {
    const pct = Math.round(((i.total || 0) / max) * 100);
    const vuokrattuPct = i.total ? Math.round((i.vuokrattu / i.total) * 100) : 0;
    return `
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="small fw-semibold">${esc(i.vastuuhenkilo || '(ei asetettu)')}</span>
          <span class="small text-muted">${i.total} kpl &bull; ${vuokrattuPct}% vuokrattu</span>
        </div>
        <div class="progress">
          <div class="progress-bar bg-primary" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTilaStats(items) {
  const el = document.getElementById('tila-stats');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="text-muted text-center py-3">Ei dataa.</div>';
    return;
  }
  const total = items.reduce((s, i) => s + (i.count || 0), 0) || 1;
  const colors = ['bg-success', 'bg-warning', 'bg-danger', 'bg-info', 'bg-secondary', 'bg-primary'];
  el.innerHTML = items.map((i, idx) => {
    const pct = Math.round(((i.count || 0) / total) * 100);
    return `
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="small fw-semibold">${esc(i.asunnon_tila || '(ei asetettu)')}</span>
          <span class="small text-muted">${i.count} kpl (${pct}%)</span>
        </div>
        <div class="progress">
          <div class="progress-bar ${colors[idx % colors.length]}" style="width:${pct}%"></div>
        </div>
      </div>`;
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
  } catch (e) {
    showToast('Kohteiden lataus epäonnistui', 'danger');
  }
}

function renderTable(props) {
  const tbody = document.getElementById('properties-tbody');
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = `${props.length} kohdetta`;

  if (props.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">Ei kohteita. Lisää uusi kohde tai tuo Excel-tiedosto.</td></tr>';
    return;
  }

  tbody.innerHTML = props.map(p => `
    <tr onclick="viewProperty(${p.id})" title="Klikkaa nähdäksesi tiedot" style="cursor:pointer">
      <td>
        <div class="fw-semibold">${esc(p.kohde_osoite || '–')}</div>
        ${p.kaupunki ? `<small class="text-muted">${esc(p.kaupunki)} ${esc(p.postinumero || '')}</small>` : ''}
      </td>
      <td>${esc(p.omistaja || '–')}</td>
      <td><span class="text-muted small">${esc(p.tyyppi || '–')}</span></td>
      <td class="text-center">${p.koko ? p.koko + ' m²' : '–'}</td>
      <td class="text-center">${vuokrattuBadge(p.vuokrattu)}</td>
      <td>${esc(p.vuokralaisen_nimi || '–')}</td>
      <td class="text-end fw-semibold">${p.kokonaisumma ? formatEur(p.kokonaisumma) : '–'}</td>
      <td>${tilaBadge(p.asunnon_tila)}</td>
      <td>${esc(p.vastuuhenkilo || '–')}</td>
      <td class="text-center" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${p.id})" title="Muokkaa">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="archiveProperty(${p.id})" title="Arkistoi">
          <i class="bi bi-archive"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// =========================================
// Filters
// =========================================
async function loadFilters() {
  try {
    const res = await fetch('/api/filters');
    if (!res.ok) return;
    const d = await res.json();

    // Kaupunki multiselect dropdown
    const menu = document.getElementById('kaupunki-menu');
    if (menu) {
      // Remove all items after the static divider (keep first 2: clear + divider)
      while (menu.children.length > 2) menu.removeChild(menu.lastChild);
      d.kaupungit.forEach(k => {
        const li = document.createElement('li');
        li.innerHTML = `
          <label class="dropdown-item small py-1 d-flex align-items-center gap-2" style="cursor:pointer">
            <input type="checkbox" class="form-check-input mt-0" value="${esc(k)}"
              onchange="toggleKaupunki('${esc(k)}')">
            ${esc(k)}
          </label>`;
        menu.appendChild(li);
      });
    }

    // Vastuuhenkilö select
    const vSel = document.getElementById('filter-vastuuhenkilo');
    if (vSel) {
      while (vSel.options.length > 1) vSel.remove(1);
      d.vastuuhenkilot.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        vSel.appendChild(opt);
      });
    }
  } catch (e) { /* silent */ }
}

function toggleKaupunki(kaupunki) {
  const idx = selectedKaupungit.indexOf(kaupunki);
  if (idx === -1) selectedKaupungit.push(kaupunki);
  else selectedKaupungit.splice(idx, 1);
  updateKaupunkiLabel();
  filterProperties();
}

function updateKaupunkiLabel() {
  const lbl = document.getElementById('kaupunki-label');
  if (!lbl) return;
  if (selectedKaupungit.length === 0) {
    lbl.textContent = 'Kaikki';
  } else if (selectedKaupungit.length === 1) {
    lbl.textContent = selectedKaupungit[0];
  } else {
    lbl.textContent = `${selectedKaupungit.length} kaupunkia`;
  }
}

function clearKaupunkiFilter() {
  selectedKaupungit = [];
  // Uncheck all checkboxes in the menu
  document.querySelectorAll('#kaupunki-menu input[type=checkbox]').forEach(cb => {
    cb.checked = false;
  });
  updateKaupunkiLabel();
  filterProperties();
}

function filterProperties() {
  const search        = document.getElementById('search-input')?.value.toLowerCase() || '';
  const vuokrattu     = document.getElementById('filter-vuokrattu')?.value || '';
  const vastuuhenkilo = document.getElementById('filter-vastuuhenkilo')?.value || '';

  const filtered = allProperties.filter(p => {
    const matchSearch = !search || [
      p.kohde_osoite, p.omistaja, p.vuokralaisen_nimi,
      p.vuokranantajan_kontakti, p.kaupunki, p.tyyppi,
      p.asunnon_tila, p.vastuuhenkilo, p.postinumero, p.lisatietoja,
    ].some(v => v && v.toLowerCase().includes(search));

    const matchVuokrattu     = !vuokrattu     || (p.vuokrattu || '').toLowerCase() === vuokrattu.toLowerCase();
    const matchKaupunki      = selectedKaupungit.length === 0 || selectedKaupungit.includes(p.kaupunki);
    const matchVastuuhenkilo = !vastuuhenkilo || p.vastuuhenkilo === vastuuhenkilo;

    return matchSearch && matchVuokrattu && matchKaupunki && matchVastuuhenkilo;
  });
  renderTable(filtered);
}

function clearFilters() {
  const si = document.getElementById('search-input');
  const fv = document.getElementById('filter-vuokrattu');
  const fh = document.getElementById('filter-vastuuhenkilo');
  if (si) si.value = '';
  if (fv) fv.value = '';
  if (fh) fh.value = '';
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
  } catch (e) {
    console.error('Archive load error:', e);
  }
}

function renderArchiveTable(items) {
  const tbody   = document.getElementById('archive-tbody');
  const countEl = document.getElementById('archive-count');
  if (!tbody) return;
  if (countEl) countEl.textContent = `${items.length} arkistoitua kohdetta`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">Ei arkistoituja kohteita.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(p => `
    <tr>
      <td><div class="fw-semibold">${esc(p.kohde_osoite || '–')}</div></td>
      <td>${esc(p.omistaja || '–')}</td>
      <td>${esc(p.kaupunki || '–')}</td>
      <td>${esc(p.vuokralaisen_nimi || '–')}</td>
      <td>${esc(p.vastuuhenkilo || '–')}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-success me-1" onclick="restoreProperty(${p.id})" title="Palauta aktiiviseksi">
          <i class="bi bi-arrow-counterclockwise me-1"></i>Palauta
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="hardDeleteProperty(${p.id})" title="Poista pysyvästi">
          <i class="bi bi-trash me-1"></i>Poista pysyvästi
        </button>
      </td>
    </tr>
  `).join('');
}

function filterArchive() {
  const search = document.getElementById('archive-search')?.value.toLowerCase() || '';
  if (!search) { renderArchiveTable(allArchived); return; }
  const filtered = allArchived.filter(p =>
    [p.kohde_osoite, p.omistaja, p.kaupunki, p.vuokralaisen_nimi, p.vastuuhenkilo]
      .some(v => v && v.toLowerCase().includes(search))
  );
  renderArchiveTable(filtered);
}

async function archiveProperty(id) {
  const p    = allProperties.find(x => x.id === id);
  const name = p ? p.kohde_osoite : 'kohde';
  if (!confirm(`Arkistoidaanko kohde "${name}"?\n\nKohde poistetaan päälistalta ja tilastoista. Voit palauttaa sen arkistosta.`)) return;
  try {
    const res = await fetch(`/api/properties/${id}/archive`, { method: 'PUT' });
    if (!res.ok) throw new Error('Arkistointi epäonnistui');
    showToast('Kohde arkistoitu', 'success');
    await loadProperties();
    await loadArchive();
    await loadStats();
  } catch (e) {
    showToast('Virhe: ' + e.message, 'danger');
  }
}

async function restoreProperty(id) {
  const p    = allArchived.find(x => x.id === id);
  const name = p ? p.kohde_osoite : 'kohde';
  if (!confirm(`Palautetaanko kohde "${name}" takaisin aktiiviseksi?`)) return;
  try {
    const res = await fetch(`/api/properties/${id}/restore`, { method: 'PUT' });
    if (!res.ok) throw new Error('Palautus epäonnistui');
    showToast('Kohde palautettu aktiiviseksi', 'success');
    await loadProperties();
    await loadArchive();
    await loadStats();
  } catch (e) {
    showToast('Virhe: ' + e.message, 'danger');
  }
}

async function hardDeleteProperty(id) {
  const p    = allArchived.find(x => x.id === id);
  const name = p ? p.kohde_osoite : 'kohde';
  if (!confirm(`POISTETAANKO PYSYVÄSTI kohde "${name}"?\n\nTätä toimintoa EI voi peruuttaa. Kaikki tiedot menetetään.`)) return;
  try {
    const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Poisto epäonnistui');
    showToast('Kohde poistettu pysyvästi', 'success');
    await loadArchive();
    await loadStats();
  } catch (e) {
    showToast('Virhe: ' + e.message, 'danger');
  }
}

// =========================================
// Excel export
// =========================================
function exportExcel() {
  window.location = '/api/export';
}

// =========================================
// Tilitysraportit
// =========================================
function initTilitysForm() {
  const sel = document.getElementById('tilitys-vuosi');
  if (!sel) return;
  const now   = new Date();
  const year  = now.getFullYear();
  sel.innerHTML = '';
  for (let y = year - 2; y <= year + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === year) opt.selected = true;
    sel.appendChild(opt);
  }
  // Default month to current
  const kuukausiSel = document.getElementById('tilitys-kuukausi');
  if (kuukausiSel) kuukausiSel.value = String(now.getMonth() + 1);
}

function generateTilitysraportti() {
  const vuosi    = document.getElementById('tilitys-vuosi')?.value;
  const kuukausi = document.getElementById('tilitys-kuukausi')?.value;
  if (!vuosi || !kuukausi) { showToast('Valitse vuosi ja kuukausi', 'warning'); return; }
  window.location = `/api/tilitysraportti?vuosi=${vuosi}&kuukausi=${kuukausi}`;
}

// =========================================
// View property
// =========================================
function viewProperty(id) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  viewingId = id;
  document.getElementById('view-modal-title').innerHTML =
    `<i class="bi bi-house-door me-2 text-primary"></i>${esc(p.kohde_osoite || 'Kohde')}`;

  const sections = [
    { title: 'Kohteen tiedot', icon: 'bi-geo-alt', fields: [
      ['Osoite', p.kohde_osoite], ['Tyyppi', p.tyyppi],
      ['Koko', p.koko ? p.koko + ' m²' : null], ['Kaupunki', p.kaupunki],
      ['Postinumero', p.postinumero], ['Asunnon tila', p.asunnon_tila],
    ]},
    { title: 'Omistajatiedot', icon: 'bi-person-vcard', fields: [
      ['Omistaja', p.omistaja], ['Kontakti', p.vuokranantajan_kontakti],
      ['Sähköposti', p.vuokranantajan_sahkoposti], ['Puhelin', p.vuokranantajan_puhelin],
      ['Vuokravälittäjä', p.vuokravalittaja], ['Vastuuhenkilö', p.vastuuhenkilo],
    ]},
    { title: 'Sopimus & laskutus', icon: 'bi-file-text', fields: [
      ['Huolenpitosopimus', p.huolenpitosopimus], ['Huolenpidossa', p.huolenpidossa],
      ['Vuokrauksessa', p.vuokrauksessa], ['Laskutusperuste', p.laskutusperuste],
      ['Laskutuksen status', p.laskutuksen_status], ['Vuokratilitykset', p.vuokratilitykset],
    ]},
    { title: 'Vuokrasopimus', icon: 'bi-calendar-range', fields: [
      ['Alkaa', p.vuokrasopimus_alkaen], ['Päättyy', p.vuokrasopimus_paattyy],
      ['Vuokrattu', p.vuokrattu], ['Vuokramarkkinalla', p.vuokramarkkinalla],
    ]},
    { title: 'Vuokralaistiedot', icon: 'bi-people', fields: [
      ['Nimi', p.vuokralaisen_nimi], ['Puhelin', p.vuokralaisen_puhelin],
      ['Sähköposti', p.vuokralaisen_sahkoposti],
    ]},
    { title: 'Maksutiedot', icon: 'bi-currency-euro', fields: [
      ['Vuokra sop. alussa', p.vuokra_alussa ? formatEur(p.vuokra_alussa) : null],
      ['Vuokra tänään', p.vuokra_tanaan ? formatEur(p.vuokra_tanaan) : null],
      ['Vesimaksut', p.vesimaksut ? formatEur(p.vesimaksut) : null],
      ['Muut maksut', p.muut_maksut], ['Saunamaksut', p.saunamaksut],
      ['Kokonaissumma', p.kokonaisumma ? formatEur(p.kokonaisumma) : null],
    ]},
    { title: 'Vakuus & avaimet', icon: 'bi-shield-lock', fields: [
      ['Vuokravakuus', p.vuokravakuus ? formatEur(p.vuokravakuus) : null],
      ['Vakuuden maksupv.', p.vakuuden_maksupv],
      ['Kenen tilillä vakuus', p.kenen_tililla_vakuus],
      ['Avaimet luovutettu', p.avaimet_luovutettu],
      ['Avainten lkm yhteensä', p.avainten_lkm],
      ['Avainten luovutettu lkm', p.avainten_luovutettu_lkm],
      ['Takuupalvelu', p.takuupalvelu],
      ['Vesimittari luettu', p.vesimittari_luettu],
    ]},
    { title: 'Välitystiedot', icon: 'bi-receipt', fields: [
      ['Välitys laskutettu', p.valitys_laskutettu],
      ['Välityslaskun päivämäärä', p.valitys_laskutettu_pvm],
      ['Välityshinta', p.valityshinta ? formatEur(p.valityshinta) : null],
    ]},
  ];

  const html = sections.map(s => {
    const rows = s.fields
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([label, val]) => `
        <div class="col-6 col-md-4 mb-2">
          <div class="text-muted small">${label}</div>
          <div class="fw-semibold">${esc(String(val))}</div>
        </div>`).join('');
    if (!rows) return '';
    return `
      <div class="form-section mb-3">
        <h6 class="form-section-title">
          <i class="bi ${s.icon} me-2 text-primary"></i>${s.title}
        </h6>
        <div class="row">${rows}</div>
      </div>`;
  }).join('');

  document.getElementById('view-modal-body').innerHTML =
    html + (p.lisatietoja ? `
      <div class="form-section mb-3">
        <h6 class="form-section-title"><i class="bi bi-chat-text me-2 text-primary"></i>Lisätiedot</h6>
        <p class="mb-0">${esc(p.lisatietoja)}</p>
      </div>` : '');

  document.getElementById('view-edit-btn').onclick = () => {
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
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modal-title').innerHTML =
    `<i class="bi bi-pencil me-2"></i>Muokkaa: ${esc(p.kohde_osoite || '')}`;
  document.getElementById('f-id').value = id;

  const fields = [
    'kohde_osoite','omistaja','vuokranantajan_kontakti','vuokranantajan_sahkoposti',
    'vuokranantajan_puhelin','tyyppi','koko','kaupunki','postinumero',
    'huolenpitosopimus','huolenpidossa','vuokrauksessa','vuokravalittaja',
    'vastuuhenkilo','laskutusperuste','laskutuksen_status','vuokratilitykset',
    'vuokrasopimus_alkaen','vuokrasopimus_paattyy','vuokrattu','vuokramarkkinalla',
    'asunnon_tila','vuokralaisen_nimi','vuokralaisen_puhelin','vuokralaisen_sahkoposti',
    'vuokra_alussa','vuokra_tanaan','vesimaksut','muut_maksut','saunamaksut',
    'kokonaisumma','vuokravakuus','vakuuden_maksupv','kenen_tililla_vakuus',
    'avaimet_luovutettu','avainten_lkm','avainten_luovutettu_lkm','takuupalvelu',
    'vesimittari_luettu','valitys_laskutettu','valitys_laskutettu_pvm','valityshinta','lisatietoja',
  ];
  fields.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (!el) return;
    const v = p[f];
    el.value = (v !== null && v !== undefined) ? v : '';
  });
  new bootstrap.Modal(document.getElementById('propertyModal')).show();
}

async function saveProperty() {
  const form = document.getElementById('property-form');
  if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
  form.classList.remove('was-validated');

  const numFields = [
    'koko','vuokra_alussa','vuokra_tanaan','vesimaksut','kokonaisumma',
    'vuokravakuus','valityshinta','avainten_lkm','avainten_luovutettu_lkm',
  ];
  const fields = [
    'kohde_osoite','omistaja','vuokranantajan_kontakti','vuokranantajan_sahkoposti',
    'vuokranantajan_puhelin','tyyppi','koko','kaupunki','postinumero',
    'huolenpitosopimus','huolenpidossa','vuokrauksessa','vuokravalittaja',
    'vastuuhenkilo','laskutusperuste','laskutuksen_status','vuokratilitykset',
    'vuokrasopimus_alkaen','vuokrasopimus_paattyy','vuokrattu','vuokramarkkinalla',
    'asunnon_tila','vuokralaisen_nimi','vuokralaisen_puhelin','vuokralaisen_sahkoposti',
    'vuokra_alussa','vuokra_tanaan','vesimaksut','muut_maksut','saunamaksut',
    'kokonaisumma','vuokravakuus','vakuuden_maksupv','kenen_tililla_vakuus',
    'avaimet_luovutettu','avainten_lkm','avainten_luovutettu_lkm','takuupalvelu',
    'vesimittari_luettu','valitys_laskutettu','valitys_laskutettu_pvm','valityshinta','lisatietoja',
  ];
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (!el) return;
    const v = el.value.trim();
    data[f] = v === '' ? null : numFields.includes(f) ? (parseFloat(v) || null) : v;
  });

  const isEdit = !!editingId;
  const url    = isEdit ? `/api/properties/${editingId}` : '/api/properties';
  try {
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Virhe');
    bootstrap.Modal.getInstance(document.getElementById('propertyModal')).hide();
    showToast(isEdit ? 'Kohde päivitetty!' : 'Kohde lisätty!', 'success');
    await loadProperties();
    await loadStats();
    await loadFilters();
  } catch (e) {
    showToast('Virhe: ' + e.message, 'danger');
  }
}

// =========================================
// Excel import
// =========================================
let selectedFile = null;

function handleFileSelect(event) {
  selectedFile = event.target.files[0];
  updateFileDisplay();
}

function handleDrop(event) {
  event.preventDefault();
  selectedFile = event.dataTransfer.files[0];
  updateFileDisplay();
}

function updateFileDisplay() {
  const btn    = document.getElementById('import-btn');
  const nameEl = document.getElementById('selected-filename');
  if (selectedFile) {
    nameEl.textContent = selectedFile.name;
    btn.disabled = false;
  } else {
    nameEl.textContent = 'Ei tiedostoa valittuna';
    btn.disabled = true;
  }
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
    let html = `<div class="alert alert-success mb-2">
      <i class="bi bi-check-circle me-1"></i><strong>${data.message}</strong></div>`;
    if (data.errors && data.errors.length > 0) {
      html += `<div class="alert alert-warning mb-0"><strong>Varoitukset:</strong>
        <ul class="mb-0 mt-1">${data.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    }
    resultEl.innerHTML = html;
    selectedFile = null;
    document.getElementById('selected-filename').textContent = 'Ei tiedostoa valittuna';
    document.getElementById('import-btn').disabled = true;
    document.getElementById('excel-file-input').value = '';
    await loadProperties();
    await loadStats();
    await loadFilters();
    showToast(`Tuotu $