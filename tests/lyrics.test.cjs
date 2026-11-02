const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
  return { open: true, hidden: false, textContent: '', children: [], handlers: {}, attrs: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k,v) { this.attrs[k]=v; }, addEventListener(k,f) { this.handlers[k]=f; },
    replaceChildren() { this.children=[]; }, append(el) { this.children.push(el); } };
}
const elements = Object.fromEntries(['lyrics','lyricsText','lyricsRetry','lyricsStatus'].map(id=>[id,element()]));
const calls=[];
let reply;
const context={ window:{}, document:{ getElementById:id=>elements[id], createElement:element },
  URLSearchParams, AbortController, setTimeout, clearTimeout,
  fetch: async url=>{ calls.push(url); const [status,data]=reply(new URL(url)); return { status, ok:status===200, json:async()=>data }; } };
vm.runInNewContext(readFileSync(join(__dirname,'../lyrics.js'),'utf8'),context);
const api=context.window.MyBioLyrics;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  reply=url=>url.searchParams.has('album_name') ? [404,null] : url.pathname.endsWith('/get') ? [404,null]
    : [200,[{trackName:'Song',artistName:'Artist',duration:120,syncedLyrics:'[00:01.00]First\n[00:02.00]Second\n[00:03.00]Third\n[00:04.00]Fourth'}]];
  api.setTrack({title:'Song',artist:'Artist',album:'Deluxe',start:1000,end:121000});
  api.setPosition(2.5); await flush();
  assert.equal(calls.length,3,'album miss falls back to get without album, then search');
  assert.deepEqual(elements.lyricsText.children.map(el=>el.textContent),['First','Second','Third']);
  assert.equal(elements.lyricsText.children[1].attrs['aria-current'],'true');
  api.setPosition(3.5);
  assert.deepEqual(elements.lyricsText.children.map(el=>el.textContent),['Second','Third','Fourth'],'window advances automatically');
  api.setPosition(1.5); assert.equal(elements.lyricsText.children[1].textContent,'First','seek backwards');
  reply=()=>[200,[{trackName:'Unrelated',artistName:'Artist',syncedLyrics:'[00:00]Wrong'}]];
  // Exact get returns no lyrics, search result must be rejected.
  const searchReply=reply;
  reply=url=>url.pathname.endsWith('/get') ? [404,null] : searchReply(url);
  api.setTrack({title:'Missing',artist:'Artist'}); await flush();
  assert.equal(elements.lyricsText.textContent,'Текст не найден');
  reply=url=>url.pathname.endsWith('/get') ? [200,{plainLyrics:'Plain text'}] : [503,null];
  api.setTrack({title:'Static',artist:'Artist'}); await flush();
  assert.equal(elements.lyricsText.textContent,'Plain text','search failure preserves static lyrics');
  api.setTrack(null); assert.equal(elements.lyrics.hidden,true);
  console.log('PASS: fallback search, match validation, timed window, backward seek, static fallback, idle');
})().catch(error=>{ console.error(error); process.exitCode=1; });
