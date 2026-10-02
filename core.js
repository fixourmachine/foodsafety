export const API = 'https://api.ratings.food.gov.uk';
export const POSTCODE = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i;
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);
const MAPS_HOSTS = new Set(['google.com', 'www.google.com', 'maps.google.com', 'google.co.uk', 'www.google.co.uk', 'maps.google.co.uk']);
export const normalise = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function postcode(s) { const m = String(s).match(POSTCODE); return m ? m[0].toUpperCase().replace(/\s/g, '').replace(/(.{3})$/, ' $1') : ''; }
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };
export function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
export function parseInput(raw) {
  const text = String(raw ?? '').trim().slice(0, 8192);
  const urls = text.match(/https?:\/\/[^\s<>"]+/gi) || [];
  const parsed = { name: '', area: '', coordinates: null, shortUrl: '', mapsUrl: '', id: null, issue: '' };
  let outside = text;
  for (const link of urls) {
    const cleaned = link.replace(/[),.;]+$/, '');
    let u; try { u = new URL(cleaned); } catch { continue; }
    outside = outside.replace(link, '');
    if (u.hostname === 'ratings.food.gov.uk') {
      const id = u.pathname.match(/\/(?:business|businesses)\/(\d+)/);
      if (id) { parsed.id = Number(id[1]); return parsed; }
    }
    if (SHORT_HOSTS.has(u.hostname)) {
      if (u.hostname === 'goo.gl' && !u.pathname.startsWith('/maps/')) continue;
      if (u.hostname === 'g.co' && !u.pathname.startsWith('/kgs/')) continue;
      parsed.shortUrl = cleaned; parsed.mapsUrl = cleaned; continue;
    }
    if (!MAPS_HOSTS.has(u.hostname)) continue;
    if (!u.pathname.startsWith('/maps') && !u.searchParams.has('q') && !u.searchParams.has('query')) continue;
    parsed.mapsUrl = cleaned;
    if (u.pathname.startsWith('/maps/dir')) { parsed.issue = 'Share a restaurant listing rather than directions.'; continue; }
    const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
    let query = place ? decode(place[1].replace(/\+/g, ' ')) : (u.searchParams.get('query') || u.searchParams.get('q') || '');
    if (/^(?:place_id:|0x|ChIJ)/i.test(query) || /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(query)) query = '';
    const parts = query.split(',').map(s => s.trim()).filter(Boolean);
    parsed.name = parts.shift() || '';
    parsed.area = parts.join(', ');
    // !3d/!4d is the place pin. @lat,lon is only the map viewport and is not used.
    const pin = decode(u.href).match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
    if (pin && validCoordinates(Number(pin[1]), Number(pin[2]))) parsed.coordinates = { lat: Number(pin[1]), lon: Number(pin[2]) };
  }
  outside = outside.replace(/\bon Google Maps\b/ig, '').replace(/\b(?:Google Maps|Check out|Visit|See location)\b/ig, '').trim();
  if (!parsed.name && outside) {
    const parts = outside.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    parsed.name = parts.shift() || '';
    parsed.area ||= parts.join(', ');
  }
  const pc = postcode(parsed.name + ' ' + parsed.area + ' ' + outside);
  if (pc) { parsed.area = pc; parsed.name = parsed.name.replace(POSTCODE, '').trim(); }
  parsed.name = parsed.name.replace(/^["“]|["”]$/g, '').trim();
  if (!parsed.name && !parsed.area && !parsed.id) parsed.issue ||= parsed.shortUrl ? 'This short link hides the restaurant name. Use the iPhone share Shortcut, or add the name and postcode.' : 'Add the restaurant name and, if possible, its postcode.';
  if (urls.length && !parsed.mapsUrl && !parsed.id) parsed.issue = 'Use a Google Maps listing, an official rating link, or a restaurant name.';
  if (parsed.name.length > 160 || parsed.area.length > 200) parsed.issue = 'Use a shorter restaurant name or postcode.';
  return parsed;
}
export function nameVariants(name) {
  const clean = String(name).replace(/\s+[-–|]\s+.*$/, '').trim();
  if (!clean) return [''];
  const words = clean.split(/\s+/);
  const variants = [clean];
  if (words.length >= 3) variants.push(words.slice(0, -1).join(' '));
  if (words.length >= 2) variants.push(words.slice(0, Math.max(1, words.length - 2)).join(' '));
  return [...new Set(variants)].filter(s => normalise(s).length >= 2).slice(0, 3);
}
export function searchUrl({ name = '', area = '', coordinates = null, radius = 2, page = 1 }) {
  const u = new URL(API + '/Establishments');
  if (name) u.searchParams.set('name', name);
  if (area) u.searchParams.set('address', area);
  if (coordinates) {
    u.searchParams.set('latitude', coordinates.lat); u.searchParams.set('longitude', coordinates.lon);
    u.searchParams.set('maxDistanceLimit', String(Math.max(.1, Math.min(10, Number(radius) || 2))));
  }
  u.searchParams.set('sortOptionKey', coordinates ? 'Distance' : 'Relevance');
  u.searchParams.set('pageNumber', page); u.searchParams.set('pageSize', '50');
  return u.href;
}
export function address(b) { return [b.AddressLine1, b.AddressLine2, b.AddressLine3, b.AddressLine4, b.PostCode].filter(s => s?.trim()).join(', '); }
export function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
export function rankResults(items, query) {
  const wanted = normalise(query.name), requestedPc = postcode(query.area);
  return items.map((item, index) => {
    const actual = normalise(item.BusinessName);
    let score = actual === wanted ? 100 : actual && wanted && (wanted.startsWith(actual + ' ') || actual.startsWith(wanted + ' ')) ? 60 : 0;
    const tokens = wanted.split(' ').filter(Boolean);
    score += tokens.filter(t => actual.split(' ').includes(t)).length * 5;
    if (requestedPc && postcode(item.PostCode) === requestedPc) score += 80;
    if ([1, 7843, 7844].includes(item.BusinessTypeID)) score += 2;
    const lat = Number(item.geocode?.latitude), lon = Number(item.geocode?.longitude);
    const km = item.geocode?.latitude && item.geocode?.longitude && validCoordinates(lat, lon) && query.coordinates ? distanceKm(query.coordinates, {lat, lon}) : null;
    // Address proximity disambiguates branches; the hygiene score never changes matching order.
    if (km !== null) score += 40 / (1 + km * 4);
    return { item, score, index, km };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}
export function ratingInfo(b) {
  const value = String(b.RatingValue ?? '').trim();
  if (b.SchemeType === 'FHRS' && /^[0-5]$/.test(value)) {
    const labels = ['Urgent improvement necessary', 'Major improvement necessary', 'Improvement necessary', 'Generally satisfactory', 'Good', 'Very good'];
    return { value, label: labels[Number(value)], tone: Number(value) >= 4 ? 'good' : Number(value) === 3 ? 'fair' : 'poor', numeric: true };
  }
  const key = value.toLowerCase().replace(/[ _-]/g, '');
  const labels = { pass: 'Pass', improvementrequired: 'Improvement required', awaitinginspection: 'Awaiting inspection', awatinginspection: 'Awaiting inspection', awaitingpublication: 'Awaiting publication', exempt: 'Exempt' };
  return { value: labels[key] || value || 'Not available', label: b.SchemeType === 'FHIS' ? 'Food Hygiene Information Scheme · Scotland' : 'Food Hygiene Rating Scheme', tone: key === 'pass' ? 'good' : key === 'improvementrequired' ? 'poor' : 'neutral', numeric: false };
}
export function formatDate(value) {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0001')) return 'Not published';
  const d = new Date(s + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? 'Not published' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}
export function officialUrl(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid establishment ID');
  return 'https://ratings.food.gov.uk/business/' + id;
}
