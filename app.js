import {start} from './ui.js';
import {searchUrl} from './core.js';
// Remove only data written by older releases that may contain location searches.
try { localStorage.removeItem('hygiene-check-v1'); } catch {}
start({
 preview:false,
 async search(query,signal){const c=new AbortController(),abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);try{const response=await fetch(query.id?'https://api.ratings.food.gov.uk/Establishments/'+query.id:searchUrl(query),{headers:{'x-api-version':'2',Accept:'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:c.signal});if(!response.ok)throw Error('The ratings service is unavailable. Please try again.');const data=await response.json();return query.id?{establishments:[data],meta:{totalPages:1}}:data;}catch(e){if(e.name==='AbortError'&&!signal.aborted)throw Error('The ratings service timed out. Please try again.');if(e instanceof TypeError)throw Error('Unable to reach the FSA. Check your connection and try again.');throw e;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}},
 locate(){return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(Error('Unavailable'));return;}navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),reject,{enableHighAccuracy:false,timeout:10000,maximumAge:0});})}
});
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
