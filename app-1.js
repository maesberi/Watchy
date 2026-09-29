const KEY = '0b04475e20dc2f8dec2a38959950ab31';
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const TODAY = new Date(); TODAY.setHours(0,0,0,0);

// Estado global
let mediaType = 'series';   // series | movies
let statusView = 'watching'; // watching | watched
let stype = 'series';
let stimer = null;
let lib = JSON.parse(localStorage.getItem('watchy_lib') || '{}');
let seaCache = JSON.parse(localStorage.getItem('watchy_sea') || '{}');
let castCache = JSON.parse(localStorage.getItem('watchy_cast') || '{}');
let detailId = null, dSeason = 1;

function saveCast(){ localStorage.setItem('watchy_cast', JSON.stringify(castCache)); }

function save(){ localStorage.setItem('watchy_lib', JSON.stringify(lib)); }
function saveSea(){ localStorage.setItem('watchy_sea', JSON.stringify(seaCache)); }

/* ── DATE HELPERS ── */
function airStatus(ds){
  if(!ds) return 'unknown';
  const d = new Date(ds); d.setHours(0,0,0,0);
  return d > TODAY ? 'future' : 'past';
}
function fmtDate(ds){
  if(!ds) return '';
  return new Date(ds).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
}
function relDate(ds){
  if(!ds) return '';
  const d = new Date(ds); d.setHours(0,0,0,0);
  const diff = Math.round((d - TODAY) / 86400000);
  if(diff === 0) return 'Hoy';
  if(diff === 1) return 'Mañana';
  if(diff > 0 && diff < 8) return `En ${diff} días`;
  if(diff < 0 && diff > -8) return `Hace ${-diff} días`;
  return fmtDate(ds);
}
function esc(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/\n/g,' '); }

/* ── COUNTS ── */
function countSeen(item){
  if(!item.seasons) return 0;
  let c = 0;
  Object.values(item.seasons).forEach(s => Object.values(s).forEach(v => { if(v) c++; }));
  return c;
}

function autoComplete(item){
  if(!item.totalEps || item.totalEps === 0) return;
  const seen = countSeen(item);
  if(seen >= item.totalEps) item.status = 'watched';
  else if(seen > 0 && item.status === 'watched') item.status = 'watching';
}

/* ── RENDER ── */
function getNextAirDate(item){
  if(!seaCache[item.tmdbId]) return null;
  const seasons = Object.keys(seaCache[item.tmdbId]).map(Number).sort((a,b)=>a-b);
  for(const s of seasons){
    for(const ep of (seaCache[item.tmdbId][s]||[])){
      if(!item.seasons?.[s]?.[ep.episode_number]) return ep.air_date || null;
    }
  }
  return null;
}

function getItems(){
  const list = Object.values(lib).filter(i => i.type === mediaType && i.status === statusView);
  return list.sort((a,b) => {
    if(mediaType === 'series'){
      const da = getNextAirDate(a);
      const db = getNextAirDate(b);
      if(!da && !db) return 0;
      if(!da) return 1;
      if(!db) return -1;
      return new Date(da) - new Date(db);
    } else {
      // Películas: por fecha de estreno, más antigua primero
      const da = a.releaseDate || a.year || '';
      const db = b.releaseDate || b.year || '';
      if(!da && !db) return 0;
      if(!da) return 1;
      if(!db) return -1;
      return new Date(da) - new Date(db);
    }
  });
}

function render(){
  const list = getItems();
  const el = document.getElementById('content');
  if(!list.length){
    const labels = {
      watching: mediaType === 'series' ? 'No hay series que estés viendo' : 'No hay películas pendientes',
      watched:  mediaType === 'series' ? 'No hay series terminadas' : 'No hay películas vistas'
    };
    el.innerHTML = `<div class="empty">
      <div class="empty-icon">${mediaType==='series'?'📺':'🎬'}</div>
      <h3>${labels[statusView]}</h3>
      <p>Pulsa + para añadir títulos a tu lista.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="card-list">${list.map(i => mediaType === 'series' ? seriesCardHTML(i) : movieCardHTML(i)).join('')}</div>`;
}

/* ── SERIES CARD ── */
function seriesCardHTML(item){
  const poster = item.poster
    ? `<img src="${IMG}w92${item.poster}" alt="" loading="lazy">`
    : `<div class="sc-poster-ph">📺</div>`;

  const nextEp = getNextEp(item);
  const isComplete = item.status === 'watched';

  let epCode, epName, dateLabel, dateCls;
  if(isComplete){
    epCode = 'Completa'; epName = '✓ Serie terminada'; dateLabel = ''; dateCls = '';
  } else if(nextEp){
    epCode = `S${String(nextEp.season).padStart(2,'0')} | E${String(nextEp.ep.episode_number).padStart(2,'0')}`;
    epName = nextEp.ep.name || '';
    const as = airStatus(nextEp.ep.air_date);
    dateLabel = nextEp.ep.air_date ? relDate(nextEp.ep.air_date) : '';
    dateCls = as === 'future' ? 'future' : 'past';
  } else {
    epCode = '—'; epName = 'Sin datos de episodios'; dateLabel = ''; dateCls = '';
  }

  const seenCount = countSeen(item);
  const total = item.totalEps || 0;
  const pct = total > 0 ? Math.round(seenCount / total * 100) : 0;
  const progHTML = total > 0
    ? `<div class="sc-progress"><div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div><div class="prog-text">${seenCount}/${total}</div></div>`
    : '';

  const pillsHTML = buildEpPills(item);

  return `<div class="series-card">
    <div class="sc-top">
      <div class="sc-poster" onclick="openDetail('${item.id}')">${poster}</div>
      <div class="sc-mid" onclick="openDetail('${item.id}')">
        <div class="sc-show">${esc(item.title)}</div>
        <div class="sc-epcode">${epCode}</div>
        <div class="sc-epname">${esc(epName)}</div>
        ${dateLabel ? `<div class="sc-date ${dateCls}">${dateCls==='future'?'🔮 ':''}${dateLabel}</div>` : ''}
      </div>
      <div class="sc-right">
        <button class="check-btn ${isComplete?'checked':''}" onclick="toggleWatched('${item.id}')" title="${isComplete?'Marcar como viendo':'Marcar como vista'}">✓</button>
        <button class="del-btn" onclick="delItem('${item.id}')">🗑</button>
      </div>
    </div>
    ${(progHTML || pillsHTML) ? `<div class="sc-bottom">${progHTML}${pillsHTML}</div>` : ''}
  </div>`;
}

function getNextEp(item){
  if(!seaCache[item.tmdbId]) return null;
  const seasons = Object.keys(seaCache[item.tmdbId]).map(Number).sort((a,b)=>a-b);
  for(const s of seasons){
    for(const ep of (seaCache[item.tmdbId][s]||[])){
      if(!item.seasons?.[s]?.[ep.episode_number]) return {season:s, ep};
    }
  }
  return null;
}

function buildEpPills(item){
  if(!seaCache[item.tmdbId]) return '';
  const seasons = Object.keys(seaCache[item.tmdbId]).map(Number).sort((a,b)=>a-b);
  let pills = [], found = false;
  for(const s of seasons){
    for(const ep of (seaCache[item.tmdbId][s]||[])){
      const seen = item.seasons?.[s]?.[ep.episode_number];
      if(!found && !seen) found = true;
      if(found){
        const as = airStatus(ep.air_date);
        const cls = as === 'future' ? 'ep-future' : 'ep-unseen';
        const airLabel = ep.air_date ? relDate(ep.air_date) : '';
        // Para futuros mostrar fecha, para pasados nada
        const showDate = as === 'future' && airLabel;
        pills.push(`<div class="ep-pill ${cls}" onclick="event.stopPropagation();quickEp('${item.id}',${s},${ep.episode_number})" title="T${s}·E${ep.episode_number}: ${ep.name||''}">
          <span class="ep-pill-num">E${ep.episode_number}</span>
          ${showDate ? `<span class="ep-pill-air">${airLabel}</span>` : ''}
        </div>`);
        if(pills.length >= 8) break;
      }
    }
    if(pills.length >= 8) break;
  }
  return pills.length ? `<div class="sc-eps-row">${pills.join('')}</div>` : '';
}

function quickEp(id, season, epNum){
  const item = lib[id];
  if(!item) return;
  if(!item.seasons) item.seasons = {};
  if(!item.seasons[season]) item.seasons[season] = {};
  item.seasons[season][epNum] = !item.seasons[season][epNum];
  item.currentSeason = season; item.currentEpisode = epNum;
  item.watchedEps = countSeen(item);
  if(item.status === 'watched') item.status = 'watching';
  autoComplete(item);
  save(); render();
}

/* ── MOVIE CARD ── */
function movieCardHTML(item){
  const poster = item.poster
    ? `<img src="${IMG}w92${item.poster}" alt="" loading="lazy">`
    : `<div class="mc-poster-ph">🎬</div>`;
  const isWatched = item.status === 'watched';
  const vote = item.vote ? `★ ${item.vote.toFixed(1)}` : '';
  const releaseDate = item.releaseDate ? fmtDate(item.releaseDate) : (item.year || '');

  return `<div class="movie-card">
    <div class="mc-poster" onclick="openDetail('${item.id}')">${poster}</div>
    <div class="mc-info" onclick="openDetail('${item.id}')">
      <div class="mc-title">${esc(item.title)}</div>
      <div class="mc-meta">${vote}</div>
      ${releaseDate ? `<div class="mc-release">📅 ${releaseDate}</div>` : ''}
    </div>
    <div class="mc-right">
      <button class="check-btn ${isWatched?'checked':''}" onclick="toggleWatched('${item.id}')" title="${isWatched?'Marcar como pendiente':'Marcar como vista'}">✓</button>
      <button class="del-btn" onclick="delItem('${item.id}')">🗑</button>
    </div>
  </div>`;
}

function toggleWatched(id){
  const item = lib[id];
  if(!item) return;
  item.status = item.status === 'watched' ? 'watching' : 'watched';
  save(); render();
}

function delItem(id){
  if(!confirm('¿Eliminar de tu lista?')) return;
  delete lib[id]; save(); render();
}

/* ── TABS ── */
function switchType(t){
  mediaType = t;
  document.getElementById('tab-series').classList.toggle('active', t==='series');
  document.getElementById('tab-movies').classList.toggle('active', t==='movies');
  stype = t;
  render();
}

function switchStatus(s){
  statusView = s;
  const tw = document.getElementById('stab-watching');
  const td = document.getElementById('stab-watched');
  tw.className = 'stab-main' + (s==='watching' ? ' active-watching' : '');
  td.className = 'stab-main' + (s==='watched'  ? ' active-watched'  : '');
  render();
}

/* ── SEARCH ── */
function openSearch(){
  stype = mediaType;
  document.getElementById('stype-series').classList.toggle('active', stype==='series');
  document.getElementById('stype-movies').classList.toggle('active', stype==='movies');
  document.getElementById('ov-search').style.display = 'flex';
  setTimeout(() => document.getElementById('sinput').focus(), 120);
}
function closeSearch(){
  document.getElementById('ov-search').style.display = 'none';
  document.getElementById('sinput').value = '';
  document.getElementById('rlist').innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3);font-size:13px;">Escribe para buscar</div>';
}
function setSType(t){
  stype = t;
  document.getElementById('stype-series').classList.toggle('active', t==='series');
  document.getElementById('stype-movies').classList.toggle('active', t==='movies');
  const q = document.getElementById('sinput').value.trim();
  if(q.length > 1) doSearch(q);
}
function onSInput(){
  clearTimeout(stimer);
  const q = document.getElementById('sinput').value.trim();
  if(q.length < 2){ document.getElementById('rlist').innerHTML='<div style="text-align:center;padding:32px;color:var(--text3);font-size:13px;">Escribe para buscar</div>'; return; }
  stimer = setTimeout(() => doSearch(q), 380);
}
async function doSearch(q){
  const el = document.getElementById('rlist');
  el.innerHTML = '<div class="loading"><div class="spinner"></div><br>Buscando…</div>';
  const ep = stype === 'series' ? 'tv' : 'movie';
  try{
    const r = await fetch(`${API}/search/${ep}?api_key=${KEY}&query=${encodeURIComponent(q)}&language=es-ES`);
    const d = await r.json();
    if(!d.results?.length){ el.innerHTML=`<div class="nores">Sin resultados para "${q}"</div>`; return; }
    el.innerHTML = d.results.slice(0,12).map(resHTML).join('');
  }catch(e){ el.innerHTML='<div class="nores">Error de conexión</div>'; }
}
function resHTML(item){
  const title = item.title || item.name || '?';
  const year = (item.release_date || item.first_air_date || '').substring(0,4);
  const poster = item.poster_path
    ? `<img class="rposter" src="${IMG}w92${item.poster_path}" alt="" loading="lazy">`
    : `<div class="rph">🎞️</div>`;
  const k = `${stype}-${item.id}`;
  const inLib = !!lib[k];
  return `<div class="ritem">
    ${poster}
    <div class="rinfo">
      <div class="rtitle">${title}</div>
      <div class="rmeta">${year}${item.vote_average?` · ★${item.vote_average.toFixed(1)}`:''}</div>
    </div>
    <button class="radd ${inLib?'done':''}" id="radd-${k}"
      onclick="addItem(${item.id},'${esc(title)}','${item.poster_path||''}','${year}',${item.vote_average||0},'${item.backdrop_path||''}','${esc(item.overview||'')}','${item.release_date||item.first_air_date||''}')">
      ${inLib ? 'Añadido' : '+ Añadir'}
    </button>
  </div>`;
}

async function addItem(id, title, poster, year, vote, backdrop, overview, releaseDate){
  const k = `${stype}-${id}`;
  if(!lib[k]){
    lib[k] = { id:k, tmdbId:id, type:stype, title, poster, year, vote, backdrop, overview,
               releaseDate, status:'watching', added:Date.now(),
               seasons:{}, watchedEps:0, totalEps:0 };
    save();
    if(stype === 'series') fetchAllSeasons(id, k);
    fetchCast(id, stype);
  }
  const btn = document.getElementById('radd-'+k);
  if(btn){ btn.textContent='Añadido'; btn.classList.add('done'); }
  closeSearch();
  openDetail(k);
}

/* ── SEASON FETCH ── */
async function fetchAllSeasons(tmdbId, libKey){
  const item = lib[libKey];
  if(!item) return;
  try{
    const r = await fetch(`${API}/tv/${tmdbId}?api_key=${KEY}&language=es-ES`);
    const d = await r.json();
    item.numSeasons = d.number_of_seasons || 1;
    item.totalEps   = d.number_of_episodes || 0;
    save();
    if(!seaCache[tmdbId]) seaCache[tmdbId] = {};
    for(let s = 1; s <= item.numSeasons; s++){
      if(!seaCache[tmdbId][s]){
        try{
          const sr = await fetch(`${API}/tv/${tmdbId}/season/${s}?api_key=${KEY}&language=es-ES`);
          const sd = await sr.json();
          seaCache[tmdbId][s] = (sd.episodes||[]).map(e=>({
            episode_number: e.episode_number,
            name: e.name,
            air_date: e.air_date
          }));
          saveSea();
        }catch(e){}
      }
    }
    render();
  }catch(e){}
}

/* ── CAST ── */
async function fetchCast(tmdbId, type){
  if(castCache[tmdbId]) return;
  const ep = type === 'series' ? 'tv' : 'movie';
  try{
    const r = await fetch(`${API}/${ep}/${tmdbId}/credits?api_key=${KEY}&language=es-ES`);
    const d = await r.json();
    castCache[tmdbId] = (d.cast || []).slice(0, 15).map(c=>({
      id: c.id,
      name: c.name,
      character: c.character,
      photo: c.profile_path || null
    }));
    saveCast();
  }catch(e){}
}

/* ── DETAIL ── */
async function openDetail(id){
  detailId = id;
  const item = lib[id];
  if(!item) return;
  dSeason = item.currentSeason || 1;
  buildDetailUI();
  document.getElementById('ov-detail').style.display = 'flex';
  // Cargar datos en paralelo
  const loads = [];
  if(item.type === 'series' && !seaCache[item.tmdbId])
    loads.push(fetchAllSeasons(item.tmdbId, id));
  if(!castCache[item.tmdbId])
    loads.push(fetchCast(item.tmdbId, item.type));
  if(loads.length){
    await Promise.all(loads);
    buildDetailUI();
  }
}

function buildDetailUI(){
  const item = lib[detailId];
  if(!item) return;
  const back = item.backdrop
    ? `<img class="dback" src="${IMG}w780${item.backdrop}" alt="">`
    : `<div class="dback-ph"></div>`;
  const p = item.poster
    ? `<img class="dposter" src="${IMG}w185${item.poster}" alt="">`
    : `<div class="dph">🎞️</div>`;
  const vote = item.vote ? `★${item.vote.toFixed(1)}` : '';
  const releaseLabel = item.releaseDate ? ` · 📅 ${fmtDate(item.releaseDate)}` : (item.year ? ` · ${item.year}` : '');
  const meta = [item.type==='series'?'Serie':'Película', vote].filter(Boolean).join(' · ') + releaseLabel;
  const ov = item.overview ? `<p class="dov">${item.overview}</p>` : '';

  // 2 status buttons
  const opts = item.type === 'series'
    ? [{k:'watching',e:'▶️',l:'Viendo'},{k:'watched',e:'✅',l:'Completa'}]
    : [{k:'watching',e:'⏳',l:'Pendiente'},{k:'watched',e:'✅',l:'Vista'}];
  const stRow = opts.map(o=>`
    <div class="d-st-btn ${item.status===o.k?'sel-'+o.k:''}" onclick="dSetStatus('${o.k}')">
      <span>${o.e}</span><span>${o.l}</span>
    </div>`).join('');

  const epSection = item.type === 'series' ? buildEpSection(item) : '';
  const castSection = buildCastSection(item.tmdbId);

  document.getElementById('dsheet-content').innerHTML = `
    <div style="position:relative;flex-shrink:0">
      ${back}
      <button class="dclose" onclick="closeDetail()">✕</button>
    </div>
    <div class="dbody">
      <div class="dtop">
        ${p}
        <div class="dhead">
          <div class="dtitle">${esc(item.title)}</div>
          <div class="dmeta">${meta}</div>
        </div>
      </div>
      ${ov}
      <div class="dsec">Estado</div>
      <div class="d-status-row" id="d-strow">${stRow}</div>
      ${castSection}
      ${epSection}
      <button class="bsave" onclick="dSave()">Guardar y cerrar</button>
      <button class="bupdate" onclick="refreshEpisodes()">🔄 Actualizar episodios</button>
      <button class="brem" onclick="dRemove()">Eliminar de mi lista</button>
    </div>`;
}

function buildCastSection(tmdbId){
  const cast = castCache[tmdbId];
  if(!cast) return `<div class="dsec">Reparto</div><div class="ep-loading"><div class="spinner"></div></div>`;
  if(!cast.length) return '';
  const cards = cast.map(c => {
    const photo = c.photo
      ? `<img class="cast-photo" src="${IMG}w185${c.photo}" alt="" loading="lazy">`
      : `<div class="cast-photo-ph">👤</div>`;
    return `<div class="cast-card" onclick="openActor(${c.id},'${esc(c.name)}','${c.photo||''}','${esc(c.biography||'')}')">
      ${photo}
      <div class="cast-name">${esc(c.name)}</div>
      ${c.character ? `<div class="cast-char">${esc(c.character)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="dsec">Reparto</div><div class="cast-row">${cards}</div>`;
}

function buildEpSection(item){
  const sd = seaCache[item.tmdbId];
  if(!sd) return `<div class="dsec">Episodios</div><div class="ep-loading"><div class="spinner"></div></div>`;
  const seasons = Object.keys(sd).map(Number).sort((a,b)=>a-b);
  if(!seasons.length) return '';
  if(!seasons.includes(dSeason)) dSeason = seasons[0];

  const tabs = seasons.map(s =>
    `<div class="sea-tab ${s===dSeason?'active':''}" onclick="dSwitchSeason(${s})">T${s}</div>`
  ).join('');

  const eps = sd[dSeason] || [];
  const seenMap = item.seasons?.[dSeason] || {};
  const seenCount = Object.values(seenMap).filter(Boolean).length;
  const allSeen = seenCount === eps.length && eps.length > 0;

  const rows = eps.map(ep => {
    const seen = !!seenMap[ep.episode_number];
    const as = airStatus(ep.air_date);
    const fut = as === 'future';
    const dateStr = ep.air_date ? (fut ? `🔮 ${relDate(ep.air_date)}` : `📅 ${fmtDate(ep.air_date)}`) : '';
    return `<div class="ep-row ${seen?'ep-r-seen':''} ${fut?'ep-r-future':''}">
      <div class="ep-num">E${ep.episode_number}</div>
      <div class="ep-info">
        <div class="ep-title">${esc(ep.name || 'Episodio '+ep.episode_number)}</div>
        ${dateStr ? `<div class="ep-air ${fut?'fut':''}">${dateStr}</div>` : ''}
      </div>
      <button class="ep-check ${seen?'done':''}"
        ${fut ? 'style="opacity:0.3;cursor:default" title="Aún no ha salido"' : `onclick="dToggleEp(${dSeason},${ep.episode_number})"`}>✓</button>
    </div>`;
  }).join('');

  return `
    <div class="dsec">Episodios · T${dSeason} &mdash; ${seenCount}/${eps.length} vistos</div>
    <div class="sea-tabs">${tabs}</div>
    <button class="markall" onclick="dMarkAll(${dSeason},${!allSeen})">
      ${allSeen ? '✕ Desmarcar todos' : '✅ Marcar todos como vistos'}
    </button>
    <div class="ep-list">${rows}</div>`;
}

function dSwitchSeason(s){ dSeason = s; buildDetailUI(); }

function dToggleEp(season, epNum){
  const item = lib[detailId];
  if(!item) return;
  if(!item.seasons) item.seasons = {};
  if(!item.seasons[season]) item.seasons[season] = {};
  item.seasons[season][epNum] = !item.seasons[season][epNum];
  item.currentSeason = season; item.currentEpisode = epNum;
  item.watchedEps = countSeen(item);
  if(item.status === 'watched') item.status = 'watching';
  autoComplete(item);
  save(); buildDetailUI();
}

function dMarkAll(season, seen){
  const item = lib[detailId];
  if(!item) return;
  if(!item.seasons) item.seasons = {};
  if(!item.seasons[season]) item.seasons[season] = {};
  (seaCache[item.tmdbId]?.[season]||[]).forEach(ep => {
    item.seasons[season][ep.episode_number] = seen;
  });
  item.watchedEps = countSeen(item);
  autoComplete(item);
  save(); buildDetailUI();
}

function dSetStatus(s){
  lib[detailId].status = s;
  save(); buildDetailUI();
}

function dSave(){ save(); closeDetail(); }
function dRemove(){
  if(confirm('¿Eliminar de tu lista?')){ delete lib[detailId]; save(); closeDetail(); }
}

async function refreshEpisodes(){
  const item = lib[detailId];
  if(!item || item.type !== 'series') return;
  const tmdbId = item.tmdbId;
  showToast('🔄 Actualizando...');
  try{
    const r = await fetch(`${API}/tv/${tmdbId}?api_key=${KEY}&language=es-ES`);
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if(!d || !d.id) throw new Error('Sin datos de serie');
    item.numSeasons = d.number_of_seasons || item.numSeasons || 1;
    // Borrar caché de temporadas
    seaCache[tmdbId] = {};
    // Recargar temporadas una por una
    for(let s = 1; s <= item.numSeasons; s++){
      try{
        const sr = await fetch(`${API}/tv/${tmdbId}/season/${s}?api_key=${KEY}&language=es-ES`);
        if(!sr.ok) continue;
        const sd = await sr.json();
        if(sd && sd.episodes){
          seaCache[tmdbId][s] = sd.episodes.map(e=>({
            episode_number: e.episode_number,
            name: e.name,
            air_date: e.air_date
          }));
        }
      }catch(e){ continue; }
    }
    saveSea(); save();
    showToast('✅ Episodios actualizados');
    buildDetailUI();
  }catch(e){
    showToast('❌ Error: ' + e.message);
  }
}

function closeDetail(){
  document.getElementById('ov-detail').style.display = 'none';
  detailId = null; render();
}

/* ── ACTOR ── */
let actorCache = JSON.parse(localStorage.getItem('watchy_actor') || '{}'); // {personId: {bio, series:[], movies:[]}}
let actorFilmTab = 'series'; // tab activo en filmografía

function saveActor(){ localStorage.setItem('watchy_actor', JSON.stringify(actorCache)); }

async function openActor(personId, name, photo, bio){
  // Mostrar sheet inmediatamente con lo que tengamos
  renderActorSheet(personId, name, photo, bio || '');
  document.getElementById('ov-actor').style.display = 'flex';

  // Si no tenemos datos, los pedimos
  if(!actorCache[personId]){
    try{
      // Detalles del actor (bio)
      const [detR, credR] = await Promise.all([
        fetch(`${API}/person/${personId}?api_key=${KEY}&language=es-ES`),
        fetch(`${API}/person/${personId}/combined_credits?api_key=${KEY}&language=es-ES`)
      ]);
      const det  = await detR.json();
      const cred = await credR.json();

      // Series: ordenar por popularidad, quitar duplicados
      const seriesMap = {};
      (cred.cast||[]).filter(c=>c.media_type==='tv').forEach(c=>{
        if(!seriesMap[c.id] || (c.vote_count||0) > (seriesMap[c.id].vote_count||0))
          seriesMap[c.id] = c;
      });
      // Películas
      const moviesMap = {};
      (cred.cast||[]).filter(c=>c.media_type==='movie').forEach(c=>{
        if(!moviesMap[c.id] || (c.vote_count||0) > (moviesMap[c.id].vote_count||0))
          moviesMap[c.id] = c;
      });

      actorCache[personId] = {
        bio: det.biography || '',
        photo: det.profile_path || photo,
        series: Object.values(seriesMap)
          .sort((a,b)=>(b.popularity||0)-(a.popularity||0))
          .slice(0,40)
          .map(c=>({id:c.id,title:c.name||c.title||'?',poster:c.poster_path||null,year:(c.first_air_date||'').substring(0,4),vote:c.vote_average||0,overview:c.overview||'',backdrop:c.backdrop_path||null,releaseDate:c.first_air_date||''})),
        movies: Object.values(moviesMap)
          .sort((a,b)=>(b.popularity||0)-(a.popularity||0))
          .slice(0,40)
          .map(c=>({id:c.id,title:c.title||c.name||'?',poster:c.poster_path||null,year:(c.release_date||'').substring(0,4),vote:c.vote_average||0,overview:c.overview||'',backdrop:c.backdrop_path||null,releaseDate:c.release_date||''}))
      };
      saveActor();
      renderActorSheet(personId, name, actorCache[personId].photo, actorCache[personId].bio);
    }catch(e){}
  }
}

function renderActorSheet(personId, name, photo, bio){
  const data = actorCache[personId];
  const photoEl = photo
    ? `<img class="actor-photo-big" src="${IMG}w185${photo}" alt="">`
    : `<div class="actor-photo-big-ph">👤</div>`;
  const bioText = (data?.bio || bio || '').trim();
  const bioHTML = bioText ? `<div class="actor-bio">${esc(bioText)}</div>` : `<div class="actor-bio" style="color:var(--text3);font-style:italic">Sin biografía disponible</div>`;

  const seriesCount = data?.series?.length || 0;
  const moviesCount = data?.movies?.length || 0;

  const filmogHTML = data ? buildFilmogGrid(personId) : `<div class="ep-loading"><div class="spinner"></div></div>`;

  document.getElementById('actor-content').innerHTML = `
    <div class="handle" style="margin-top:10px"></div>
    <div class="actor-header">
      ${photoEl}
      <div class="actor-info">
        <div class="actor-name">${esc(name)}</div>
        ${bioHTML}
      </div>
      <button class="actor-close" onclick="closeActor()">✕</button>
    </div>
    <div class="actor-tabs">
      <div class="actor-tab ${actorFilmTab==='series'?'active':''}" onclick="switchActorTab('${personId}','${esc(name)}','${photo}','${esc(bioText)}','series')">
        📺 Series ${seriesCount>0?`(${seriesCount})`:''}
      </div>
      <div class="actor-tab ${actorFilmTab==='movies'?'active':''}" onclick="switchActorTab('${personId}','${esc(name)}','${photo}','${esc(bioText)}','movies')">
        🎬 Películas ${moviesCount>0?`(${moviesCount})`:''}
      </div>
    </div>
    <div class="actor-body">${filmogHTML}</div>`;
}

function switchActorTab(personId, name, photo, bio, tab){
  actorFilmTab = tab;
  renderActorSheet(personId, name, photo, bio);
}

function buildFilmogGrid(personId){
  const data = actorCache[personId];
  if(!data) return `<div class="ep-loading"><div class="spinner"></div></div>`;
  const items = actorFilmTab === 'series' ? data.series : data.movies;
  const type  = actorFilmTab === 'series' ? 'series' : 'movies';
  if(!items?.length) return `<div class="actor-empty">Sin ${actorFilmTab==='series'?'series':'películas'} encontradas</div>`;

  const cards = items.map(item => {
    const k = `${type}-${item.id}`;
    const inLib = !!lib[k];
    const poster = item.poster
      ? `<img class="fg-poster" src="${IMG}w185${item.poster}" alt="" loading="lazy">`
      : `<div class="fg-poster-ph">🎞️</div>`;
    const badge = inLib ? `<div class="fg-badge">✓</div>` : '';
    const addBtn = inLib
      ? `<div class="fg-add-btn"><span class="fg-add done">✓ Añadido</span></div>`
      : `<div class="fg-add-btn"><button class="fg-add" onclick="event.stopPropagation();addFromActor('${type}',${item.id},'${esc(item.title)}','${item.poster||''}','${item.year}',${item.vote},'${item.backdrop||''}','${esc(item.overview||'')}','${item.releaseDate||''}')">+ Añadir</button></div>`;
    return `<div class="fg-card ${inLib?'in-lib':''}" onclick="addFromActor('${type}',${item.id},'${esc(item.title)}','${item.poster||''}','${item.year}',${item.vote},'${item.backdrop||''}','${esc(item.overview||'')}','${item.releaseDate||''}')">
      ${poster}
      ${badge}
      ${addBtn}
      <div class="fg-info">
        <div class="fg-title">${esc(item.title)}</div>
        ${item.year ? `<div class="fg-year">${item.year}${item.vote>0?` · ★${item.vote.toFixed(1)}`:''}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="filmog-grid">${cards}</div>`;
}

function addFromActor(type, id, title, poster, year, vote, backdrop, overview, releaseDate){
  const k = `${type}-${id}`;
  if(!lib[k]){
    lib[k] = { id:k, tmdbId:id, type, title, poster, year, vote:parseFloat(vote)||0, backdrop, overview,
               releaseDate, status:'watching', added:Date.now(),
               seasons:{}, watchedEps:0, totalEps:0 };
    save();
    if(type === 'series') fetchAllSeasons(id, k);
    fetchCast(id, type);
    showToast(`✅ "${title}" añadido`);
  } else {
    showToast(`Ya está en tu lista`);
  }
  // Refrescar grid para mostrar badge ✓
  const data = actorCache[Object.keys(actorCache).find(pid => {
    const d = actorCache[pid];
    return d && (d.series||[]).concat(d.movies||[]).some(i=>String(i.id)===String(id));
  })];
  // Re-render el grid actual
  const body = document.querySelector('.actor-body');
  if(body){
    const pid = Object.keys(actorCache).find(pid => {
      const d = actorCache[pid];
      return d && (d[actorFilmTab]||[]).some(i=>String(i.id)===String(id));
    });
    if(pid) body.innerHTML = buildFilmogGrid(pid);
  }
}

function closeActor(){
  document.getElementById('ov-actor').style.display = 'none';
  actorFilmTab = 'series';
}

function ovClick(e, id){
  if(e.target === document.getElementById(id)){
    if(id === 'ov-search') closeSearch();
    else if(id === 'ov-backup') closeBackup();
    else if(id === 'ov-actor') closeActor();
    else closeDetail();
  }
}

/* ── BACKUP ── */
function openBackup(){
  // Calcular stats
  const all = Object.values(lib);
  const series = all.filter(i=>i.type==='series');
  const movies = all.filter(i=>i.type==='movies');
  const seriesVistas = series.filter(i=>i.status==='watched').length;
  const pelisVistas  = movies.filter(i=>i.status==='watched').length;
  let totalEps = 0;
  series.forEach(i=>{ totalEps += i.watchedEps||0; });

  document.getElementById('bk-stats').innerHTML = `
    <div class="bk-stat">
      <div class="bk-stat-num">${series.length}</div>
      <div class="bk-stat-label">Series</div>
    </div>
    <div class="bk-divider"></div>
    <div class="bk-stat">
      <div class="bk-stat-num">${movies.length}</div>
      <div class="bk-stat-label">Películas</div>
    </div>
    <div class="bk-divider"></div>
    <div class="bk-stat">
      <div class="bk-stat-num">${totalEps}</div>
      <div class="bk-stat-label">Eps vistos</div>
    </div>
    <div class="bk-divider"></div>
    <div class="bk-stat">
      <div class="bk-stat-num">${seriesVistas+pelisVistas}</div>
      <div class="bk-stat-label">Completos</div>
    </div>`;
  document.getElementById('ov-backup').style.display = 'flex';
}

function closeBackup(){
  document.getElementById('ov-backup').style.display = 'none';
}

async function exportJSON(){
  const backup = {
    version: 1,
    date: new Date().toISOString(),
    lib,
    seaCache
  };
  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g,'-');
  const fileName = `watchy-respaldo-${dateStr}.json`;

  // 1️⃣ Capacitor Filesystem (APK nativa)
  if(window.Capacitor && window.Capacitor.isNativePlatform()){
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    const base64 = btoa(unescape(encodeURIComponent(json)));
    try{
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.ExternalStorage, recursive: true });
      showToast('✅ Respaldo en Descargas');
      return;
    }catch(e1){}
    try{
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents, recursive: true });
      showToast('✅ Respaldo en Documentos');
      return;
    }catch(e2){}
    try{
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
      showToast('✅ Respaldo guardado (busca en Gestor → watchy)');
      return;
    }catch(e3){}
  }

  // 2️⃣ Web Share API (Chrome móvil)
  const blob = new Blob([json], {type:'application/json'});
  if(navigator.canShare && navigator.canShare({files:[new File([blob], fileName, {type:'application/json'})]})){
    try{
      const file = new File([blob], fileName, {type:'application/json'});
      await navigator.share({title:'Watchy — Respaldo', files:[file]});
      showToast('✅ Respaldo compartido');
      return;
    }catch(e){
      if(e.name === 'AbortError') return;
    }
  }

  // 3️⃣ Descarga directa (navegador escritorio)
  try{
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('✅ Respaldo en Descargas');
  }catch(e){
    showToast('❌ No se pudo guardar el respaldo');
  }
}


function importJSON(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const backup = JSON.parse(e.target.result);
      if(!backup.lib) throw new Error('Formato inválido');
      const count = Object.keys(backup.lib).length;
      if(!confirm(`¿Restaurar ${count} títulos? Esto reemplazará tu lista actual.`)) return;
      lib = backup.lib;
      if(backup.seaCache) seaCache = backup.seaCache;
      save(); saveSea();
      closeBackup();
      render();
      showToast(`✅ ${count} títulos restaurados`);
    } catch(err){
      showToast('❌ Archivo no válido');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // reset para poder importar el mismo archivo otra vez
}

function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 2800);
}

/* ── INIT ── */
async function initFetch(){
  const series = Object.values(lib).filter(i => i.type === 'series');
  for(const item of series){
    if(!seaCache[item.tmdbId]) await fetchAllSeasons(item.tmdbId, item.id);
  }
}

render();
initFetch();
