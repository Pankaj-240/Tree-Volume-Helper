// script.js — optimized version (no export CSV, no dataStatus writes)
const DATA_JSON = 'book_data.json';
let bookPoints = [];
let bookMap = new Map(); // for fast lookup: key -> vol
const STORAGE_KEY = 'tree_volume_entries_v1';
let LAST_ADDED_ID = null;

/* ---------- Helpers ---------- */
const el = id => document.getElementById(id);
const toNum = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
const saveEntries = entries => localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
const loadEntries = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (e) { return []; }
};

const isMobileView = () => window.matchMedia('(max-width: 800px)').matches;

/* Create key for circ+len pair (normalized) */
const keyFor = (circ, len) => `${Number(circ)}|${Number(len)}`;

/* build lookup map from loaded bookPoints */
function buildBookMap() {
  bookMap = new Map();
  for (const p of bookPoints) {
    const k = keyFor(p.circ, p.len);
    if (!bookMap.has(k)) bookMap.set(k, p.vol);
  }
}

/* O(1) volume lookup */
function findExactVolume(circ, len) {
  return bookMap.get(keyFor(circ, len)) ?? null;
}

/* ---------- CRUD & Rendering ---------- */

/* Remove entry with animation request */
function requestDeleteEntry(createdAt) {
  const container = el('speciesList');
  if (!container) { deleteEntry(createdAt); return; }
  const rows = container.querySelectorAll(`[data-id="${createdAt}"]`);
  if (!rows.length) { deleteEntry(createdAt); return; }
  rows.forEach(r => r.classList.add('flash-removed'));
  setTimeout(() => deleteEntry(createdAt), 480); // match CSS animation (~450ms)
}

/* Delete from storage + re-render */
function deleteEntry(createdAt) {
  const entries = loadEntries().filter(e => e.createdAt !== createdAt);
  saveEntries(entries);
  renderSpeciesList();
  const ra = el('resultArea');
  if (ra) { ra.textContent = '🗑️ Entry deleted.'; ra.classList.add('pulse'); setTimeout(()=> ra.classList.remove('pulse'),700); }
}

/* compute species sums quickly */
function computeSpeciesSums(entries) {
  const sums = Object.create(null);
  for (const e of entries) {
    const sp = e.species || 'Unknown';
    sums[sp] = (sums[sp] || 0) + Number(e.vol || 0);
  }
  return sums;
}

/* Efficient renderer using DocumentFragment and event delegation */
function renderSpeciesList() {
  const container = el('speciesList');
  if (!container) return;

  const entries = loadEntries();
  container.innerHTML = ''; // clear once

  if (!entries.length) {
    container.innerHTML = '<div class="small">No entries yet</div>';
    return;
  }

  // group by species
  const bySpecies = Object.create(null);
  for (const e of entries) {
    const sp = e.species || 'Unknown';
    if (!bySpecies[sp]) bySpecies[sp] = [];
    bySpecies[sp].push(e);
  }

  // stable sorted species list (nice UX)
  const speciesNames = Object.keys(bySpecies).sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));

  const frag = document.createDocumentFragment();
  const colorCount = 6;
  let idx = 0;

  for (const s of speciesNames) {
    const rows = bySpecies[s];
    const speciesWrap = document.createElement('div');
    speciesWrap.className = `species-block species-color-${idx % colorCount}`;
    idx++;

    // heading: "Name(count)"
    const heading = document.createElement('div');
    heading.className = 'species-heading';
    heading.innerHTML = `<div><strong>${escapeHtml(s)}</strong></div><div class="count">(${rows.length})</div>`;
    speciesWrap.appendChild(heading);

    // build table (render table on both mobile & desktop for consistency)
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>L (m)</th><th>Circ (m)</th><th>Volume</th><th></th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let sum = 0;
    for (const r of rows) {
      sum += Number(r.vol || 0);
      const tr = document.createElement('tr');
      tr.dataset.id = r.createdAt;
      const tdL = `<td>${escapeHtml(String(r.len))}</td>`;
      const tdC = `<td>${escapeHtml(String(r.circ))}</td>`;
      const tdV = `<td>${escapeHtml(Number(r.vol).toFixed(4))}</td>`;
      const tdDel = `<td><button class="del-btn" data-id="${escapeHtml(r.createdAt)}" title="Delete entry">❌</button></td>`;
      tr.innerHTML = tdL + tdC + tdV + tdDel;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    tfoot.innerHTML = `<tr><td colspan="2" class="sum">Total</td><td class="sum">${sum.toFixed(4)}</td><td></td></tr>`;
    table.appendChild(tfoot);

    speciesWrap.appendChild(table);
    frag.appendChild(speciesWrap);
  }

  // "All tables" summary if >1 species
  const speciesSums = computeSpeciesSums(entries);
  const namesForSummary = Object.keys(speciesSums);
  if (namesForSummary.length > 1) {
    const summaryWrap = document.createElement('div');
    summaryWrap.style.marginTop = '0.8rem';
    const h4 = document.createElement('h4');
    h4.style.margin = '0 0 0.4rem 0';
    h4.textContent = 'All tables summary';
    summaryWrap.appendChild(h4);

    const stableNames = namesForSummary.sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
    const sumTable = document.createElement('table');
    sumTable.innerHTML = `<thead><tr><th>Table (Species)</th><th>Sum (Volume)</th></tr></thead>`;
    const sumBody = document.createElement('tbody');
    let grand = 0;
    for (const name of stableNames) {
      const ssum = Number(speciesSums[name] || 0);
      grand += ssum;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td>${ssum.toFixed(4)}</td>`;
      sumBody.appendChild(tr);
    }
    sumTable.appendChild(sumBody);
    const sumFoot = document.createElement('tfoot');
    sumFoot.innerHTML = `<tr><td class="sum">Grand Total</td><td class="sum">${grand.toFixed(4)}</td></tr>`;
    sumTable.appendChild(sumFoot);
    summaryWrap.appendChild(sumTable);
    frag.appendChild(summaryWrap);
  }

  container.appendChild(frag);

  // highlight recently added
  if (LAST_ADDED_ID) {
    const newly = container.querySelectorAll(`[data-id="${LAST_ADDED_ID}"]`);
    if (newly.length) {
      newly.forEach(n => { n.classList.add('flash-added'); setTimeout(()=> n.classList.remove('flash-added'), 700); });
      const ra = el('resultArea'); if (ra) { ra.classList.add('pulse'); setTimeout(()=> ra.classList.remove('pulse'),700); }
    }
    LAST_ADDED_ID = null;
  }
}

/* ---------- Add ---------- */
function addEntry(species, len, circ, vol, createdAt) {
  const entries = loadEntries();
  entries.push({ species, len: Number(len), circ: Number(circ), vol: Number(vol), createdAt: createdAt || new Date().toISOString() });
  saveEntries(entries);
  renderSpeciesList();
}

/* ---------- Load book data ---------- */
async function loadBookData() {
  try {
    const res = await fetch(DATA_JSON, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    bookPoints = data.map(p => ({ circ: Number(p.circ), len: Number(p.len), vol: Number(p.vol) }))
      .filter(p => !isNaN(p.circ) && !isNaN(p.len) && !isNaN(p.vol));
    buildBookMap();
    // intentionally not writing to DOM here (dataStatus removed)
  } catch (err) {
    const cn = el('calcNotice'); if (cn) cn.textContent = 'Please make sure book_data.json is in the same folder.';
    console.error('loadBookData error:', err);
  }
}

/* ---------- Utilities ---------- */
/* Small helper to escape text inserted into innerHTML */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* debounce helper */
function debounce(fn, wait = 120) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(()=> fn(...args), wait); };
}

/* ---------- Init & Events ---------- */
window.addEventListener('DOMContentLoaded', () => {
  // initial render
  renderSpeciesList();

  // Clear all
  const clearBtn = el('clearAll');
  if (clearBtn) clearBtn.addEventListener('click', ()=> {
    if (!confirm('Clear all saved entries?')) return;
    saveEntries([]);
    renderSpeciesList();
    const ra = el('resultArea'); if (ra) { ra.textContent = 'All entries cleared.'; ra.classList.add('pulse'); setTimeout(()=>ra.classList.remove('pulse'),700); }
  });

  // Add button
  const addBtn = el('addBtn');
  if (addBtn) addBtn.addEventListener('click', ()=> {
    const speciesEl = el('species');
    const lengthEl = el('length');
    const circEl = el('circ');
    const resultArea = el('resultArea');

    const species = (speciesEl && speciesEl.value ? speciesEl.value : 'Unknown').trim();
    const len = toNum(lengthEl ? lengthEl.value : null);
    const circ = toNum(circEl ? circEl.value : null);

    if (isNaN(len) || isNaN(circ)) { alert('Enter valid numbers for length and circumference.'); return; }

    const vol = findExactVolume(circ, len);

    if (vol === null || isNaN(vol)) {
      if (resultArea) resultArea.textContent = '❌ These parameters are not in the data file.';
      return;
    }

    const createdAt = new Date().toISOString();
    LAST_ADDED_ID = createdAt;
    addEntry(species, len, circ, Number(vol).toFixed(6), createdAt);

    if (resultArea) resultArea.textContent = `✅ Added: volume = ${Number(vol).toFixed(6)}`;
    if (lengthEl) lengthEl.value = '';
    if (circEl) circEl.value = '';
  });

  // Event delegation for delete buttons (faster than attaching many handlers)
  const speciesList = el('speciesList');
  if (speciesList) {
    speciesList.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('.del-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      requestDeleteEntry(id);
    });
  }

  // Rebuild book map after loading data
  loadBookData();

  // re-render on resize, debounced
  window.addEventListener('resize', debounce(() => { renderSpeciesList(); }, 140));

  // register service worker (one registration, on load)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('SW registered with scope:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    });
  }
});
