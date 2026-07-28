import puppeteer from 'puppeteer-core';
const SP='/private/tmp/claude-501/-Users-yigitsalihemecen-Desktop-games-with-sofia/c2af9dc8-17f5-441e-a28f-7eddcf0a8cd5/scratchpad';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const br=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const mk=async(id,name,w,h)=>{const p=await br.newPage();await p.setViewport({width:w,height:h,deviceScaleFactor:2});
  await p.evaluateOnNewDocument((i,n)=>{localStorage.setItem('taka.clientId',i);localStorage.setItem('taka.name',n);localStorage.setItem('taka.theme','light');},id,name);return p;};

const a=await mk('yigit-test','Yiğit',1280,860);
await a.goto('http://localhost:5199/#/g/backgammon',{waitUntil:'networkidle0'}); await sleep(900);
await a.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Open a table'))?.click());
await sleep(1400);
const code=await a.evaluate(()=>location.hash.split('/').pop());
const b=await mk('sofia-test','Sofia',430,880);
await b.goto(`http://localhost:5199/#/t/${code}`,{waitUntil:'networkidle0'}); await sleep(2500);

const read=async(p)=>p.evaluate(()=>{
  const home={};
  for(const el of document.querySelectorAll('.bg__row--bottom .pt')){
    const abs=parseInt(el.getAttribute('aria-label').replace('point ',''),10)-1;
    home[abs]={me:el.querySelectorAll('.chk--me').length,them:el.querySelectorAll('.chk--them').length};
  }
  const order=[...document.querySelectorAll('.bg__row--bottom .pt')].map(e=>parseInt(e.getAttribute('aria-label').replace('point ',''),10)-1);
  return {order, homeRight:order.slice(6), fiveOnHome:Object.entries(home).filter(([,v])=>v.me===5).map(([k])=>+k)};
});
const A=await read(a), B=await read(b);
console.log('seat0 bottom row (abs):', A.order.join(' '));
console.log('seat0 five-stack of own checkers at abs:', A.fiveOnHome.join(','));
console.log('seat1 bottom row (abs):', B.order.join(' '));
console.log('seat1 five-stack of own checkers at abs:', B.fiveOnHome.join(','));
console.log('seat0 home board bottom-right =', A.homeRight.join(','), '(expect 5,4,3,2,1,0)');
console.log('seat1 home board bottom-right =', B.homeRight.join(','), '(expect 18,19,20,21,22,23)');
await b.screenshot({path:`${SP}/bg-seat1.png`});
await br.close();
