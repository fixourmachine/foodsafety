import { API, parseInput, nameVariants, searchUrl, rankResults, address, ratingInfo, formatDate, officialUrl } from './core.js';
import { MAPS_RESOLVER, MAP_TILE_URL } from './config.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const append = (parent, ...children) => { parent.append(...children.filter(Boolean)); return parent; };
const STORE = 'hygiene-check-v1';
let stored;
try { stored = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { stored = {}; }
if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
let cache = stored.cache && typeof stored.cache === 'object' && !Array.isArray(stored.cache) ? stored.cache : {};
let recent = Array.isArray(stored.recent) ? stored.recent.filter(x => x?.business?.FHRSID && x?.checkedAt).slice(0, 12) : [];
let searchController = null, searchRun = 0, detailRun = 0, activeQuery = null, currentPage = 1, currentItems = [], currentMeta = {}, currentStamp = null, selected = null, userCoordinates = null;
let originalQuery = '', broadened = false, mapMode = false, mapApi = null, mapLoading = null, mapCoordinates = null;

function persist() {
  const entries = Object.entries(cache).filter(([,v]) => v?.checkedAt).sort((a,b) => b[1].checkedAt - a[1].checkedAt).slice(0, 45);
  cache = Object.fromEntries(entries);
  try { localStorage.setItem(STORE, JSON.stringify({ cache, recent })); } catch { /* Storage may be disabled or full. Live search still works. */ }
}
function getCached(key) { const v = cache[key]; return v && typeof v.checkedAt === 'number' && v.data ? v : null; }
function remember(key, value) { cache[key] = value; persist(); }
function checkedTime(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
function status(message, kind = '', action = null) {
  const box = $('status'); box.replaceChildren(); box.hidden = !message;
  box.className = 'status' + (kind ? ' ' + kind : '');
  if (message) box.append(el('span', '', message));
  if (action) { const b = el('button', 'text-button', action.label); b.type = 'button'; b.addEventListener('click', action.run); box.append(b); }
}
function setBusy(busy) { $('search-button').disabled = busy; $('search-button').classList.toggle('busy', busy); $('search-button').textContent = busy ? 'Finding rating…' : 'Find rating'; }
async function getJSON(url, outerSignal = null) {
  const controller = new AbortController();
  const relay = () => controller.abort();
  outerSignal?.addEventListener('abort', relay, { once: true });
  if (outerSignal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
  try {
    const response = await fetch(url, { headers: { 'x-api-version': '2', 'Accept': 'application/json' }, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) { const error = new Error(response.status === 404 ? 'This business is no longer in the published ratings data.' : 'The ratings service is temporarily unavailable. Please try again.'); error.status = response.status; throw error; }
    return { data: await response.json(), checkedAt: Date.now() };
  } catch (error) {
    if (timedOut) throw new Error('The ratings service took too long. Try again, or view a saved check below.');
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) throw new Error('Unable to reach the ratings service. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); outerSignal?.removeEventListener('abort', relay); }
}
async function expandShortLink(parsed, signal) {
  if (!MAPS_RESOLVER || !parsed.shortUrl || parsed.name) return parsed;
  const endpoint = new URL(MAPS_RESOLVER); endpoint.searchParams.set('url', parsed.shortUrl);
  // The optional resolver has no access to ratings, search history or location.
  const controller = new AbortController(), relay = () => controller.abort();
  signal.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(relay, 10000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('The Maps link could not be expanded. Use the iPhone Shortcut or add the name and postcode.');
    const data = await response.json(), expanded = parseInput(data.url);
    if (!expanded.name) throw new Error('Maps returned a link without a restaurant name. Add the name and postcode.');
    return expanded;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', relay); }
}

function resultRow(business, open, query = null) {
  const rating = ratingInfo(business);
  const row = el('button', 'result-row'); row.type = 'button';
  const main = el('div', 'row-main');
  append(main, el('strong', '', business.BusinessName), el('span', '', address(business) || 'Address not published'));
  let metadata = business.BusinessType || '';
  if (query?.coordinates && business.Distance !== null && business.Distance !== undefined && Number.isFinite(Number(business.Distance))) metadata += ' · ' + Number(business.Distance).toFixed(1) + ' mi from pin';
  append(main, el('span', 'row-meta', metadata));
  const badge = el('div', 'mini-rating tone-' + rating.tone + (!rating.numeric ? ' text' : ''), rating.value);
  if (rating.numeric) badge.append(el('small', '', 'out of 5'));
  append(row, main, badge); row.addEventListener('click', open); return row;
}
function renderResults(items, meta, stamp, saved = false) {
  $('detail').hidden = true; $('result-section').hidden = false;
  $('results').replaceChildren(...rankResults(items, activeQuery).map(({item}) => resultRow(item, () => showBusiness(item, stamp, saved), activeQuery)));
  const total = Number(meta.totalCount) || items.length;
  $('result-count').textContent = total.toLocaleString('en-GB') + (total === 1 ? ' match' : ' matches');
  const context = [];
  if (broadened) context.push('Also searched “' + activeQuery.name + '” to find council listings.');
  if (activeQuery.coordinates) context.push('Within ' + (activeQuery.radius || 2) + ' miles of ' + (activeQuery.pinSource === 'device' ? 'your location' : activeQuery.pinSource === 'map' ? 'the map centre' : 'the Maps pin') + '.');
  if (activeQuery.area) context.push('Address contains “' + activeQuery.area + '”.');
  if (saved) context.push('Saved results, checked ' + checkedTime(stamp) + '.');
  if (items.length === 1) context.push('Check the address before opening the rating.');
  $('result-context').textContent = context.join(' ') || 'Select the address that matches your listing.';
  $('more-results').hidden = currentPage >= (Number(meta.totalPages) || 1) || !items.length;
  $('results').hidden = mapMode;
  $('map-panel').hidden = !mapMode;
  if (mapMode) updateMap();
}
async function runSearch(event) {
  event?.preventDefault();
  searchController?.abort(); searchController = new AbortController();
  const run = ++searchRun; ++detailRun;
  $('detail').hidden = true; $('result-section').hidden = true; selected = null;
  setBusy(true); status('Searching official ratings…', 'busy');
  let parsed = parseInput($('query').value);
  try {
    if (parsed.id) { await loadBusiness(parsed.id, null, run); return; }
    parsed = await expandShortLink(parsed, searchController.signal);
    if (run !== searchRun) return;
    if (parsed.issue && !parsed.name && !parsed.area && !(userCoordinates || mapCoordinates) || parsed.issue?.startsWith('Share a restaurant') || parsed.issue?.startsWith('Use a Google Maps') || parsed.issue?.startsWith('Use a shorter')) {
      status(parsed.issue, 'error', parsed.shortUrl ? { label: 'Set up iPhone sharing', run: openHelp } : null); return;
    }
    const explicitArea = $('area').value.trim();
    activeQuery = { name: parsed.name, area: mapCoordinates ? '' : explicitArea || parsed.area, coordinates: mapCoordinates?.coordinates || parsed.coordinates || (!explicitArea ? userCoordinates : null), radius: mapCoordinates?.radius || 2, pinSource: mapCoordinates ? 'map' : parsed.coordinates ? 'maps' : 'device' };
    mapCoordinates = null;
    if (!activeQuery.name && !activeQuery.area && !activeQuery.coordinates) { status('Add a restaurant name or postcode.', 'error'); return; }
    if (activeQuery.name && activeQuery.name.length < 2) { status('Use at least two characters for the restaurant name.', 'error'); return; }
    originalQuery = activeQuery.name; broadened = false; currentPage = 1; currentItems = [];
    const variants = nameVariants(activeQuery.name);
    let payload;
    for (const variant of variants) {
      const q = { ...activeQuery, name: variant };
      const url = searchUrl(q), saved = getCached(url);
      if (saved?.data?.establishments?.length) {
        activeQuery.name = variant; broadened = variant !== originalQuery;
        currentMeta = saved.data.meta || {}; currentItems = saved.data.establishments; currentStamp = saved.checkedAt;
        renderResults(currentItems, currentMeta, currentStamp, true);
        status('Saved matches shown. Checking for updates…', 'busy');
      }
      try { payload = await getJSON(url, searchController.signal); }
      catch (error) {
        if (run !== searchRun) return;
        if (saved) { status('Could not refresh. Saved results were checked ' + checkedTime(saved.checkedAt) + '.', 'error', {label:'Try again',run:runSearch}); return; }
        throw error;
      }
      if (run !== searchRun) return;
      if (!Array.isArray(payload.data.establishments)) throw new Error('The ratings service returned an unexpected response. Please try again.');
      remember(url, payload);
      activeQuery.name = variant; broadened = variant !== originalQuery;
      if (payload.data.establishments.length) break;
    }
    currentMeta = payload.data.meta || {}; currentItems = payload.data.establishments; currentStamp = payload.checkedAt;
    if (!currentItems.length) {
      $('result-section').hidden = true;
      status('No published listing found. Try the trading name shown at the entrance, or search by postcode alone.', '', {label:'Search by postcode',run:()=>{ $('query').value = activeQuery.area || ''; $('area').value=''; $('query').focus(); }});
      return;
    }
    renderResults(currentItems, currentMeta, currentStamp); status('');
  } catch (error) {
    if (run !== searchRun || error.name === 'AbortError') return;
    status(error.message || 'Unable to load ratings. Please try again.', 'error', {label:'Try again',run:runSearch});
  } finally { if (run === searchRun) setBusy(false); }
}
async function moreResults() {
  if (!activeQuery) return;
  const run = searchRun, next = currentPage + 1;
  $('more-results').disabled = true;
  try {
    const payload = await getJSON(searchUrl({...activeQuery,page:next}), searchController?.signal);
    if (run !== searchRun) return;
    currentPage = next;
    const ids = new Set(currentItems.map(x => x.FHRSID));
    currentItems.push(...payload.data.establishments.filter(x => !ids.has(x.FHRSID)));
    currentMeta = payload.data.meta || {}; currentStamp = payload.checkedAt;
    renderResults(currentItems, currentMeta, currentStamp); status('');
  } catch (e) { if (run === searchRun && e.name !== 'AbortError') status(e.message, 'error'); }
  finally { $('more-results').disabled = false; }
}
function saveRecent(business, checkedAt) {
  recent = [{business, checkedAt}, ...recent.filter(x => x.business.FHRSID !== business.FHRSID)].slice(0, 12);
  remember('detail:' + business.FHRSID, {data: business, checkedAt}); renderRecent();
}
function renderRecent() {
  $('recent-section').hidden = !recent.length;
  $('recent').replaceChildren(...recent.slice(0, 4).map(x => {
    const row = resultRow(x.business, () => loadBusiness(x.business.FHRSID, x));
    row.querySelector('.row-meta').textContent = 'Checked ' + checkedTime(x.checkedAt);
    return row;
  }));
}
function renderBusiness(business, stamp, saved = false) {
  const root = $('detail'); root.replaceChildren(); root.hidden = false;
  $('result-section').hidden = true;
  const back = el('button', 'text-button back', currentItems.length ? 'Back to matches' : 'Back to search');
  back.type = 'button'; back.addEventListener('click', () => { ++detailRun; root.hidden = true; selected = null; if(currentItems.length) renderResults(currentItems,currentMeta,currentStamp); else $('query').focus(); status(''); });
  const rating = ratingInfo(business), card = el('article', 'rating-card'), main = el('div','rating-main');
  append(main, el('h2','business-heading',business.BusinessName),el('p','business-address',address(business)||'Address not published'));
  const score = el('div', 'score-block tone-' + rating.tone + (!rating.numeric ? ' nonnumeric' : ''));
  append(score, el('span','score-header','Food hygiene rating'),el('span','score-number',rating.value),el('p','score-caption',rating.label));
  if (rating.numeric) {
    const scale = el('div','score-scale'); scale.setAttribute('aria-hidden','true');
    for(let i=0;i<6;i++) { const n=el('span',String(i)===rating.value?'selected':''); n.append(el('b','',String(i))); scale.append(n); } score.append(scale);
  }
  main.append(score);
  const dl = el('dl','card-meta');
  for(const [label,value] of [['Last inspected',formatDate(business.RatingDate)],['Local authority',business.LocalAuthorityName || 'Not published']]) dl.append(append(el('div'),el('dt','',label),el('dd','',value)));
  main.append(dl);
  if(business.NewRatingPending) main.append(el('p','pending','A new rating is pending. This is the currently published rating.'));
  const checked=el('div','checked'+(saved?' saved':''));
  const message=el('span','',(saved?'Saved copy · checked ':'Checked ')+checkedTime(stamp));
  const refresh=el('button','text-button','Refresh'); refresh.type='button'; refresh.addEventListener('click',()=>loadBusiness(business.FHRSID,{business,checkedAt:stamp}));
  append(checked,message,refresh); append(card,main,checked); append(root,back,card);
  const links=el('div','detail-links');
  const official=el('a','secondary','Official record');official.href=officialUrl(business.FHRSID);official.target='_blank';official.rel='noopener';
  const share=el('button','secondary','Share rating');share.type='button';share.addEventListener('click',()=>shareBusiness(business));
  append(links,official,share);root.append(links);
  if (business.SchemeType === 'FHRS' && business.scores && Object.values(business.scores).some(x=>x !== null)) {
    const section=el('section','breakdown');section.id='breakdown';
    append(section,el('h3','','Inspection breakdown'),el('p','note','Loading the inspector’s published descriptions…'));root.append(section);
  }
  if (business.RightToReply?.trim()) {
    const reply=el('details','reply');append(reply,el('summary','','Business’s right to reply'),el('p','',business.RightToReply));root.append(reply);
  }
  root.append(el('p','note','This rating reflects the last inspection. Check the address and inspection date.'));
}
async function showBusiness(business, stamp, saved = false) {
  searchController?.abort(); ++searchRun; setBusy(false);
  const run=++detailRun; selected=business;
  renderBusiness(business,stamp,saved); saveRecent(business,stamp); status('');
  $('detail').focus({preventScroll:true}); $('detail').scrollIntoView({behavior:'smooth',block:'start'});
  await loadBreakdown(business,run);
}
async function loadBusiness(id, saved = null, parentSearchRun = null) {
  if(parentSearchRun === null) {searchController?.abort(); ++searchRun;setBusy(false);}
  const run=++detailRun;
  const entry=getCached('detail:'+id);
  if(!saved && entry) saved={business:entry.data,checkedAt:entry.checkedAt};
  if(saved) {selected=saved.business;renderBusiness(saved.business,saved.checkedAt,true);status('Checking for an updated rating…','busy');}
  else status('Loading official rating…','busy');
  if(parentSearchRun===null) {$('detail').focus({preventScroll:true});$('detail').scrollIntoView({behavior:'smooth',block:'start'});}
  try {
    const payload=await getJSON(API+'/Establishments/'+id);
    if(run!==detailRun) return;
    const b=payload.data;
    if(!b.FHRSID || !b.BusinessName) throw new Error('The ratings service returned an unexpected record.');
    selected=b;renderBusiness(b,payload.checkedAt);saveRecent(b,payload.checkedAt);status('');
    await loadBreakdown(b,run);
  } catch(e) {
    if(run!==detailRun) return;
    if(e.status===404) {
      delete cache['detail:'+id];recent=recent.filter(x=>x.business.FHRSID!==Number(id));persist();renderRecent();
      $('detail').hidden=true;selected=null;status('This business no longer has a published record. Search for its current name or postcode.','error');return;
    }
    status(saved ? 'Could not refresh. Showing a saved copy checked '+checkedTime(saved.checkedAt)+'.' : e.message,'error',{label:'Try again',run:()=>loadBusiness(id,saved)});
    if(saved) await loadBreakdown(saved.business,run);
  }
}
async function loadBreakdown(business,run) {
  if(business.SchemeType!=='FHRS' || !$('breakdown')) return;
  const key='descriptors:'+business.FHRSID;
  // Score descriptions are stable; match both category and numerical score if reusing them.
  let payload=getCached(key);
  const expected=[['Hygiene',business.scores?.Hygiene],['Structural',business.scores?.Structural],['Confidence',business.scores?.ConfidenceInManagement]];
  const compatible=p=>p?.data?.scoreDescriptors?.every(x=>expected.some(([cat,score])=>cat===x.ScoreCategory && score===x.Score));
  try {
    if(!compatible(payload)) {payload=await getJSON(API+'/ScoreDescriptors?establishmentId='+business.FHRSID);remember(key,payload);}
    if(run!==detailRun || !$('breakdown')) return;
    const section=$('breakdown'), dl=el('dl');
    const names={Hygiene:'Hygienic food handling',Structural:'Cleanliness and facilities',Confidence:'Food safety management'};
    for(const d of payload.data.scoreDescriptors || []) if(names[d.ScoreCategory]) dl.append(append(el('div'),el('dt','',names[d.ScoreCategory]),el('dd','',d.Description)));
    section.replaceChildren(el('h3','','Inspection breakdown'),dl);
    if(!dl.childElementCount) section.append(el('p','note','Breakdown not published.'));
  } catch {
    if(run===detailRun && $('breakdown')) $('breakdown').replaceChildren(el('h3','','Inspection breakdown'),el('p','note','Descriptions unavailable. Open the official record for more detail.'));
  }
}
async function shareBusiness(business) {
  const url=new URL('./',location.href);url.searchParams.set('id',business.FHRSID);
  try {
    if(navigator.share) await navigator.share({title:business.BusinessName+' · food hygiene rating',text:business.BusinessName+' — '+ratingInfo(business).value+' · '+address(business),url:url.href});
    else {await navigator.clipboard.writeText(url.href);status('Rating link copied.');}
  } catch(e) {if(e.name!=='AbortError')status('Unable to share automatically. Use the official record link.','error');}
}
function openHelp(){const u=new URL('./',location.href);$('shortcut-base').value=u.href+'?url=';if(!$('help-dialog').open)$('help-dialog').showModal();}
async function updateMap() {
  try {
    if(!mapLoading)mapLoading=import('./map.js');
    const { createMap } = await mapLoading;
    if(!mapMode || $('result-section').hidden)return;
    if(!mapApi)mapApi=await createMap($('map'),MAP_TILE_URL,()=>{$('search-map').hidden=false;});
    if(!mapMode || $('result-section').hidden)return;
    const missing=mapApi.update(currentItems,b=>showBusiness(b,currentStamp),activeQuery);
    $('map-note').textContent='Showing '+(currentItems.length-missing)+' of '+(Number(currentMeta.totalCount)||currentItems.length)+' matches on the map.'+(missing?' '+missing+' loaded '+(missing===1?'listing has':'listings have')+' no pin; check the list.':'');
    $('search-map').hidden=true;
  } catch { $('map-note').textContent='The map could not load. Your ratings are still available in the list.'; }
}
function setView(useMap){mapMode=useMap;$('list-view').setAttribute('aria-pressed',String(!useMap));$('map-view').setAttribute('aria-pressed',String(useMap));$('results').hidden=useMap;$('map-panel').hidden=!useMap;if(useMap)updateMap();}
$('list-view').addEventListener('click',()=>setView(false));
$('map-view').addEventListener('click',()=>setView(true));
$('search-map').addEventListener('click',()=>{if(!mapApi)return;mapCoordinates=mapApi.area();$('area').value='';runSearch();});
$('search-form').addEventListener('submit',runSearch);
$('query').addEventListener('input',()=>{$('clear-query').hidden=!$('query').value;});
$('query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();runSearch();}});
$('clear-query').addEventListener('click',()=>{$('query').value='';$('clear-query').hidden=true;$('query').focus();});
$('area').addEventListener('input',()=>{userCoordinates=null;$('location-note').hidden=true;$('near-me').textContent='Near me';});
$('more-results').addEventListener('click',moreResults);
$('paste').addEventListener('click',async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim()){status('The clipboard is empty. Copy a restaurant listing first.');return;}$('query').value=text;$('clear-query').hidden=false;await runSearch();}catch{status('Tap the search box and choose Paste. Your browser does not allow automatic clipboard access.');$('query').focus();}});
$('near-me').addEventListener('click',()=>{
  if(userCoordinates){userCoordinates=null;$('location-note').hidden=true;$('near-me').textContent='Near me';return;}
  if(!navigator.geolocation){status('Location is unavailable. Enter a postcode or town.','error');return;}
  $('near-me').disabled=true;$('near-me').textContent='Locating…';
  navigator.geolocation.getCurrentPosition(p=>{userCoordinates={lat:p.coords.latitude,lon:p.coords.longitude};$('area').value='';$('location-note').textContent='Using your location within 2 miles. Tap “Location on” to remove it.';$('location-note').hidden=false;$('near-me').textContent='Location on';$('near-me').disabled=false;runSearch();},()=>{$('near-me').textContent='Near me';$('near-me').disabled=false;status('Location access was unavailable. Enter a postcode or town instead.','error');},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
});
$('clear-recent').addEventListener('click',()=>{recent=[];cache={};persist();renderRecent();status('Saved checks cleared.');});
for(const id of ['help-button','share-help','about-button'])$(id).addEventListener('click',openHelp);
$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('copy-shortcut').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('shortcut-base').value);$('copy-shortcut').textContent='Copied';setTimeout(()=>$('copy-shortcut').textContent='Copy',1500);}catch{$('shortcut-base').select();}});
renderRecent();
const incoming=new URLSearchParams(location.search);
const id=incoming.get('id'), shared=[incoming.get('title'),incoming.get('text'),incoming.get('url'),incoming.get('q')].filter(Boolean).join('\n');
if(incoming.has('help'))openHelp();
if(id&&/^\d+$/.test(id))loadBusiness(Number(id));
else if(shared){$('query').value=shared;$('clear-query').hidden=false;runSearch();}
// Clear transferred data from the visible address bar after it has been consumed.
if(shared||id)history.replaceState(null,'',new URL('./',location.href));
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
