process.env.SECRET_KEY='t'; process.env.DB_HOST='127.0.0.1';
const http=require('http'); const app=require('../src/app');
const s=app.listen(5077,()=>{
  const paths=['/css/home.css','/css/browse.css','/css/anime.css','/css/profile.css','/css/auth.css','/css/admin_report.css','/js/index.js','/default-bg.jpg'];
  let i=0,pass=0,fail=0;
  const next=()=>{ if(i>=paths.length){console.log(`\n${pass} served, ${fail} failed`);return s.close(()=>process.exit(fail?1:0));}
    const p=paths[i++];
    http.get({host:'127.0.0.1',port:5077,path:p},r=>{console.log(`${r.statusCode===200?'PASS':'FAIL'} ${p} -> ${r.statusCode}`);r.statusCode===200?pass++:fail++;r.resume();next();}).on('error',e=>{console.log('ERR',p,e.message);fail++;next();});
  }; next();
});
