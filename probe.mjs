import puppeteer from 'puppeteer-core';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const br=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await br.newPage(); await p.setViewport({width:1280,height:860});
await p.goto('http://localhost:5199/#/g/durak/solo',{waitUntil:'networkidle0'});
await sleep(3000);
const dump=(tag)=>p.evaluate((tag)=>{
  const tt=document.querySelector('.tabletop'); const cs=getComputedStyle(tt); const r=tt.getBoundingClientRect();
  return {tag, cls:tt.className, minW:cs.minWidth, minH:cs.minHeight, w:Math.round(r.width), h:Math.round(r.height),
    cardW:getComputedStyle(document.querySelector('.board')).getPropertyValue('--card-w').trim(),
    cardWpx:Math.round(document.querySelector('.fan--self .pcard').getBoundingClientRect().width),
    bouts:[...document.querySelectorAll('.bout')].map(b=>Math.round(b.getBoundingClientRect().x))};
},tag);
console.log(JSON.stringify(await dump('empty')));
await p.evaluate(()=>document.querySelector('.fan--self .pcard.is-live')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
await sleep(700);  console.log(JSON.stringify(await dump('1 bout')));
await sleep(2500); console.log(JSON.stringify(await dump('after bot')));
await br.close();
