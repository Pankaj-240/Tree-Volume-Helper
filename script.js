// script.js (updated - defensive & GitHub Pages friendly)

const DATA_JSON = 'book_data.json'; 
let bookPoints = []; 
const STORAGE_KEY = 'tree_volume_entries_v1';

// Utility helpers
const el = id => document.getElementById(id);
function toNum(v){ return (v === null || v === undefined || v === '') ? NaN : Number(v); }
function saveEntries(entries){ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function loadEntries(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; } }

// Find volume ONLY if exact data exists
function findExactVolume(circ, len){
  for(const p of bookPoints){
    if (Number(p.circ) === Number(circ) && Number(p.len) === Number(len)){
      return p.vol;
    }
  }
  return null;
}

// Delete a single entry by its timestamp
function deleteEntry(createdAt){
  const entries = loadEntries().filter(e => e.createdAt !== createdAt);
  saveEntries(entries);
  renderSpeciesList();
  const ra = el('resultArea'); if(ra) ra.textContent = '🗑️ Entry deleted.';
}

// Renders species-wise tables and totals with delete button
function renderSpeciesList(){
  const container = el('speciesList');
  if(!container) return;
  const entries = loadEntries();
  const bySpecies = {};

  for(const e of entries){
    if(!bySpecies[e.species]) bySpecies[e.species] = [];
    bySpecies[e.species].push(e);
  }

  container.innerHTML = '';
  if(Object.keys(bySpecies).length === 0){
    container.innerHTML = '<div class="small">No entries yet</div>';
    return;
  }

  for(const s of Object.keys(bySpecies)){
    const rows = bySpecies[s];
    let html = `<div style="margin-bottom:0.6rem;"><strong>${s}</strong> — ${rows.length} entries<br>`;
    html += `<table><thead><tr><th>L (m)</th><th>Circ (m)</th><th>Volume</th><th></th></tr></thead><tbody>`;
    let sum = 0;
    for(const r of rows){
      sum += Number(r.vol || 0);
      html += `
        <tr>
          <td>${r.len}</td>
          <td>${r.circ}</td>
          <td>${Number(r.vol).toFixed(4)}</td>
          <td>
            <button class="del-btn" data-id="${r.createdAt}" title="Delete entry">❌</button>
          </td>
        </tr>`;
    }
    html += `</tbody><tfoot><tr><td colspan="2" class="sum">Total</td><td class="sum">${sum.toFixed(4)}</td><td></td></tr></tfoot></table></div>`;
    container.innerHTML += html;
  }

  // Attach delete button events
  document.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteEntry(id);
    });
  });
}

// Add new entry (only when exact data found)
function addEntry(species, len, circ, vol){
  const entries = loadEntries();
  entries.push({
    species, len: Number(len), circ: Number(circ), vol: Number(vol), createdAt: new Date().toISOString()
  });
  saveEntries(entries);
  renderSpeciesList();
}

// Load book_data.json
async function loadBookData(){
  try {
    const res = await fetch(DATA_JSON, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    bookPoints = data
      .map(p => ({ circ: Number(p.circ), len: Number(p.len), vol: Number(p.vol) }))
      .filter(p => !isNaN(p.circ) && !isNaN(p.len) && !isNaN(p.vol));
    const ds = el('dataStatus'); if(ds) ds.textContent = `Loaded ${bookPoints.length} entries from ${DATA_JSON}`;
  } catch (err){
    const ds = el('dataStatus'); if(ds) ds.textContent = '⚠️ Failed to load book_data.json';
    const cn = el('calcNotice'); if(cn) cn.textContent = 'Please make sure book_data.json is in the same folder.';
    console.error('loadBookData error:', err);
  }
}

// DOM-ready initialization
window.addEventListener('DOMContentLoaded', () => {
  // Render saved entries (safe guard)
  renderSpeciesList();

  // Wire up UI elements safely (check existence)
  const clearBtn = el('clearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', ()=> {
      if(!confirm('Clear all saved entries?')) return;
      saveEntries([]);
      renderSpeciesList();
      const ra = el('resultArea'); if(ra) ra.textContent = 'All entries cleared.';
    });
  }

  const addBtn = el('addBtn');
  if (addBtn) {
    addBtn.addEventListener('click', ()=> {
      const speciesEl = el('species');
      const lengthEl = el('length');
      const circEl = el('circ');
      const resultArea = el('resultArea');

      const species = (speciesEl && speciesEl.value ? speciesEl.value : 'Unknown').trim();
      const len = toNum(lengthEl ? lengthEl.value : null);
      const circ = toNum(circEl ? circEl.value : null);

      if(isNaN(len) || isNaN(circ)){
        alert('Enter valid numbers for length and circumference.');
        return;
      }

      const vol = findExactVolume(circ, len);

      if(vol === null || isNaN(vol)){
        if(resultArea) resultArea.textContent = '❌ These parameters are not in the data file.';
        return;
      }

      addEntry(species, len, circ, Number(vol).toFixed(6));
      if(resultArea) resultArea.textContent = `✅ Added: volume = ${Number(vol).toFixed(6)}`;
    });
  }

  // Load the data file after DOM ready
  loadBookData();

  // Register service worker: use relative path to avoid 404 on GitHub repo pages
  if ('serviceWorker' in navigator) {
    // If your service-worker.js lives next to index.html, use 'service-worker.js'.
    // If it lives at repo root with different path, adjust accordingly.
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('Service Worker registered with scope:', reg.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  }
});
