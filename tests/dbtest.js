'use strict';
const fs=require('fs'), os=require('os'), path=require('path');
const { readEnv, writeEnv, quoteIfNeeded, parseArgs, friendly } = require('../scripts/setup-db.js');
let pass=0,fail=0;
const ck=(n,c,x)=>{console.log(`${c?'PASS':'FAIL'}  ${n}${x?'  ['+x+']':''}`);c?pass++:fail++;};

// arg parsing
const a = parseArgs(['node','x','--user','root','--password=p@ss#1','--port','3307']);
ck('parseArgs --user', a.user==='root', a.user);
ck('parseArgs --password= (equals form)', a.password==='p@ss#1', a.password);
ck('parseArgs --port', a.port==='3307', a.port);

// quoting (dotenv-safety)
ck('plain value unquoted', quoteIfNeeded('nikkilog')==='nikkilog', quoteIfNeeded('nikkilog'));
ck('value with # quoted', quoteIfNeeded('p@ss#1')==='"p@ss#1"', quoteIfNeeded('p@ss#1'));
ck('empty value quoted', quoteIfNeeded('')==='""', quoteIfNeeded(''));
ck('value with space quoted', quoteIfNeeded('a b')==='"a b"');

// read/write round-trip
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'nikkilog-'));
const envFile = path.join(tmp,'.env');
fs.writeFileSync(envFile, 'SECRET_KEY=keepme\nDB_USER=olduser\n\n# a comment\nOTHER=1\n');
const map = readEnv(envFile);
ck('readEnv reads SECRET_KEY', map.SECRET_KEY==='keepme', map.SECRET_KEY);
ck('readEnv reads DB_USER', map.DB_USER==='olduser');
map.DB_USER='root'; map.DB_PASSWORD='p#w'; map.DB_NAME='nikkilog';
writeEnv(map, envFile);
const out = fs.readFileSync(envFile,'utf8');
ck('SECRET_KEY preserved', out.includes('SECRET_KEY=keepme'));
ck('DB_USER updated', out.includes('DB_USER=root'));
ck('DB_PASSWORD quoted safely', out.includes('DB_PASSWORD="p#w"'), out.split('\n').find(l=>l.startsWith('DB_PASSWORD')));
ck('re-readable', readEnv(envFile).DB_PASSWORD==='"p#w"');
ck('unknown key preserved', out.includes('OTHER=1'));

// friendly error mapping
ck('ECONNREFUSED friendly', /running/.test(friendly({code:'ECONNREFUSED'})), friendly({code:'ECONNREFUSED'}));
ck('access denied friendly', /username or password/.test(friendly({code:'ER_ACCESS_DENIED_ERROR'})), friendly({code:'ER_ACCESS_DENIED_ERROR'}));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
