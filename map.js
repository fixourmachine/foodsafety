import { ratingInfo, address, validCoordinates } from './core.js';
let loaded;
function leaflet() {
  if(window.L)return Promise.resolve(window.L);
  if(!loaded)loaded=new Promise((resolve,reject)=>{
    const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./vendor/leaflet/leaflet.css',import.meta.url);document.head.append(css);
    const js=document.createElement('script');js.src=new URL('./vendor/leaflet/leaflet.js',import.meta.url);js.onload=()=>resolve(window.L);js.onerror=reject;document.head.append(js);
  });
  return loaded;
}
export async function createMap(container,tileUrl,onMove) {
  const L=await leaflet();
  const map=L.map(container,{scrollWheelZoom:false}).setView([54,-3],6);
  L.tileLayer(tileUrl,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
  const markers=L.layerGroup().addTo(map);let programmatic=false;
  map.on('dragend zoomend',()=>{if(!programmatic)onMove();});
  return {
    update(items,open,query) {
      programmatic=true;markers.clearLayers();const pins=[];let missing=0;
      for(const b of items) {
        const lat=Number(b.geocode?.latitude),lon=Number(b.geocode?.longitude);
        if(!b.geocode?.latitude || !b.geocode?.longitude || !validCoordinates(lat,lon) || (lat===0&&lon===0)){missing++;continue;}
        const rating=ratingInfo(b),iconContent=document.createElement('span');iconContent.className='map-pin tone-'+rating.tone;iconContent.textContent=rating.numeric?rating.value:rating.value==='Pass'?'P':rating.value==='Improvement required'?'!':'?';
        const marker=L.marker([lat,lon],{icon:L.divIcon({html:iconContent,className:'rating-marker',iconSize:[36,42],iconAnchor:[18,36]}),title:b.BusinessName+' · '+rating.value});
        const popup=document.createElement('div');popup.className='map-popup';
        const name=document.createElement('strong');name.textContent=b.BusinessName;
        const addr=document.createElement('p');addr.textContent=address(b);
        const button=document.createElement('button');button.className='primary';button.textContent='Open rating '+(rating.numeric?rating.value+'/5':rating.value);button.addEventListener('click',()=>open(b));
        popup.append(name,addr,button);marker.bindPopup(popup);markers.addLayer(marker);pins.push([lat,lon]);
      }
      map.invalidateSize();
      if(pins.length)map.fitBounds(L.latLngBounds(pins).pad(.14),{maxZoom:16,animate:false});
      else if(query.coordinates)map.setView([query.coordinates.lat,query.coordinates.lon],14,{animate:false});
      programmatic=false;return missing;
    },
    area() {const c=map.getCenter(),b=map.getBounds();const radius=Math.max(.1,Math.min(10,map.distance(c,b.getNorthEast())/1609.344));return {coordinates:{lat:c.lat,lon:c.lng},radius:Number(radius.toFixed(1))};}
  };
}
