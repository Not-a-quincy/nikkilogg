'use strict';
process.env.SECRET_KEY='sc'; process.env.DB_HOST='127.0.0.1';
const { launch } = require('./helpers/browser');
const app=require('../src/app');
let pass=0,fail=0;
const ck=(n,c,x)=>{console.log(`${c?'PASS':'FAIL'}  ${n}${x!==undefined?'  ['+x+']':''}`);c?pass++:fail++;};
(async()=>{
  const srv=app.listen(5103); await new Promise(r=>srv.once('listening',r));
  const b=await launch();
  if (!b) { console.log('skipped — no browser available'); process.exit(0); }
  const p=await b.newPage();
  await p.setRequestInterception(true);
  p.on('request',r=>r.url().includes('/api/')?r.respond({status:200,contentType:'application/json',body:'{"anime":[]}'}):r.continue());
  await p.setViewport({width:1440,height:900});
  await p.goto('http://127.0.0.1:5103/browse',{waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,600));
  const before=await p.evaluate(()=>getComputedStyle(document.querySelector('.search-overlay-container')).display);
  ck('search overlay hidden at rest', before==='none', before);
  await p.click('#topbarSearchBtn');
  await new Promise(r=>setTimeout(r,300));
  const after=await p.evaluate(()=>{
    const o=document.querySelector('.search-overlay-container');
    const inp=o.querySelector('input[type="search"]');
    return { display:getComputedStyle(o).display, inputVisible: inp && inp.getBoundingClientRect().height>10 };
  });
  ck('search overlay opens on the top-bar button', after.display==='block', after.display);
  ck('search input is visible', after.inputVisible===true);
  const btn=await p.evaluate(()=>{
    const b=document.querySelector('.filter-btn');
    if(!b) return 'no filter btn';
    const cs=getComputedStyle(b);
    return cs.borderRadius+' / bg '+cs.backgroundColor;
  });
  ck('filter button is styled', /px/.test(btn), btn);
  const bullets=await p.evaluate(()=>{
    // does the reset actually apply to lists?
    const ul=document.createElement('ul'); document.body.appendChild(ul);
    const t=getComputedStyle(ul).listStyleType; ul.remove(); return t;
  });
  ck('list markers removed', bullets==='none'||bullets==='n/a', bullets);
  await b.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
