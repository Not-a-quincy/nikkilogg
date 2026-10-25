'use strict';
process.env.SECRET_KEY='pc'; process.env.DB_HOST='127.0.0.1';
const fs=require('fs'),path=require('path');
const ejs=require('ejs');
const { launch } = require('./helpers/browser');
const app=require('../src/app');
const { ROOT, OUTPUT } = require('./helpers/paths');
const OUT = OUTPUT;
const ph=(t,c,w,h)=>'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/><text x="${w/2}" y="${h/2}" fill="#fff" font-size="26" font-family="sans-serif" text-anchor="middle">${t}</text></svg>`);
const user={id:7,display_name:'Vasanth',is_admin:true,is_early_user:true,profile_pic:ph('V','#5a3aa8',120,120),bg_image:ph('bg','#3a5a8a',1200,400)};
function api(u){
  if(/user\/anime-list/.test(u)) return {anime_list:[
    {mal_id:1,title_en:"Frieren: Beyond Journey's End",title_jp:'葬送のフリーレン',poster_image_url:ph('P','#1D90F3',300,450),total_episodes:28,status:'watching',current_episode:18,user_rating:9.5,mood:'calm'},
    {mal_id:2,title_en:'Vinland Saga',poster_image_url:ph('P','#7a5a2a',300,450),total_episodes:24,status:'completed',current_episode:24,user_rating:9,mood:''}]};
  if(/user\/favorites/.test(u)) return {favorites:[{mal_id:1,title_en:'Frieren',poster_image_url:ph('F','#1D90F3',300,450),anime_year:2023,average_rating:9.3},{mal_id:3,title_en:'Mushishi',poster_image_url:ph('F','#2a6a4a',300,450),anime_year:2005,average_rating:8.7}]};
  if(/user-stats/.test(u)) return {total_hours_watched:1310,total_episodes_watched:2431,avg_score:7.9,most_watched_genre:'Drama',status_counts:{completed:98,watching:24,'plan to watch':15,'on hold':6,dropped:3},titles_watched:141,total_days:54.6};
  if(/status_counts/.test(u)) return {status_counts:[{status:'completed',count:98},{status:'watching',count:24},{status:'plan_to_watch',count:15},{status:'on_hold',count:6},{status:'dropped',count:3}]};
  if(/watch_hour_ranks/.test(u)) return {ranks:[{user_id:7,display_name:'Vasanth',total_watch_hours:1310,rank_no:1},{user_id:8,display_name:'Someone',total_watch_hours:900,rank_no:2}]};
  if(/custom-themes/.test(u)) return {themes:[{theme_id:1,anime_title:'Frieren',song_title:'The Journey',artist:'Evan Call',platform:'YouTube',url:'#'}]};
  if(/recommendations/.test(u)) return {recommendations:[]};
  if(/recent-anime/.test(u)) return {recent:[]};
  return {};
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(ROOT,'public','__pv_profile.html'), await ejs.renderFile(path.join(ROOT,'views','profile.ejs'),{currentUser:user,isLoggedIn:true,overview:{
    isEmpty:false,total:299,episodes:4120,watchTime:'69 days',meanScore:7.85,scored:240,
    byStatus:[{key:'watching',label:'Watching',count:8,percent:3},{key:'completed',label:'Completed',count:223,percent:75}],
    recent:[{malId:52991,title:'Frieren',poster:'/favicon.svg',statusLabel:'Watching',episodes:28,score:10},
            {malId:1,title:'Cowboy Bebop',poster:'/favicon.svg',statusLabel:'Completed',episodes:26,score:9}],
  }}));
  const srv=app.listen(5105); await new Promise(r=>srv.once('listening',r));
  const b=await launch();
  if (!b) { console.log('skipped — no browser available'); process.exit(0); }
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request',r=>{const u=r.url(); if(u.includes('/api/news')) return r.abort(); if(u.includes('/api/')) return r.respond({status:200,contentType:'application/json',body:JSON.stringify(api(u))}); return r.continue();});
  await p.setViewport({width:1440,height:1100});
  await p.goto('http://127.0.0.1:5105/__pv_profile.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>document.fonts&&document.fonts.ready?document.fonts.ready:null);
  await new Promise(r=>setTimeout(r,1200));
  await p.screenshot({path:path.join(OUT,'p-overview.png')});
  const tabs=await p.$$eval('.details-navigation-ul-li', els=>els.map(e=>e.dataset.target));
  for (const t of tabs.slice(1)) {
    try {
      await p.evaluate((target)=>{const li=[...document.querySelectorAll('.details-navigation-ul-li')].find(e=>e.dataset.target===target); if(li) li.click();}, t);
      await new Promise(r=>setTimeout(r,900));
      await p.screenshot({path:path.join(OUT,'p-'+t.toLowerCase().replace(/[^a-z]/g,'')+'.png')});
      console.log('shot tab', t);
    } catch(e){ console.log('tab failed', t, e.message); }
  }
  // layout assertions (guards against the grid-squeeze / unsized-thumbnail bugs)
  let pass=0, fail=0;
  const ck=(n,c,x)=>{console.log(`${c?'PASS':'FAIL'}  ${n}${x!==undefined?'  ['+x+']':''}`);c?pass++:fail++;};
  // The Favourites tab was removed on request, so it must not come back.
  const navTabs = await p.evaluate(()=>[...document.querySelectorAll('.details-navigation-ul-li')].map(e=>e.dataset.target));
  ck('the Favourites tab is gone', !navTabs.some(t=>/Favorit/i.test(t)), navTabs.join(', '));
  ck('the remaining tabs are intact', navTabs.length === 5, navTabs.length + ' tabs');

  // The Overview is the default tab and should carry real content.
  await p.evaluate(()=>{const li=[...document.querySelectorAll('.details-navigation-ul-li')].find(e=>e.dataset.target==='Overview-content'); if(li) li.click();});
  await new Promise(r=>setTimeout(r,600));
  const ov = await p.evaluate(()=>{
    const sec = document.getElementById('overview-section');
    const tiles = sec ? sec.querySelectorAll('.ov-stat').length : 0;
    const bars = sec ? sec.querySelectorAll('.ov-status').length : 0;
    const recent = sec ? sec.querySelectorAll('.ov-recent').length : 0;
    const links = sec ? [...sec.querySelectorAll('.ov-recent')].every(a=>/^\/anime\/\d+$/.test(a.getAttribute('href'))) : false;
    return { tiles, bars, recent, links, text: (sec||{}).textContent||'' };
  });
  ck('the Overview renders stat tiles', ov.tiles === 4, ov.tiles + ' tiles');
  ck('the Overview renders the status breakdown', ov.bars >= 2, ov.bars + ' rows');
  ck('the Overview lists recently updated titles', ov.recent >= 2, ov.recent + ' cards');
  ck('every recent title links to its info page', ov.links === true);
  ck('the Overview shows the totals', ov.text.includes('299') && ov.text.includes('69 days'));

  await p.evaluate(()=>{const li=[...document.querySelectorAll('.details-navigation-ul-li')].find(e=>e.dataset.target==='Anime-list-content'); if(li) li.click();});
  await new Promise(r=>setTimeout(r,800));
  const list=await p.evaluate(()=>{
    const img=document.querySelector('.anime-list-item-img');
    const row=document.querySelector('#user-anime-table-container tbody tr');
    return {imgW:img?Math.round(img.getBoundingClientRect().width):0, rowH:row?Math.round(row.getBoundingClientRect().height):0};
  });
  ck('anime-list thumbnail is small', list.imgW>0 && list.imgW<80, list.imgW+'px');
  ck('anime-list row is not blown up', list.rowH>0 && list.rowH<160, list.rowH+'px');

  await p.evaluate(()=>{const li=[...document.querySelectorAll('.details-navigation-ul-li')].find(e=>e.dataset.target==='Top-Tracks-content'); if(li) li.click();});
  await new Promise(r=>setTimeout(r,800));
  const trk=await p.evaluate(()=>{
    const c=document.querySelector('.track-card'); if(!c) return {w:0,h:0};
    const r=c.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};
  });
  ck('track card is a sensible size', trk.w>0 && trk.w<420, trk.w+'x'+trk.h);

  await p.evaluate(()=>{const li=[...document.querySelectorAll('.details-navigation-ul-li')].find(e=>e.dataset.target==='Statistics-content'); if(li) li.click();});
  await new Promise(r=>setTimeout(r,900));
  const st=await p.evaluate(()=>{
    const c=document.getElementById('statusChart');
    return c?Math.round(c.getBoundingClientRect().height):0;
  });
  ck('status chart has height', st>100, st+'px');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('console errors:', errs.length? errs.slice(0,3):'none');
  await b.close(); srv.close(); try{fs.unlinkSync(path.join(ROOT,'public','__pv_profile.html'));}catch(e){}
})();
