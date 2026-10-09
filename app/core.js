// ===== Paycheck Budget — shared budget logic =====
// Used by BOTH the app (index.html) and the scheduled email job (Code.gs), so they always agree.
// Edit this file only; push.ps1 copies it to Core.gs (server) and core.html (app).
// Everything here works on the global S (your budget data).

const DEFAULT_CATS = ['Uncategorized','Rent/Bills','Groceries','Food/Eating Out','Gas/Transport','Shopping','Subscriptions','Entertainment','Health','Other','Paycheck','Other Income'];

function todayISO(){const t=new Date();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}

function normalize(s){
  s=s||{};
  s.settings=Object.assign({payAmount:0,firstPayday:todayISO(),savingsGoal:0,goalType:'save',payMode:'fixed',payFreq:'biweekly',payAcct:'',payMin:100,payKey:'',acctNames:{},alertFrom:[],catLimits:{},email:{weekly:false,payday:false,limits:false}},s.settings||{});
  s.tx=s.tx||[]; s.overrides=s.overrides||{}; s.rules=s.rules||{};
  s.categories=s.categories||DEFAULT_CATS.slice();
  for(const c of ['Transfer','Recurring'])if(!s.categories.includes(c)) s.categories.push(c);
  s.bank={lastSync:(s.bank&&s.bank.lastSync)||0};
  s.deleted=s.deleted||[];
  s.recurring=s.recurring||[];
  s.settingsAt=s.settingsAt||0;
  s.logoCache=s.logoCache||{};
  s.recDismissed=s.recDismissed||[];
  s.emailLog=s.emailLog||{};
  s.goals=s.goals||[];
  return s;
}

const dn=s=>{const[y,m,d]=s.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5);};

const ds=n=>new Date(n*864e5).toISOString().slice(0,10);

const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});

const $m=v=>money.format(v||0);

const $r=v=>'$'+Math.round(v||0).toLocaleString('en-US');

const pretty=iso=>{const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-US',{month:'short',day:'numeric'});};

const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);

const merchantKey=d=>String(d).toLowerCase().replace(/[0-9#*]+/g,' ').replace(/[^a-z& ]/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,3).join(' ');

// ---------- pay periods ----------
// Auto mode: each period runs from one real payday (an income transaction in "Paycheck")
// to the day before the next. Before the first / after the last known payday, follow your pay schedule.
let PD; // cached payday list, cleared by resetCaches()
function paydays(){
  if(PD!==undefined)return PD;
  PD=null;
  if(S.settings.payMode==='auto'){
    const dates=[...new Set(S.tx.filter(t=>t.type==='income'&&t.cat==='Paycheck').map(t=>t.date))].sort();
    const out=[];for(const d of dates)if(!out.length||dn(d)-dn(out[out.length-1])>=5)out.push(d); // deposits a few days apart = same payday
    if(out.length)PD=out;
  }
  return PD;
}
// How often you're paid (Settings → Paycheck & goal). Twice-a-month schedules follow the calendar.
const PAY_FREQ={weekly:'Weekly',biweekly:'Every 2 weeks',semi_1_15:'Twice a month (1st & 15th)',semi_15_last:'Twice a month (15th & last day)',monthly:'Monthly'};
const PAY_DAYS={weekly:7,biweekly:14,semi_1_15:15.22,semi_15_last:15.22,monthly:30.44};
const payFreq=()=>PAY_FREQ[S.settings.payFreq]?S.settings.payFreq:'biweekly';
const lastDay=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
// twice-a-month paydays, numbered from January 2000: k=0 → first payday of Jan 2000, k=1 → second, …
function semiDate(k,f){
  const m=Math.floor(k/2),h=k-2*m,y=2000+Math.floor(m/12),mo=((m%12)+12)%12;
  const day=f==='semi_1_15'?(h?15:1):(h?lastDay(y,mo):15);
  return y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function semiIndex(iso,f){ // the twice-a-month period containing this date
  const [y,mo,d]=iso.split('-').map(Number),m=(y-2000)*12+mo-1;
  if(f==='semi_1_15')return m*2+(d>=15?1:0);
  return d<15?m*2-1:d<lastDay(y,mo-1)?m*2:m*2+1;
}
// the payday k paychecks after `anchor` (k can be negative)
function payStep(anchor,k){
  const f=payFreq();
  if(f==='monthly')return addMonth(anchor,k,+anchor.slice(8));
  if(f.startsWith('semi'))return k?semiDate(semiIndex(anchor,f)+k,f):anchor;
  return ds(dn(anchor)+PAY_DAYS[f]*k);
}
// how many paychecks after `anchor` the period containing `iso` is
function payCount(anchor,iso){
  let i=Math.floor((dn(iso)-dn(anchor))/PAY_DAYS[payFreq()]);
  while(payStep(anchor,i+1)<=iso)i++;
  while(i>-100000&&payStep(anchor,i)>iso)i--;
  return i;
}
function pStart(i){
  const B=paydays();if(!B)return payStep(S.settings.firstPayday,i);
  const L=B.length-1;
  return i<0?payStep(B[0],i):i>L?payStep(B[L],i-L):B[i];
}
const pEnd=i=>ds(dn(pStart(i+1))-1);
function pIndex(iso){
  const B=paydays();if(!B)return payCount(S.settings.firstPayday,iso);
  const L=B.length-1;
  if(iso<B[0])return payCount(B[0],iso);
  if(iso>=B[L])return L+payCount(B[L],iso);
  let i=0;while(B[i+1]<=iso)i++;return i;
}
// Is this deposit a paycheck? (into your paycheck account, or looks like payroll, and big enough)
function isPayDeposit(t){
  const s=S.settings;
  if(t.type!=='income'||t.amount<(+s.payMin||0))return false;
  if(TRANSFER_WORDS.test(t.desc))return false;
  if(s.payAcct&&t.acct===s.payAcct)return true;
  if(s.payKey&&t.desc.toLowerCase().includes(s.payKey.toLowerCase()))return true;
  return /payroll|direct dep|salary/i.test(t.desc);
}

// ---------- recurring purchases ----------
// Each one is set aside from your paycheck up front (not part of your spending money) and shown on its own.
// When the real charge shows up, it's matched to the bill so it isn't counted twice.
const FREQ={monthly:'Monthly',biweekly:'Every 2 weeks',weekly:'Weekly',period:'Every paycheck'};
function addMonth(iso,k,day){const[y,m]=iso.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+k,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(day,last));return first.toISOString().slice(0,10);}
function billDates(r,from,to){
  const out=[];if(!r.start)return out;
  const stop=r.end&&r.end<to?r.end:to;
  if(r.freq==='period'){ // once each pay period, due on payday
    for(let i=pIndex(from>r.start?from:r.start);pStart(i)<=stop;i++){const d=pStart(i);if(d>=r.start&&d>=from)out.push(d);if(i>pIndex(from)+400)break;}
    return out;
  }
  if(r.freq==='monthly'){const day=+r.start.slice(8);for(let k=0;k<1200;k++){const d=addMonth(r.start,k,day);if(d>stop)break;if(d>=from)out.push(d);}return out;}
  const step=r.freq==='weekly'?7:14;let n=dn(r.start);
  if(n<dn(from))n+=Math.ceil((dn(from)-n)/step)*step;
  for(;ds(n)<=stop;n+=step)out.push(ds(n));
  return out;
}
let BM; // cached bill matches: {occ:[{r,date,tx}], matched:Set(tx ids)}
function resetCaches(){PD=undefined;BM=undefined;}
function billMatches(){
  if(BM)return BM;
  const occ=[],matched=new Set();
  if(S.recurring.length){
    const dates=S.tx.map(t=>t.date).sort();
    const from=dates[0]&&dates[0]<todayISO()?ds(dn(dates[0])-31):ds(dn(todayISO())-31);
    const to=ds(dn(todayISO())+120);
    const exp=S.tx.filter(t=>t.type==='expense'&&t.cat!=='Transfer'&&!t.excluded);
    for(const r of S.recurring)for(const date of billDates(r,from,to)){
      // the bill's own word (or the first word of its name) appearing in the charge, or the exact amount
      const word=(r.match||(String(r.name).toLowerCase().match(/[a-z]{3,}/)||[''])[0]).toLowerCase().trim();
      let best=null,bestGap=99;
      for(const t of exp){
        if(matched.has(t.id))continue;
        const off=dn(t.date)-dn(date);if(off<-3||off>5)continue; // charged up to 3 days early or 5 days late
        const gap=Math.abs(off);
        const near=Math.abs(t.amount-r.amount)<=Math.max(.01,r.amount*.005);
        const named=word&&t.desc.toLowerCase().includes(word)&&Math.abs(t.amount-r.amount)<=r.amount*.25;
        if((near||named)&&gap<bestGap){best=t;bestGap=gap;}
      }
      if(best)matched.add(best.id);
      occ.push({r,date,tx:best});
    }
  }
  return BM={occ,matched};
}
function periodSummary(i){
  const start=pStart(i),end=pEnd(i);
  const txs=S.tx.filter(t=>t.date>=start&&t.date<=end);
  const {occ,matched}=billMatches();
  const bills=occ.filter(o=>o.date>=start&&o.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  let income=0,spent=0,billsTotal=0;const byCat={};
  for(const o of bills)billsTotal+=o.tx?o.tx.amount:o.r.amount;
  for(const t of txs){
    if(t.cat==='Transfer') continue; // moving money between your own accounts isn't spending or income
    if(t.excluded) continue; // you left it out of the budget
    if(t.type==='income'){
      if(S.settings.payMode==='fixed'&&t.cat==='Paycheck') continue; // fixed amount already covers the paycheck
      income+=t.amount;
    }else if(matched.has(t.id)) continue; // already counted as a recurring bill
    else if(t.cat==='Recurring') billsTotal+=t.amount; // marked recurring by hand
    else { spent+=t.amount; byCat[t.cat]=(byCat[t.cat]||0)+t.amount; }
  }
  let paycheck=0;
  if(S.settings.payMode==='fixed'){
    paycheck = (start in S.overrides) ? S.overrides[start] : (+S.settings.payAmount||0);
  }
  income+=paycheck;
  return {i,start,end,txs,income,spent,bills,billsTotal,saved:income-spent-billsTotal,byCat,paycheck};
}
function periodRange(){
  const cur=pIndex(todayISO());
  let lo=Math.min(0,cur);
  for(const t of S.tx) lo=Math.min(lo,pIndex(t.date));
  return [lo,cur];
}

// Alerts don't include a category, so guess from the merchant name
const KEYWORD_CATS=[
  [/kroger|publix|aldi|walmart|wal-mart|food lion|winn|piggly|sams club|costco|grocery|market/i,'Groceries'],
  [/mcdonald|chick|taco|wendy|sonic|burger|pizza|starbucks|dunkin|subway|zaxby|popeye|waffle|doordash|uber ?eats|grubhub|restaurant|cafe|grill/i,'Food/Eating Out'],
  [/shell|exxon|chevron|\bbp\b|marathon|circle k|racetrac|quiktrip|\bqt\b|murphy|speedway|valero|sunoco|uber|lyft|parking/i,'Gas/Transport'],
  [/netflix|spotify|hulu|disney|apple\.com|itunes|google \*|youtube|xbox|playstation|steam|amazon prime|max\.com|paramount/i,'Subscriptions'],
  [/amazon|amzn|target|best buy|dollar|tj ?maxx|ross|old navy|walgreens|cvs/i,'Shopping'],
  [/payroll|direct dep|salary|paycheck/i,'Paycheck'],
];

const TRANSFER_WORDS=/transfer|xfer|from sav|to sav|from chk|to chk/i;
function guessCat(desc,type,t){
  const r=S.rules[merchantKey(desc)];if(r)return r;
  if(t&&S.settings.payMode==='auto'&&isPayDeposit(t))return 'Paycheck';
  if(TRANSFER_WORDS.test(desc))return 'Transfer';
  // your paycheck goes into one account and you move money to the others as needed,
  // so a non-payroll deposit into one of those other accounts is a transfer, not income
  if(type==='income'&&t&&t.acct&&S.settings.payMode==='auto'&&S.settings.payAcct&&t.acct!==S.settings.payAcct&&!/payroll|direct dep|salary|refund|return/i.test(desc))return 'Transfer';
  const k=KEYWORD_CATS.find(([re])=>re.test(desc));
  if(type==='income')return k&&k[1]==='Paycheck'?'Paycheck':'Other Income';
  return k&&k[1]!=='Paycheck'?k[1]:'Uncategorized';
}

function mergeStates(a,b){ // a = this device, b = saved copy; this device's settings win, transactions are combined
  const out={...b,...a};
  // settings: the most recently saved wins; untouched defaults never beat real settings
  const configured=x=>x.settings.payMode!=='fixed'||!!x.settings.payAmount||!!x.settings.savingsGoal;
  const aWins=a.settingsAt!==b.settingsAt?a.settingsAt>b.settingsAt:(configured(a)||!configured(b));
  const [win,lose]=aWins?[a,b]:[b,a];
  out.settings={...lose.settings,...win.settings,acctNames:{...(lose.settings.acctNames||{}),...(win.settings.acctNames||{})}};
  out.settingsAt=Math.max(a.settingsAt,b.settingsAt);
  out.overrides={...b.overrides,...a.overrides};out.rules={...b.rules,...a.rules};
  out.categories=[...new Set([...b.categories,...a.categories])];
  out.deleted=[...new Set([...b.deleted,...a.deleted])];
  const del=new Set(out.deleted),seen=new Set(),tx=[];
  const key=t=>t.bid||[t.date,(+t.amount).toFixed(2),t.type,String(t.desc).toLowerCase()].join('|'); // same manual entry on 2 devices = 1
  for(const t of [...a.tx,...b.tx]){if(del.has(t.id))continue;const k=key(t);if(seen.has(k))continue;seen.add(k);tx.push(t);}
  out.tx=tx;
  const rs=new Set();out.recurring=[];
  for(const r of [...a.recurring,...b.recurring]){if(del.has(r.id)||rs.has(r.id))continue;rs.add(r.id);out.recurring.push(r);}
  out.logoCache={...b.logoCache,...a.logoCache};
  out.recDismissed=[...new Set([...b.recDismissed,...a.recDismissed])];
  out.emailLog={...b.emailLog,...a.emailLog};
  const gs=new Set();out.goals=[];
  for(const g of [...a.goals,...b.goals]){if(del.has(g.id)||gs.has(g.id))continue;gs.add(g.id);out.goals.push(g);}
  out.bank={lastSync:Math.max(a.bank.lastSync||0,b.bank.lastSync||0)};
  return normalize(out);
}

// ---------- bank alerts -> transactions ----------
// list = transactions from getAlertTransactions(); returns how many were new (duplicates skipped)
function importAlerts(list){
  const have=new Set([...S.tx.filter(t=>t.bid).map(t=>t.bid),...S.deleted]);let added=0; // deleted ones stay deleted
  for(const t of list){
    const bid='g|'+t.id;
    if(have.has(bid)){ // already here: take the reader's latest name for it (fixes earlier misreads)
      const ex=S.tx.find(x=>x.bid===bid);
      if(ex&&ex.desc!==t.desc){ex.desc=t.desc;ex.acct=t.acct||ex.acct;if(ex.cat==='Uncategorized')ex.cat=guessCat(ex.desc,ex.type,ex);added++;}
      continue;
    }
    const nt={id:uid(),bid,date:t.date,desc:t.desc,amount:t.amount,type:t.type,acct:t.acct||''};
    nt.cat=guessCat(nt.desc,nt.type,nt);S.tx.push(nt);have.add(bid);added++;
  }
  if(added)pairTransfers();
  resetCaches();
  return added;
}
// money leaving one of your accounts and the same amount arriving in another within 2 days = a transfer
function pairTransfers(){
  const out=S.tx.filter(t=>t.type==='expense'&&t.acct&&t.cat!=='Transfer'&&!t.excluded&&!S.rules[merchantKey(t.desc)]);
  const inc=S.tx.filter(t=>t.type==='income'&&t.acct&&t.cat!=='Paycheck'&&t.cat!=='Transfer'&&!S.rules[merchantKey(t.desc)]);
  for(const o of out){
    const m=inc.find(i=>i.acct!==o.acct&&Math.abs(i.amount-o.amount)<.01&&Math.abs(dn(i.date)-dn(o.date))<=2&&i.cat!=='Transfer');
    if(m){o.cat='Transfer';m.cat='Transfer';}
  }
}

// ---------- category limits (per paycheck) ----------
// -> [{cat, limit, spent, pct}] for every category you've set a limit on
function limitStatus(p){
  return Object.entries(S.settings.catLimits||{}).filter(([c,v])=>+v>0)
    .map(([cat,limit])=>({cat,limit:+limit,spent:p.byCat[cat]||0,pct:(p.byCat[cat]||0)/+limit}))
    .sort((a,b)=>b.pct-a.pct);
}

// ---------- spot recurring charges ----------
// Same store, steady amount (within 10%), regular spacing (weekly / every 2 weeks / monthly), seen 2+ times,
// and not already a recurring purchase or dismissed.
function detectRecurring(){
  const {matched}=billMatches(),dismissed=new Set(S.recDismissed);
  const known=S.recurring.flatMap(r=>[(r.match||'').toLowerCase(),merchantKey(r.name)]).filter(Boolean);
  const groups={};
  for(const t of S.tx){
    if(t.type!=='expense'||t.cat==='Transfer'||t.cat==='Recurring'||t.excluded||matched.has(t.id))continue;
    const k=merchantKey(t.desc);if(k)(groups[k]=groups[k]||[]).push(t);
  }
  const out=[];
  for(const [k,list] of Object.entries(groups)){
    if(list.length<2||dismissed.has(k)||known.some(w=>k.includes(w)||w.includes(k)))continue;
    list.sort((a,b)=>a.date.localeCompare(b.date));
    const amts=list.map(t=>t.amount).sort((a,b)=>a-b),med=amts[amts.length>>1];
    if(list.some(t=>Math.abs(t.amount-med)>Math.max(1,med*.1)))continue;
    const gaps=list.slice(1).map((t,i)=>dn(t.date)-dn(list[i].date)),avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const freq=avg>=26&&avg<=35?'monthly':avg>=12&&avg<=16?'biweekly':avg>=6&&avg<=8?'weekly':null;
    if(!freq||gaps.some(g=>Math.abs(g-avg)>4))continue;
    const last=list[list.length-1];
    const next=freq==='monthly'?addMonth(last.date,1,+last.date.slice(8)):ds(dn(last.date)+(freq==='weekly'?7:14));
    out.push({key:k,name:last.desc,amount:Math.round(med*100)/100,freq,next,count:list.length});
  }
  return out;
}

// ---------- the numbers on the Home screen (also used in emails) ----------
function budgetNumbers(i){
  const p=periodSummary(i),goal=+S.settings.savingsGoal||0,spendMode=S.settings.goalType==='spend';
  const left=spendMode&&goal?goal-p.spent:p.income-p.billsTotal-(spendMode?0:goal)-p.spent;
  const isCur=i===pIndex(todayISO()),daysLeft=isCur?dn(p.end)-dn(todayISO())+1:0;
  return {p,goal,spendMode,left,isCur,daysLeft,perDay:daysLeft>0&&left>0?left/daysLeft:0};
}


// ---------- savings goals ----------
// Every finished paycheck, what you saved (income − spending − recurring) is shared out to your goals in
// list order: each takes up to its "per paycheck" amount until it's reached. Money you add or take out by
// hand (adjust) and a starting amount count too.
function goalProgress(){
  const cur=pIndex(todayISO());
  const res=S.goals.map(g=>({g,saved:(+g.startAmt||0)+(+g.adjust||0)}));
  if(res.length){
    const first=Math.min(...S.goals.map(g=>pIndex(g.created||todayISO())));
    for(let i=first;i<cur;i++){
      let left=Math.max(0,periodSummary(i).saved);
      for(const r of res){
        if(left<=0)break;
        if(pEnd(i)<(r.g.created||''))continue; // goal didn't exist yet
        const give=Math.min(+r.g.per||0,left,Math.max(0,r.g.target-r.saved));
        r.saved+=give;left-=give;
      }
    }
  }
  for(const r of res){
    r.saved=Math.max(0,r.saved);
    const remain=Math.max(0,r.g.target-r.saved);
    r.pct=r.g.target?Math.min(1,r.saved/r.g.target):0;
    r.done=remain<=0;
    r.paychecks=!r.done&&r.g.per>0?Math.ceil(remain/r.g.per):null;
    r.eta=r.paychecks?pStart(cur+r.paychecks):null; // payday it should be reached
  }
  return res;
}

// ---------- trends: last few paychecks side by side ----------
// -> {periods:[summary...] oldest first (only ones with data), cats:{name:[amount per period]}}
function trends(n){
  const cur=pIndex(todayISO()),periods=[];
  for(let i=cur-n+1;i<=cur;i++){const p=periodSummary(i);if(p.txs.length||p.income||p.billsTotal)periods.push(p);}
  const cats={};
  periods.forEach((p,k)=>{
    const add=(c,v)=>{(cats[c]=cats[c]||periods.map(()=>0))[k]+=v;};
    for(const [c,v] of Object.entries(p.byCat))add(c,v);
    if(p.billsTotal)add('Recurring',p.billsTotal);
  });
  return {periods,cats};
}

// ---------- year in review ----------
function yearsWithData(){
  const ys=new Set(S.tx.map(t=>t.date.slice(0,4)));ys.add(todayISO().slice(0,4));
  return [...ys].sort().reverse();
}
function yearReview(y){
  // money totals come from the pay periods that started that year
  let earned=0,spent=0,bills=0,saved=0,hit=0,full=0;const byCat={};
  const goal=+S.settings.savingsGoal||0,cur=pIndex(todayISO());
  const [lo,hi]=periodRange();
  for(let i=lo;i<=hi;i++){
    const p=periodSummary(i);if(!p.start.startsWith(y)||!(p.txs.length||p.income))continue;
    earned+=p.income;spent+=p.spent;bills+=p.billsTotal;saved+=p.saved;
    for(const [c,v] of Object.entries(p.byCat))byCat[c]=(byCat[c]||0)+v;
    if(i<cur){full++;if(S.settings.goalType==='spend'?p.spent<=goal:p.saved>=goal)hit++;}
  }
  if(bills)byCat['Recurring']=(byCat['Recurring']||0)+bills;
  // store and month details come from the purchases themselves
  const stores={},months=Array(12).fill(0);let count=0,biggest=null;
  for(const t of S.tx){
    if(!t.date.startsWith(y)||t.type!=='expense'||t.cat==='Transfer'||t.excluded)continue;
    count++;months[+t.date.slice(5,7)-1]+=t.amount;
    if(!biggest||t.amount>biggest.amount)biggest=t;
    const k=merchantKey(t.desc)||t.desc;
    const s=stores[k]=stores[k]||{name:t.desc,cat:t.cat,total:0,visits:0};s.total+=t.amount;s.visits++;
  }
  const storeList=Object.values(stores);
  return {y,earned,spent,bills,saved,rate:earned?saved/earned:0,hit,full,byCat,months,count,biggest,
    topStores:storeList.slice().sort((a,b)=>b.total-a.total).slice(0,5),
    regular:storeList.slice().sort((a,b)=>b.visits-a.visits)[0]||null};
}

// ---------- leave out / delete ----------
function deleteTx(id){
  const t=S.tx.find(x=>x.id===id);if(!t)return;
  S.tx=S.tx.filter(x=>x!==t);S.deleted.push(t.id);if(t.bid)S.deleted.push(t.bid);
  resetCaches();
}

// ---------- readable names ----------
// Bank alerts arrive in capitals with payment-service prefixes ("PAYPAL *RUNNINGRIOT", "KROGER #123").
// nice() turns that into "PayPal · Runningriot" / "Kroger" for display only; the original stays saved.
// Names you typed yourself (not all capitals) are left exactly as they are.
const PROCESSORS=[[/^(paypal|pp)\s*\*\s*/i,'PayPal'],[/^venmo\s*\*\s*/i,'Venmo'],[/^cash\s*app\s*\*\s*/i,'Cash App'],
  [/^google\s*\*\s*/i,'Google'],[/^apple\.com\/bill\s*/i,'Apple'],[/^(amzn|amazon)\s*mktp\w*\s*\S*\s*/i,'Amazon'],
  [/^(sq|tst|sp|dd)\s*\*\s*/i,'']]; // card readers (Square, Toast, Shopify, DoorDash): just show the store
function nice(desc){
  let d=String(desc||'').trim();
  if(!d||d!==d.toUpperCase()||!/[A-Z]/.test(d))return d;
  let via='';
  for(const [re,p] of PROCESSORS)if(re.test(d)){d=d.replace(re,'');via=p;break;}
  d=d.replace(/\s*#\s*\d+.*$/,'').replace(/\s+\d{3,}.*$/,'').replace(/\*+/g,' ').replace(/\s+/g,' ').trim();
  const name=d.toLowerCase().replace(/(^|[\s\-\/&])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  return via?(name?via+' · '+name:via):(name||String(desc).trim());
}
