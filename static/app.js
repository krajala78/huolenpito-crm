// =========================================
// State
// =========================================
let allProperties = [];
let editingId = null;
let viewingId = null;

// =========================================
// Init
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadProperties();
  loadFilters();
  showTab('dashboard');
});

// =========================================
// Tab navigation
// =========================================
function showTab(tab) {
  ['dashboard', 'kohteet', 'tuonti'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('d-none', t !== tab);
  });
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const map = { dashboard: 0, kohteet: 1, tuonti: 3 };
  if (map[tab] !== undefined) {
    document.querySelectorAll('.nav-link')[map[tab]]?.classList.add('active');
  }
}

// =========================================
// Stats / Dashboard
// =========================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    document.getElementById('stat-total').textContent = d.total;
    document.getElementById('stat-vuokrattu').textContent = d.vuokrattu;
    document.getElementById('stat-vapaat').textContent = d.vapaat;
    document.getElementById('stat-vuokra').textContent = formatEur(d.vuokra_sum);
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// =========================================
// Properties list
// =========================================
async function loadProperties() {
  try {
    const res = await fetch('/api/properties');
    allProperties = await res.json();
    renderTable(allProperties);
    renderDashboardTable(allProperties.slice(0, 7));
  } catch (e) {
    showToast('Kohteiden lataus epäonnistui', 'danger');
  }
}

function renderTable(props) {
  const tbody = document.getElementById('properties-tbody');
  document.getElementById('result-count').textContent =
    `${props.length} kohdetta`;

  if (props.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">Ei kohteita. Lisää uusi kohde tai tuo Excel-tiedosto.</td></tr>';
    return;
  }

  tbody.innerHTML = props.map(p => `
    <tr onclick="viewProperty(${p.id})" title="Klikkaa nähdäksesi tiedot">
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
        <button class="btn btn-sm btn-outline-danger" onclick="deleteProperty(${p.id})" title="Poista">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderDashboardTable(props) {
  const tbody = document.getElementById('dashboard-tbody');
  if (props.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Ei dataa. Lisää kohteita tai tuo Excel.</td></tr>';
    return;
  }
  tbody.innerHTML = props.map(p => `
    <tr onclick="showTab('kohteet')" style="cursor:pointer" title="Siirry kohteet-näkymään">
      <td><div class="fw-semibold">${esc(p.kohde_osoite || '–')}</div></td>
      <td>${esc(p.omistaja || '–')}</td>
      <td><span class="text-muted small">${esc(p.tyyppi || '–')}</span></td>
      <td>${esc(p.vuokralaisen_nimi || '–')}</td>
      <td class="fw-semibold">${p.kokonaisumma ? formatEur(p.kokonaisumma) : '–'}</td>
      <td>${tilaBadge(p.asunnon_tila)}</td>
    </tr>
  `).join('');
}

// =========================================
// Filters
// =========================================
async function loadFilters() {
  try {
    const res = await fetch('/api/filters');
    const d = await res.json();
    const kSel = document.getElementById('filter-kaupunki');
    d.kaupungit.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      kSel.appendChild(opt);
    });
    const vSel = document.getElementById('filter-vastuuhenkilo');
    d.vastuuhenkilot.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      vSel.appendChild(opt);
    });
  } catch (e) { /* silent */ }
}

function filterProperties() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const vuokrattu = document.getElementById('filter-vuokrattu').value.toLowerCase();
  const kaupunki = document.getElementById('filter-kaupunki').value;
  const vastuuhenkilo = document.getElementById('filter-vastuuhenkilo').value;

  const filtered = allProperties.filter(p => {
    const matchSearch = !search || [
      p.kohde_osoite, p.omistaja, p.vuokralaisen_nimi, p.vuokranantajan_kontakti, p.kaupunki
    ].some(v => v && v.toLowerCase().includes(search));

    const matchVuokrattu = !vuokrattu ||
      (p.vuokrattu || '').toLowerCase() === vuokrattu;
    const matchKaupunki = !kaupunki || p.kaupunki === kaupunki;
    const matchVastuuhenkilo = !vastuuhenkilo || p.vastuuhenkilo === vastuuhenkilo;

    return matchSearch && matchVuokrattu && matchKaupunki && matchVastuuhenkilo;
  });

  renderTable(filtered);
}

function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-vuokrattu').value = '';
  document.getElementById('filter-kaupunki').value = '';
  document.getElementById('filter-vastuuhenkilo').value = '';
  renderTable(allProperties);
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
      ['Vesimittari luettu', p.vesimittari_luettu],
    ]},
    { title: 'Välitystiedot', icon: 'bi-receipt', fields: [
      ['Välitys laskutettu', p.valitys_laskutettu],
      ['Välityshinta', p.valityshinta ? formatEur(p.valityshinta) : null],
    ]},
  ];

  const html = sections.map(s => {
    const rows = s.fields.filter(([, v]) => v !== null && v !== undefined && v !== '')
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
// Add / Edit modal
// =========================================
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').innerHTML =
    '<i class="bi bi-house-add me-2"></i>Lisää uusi kohde';
  document.getElementById('property-form').reset();
  document.getElementById('f-id').value = '';
  new bootstrap.Modal(document.getElementById('propertyModal')).show();
  showTab('kohteet');
}

function openEditModal(id) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  document.getElementById('modal-title').innerHTML =
    `<i class="bi bi-pencil me-2"></i>Muokkaa: ${esc(p.kohde_osoite || '')}`;
  document.getElementById('f-id').value = id;

  const fields = [
    'kohde_osoite', 'omistaja', 'vuokranantajan_kontakti', 'vuokranantajan_sahkoposti',
    'vuokranantajan_puhelin', 'tyyppi', 'koko', 'kaupunki', 'postinumero',
    'huolenpitosopimus', 'huolenpidossa', 'vuokrauksessa', 'vuokravalittaja',
    'vastuuhenkilo', 'laskutusperuste', 'laskutuksen_status', 'vuokratilitykset',
    'vuokrasopimus_alkaen', 'vuokrasopimus_paattyy', 'vuokrattu', 'vuokramarkkinalla',
    'asunnon_tila', 'vuokralaisen_nimi', 'vuokralaisen_puhelin', 'vuokralaisen_sahkoposti',
    'vuokra_alussa', 'vuokra_tanaan', 'vesimaksut', 'muut_maksut', 'saunamaksut',
    'kokonaisumma', 'vuokravakuus', 'vakuuden_maksupv', 'kenen_tililla_vakuus',
    'avaimet_luovutettu', 'vesimittari_luettu', 'valitys_laskutettu', 'valityshinta',
    'lisatietoja',
  ];

  fields.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (!el) return;
    const v = p[f];
    if (el.tagName === 'SELECT') {
      el.value = v || '';
    } else {
      el.value = v !== null && v !== undefined ? v : '';
    }
  });

  new bootstrap.Modal(document.getElementById('propertyModal')).show();
}

async function saveProperty() {
  const form = document.getElementById('property-form');
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }
  form.classList.remove('was-validated');

  const numFields = ['koko', 'vuokra_alussa', 'vuokra_tanaan', 'vesimaksut',
    'kokonaisumma', 'vuokravakuus', 'valityshinta'];

  const data = {};
  const fields = [
    'kohde_osoite', 'omistaja', 'vuokranantajan_kontakti', 'vuokranantajan_sahkoposti',
    'vuokranantajan_puhelin', 'tyyppi', 'koko', 'kaupunki', 'postinumero',
    'huolenpitosopimus', 'huolenpidossa', 'vuokrauksessa', 'vuokravalittaja',
    'vastuuhenkilo', 'laskutusperuste', 'laskutuksen_status', 'vuokratilitykset',
    'vuokrasopimus_alkaen', 'vuokrasopimus_paattyy', 'vuokrattu', 'vuokramarkkinalla',
    'asunnon_tila', 'vuokralaisen_nimi', 'vuokralaisen_puhelin', 'vuokralaisen_sahkoposti',
    'vuokra_alussa', 'vuokra_tanaan', 'vesimaksut', 'muut_maksut', 'saunamaksut',
    'kokonaisumma', 'vuokravakuus', 'vakuuden_maksupv', 'kenen_tililla_vakuus',
    'avaimet_luovutettu', 'vesimittari_luettu', 'valitys_laskutettu', 'valityshinta',
    'lisatietoja',
  ];

  fields.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (!el) return;
    const v = el.value.trim();
    if (v === '') {
      data[f] = null;
    } else if (numFields.includes(f)) {
      data[f] = parseFloat(v) || null;
    } else {
      data[f] = v;
    }
  });

  const isEdit = !!editingId;
  const url = isEdit ? `/api/properties/${editingId}` : '/api/properties';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
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
// Delete
// =========================================
async function deleteProperty(id) {
  const p = allProperties.find(x => x.id === id);
  const name = p ? p.kohde_osoite : 'kohde';
  if (!confirm(`Poistetaanko kohde "${name}"?\n\nTätä toimintoa ei voi peruuttaa.`)) return;

  try {
    const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Poisto epäonnistui');
    showToast('Kohde poistettu', 'success');
    await loadProperties();
    await loadStats();
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
  const btn = document.getElementById('import-btn');
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
    const res = await fetch('/api/import', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Tuonti epäonnistui');

    let html = `<div class="alert alert-success mb-2">
      <i class="bi bi-check-circle me-1"></i>
      <strong>${data.message}</strong>
    </div>`;

    if (data.errors && data.errors.length > 0) {
      html += `<div class="alert alert-warning mb-0">
        <strong>Varoitukset:</strong>
        <ul class="mb-0 mt-1">${data.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      </div>`;
    }

    resultEl.innerHTML = html;
    selectedFile = null;
    document.getElementById('selected-filename').textContent = 'Ei tiedostoa valittuna';
    document.getElementById('import-btn').disabled = true;
    document.getElementById('excel-file-input').value = '';

    await loadProperties();
    await loadStats();
    await loadFilters();
    showToast(`Tuotu ${data.count} kohdetta!`, 'success');
  } catch (e) {
    resultEl.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-1"></i>${esc(e.message)}</div>`;
  }
}

// =========================================
// Helpers
// =========================================
function formatEur(n) {
  if (n === null || n === undefined) return '–';
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vuokrattuBadge(v) {
  if (!v) return '<span class="badge bg-secondary">–</span>';
  const lower = v.toLowerCase();
  if (lower === 'kyllä') return '<span class="badge badge-vuokrattu">Kyllä</span>';
  return '<span class="badge badge-vapaa">Ei</span>';
}

function tilaBadge(v) {
  if (!v) return '<span class="text-muted">–</span>';
  if (v.toLowerCase() === 'ok') return '<span class="badge badge-ok">OK</span>';
  if (v.toLowerCase().includes('selvitys')) return '<span class="badge badge-selvitys" title="' + esc(v) + '">Selvityksessä</span>';
  return `<span class="badge bg-secondary" title="${esc(v)}">${esc(v.length > 14 ? v.substring(0, 14) + '…' : v)}</span>`;
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const body = document.getElementById('toast-body');
  toast.className = `toast align-items-center text-white border-0 bg-${type}`;
  body.textContent = msg;
  new bootstrap.Toast(toast, { delay: 3000 }).show();
}
