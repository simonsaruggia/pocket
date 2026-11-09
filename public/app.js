import {GROUPS,CATEGORIES,amountCents,cleanTag,normalizedTags,summary,filterRows,overviewSummary} from '/domain.js?v=15';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const shortMoney=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monthTitle=m=>new Date(m+'-15T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Europe/Rome'});
const dateTitle=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Europe/Rome'});
const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',arrows:'<path d="M7 3v17m-4-4 4 4 4-4M17 21V4m-4 4 4-4 4 4"/>',tag:'<path d="m3 3 9 .2 9 9a2 2 0 0 1 0 2.8l-6 6a2 2 0 0 1-2.8 0l-9-9Z"/><circle cx="7.5" cy="7.5" r="1"/>',layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',leaf:'<path d="M20 3C9 2 3 7 4 14c1 7 10 8 14 2 3-4 2-13 2-13ZM4 21l11-12"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>',plus:'<path d="M12 5v14M5 12h14"/>','chevron-left':'<path d="m14 6-6 6 6 6"/>','chevron-right':'<path d="m10 6 6 6-6 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>','arrow-up-right':'<path d="M6 18 18 6M7 6h11v11"/>','arrow-down-left':'<path d="M18 6 6 18M6 7v11h11"/>','arrow-down':'<path d="M12 4v16m-6-6 6 6 6-6"/>','arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',wallet:'<path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7m18 6h-5v4h5"/>',sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',pie:'<path d="M10 3a9 9 0 1 0 11 11H10ZM14 2v8h8a9 9 0 0 0-8-8Z"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',x:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',coffee:'<path d="M3 8h13v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm13 1h2a3 3 0 0 1 0 6h-2M6 3v2m4-2v2m4-2v2M2 23h17"/>',home:'<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>',bag:'<path d="M5 7h14l2 14H3Zm3 0V5a4 4 0 0 1 8 0v2"/>',car:'<path d="m4 10 2-6h12l2 6M3 11h18v8H3Zm2 8v2m14-2v2M6 14h2m8 0h2"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'};
const icon=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[n]||paths.wallet)+'</svg>';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
icons();
let state={transactions:[],tags:[],budgets:[]},view='overview',month=today().slice(0,7),selectedTrip='',review=[],saveRequestId='',saveFingerprint='',toastTimeout;
const tripCategoryFilters=new Map();
let tripDetailTab='breakdown';
const chartLevels={overview:'groups',trip:'categories'};
try{const saved=JSON.parse(localStorage.getItem('pocket-chart-levels'));for(const key of ['overview','trip'])if(['groups','categories'].includes(saved?.[key]))chartLevels[key]=saved[key];}catch{}
// Display colors are independent of stored categories and transaction data.
const groupColors=Object.fromEntries([...GROUPS.map(g=>[g.id,g.color]),['trips','#3A6FF7']]);
const categoryColor=id=>['#377AF6','#25A993','#A481DA','#EB9864','#5DA9D5','#DF7BA4','#A5B552','#728BD6','#DBB04C','#50AAB2','#B18576','#7FA25C','#C479BC','#8493A8'][Math.max(0,CATEGORIES.findIndex(c=>c.id===id))%14];
function chartLevelControl(context){return '<div class="chart-level-control" role="group" aria-label="'+(context==='overview'?'Overview':'Trip')+' chart detail">'+[['groups','Head categories'],['categories','Categories']].map(([level,label])=>'<button type="button" data-chart-context="'+context+'" data-chart-level="'+level+'" aria-pressed="'+(chartLevels[context]===level)+'">'+label+'</button>').join('')+'</div>';}
function chooseChartLevel(context,level){chartLevels[context]=level;try{localStorage.setItem('pocket-chart-levels',JSON.stringify(chartLevels));}catch{}if(context==='overview')renderOverview();else renderTrips();document.querySelector('[data-chart-context="'+context+'"][data-chart-level="'+level+'"]')?.focus({preventScroll:true});}
function renderTripTab(){
  $('trip-detail').dataset.tab=tripDetailTab;
  document.querySelectorAll('[data-trip-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tripTab===tripDetailTab)));
}

let activeDefault='';try{activeDefault=localStorage.getItem('pocket-default-tag')||'';}catch{}
$('month').value=month;
function toast(text){$('toast-text').textContent=text;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,3800);}
function formError(id,message){$(id).textContent=message;$(id).hidden=!message;}
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:{'content-type':'application/json','x-pocket-client':'1'},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{throw new Error('Pocket could not connect. Please try again.');}if(!r.ok){const e=new Error(data.error||'Something went wrong. Please try again.');e.status=r.status;throw e;}return data;}
async function load({quiet=false}={}){try{state=await api('/api/state');$('load-error').hidden=true;$('app-content').hidden=false;render();return true;}catch(e){$('load-error').textContent=e.message;if(e.status===401){$('load-error').insertAdjacentHTML('beforeend',' <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a>');}$('load-error').hidden=false;return false;}finally{$('loading').hidden=true;}}
function categoryOptions(selected){return GROUPS.map(g=>'<optgroup label="'+esc(g.name)+'">'+CATEGORIES.filter(c=>c.groupId===g.id).map(c=>'<option value="'+c.id+'"'+(c.id===selected?' selected':'')+'>'+esc(c.displayName)+'</option>').join('')+'</optgroup>').join('');}
function tagOptions(selected='',empty='All tags'){return '<option value="">'+empty+'</option>'+state.tags.map(t=>'<option value="'+esc(t)+'"'+(t===selected?' selected':'')+'>'+esc(t)+'</option>').join('');}
function currentRows(){return filterRows(state.transactions,{month});}
function currentBudget(){return state.budgets.find(b=>b.month===month)?.amount_cents||0;}
function render(){
  $('month-label').textContent=monthTitle(month);$('month').value=month;
  const tagFilter=$('tag-filter').value;$('tag-filter').innerHTML=tagOptions(tagFilter);
  $('default-tag').innerHTML=tagOptions(state.tags.includes(activeDefault)?activeDefault:'','No tag');
  $('tag-suggestions').innerHTML=state.tags.map(t=>'<option value="'+esc(t)+'">').join('');
  renderOverview();renderTransactions();renderTrips();
}
function overviewTrips(s){
  if(!s.trips.length)return '';
  return '<div class="overview-trips"><h3>Trips / Vacation</h3><p>Tagged spending this month</p><ul>'+s.trips.map(trip=>'<li><span class="overview-trip-tags">'+trip.tags.map(tag=>'<button class="text-button" data-overview-trip="'+esc(tag)+'">#'+esc(tag)+'</button>').join('<span aria-hidden="true"> + </span>')+(trip.tags.length>1?'<small>Shared expense total</small>':'')+'</span><strong>'+money(trip.amount_cents)+'</strong></li>').join('')+'</ul>'+(s.trips.some(trip=>trip.tags.length>1)?'<p class="shared-trip-note">Expenses with multiple tags appear together and are counted once.</p>':'')+'</div>';
}
function renderOverview(){
  const rows=currentRows(),s=overviewSummary(rows),budget=currentBudget();
  const detailed=chartLevels.overview==='categories';
  const amounts=detailed?{...s.everydayCategories,trips:s.groups.trips}:s.groups;
  const overviewGroups=[...(detailed?CATEGORIES.filter(c=>amounts[c.id]>0).sort((a,b)=>amounts[b.id]-amounts[a.id]).map(c=>({...c,name:c.displayName,color:categoryColor(c.id)})):GROUPS.map(g=>({...g,color:groupColors[g.id]}))),{id:"trips",name:"Trips / Vacation",color:groupColors.trips}];
  $('spending').textContent=money(s.spending);
  const count=rows.filter(t=>t.kind==='expense').length;$('expense-count').textContent=count+' expense'+(count===1?'':'s')+' this month';
  let offset=0;const segments=overviewGroups.map(g=>{const start=offset;offset+=s.spending?(amounts[g.id]||0)/s.spending*100:0;return g.color+' '+start+'% '+offset+'%';}).join(',');
  $('category-breakdown').innerHTML='<div class="overview-chart-controls">'+chartLevelControl('overview')+'<p>Tagged expenses stay in Trips / Vacation.</p></div><div class="category-body"><div class="donut-wrap"><div class="donut" style="background:'+(s.spending?'conic-gradient('+segments+')':'#E9EEF8')+'"></div><div class="donut-center"><span>'+ (s.spending?'TOTAL SPENT':'A FRESH START')+'</span><strong>'+money(s.spending)+'</strong></div></div><div class="category-legend">'+overviewGroups.map(g=>'<div class="legend-row"><span class="legend-dot" style="background:'+g.color+'"></span><span class="legend-name" title="'+esc(g.name)+'">'+esc(g.name)+'</span><strong>'+money(amounts[g.id]||0)+'</strong></div>').join('')+'</div></div>'+overviewTrips(s)+(s.spending?'':'<p class="category-empty">Your first expense will bring this picture to life.</p>');
  $('edit-budget').innerHTML=(budget?'Edit budget':'Set budget')+' '+icon('arrow-up-right');
  $('budget-remaining').textContent=budget?money(Math.abs(budget-s.spending))+' '+(s.spending>budget?'over budget':'left'):'Set your pace';
  $('budget-remaining').classList.toggle('negative',!!budget&&s.spending>budget);
  $('budget-subtitle').textContent=budget?'Of your '+money(budget)+' budget for '+monthTitle(month):'Give this month a spending limit.';
  $('budget-progress').style.width=budget?Math.min(s.spending/budget*100,100)+'%':'0%';$('budget-progress').classList.toggle('over-budget',!!budget&&s.spending>budget);
  $('budget-spent').textContent=shortMoney(s.spending)+' spent';$('budget-total').textContent=budget?shortMoney(budget)+' budget':'No budget yet';
  const budgetText=budget?(s.spending>budget?'A little over your plan. <br>You can adjust your budget anytime.':Math.round(s.spending/budget*100)+'% of your budget used. <br>A little awareness goes a long way.'):'Your budget is a guide. <br>Make it work for you.';
  $('budget-message').innerHTML=icon('leaf')+'<p>'+budgetText+'</p>';
  $('recent-list').innerHTML=rows.length?rows.slice(0,5).map(transactionRow).join(''):empty('Your story starts here','Add your first transaction. We’ll take care of the bigger picture.','Add your first expense','add','wallet');
}
function empty(title,description,button,action,ico='wallet'){return '<div class="empty-state"><div class="empty-icon">'+icon(ico)+'</div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p>'+(button?'<button class="secondary" data-action="'+action+'">'+icon('plus')+esc(button)+'</button>':'')+'</div>';}
function transactionRow(t){const c=CATEGORIES.find(c=>c.id===t.category_id)||CATEGORIES[0],color=groupColors[c.groupId],title=t.fx?(t.fx.original_note||c.name):(t.note||c.name).split(' | ')[0];return '<button class="transaction-row" data-edit="'+esc(t.id)+'" aria-label="Edit '+esc(t.note||c.name)+', '+esc(money(t.amount_cents))+'"><span class="category-icon" style="background:'+color+'14;color:'+color+'">'+'<span aria-hidden="true">'+c.emoji+'</span>'+'</span><span class="transaction-info"><span class="transaction-title" title="'+esc(t.note||c.name)+'">'+esc(title)+'</span>'+(t.fx&&t.fx.original_currency!=='EUR'?'<span class="transaction-original">Original: '+esc(new Intl.NumberFormat('en-IE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(t.fx.original_amount_cents/100))+' '+esc(t.fx.original_currency)+'</span>':'')+'<span class="transaction-meta"><span>'+esc(c.displayName)+'</span>'+t.tags.map(tag=>'<span class="tag-chip">#'+esc(tag)+'</span>').join('')+'</span></span><span class="transaction-right"><span class="transaction-amount">−'+money(t.amount_cents)+'</span><span class="transaction-date">'+dateTitle(t.occurred_on)+'</span></span><span class="row-chevron">'+icon('chevron-right')+'</span></button>';}
function transactionFilters(){const query=$('search').value.trim().toLocaleLowerCase(),group=$('group-filter').value,tag=$('tag-filter').value;return filterRows(currentRows(),{tag}).filter(t=>{const c=CATEGORIES.find(c=>c.id===t.category_id);return (!group||c?.groupId===group)&&(!query||[t.note,c?.name,c?.group,...t.tags].join(' ').toLocaleLowerCase().includes(query));});}
function renderTransactions(){const rows=transactionFilters(),s=summary(rows);$('list-total').textContent=rows.length+' expense'+(rows.length===1?'':'s')+' · '+money(s.spending)+' spent';$('transactions-list').innerHTML=rows.length?rows.map(transactionRow).join(''):empty('Nothing here just yet','Try a different month or filter, or add an expense.','Add expense','add');}
function tripCategoryChart(s,tag){
  if(!s.spending)return '<div class="trip-chart-empty">Your category breakdown will appear with your first expense.</div>';
  const byGroup=chartLevels.trip==='groups',levelName=byGroup?'head category':'category';
  const entries=Object.entries(byGroup?s.groups:s.categories).filter(([,amount])=>amount>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  let angle=-Math.PI/2;
  const parts=entries.map(([id,amount],i)=>{
    const c=(byGroup?GROUPS:CATEGORIES).find(c=>c.id===id),name=(byGroup?c?.name:c?.displayName)||id,share=amount/s.spending,percent=(share*100).toFixed(1)+'%',color=byGroup?groupColors[id]:categoryColor(id);
    const end=angle+share*Math.PI*2,x=100+96*Math.cos(angle),y=100+96*Math.sin(angle),ex=100+96*Math.cos(end),ey=100+96*Math.sin(end);
    const title=esc(name+' · '+money(amount)+' · '+percent);
    const shape=entries.length===1?'<circle cx="100" cy="100" r="96" fill="'+color+'"><title>'+title+'</title></circle>':'<path d="M100 100 L'+x+' '+y+' A96 96 0 '+(share>0.5?1:0)+' 1 '+ex+' '+ey+' Z" fill="'+color+'"><title>'+title+'</title></path>';
    angle=end;
    return {shape,legend:'<li><span class="trip-chart-dot" style="background:'+color+'"></span><span class="trip-chart-name">'+esc(name)+'</span><strong>'+money(amount)+'</strong><span class="trip-chart-percent">'+percent+'</span></li>'};
  });
  return '<div class="trip-breakdown"><div class="trip-breakdown-heading"><div><h3>Spending by '+levelName+'</h3><p>All expenses tagged #'+esc(tag)+' · All time</p></div>'+chartLevelControl('trip')+'</div><div class="trip-chart-layout"><svg class="trip-pie" viewBox="0 0 200 200" role="img" aria-label="'+esc('Spending by '+levelName+' for #'+tag+', total '+money(s.spending))+'">'+parts.map(p=>p.shape).join('')+'</svg><ul class="trip-chart-legend" aria-label="Category amounts and percentages">'+parts.map(p=>p.legend).join('')+'</ul></div></div>';
}
function tripTransactionRows(){
  const category=tripCategoryFilters.get(selectedTrip)||'';
  return filterRows(state.transactions,{tag:selectedTrip,...(category.startsWith('group:')?{group:category.slice(6)}:{category})});
}
function tripTransactionControls(rows){
  const ids=new Set(rows.map(t=>t.category_id)),groups=GROUPS.filter(g=>CATEGORIES.some(c=>c.groupId===g.id&&ids.has(c.id))),valid=new Set([...ids,...groups.map(g=>'group:'+g.id)]);
  if(!valid.has(tripCategoryFilters.get(selectedTrip)))tripCategoryFilters.delete(selectedTrip);
  const selected=tripCategoryFilters.get(selectedTrip)||'';
  return '<section class="trip-transactions" aria-label="Trip transactions"><div class="trip-list-toolbar"><div><h3>Transactions</h3><p id="trip-filter-total" role="status" aria-live="polite"></p></div><label for="trip-category-filter">Filter transactions<select id="trip-category-filter"><option value="">All categories</option><optgroup label="Head categories">'+groups.map(g=>'<option value="group:'+g.id+'"'+(selected==='group:'+g.id?' selected':'')+'>'+esc(g.name)+'</option>').join('')+'</optgroup><optgroup label="Categories">'+CATEGORIES.filter(c=>ids.has(c.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>'<option value="'+c.id+'"'+(c.id===selected?' selected':'')+'>'+esc(c.displayName)+'</option>').join('')+'</optgroup></select></label></div><div id="trip-transactions-list"></div></section>';
}
function renderTripTransactions(){
  if(!selectedTrip||!$('trip-transactions-list'))return;
  const rows=tripTransactionRows(),s=summary(rows),category=tripCategoryFilters.get(selectedTrip)||'';
  $('trip-filter-total').textContent=s.count+' expense'+(s.count===1?'':'s')+' · '+money(s.spending)+(category?' in '+((category.startsWith('group:')?GROUPS.find(g=>g.id===category.slice(6)):CATEGORIES.find(c=>c.id===category))?.name||category):' across all categories');
  $('trip-transactions-list').innerHTML=rows.length?rows.map(transactionRow).join(''):'<p class="detail-empty">'+(category?'No expenses in this category.':'Add the #'+esc(selectedTrip)+' tag to an expense to start your trip total.')+'</p>';
}
document.addEventListener('change',e=>{
  if(e.target.id==='trip-category-filter'){tripCategoryFilters.set(selectedTrip,e.target.value);renderTripTransactions();}
});
function renderTrips(){
  $('trip-grid').innerHTML=state.tags.length?state.tags.map(tag=>{const rows=filterRows(state.transactions,{tag}),s=summary(rows),dates=rows.map(t=>t.occurred_on).sort();return '<button class="trip-card '+(selectedTrip===tag?'active':'')+'" data-trip="'+esc(tag)+'"><span class="tag-icon">'+icon('tag')+'</span><h3>#'+esc(tag)+'</h3><span class="trip-total">'+money(s.spending)+'</span><small>'+rows.filter(t=>t.kind==='expense').length+' expenses · All time</small><span class="trip-date-range">'+(dates.length?dateTitle(dates[0])+' '+dates[0].slice(0,4)+' — '+dateTitle(dates.at(-1))+' '+dates.at(-1).slice(0,4):'Ready for your next adventure')+'</span></button>';}).join(''):empty('Every adventure deserves a tag','Create Roma, Monte_Carlo, or anything you like. Add the tag to expenses to see the whole trip.','Create your first tag','tag','compass');
  $('trip-detail').hidden=!selectedTrip;
  document.body.classList.toggle('trip-selected',!!selectedTrip&&view==='trips');
  $('trip-back').hidden=!selectedTrip||view!=='trips';
  if(selectedTrip){const rows=filterRows(state.transactions,{tag:selectedTrip}),s=summary(rows);$('trip-detail').innerHTML='<div class="panel-heading"><div><h2>#'+esc(selectedTrip)+'</h2><p>All time · Every category</p><button class="text-button" data-action="rename-tag">Edit tag</button></div><button class="text-button" data-action="tagged-add">Add expense '+icon('plus')+'</button></div><div class="trip-detail-summary"><div><small>Total spent</small><strong>'+money(s.spending)+'</strong></div><div><small>Expenses</small><strong>'+s.count+'</strong></div></div>'+'<div class="trip-detail-tabs" role="group" aria-label="Trip view"><button data-trip-tab="breakdown" aria-pressed="'+(tripDetailTab==='breakdown')+'">Breakdown</button><button data-trip-tab="transactions" aria-pressed="'+(tripDetailTab==='transactions')+'">Transactions</button></div>'+tripCategoryChart(s,selectedTrip)+tripTransactionControls(rows);renderTripTransactions();renderTripTab();}
}
$('trip-back').onclick=()=>{selectedTrip='';renderTrips();window.scrollTo({top:0,behavior:'instant'});$('create-tag').focus({preventScroll:true});};
const titles={overview:['Your money, in view','Make room for what matters. Keep track of the rest.','A LITTLE CLARITY, EVERY DAY','Overview'],transactions:['Every little detail','Your everyday spending, all in one place.','THE STORY BEHIND THE NUMBERS','Expenses'],trips:['A tag for every adventure','See what it really cost, from the first coffee to the last train.','GO PLACES. KEEP PERSPECTIVE.','Trips & tags'],categories:['Everything has its place','Your categories, just the way you organised them.','A LITTLE ORDER GOES A LONG WAY','Categories']};
function setView(next){view=next;document.body.classList.toggle('trip-selected',!!selectedTrip&&view==='trips');$('trip-back').hidden=!selectedTrip||view!=='trips';document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});const t=titles[view];$('mobile-page-title').textContent=t[3];$('page-title').innerHTML=esc(t[0])+'<span>.</span>';$('page-description').textContent=t[1];$('eyebrow').textContent=t[2];$('breadcrumb-title').textContent=t[3];$('month-picker').hidden=['trips','categories'].includes(view);$('toolbar-caption').textContent=view==='trips'?'Trip totals include every month':view==='categories'?GROUPS.length+' head categories · '+CATEGORIES.length+' categories':'A fresh perspective on your month';$('export').hidden=view==='categories';window.scrollTo({top:0,behavior:'instant'});}
function populateCategories(){const old=$('category').value;$('category').innerHTML=categoryOptions(old);}
let quickRequest=0;
function showEntry(mode){quickRequest++;if(!chatSaving){$('parse-quick').disabled=false;$('parse-quick').textContent='Send';}$('quick-entry').hidden=mode!=='quick';$('manual-form').hidden=mode!=='manual';$('review-entry').hidden=mode!=='review';$('quick-tab').classList.toggle('selected',mode!=='manual');$('manual-tab').classList.toggle('selected',mode==='manual');formError('transaction-error','');}
function openAdd(text='',tag=''){
  $('manual-form').reset();$('conversion-preview').textContent='All expenses are saved and displayed in EUR.';$('edit-id').value='';$('date').value=today();$('quick-date').value=today();$('quick-text').value=text;$('transaction-tags').value=tag||activeDefault;$('default-tag').value=tag;chatTrip=tag;
  $('transaction-dialog-title').textContent='Add an expense';$('delete-transaction').hidden=true;document.querySelector('.entry-tabs').hidden=false;
  saveRequestId='';saveFingerprint='';resetChat(false);populateCategories();showEntry('quick');$('transaction-dialog').showModal();$('quick-text').focus();
  if(text.trim())previewQuick();
}
function editTransaction(id){const t=state.transactions.find(t=>t.id===id);if(!t)return;
  $('edit-id').value=id;$('expense-currency').value=t.fx?.original_currency||'EUR';$('amount').value=((t.fx?.original_amount_cents??t.amount_cents)/100).toFixed(2);$('date').value=t.occurred_on;$('note').value=t.fx?.original_note??t.note;$('transaction-tags').value=t.tags.join(', ');populateCategories();$('category').value=t.category_id;$('transaction-dialog-title').textContent='Edit expense';$('delete-transaction').hidden=false;document.querySelector('.entry-tabs').hidden=true;showEntry('manual');$('transaction-dialog').showModal();updateCurrencyPreview();
}
const readTags=text=>normalizedTags(text.split(',').map(t=>t.trim()).filter(Boolean));
let chatMessages=[],chatDraft=null,chatTrip='',chatSaving=false;
function chatBubble(role,text){const el=document.createElement('div');el.className='chat-bubble '+role;el.textContent=text;$('chat-log').append(el);el.scrollIntoView({block:'nearest'});}
function renderChatDraft(){
  const el=$('chat-draft');el.hidden=!chatDraft;if(!chatDraft){el.innerHTML='';return;}
  let content='';
  if(chatDraft.rule_action){const r=chatDraft.rule_action;content='<strong>'+({create:'Remember this trip rule?',update:'Update this trip rule?',cancel:'Cancel this trip rule?'}[r.action])+'</strong><p>#'+esc(r.tag)+'</p><p>'+esc(r.starts_on)+' → '+esc(r.ends_on)+' · both days included</p><p class="field-help">'+(r.action==='cancel'?'Stops automatic tagging for this rule.':'Applies to new entries dated within this range, unless you choose another tag or no tag.')+' Existing expenses stay unchanged.</p>';}
  else content=chatDraft.transactions.map(t=>'<article class="chat-summary"><strong>'+money(t.amount_cents)+'</strong><dl><dt>Description</dt><dd>'+esc(t.note)+'</dd><dt>Category</dt><dd>'+esc(CATEGORIES.find(c=>c.id===t.category_id)?.displayName||'')+'</dd><dt>Date</dt><dd>'+esc(t.occurred_on)+'</dd><dt>Trip</dt><dd>'+esc(t.tags.length?t.tags.map(t=>'#'+t).join(', '):'No trip tag')+'</dd></dl></article>').join('');
  el.innerHTML=content+'<button type="button" class="primary full-width" id="confirm-chat">'+(chatDraft.rule_action?'Confirm rule change':'Confirm & save')+'</button>';
  $('confirm-chat').disabled=!!$('quick-text').value.trim()||chatSaving;
  $('confirm-chat').onclick=confirmChat;
}
async function refreshChatRules(){try{const {rules}=await api('/api/trip-rules');$('chat-rules').innerHTML=rules.filter(r=>r.active).map(r=>'<p><strong>#'+esc(r.tag)+'</strong><br>'+esc(r.starts_on)+' → '+esc(r.ends_on)+(r.ends_on<today()?' · ended':'')+'</p>').join('')||'<p>No trip rules yet.</p>';}catch{$('chat-rules').textContent='Could not load rules. Try reopening the chat.';}}
function resetChat(clear=true){quickRequest++;chatMessages=[];chatDraft=null;$('chat-log').innerHTML='';if(clear)$('quick-text').value='';$('parse-quick').disabled=false;$('parse-quick').textContent='Send';renderChatDraft();chatBubble('assistant','Tell me an expense, or ask me to remember a trip. I’ll show you a summary before saving.'+(chatTrip?' This chat defaults to #'+chatTrip+'.':''));refreshChatRules();}
async function previewQuick(){
  if(chatSaving||$('parse-quick').disabled)return;
  const text=$('quick-text').value.trim();if(!text)return;
  if(chatMessages.length>=16){formError('transaction-error','This chat is full. Start a new chat to continue.');return;}
  const token=++quickRequest,previous=[...chatMessages];chatDraft=null;renderChatDraft();
  chatBubble('user',text);$('quick-text').value='';chatMessages.push({role:'user',content:text});
  $('parse-quick').disabled=true;$('parse-quick').textContent='Thinking…';formError('transaction-error','');
  try{
    const result=await api('/api/expenses/preview','POST',{text,date:today(),default_tag:chatTrip,chat:true,messages:previous});
    if(token!==quickRequest||!$('transaction-dialog').open)return;
    if(result.question){chatBubble('assistant',result.question);chatMessages.push({role:'assistant',content:result.question});}
    else{chatDraft={...result,request_id:crypto.randomUUID()};chatBubble('assistant',result.rule_action?'Here’s the trip rule change. Confirm it below, or tell me what to change.':'Here’s your summary. Confirm below, or reply with any corrections.');chatMessages.push({role:'assistant',content:JSON.stringify(result)});renderChatDraft();}
  }catch(e){if(token===quickRequest){chatMessages=previous;$('quick-text').value=text;formError('transaction-error',e.message);}}
  finally{if(token===quickRequest){$('parse-quick').disabled=false;$('parse-quick').textContent='Send';$('quick-text').focus();}}
}
async function confirmChat(){
  if(!chatDraft||chatSaving||$('quick-text').value.trim())return;
  const draft=chatDraft;chatSaving=true;document.querySelectorAll('#transaction-dialog [data-close],#transaction-dialog .entry-tabs button').forEach(b=>b.disabled=true);renderChatDraft();$('parse-quick').disabled=true;$('quick-text').disabled=true;$('new-chat').disabled=true;
  try{
    let savedRule=null;
    if(draft.rule_action)savedRule=await api('/api/trip-rules','POST',{request_id:draft.request_id,rule:draft.rule_action});
    else await api('/api/transactions','POST',{request_id:draft.request_id,transactions:draft.transactions});
    chatDraft=null;chatMessages=savedRule?[{role:'assistant',content:JSON.stringify({saved_rule:{...draft.rule_action,id:savedRule.saved},confirmed:true})}]:[];renderChatDraft();chatBubble('assistant',draft.rule_action?(draft.rule_action.action==='cancel'?'Trip rule cancelled.':'Trip rule saved. I’ll remember it for future entries.'):(draft.transactions.length===1?'Expense saved.':'Expenses saved.')+' What’s next?');$('quick-inline').value='';
    await load({quiet:true});await refreshChatRules();
  }catch(e){formError('transaction-error',e.message);}
  finally{chatSaving=false;document.querySelectorAll('#transaction-dialog [data-close],#transaction-dialog .entry-tabs button').forEach(b=>b.disabled=false);$('parse-quick').disabled=false;$('quick-text').disabled=false;$('new-chat').disabled=false;renderChatDraft();}
}
$('chat-form').onsubmit=e=>{e.preventDefault();previewQuick();};
$('new-chat').onclick=()=>resetChat();
$('quick-text').oninput=()=>{const button=$('confirm-chat');if(button)button.disabled=!!$('quick-text').value.trim()||chatSaving;};
$('transaction-dialog').addEventListener('cancel',e=>{if(chatSaving)e.preventDefault();});
$('transaction-dialog').addEventListener('close',()=>{quickRequest++;});

function renderReview(){ $('review-list').innerHTML=review.map((t,i)=>'<div class="review-card" data-review="'+i+'"><div class="review-title"><span>Expense '+(i+1)+'</span><span>'+money(t.amount_cents)+'</span></div>'+(t.needs_review?'<p class="review-warning">Category needs a look — choose the best fit below.</p>':'')+'<div class="form-grid"><label>Original amount<input data-field="amount" inputmode="decimal" value="'+((t.fx?.original_amount_cents??t.amount_cents)/100).toFixed(2)+'" required></label><label>Currency<select data-field="currency">'+['EUR','USD','ARS'].map(c=>'<option value="'+c+'"'+(c===(t.fx?.original_currency||t.currency||'EUR')?' selected':'')+'>'+c+'</option>').join('')+'</select></label><label>Date<input data-field="occurred_on" type="date" min="1900-01-01" max="2200-12-31" value="'+t.occurred_on+'" required></label></div><label>Category<select data-field="category_id">'+GROUPS.map(g=>'<optgroup label="'+esc(g.name)+'">'+CATEGORIES.filter(c=>c.groupId===g.id).map(c=>'<option value="'+c.id+'"'+(c.id===t.category_id?' selected':'')+'>'+esc(c.displayName)+'</option>').join('')+'</optgroup>').join('')+'</select></label><label>Description<input data-field="note" value="'+esc(t.fx?.original_note??t.note)+'" maxlength="250"></label><label>Tags<input data-field="tags" value="'+esc(t.tags.join(', '))+'" placeholder="Roma, Summer_2026"></label></div>').join(''); }
function idFor(items){const fingerprint=JSON.stringify(items);if(fingerprint!==saveFingerprint){saveRequestId=crypto.randomUUID();saveFingerprint=fingerprint;}return saveRequestId;}
async function withBusy(button,fn,errorId){button.disabled=true;try{await fn();}catch(e){formError(errorId,e.message);}finally{button.disabled=false;}}
async function afterSave(message,dialog){$(dialog).close();toast(message);await load({quiet:true});}
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.chartContext)chooseChartLevel(button.dataset.chartContext,button.dataset.chartLevel);if(button.dataset.tripTab){tripDetailTab=button.dataset.tripTab;renderTripTab();}if(button.dataset.view)setView(button.dataset.view);if(button.dataset.close)$(button.dataset.close).close();if(button.dataset.edit)editTransaction(button.dataset.edit);if(button.dataset.overviewTrip){selectedTrip=button.dataset.overviewTrip;tripDetailTab='breakdown';renderTrips();setView('trips');$('trip-detail').scrollIntoView({behavior:'smooth',block:'start'});}if(button.dataset.trip){selectedTrip=button.dataset.trip;tripDetailTab='breakdown';renderTrips();$('trip-detail').scrollIntoView({behavior:'smooth',block:'start'});}if(button.dataset.action==='add')openAdd();if(button.dataset.action==='tag')openTag();if(button.dataset.action==='tagged-add')openAdd('',selectedTrip);if(button.dataset.action==='rename-tag')openTag(true);});
for(const id of ['add-top','mobile-add'])$(id).onclick=()=>openAdd();
$('view-all').onclick=()=>setView('transactions');$('refresh').onclick=async()=>{if(await load({quiet:true}))toast('Pocket is up to date.');};
$('quick-inline-form').onsubmit=e=>{e.preventDefault();openAdd($('quick-inline').value);};
$('quick-tab').onclick=()=>showEntry('quick');$('manual-tab').onclick=()=>{showEntry('manual');$('amount').focus();};
$('back-to-quick').onclick=()=>showEntry('quick');
$('manual-form').onsubmit=e=>{e.preventDefault();withBusy($('save-transaction'),async()=>{const t={amount_cents:amountCents($('amount').value),currency:$('expense-currency').value,category_id:$('category').value,occurred_on:$('date').value,note:$('note').value,tags:readTags($('transaction-tags').value)};const id=$('edit-id').value;if(id)await api('/api/transactions/'+encodeURIComponent(id),'PUT',t);else await api('/api/transactions','POST',{request_id:idFor([t]),transactions:[t]});await afterSave(id?'Expense updated.':'Expense saved.','transaction-dialog');},'transaction-error');};
$('save-batch').onclick=()=>withBusy($('save-batch'),async()=>{const items=[...document.querySelectorAll('[data-review]')].map(el=>{const field=n=>el.querySelector('[data-field="'+n+'"]').value,category_id=field('category_id');return {amount_cents:amountCents(field('amount')),currency:field('currency'),category_id,occurred_on:field('occurred_on'),note:field('note'),tags:readTags(field('tags'))};});await api('/api/transactions','POST',{request_id:idFor(items),transactions:items});$('quick-inline').value='';await afterSave(items.length===1?'Expense saved.':items.length+' expenses saved.','transaction-dialog');},'transaction-error');
$('delete-transaction').onclick=()=>{formError('delete-error','');$('confirm-dialog').showModal();};
$('confirm-delete').onclick=()=>withBusy($('confirm-delete'),async()=>{await api('/api/transactions/'+encodeURIComponent($('edit-id').value),'DELETE');$('confirm-dialog').close();await afterSave('Expense deleted.','transaction-dialog');},'delete-error');
function changeMonth(offset){const d=new Date(month+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);const next=d.toISOString().slice(0,7);if(next<'1900-01'||next>'2200-12')return;month=next;render();}
$('prev-month').onclick=()=>changeMonth(-1);$('next-month').onclick=()=>changeMonth(1);$('month').onchange=()=>{if($('month').value){month=$('month').value;render();}};
$('edit-budget').onclick=()=>{$('budget-month-title').textContent=monthTitle(month);$('budget-amount').value=currentBudget()?(currentBudget()/100).toFixed(2):'';formError('budget-error','');$('budget-dialog').showModal();};
$('budget-form').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{const value=$('budget-amount').value.trim(),amount_cents=/^0([.,]00?)?$/.test(value)?0:amountCents(value);await api('/api/budget','PUT',{month,amount_cents});await afterSave('Monthly budget updated.','budget-dialog');},'budget-error');};
let editingTag='';
function openTag(edit=false){
  editingTag=edit===true?selectedTrip:'';formError('tag-error','');$('tag-name').value=editingTag;
  $('tag-dialog-title').textContent=editingTag?'Edit tag':'Create a tag';$('save-tag').textContent=editingTag?'Save tag':'Create tag';
  $('remove-tag').hidden=!editingTag||state.transactions.some(t=>t.tags.some(tag=>tag.toLocaleLowerCase()===editingTag.toLocaleLowerCase()));
  $('tag-dialog').showModal();
}
$('create-tag').onclick=()=>openTag();$('create-trip-banner').onclick=()=>openTag();
$('tag-form').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{
  const name=cleanTag($('tag-name').value),previous=editingTag;
  await api(previous?'/api/tags/'+encodeURIComponent(previous):'/api/tags',previous?'PUT':'POST',{name});
  if(previous&&tripCategoryFilters.has(previous)){tripCategoryFilters.set(name,tripCategoryFilters.get(previous));tripCategoryFilters.delete(previous);}
  selectedTrip=name;
  if(!previous||activeDefault.toLocaleLowerCase()===previous.toLocaleLowerCase()){activeDefault=name;try{localStorage.setItem('pocket-default-tag',name);}catch{}}
  await afterSave(previous?'Tag renamed. All expenses updated.':'Tag created. Ready for your next adventure.','tag-dialog');setView('trips');
},'tag-error');};
$('remove-tag').onclick=()=>withBusy($('remove-tag'),async()=>{
  const previous=editingTag;await api('/api/tags/'+encodeURIComponent(previous),'DELETE');
  selectedTrip='';tripCategoryFilters.delete(previous);
  if(activeDefault.toLocaleLowerCase()===previous.toLocaleLowerCase()){activeDefault='';try{localStorage.removeItem('pocket-default-tag');}catch{}}
  await afterSave('Empty tag removed.','tag-dialog');setView('trips');
},'tag-error');
$('group-filter').innerHTML='<option value="">All categories</option>'+GROUPS.map(g=>'<option value="'+g.id+'">'+esc(g.name)+'</option>').join('');
for(const id of ['search','group-filter','tag-filter'])$(id).addEventListener(id==='search'?'input':'change',renderTransactions);
$('categories-grid').innerHTML=GROUPS.map(g=>'<article class="category-tile"><span class="category-icon" style="background:'+groupColors[g.id]+'14;color:'+groupColors[g.id]+'">'+icon(g.icon)+'</span><h2>'+esc(g.name)+'</h2><ul>'+CATEGORIES.filter(c=>c.groupId===g.id).map(c=>'<li>'+esc(c.displayName)+'</li>').join('')+'</ul></article>').join('');
$('export').onclick=()=>{let rows=view==='trips'?(selectedTrip?filterRows(state.transactions,{tag:selectedTrip}):state.transactions):view==='transactions'?transactionFilters():currentRows();const cell=s=>'"'+String(s??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const lines=[['Date','Amount EUR','Original amount','Original currency','USD to EUR rate','Rate date','Official ARS per USD','ARS rate date','Rate source','Head category','Category','Description','Tags'],...rows.map(t=>{const c=CATEGORIES.find(c=>c.id===t.category_id);return [t.occurred_on,(t.amount_cents/100).toFixed(2),((t.fx?.original_amount_cents??t.amount_cents)/100).toFixed(2),t.fx?.original_currency||'EUR',t.fx?.rate||'1',t.fx?.rate_date||t.occurred_on,t.fx?.ars_per_usd||'',t.fx?.ars_rate_date||'',t.fx?.provider||'EUR',c?.group,c?.name,t.note,t.tags.join('; ')];})];const blob=new Blob(['\ufeff'+lines.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pocket-'+(view==='trips'?'trips-all-time':month)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV exported.');};
let refreshing=false;document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!refreshing){refreshing=true;await load({quiet:true});refreshing=false;}});
setInterval(async()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!refreshing){refreshing=true;await load({quiet:true});refreshing=false;}},30000);
load();

// Quoted conversions are informational until the existing Save action is used.
let currencyPreviewRequest=0,currencyPreviewTimer;
async function updateCurrencyPreview(){
  const token=++currencyPreviewRequest,el=$('conversion-preview');
  if(!$('amount').value.trim()||!$('date').value){el.textContent='All expenses are saved and displayed in EUR.';return;}
  let amount_cents;try{amount_cents=amountCents($('amount').value);}catch{el.textContent='Enter a positive amount with up to two decimals.';return;}
  const currency=$('expense-currency').value;
  if(currency==='EUR'){el.textContent='EUR amount: '+money(amount_cents)+' EUR.';return;}
  el.textContent='Getting the rate for this expense date…';
  try{
    const preview=await api('/api/expenses/convert','POST',{amount_cents,currency,category_id:$('category').value||CATEGORIES[0].id,occurred_on:$('date').value,note:'',tags:[]});
    if(token!==currencyPreviewRequest)return;
    el.textContent='EUR amount: '+money(preview.amount_cents)+' EUR · '+preview.note;
  }catch(error){if(token===currencyPreviewRequest)el.textContent=error.message;}
}
for(const id of ['amount','expense-currency','date'])$(id).addEventListener('input',()=>{currencyPreviewRequest++;clearTimeout(currencyPreviewTimer);currencyPreviewTimer=setTimeout(updateCurrencyPreview,350);});
