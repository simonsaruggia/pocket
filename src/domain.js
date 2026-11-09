// Category IDs are permanent: regrouping must never change stored expense references.
const GROUP_DEFINITIONS = [
  {id:'home', name:'Home & bills', color:'#4C8BF5', icon:'home', categories:[['essentials-4','Rent'],['essentials-3','Iliad / internet'],['shopping-0','App subscriptions'],['essentials-0','Bank and fees'],['essentials-5','Service']]},
  {id:'groceries', name:'Groceries & household', color:'#24A891', icon:'bag', categories:[['food-5','Groceries']]},
  {id:'food', name:'Eating & drinking out', color:'#E2A348', icon:'coffee', categories:[['food-6','Restaurants'],['food-1','Delivery'],['food-0','Bar and coffee'],['food-3','Fast food - Snacks'],['food-4','Gelato']]},
  {id:'transportation', name:'Transport', color:'#54A8D4', icon:'car', categories:[['transportation-6','Public transport'],['transportation-1','Bus / train'],['transportation-7','Taxi/uber'],['transportation-4','Fuel'],['transportation-0','Autostrada'],['transportation-5','Parking'],['transportation-2','Car costs / Repairs'],['transportation-8','Rented vehicle'],['transportation-3','Flights']]},
  {id:'accommodation', name:'Accommodation', color:'#728BD6', icon:'home', categories:[['essentials-6','Hotel / Airbnb']]},
  {id:'health', name:'Health & fitness', color:'#D975A2', icon:'heart', categories:[['essentials-2','Healthcare doctor'],['essentials-1','Dentist and related'],['wellness-1','Gym'],['wellness-0','Coaching'],['wellness-2','Gym equipment'],['wellness-3','Supplements']]},
  {id:'shopping', name:'Shopping & personal care', color:'#9A78DF', icon:'bag', categories:[['shopping-1','Clothes and shoes'],['shopping-2','Electronics and Gadgets'],['shopping-4','Haircut / self care'],['shopping-3','Gifts for others']]},
  {id:'entertainment', name:'Leisure & entertainment', color:'#F18C46', icon:'sparkles', categories:[['entertainment-1','Attività varie'],['entertainment-3','Disco/tickets/events'],['entertainment-0','Drinks / Alcohol'],['entertainment-2','Cigarettes cigars etc'],['entertainment-4','Gambling']]},
  {id:'other', name:'Uncategorised', color:'#8493A8', icon:'wallet', categories:[['shopping-5','Miscellaneous']]}
];
const CATEGORY_EMOJIS = {"Rent": "🏠", "Iliad / internet": "📱", "App subscriptions": "🔄", "Bank and fees": "🏦", "Service": "🛠️", "Groceries": "🛒", "Restaurants": "🍽️", "Delivery": "🛵", "Bar and coffee": "☕", "Fast food - Snacks": "🍔", "Gelato": "🍦", "Public transport": "🚍", "Bus / train": "🚆", "Taxi/uber": "🚕", "Fuel": "⛽", "Autostrada": "🛣️", "Parking": "🅿️", "Car costs / Repairs": "🔧", "Rented vehicle": "🛵", "Flights": "✈️", "Hotel / Airbnb": "🛏️", "Healthcare doctor": "🩺", "Dentist and related": "🦷", "Gym": "🏋️", "Coaching": "🎯", "Gym equipment": "💪", "Supplements": "💊", "Clothes and shoes": "👕", "Electronics and Gadgets": "💻", "Haircut / self care": "💇", "Gifts for others": "🎁", "Attività varie": "🎯", "Disco/tickets/events": "🎟️", "Drinks / Alcohol": "🍸", "Cigarettes cigars etc": "🚬", "Gambling": "🎰", "Miscellaneous": "❓"};
export const canonicalCategoryId = id => id === "food-2" ? "entertainment-0" : id;
export const GROUPS = GROUP_DEFINITIONS.map(g => ({...g,categories:g.categories.map(([,name])=>name)}));
export const CATEGORIES = GROUP_DEFINITIONS.flatMap(g => g.categories.map(([id,name]) => ({id,name,emoji:CATEGORY_EMOJIS[name],displayName:CATEGORY_EMOJIS[name]+' '+name,groupId:g.id,group:g.name,color:g.color,icon:g.icon,kind:'expense'})));
export class InputError extends Error {}
export function assert(value,message){if(!value)throw new InputError(message);}
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s&&s>='1900-01-01'&&s<='2200-12-31';}
export function validMonth(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&s>='1900-01'&&s<='2200-12';}
export function euroCents(value){
  let s=String(value??'').trim().replace(/€/g,'').replace(/\s/g,'');
  if(s.includes(',')&&s.includes('.')){const comma=s.lastIndexOf(',')>s.lastIndexOf('.');s=comma?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');}
  else if(s.includes(','))s=s.replace(',','.');
  assert(/^\d+(\.\d{1,2})?$/.test(s),'Enter a positive EUR amount with at most two decimals.');
  const [whole,decimal='']=s.split('.'); const amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  assert(Number.isSafeInteger(amount)&&amount>0&&amount<=100000000000,'Amount must be between €0.01 and €1,000,000,000.');return amount;
}
export function cleanTag(tag){assert(typeof tag==='string','Tags must be text.');const name=tag.trim().replace(/^#+/,'').normalize('NFC');assert(name.length>=1&&name.length<=40&&/^[\p{L}\p{N}_ '’-]+$/u.test(name),'Use 1–40 letters, numbers, spaces, apostrophes, underscores or hyphens for a tag.');return name;}
export function normalizedTags(tags=[]){assert(Array.isArray(tags)&&tags.length<=12,'Use at most 12 tags.');return [...new Map(tags.map(t=>{const n=cleanTag(t);return [n.toLocaleLowerCase(),n];})).values()];}
export function validateTransaction(input){
  assert(input&&typeof input==='object','Provide a transaction.');
  const cat=CATEGORIES.find(c=>c.id===canonicalCategoryId(input.category_id));assert(cat,'Choose a category.');
  const kind='expense';assert(input.kind===undefined||input.kind==='expense','Pocket tracks expenses only.');
  assert(Number.isSafeInteger(input.amount_cents)&&input.amount_cents>0&&input.amount_cents<=100000000000,'Enter a valid amount in EUR cents.');
  assert(validDate(input.occurred_on),'Choose a valid transaction date.');
  assert(typeof (input.note??'')==='string'&&(input.note??'').length<=250,'Description must be 250 characters or fewer.');
  return {amount_cents:input.amount_cents,kind,category_id:cat.id,occurred_on:input.occurred_on,note:(input.note||'').trim(),tags:normalizedTags(input.tags)};
}
export function summary(rows){
  let spending=0,count=0;const groups={},categories={};
  for(const t of rows){if(t.kind!=='expense')continue;spending+=t.amount_cents;count++;const c=CATEGORIES.find(c=>c.id===t.category_id);const gid=c?.groupId||'other';groups[gid]=(groups[gid]||0)+t.amount_cents;categories[t.category_id]=(categories[t.category_id]||0)+t.amount_cents;}
  return {spending,groups,categories,count};
}
// Overview allocation is separate from the original category summaries.
export function overviewSummary(rows){
  const expenses=rows.filter(t=>t.kind==='expense'),s=summary(expenses),groups={},everydayCategories={},buckets=new Map(),names=new Map();
  for(const t of expenses)for(const tag of t.tags||[])if(!names.has(tag.toLocaleLowerCase()))names.set(tag.toLocaleLowerCase(),tag);
  for(const t of expenses){
    const keys=[...new Set((t.tags||[]).map(tag=>tag.toLocaleLowerCase()))].sort();
    if(keys.length){
      groups.trips=(groups.trips||0)+t.amount_cents;
      const key=JSON.stringify(keys),bucket=buckets.get(key)||{tags:keys.map(key=>names.get(key)),amount_cents:0};
      bucket.amount_cents+=t.amount_cents;buckets.set(key,bucket);
    }else{
      const gid=CATEGORIES.find(c=>c.id===t.category_id)?.groupId||'other';
      groups[gid]=(groups[gid]||0)+t.amount_cents;
      everydayCategories[t.category_id]=(everydayCategories[t.category_id]||0)+t.amount_cents;
    }
  }
  return {...s,groups,everydayCategories,trips:[...buckets.values()].sort((a,b)=>b.amount_cents-a.amount_cents||a.tags.join().localeCompare(b.tags.join()))};
}
export function filterRows(rows,{month,tag,from,to,group,category}={}){return rows.filter(t=>t.kind==='expense'&&(!group||CATEGORIES.find(c=>c.id===t.category_id)?.groupId===group)&&(!category||t.category_id===category)&&(!month||t.occurred_on.startsWith(month))&&(!from||t.occurred_on>=from)&&(!to||t.occurred_on<=to)&&(!tag||t.tags.some(v=>v.toLocaleLowerCase()===tag.toLocaleLowerCase())));}
const MATCHERS = [
  ['food-0',/\b(coffee|caff[eè]|cappuccino|espresso|colazione)\b/i],['food-1',/\b(delivery|deliveroo|glovo|just eat)\b/i],
  ['food-4',/\b(gelato|ice cream)\b/i],['food-5',/\b(grocer\w*|supermarket|supermercato|spesa|lidl|conad|coop|esselunga)\b/i],
  ['food-3',/\b(snack|fast food|mcdonald\w*|burger king)\b/i],['food-6',/\b(lunch|dinner|pranzo|cena|restaurant\w*|ristorante|pizza|sushi)\b/i],
  ['entertainment-0',/\b(drink\w*|acqua|water|juice|succo)\b/i],['entertainment-0',/\b(beer|birra|wine|vino|cocktail|aperitivo|alcohol)\b/i],
  ['entertainment-2',/\b(cigarette\w*|sigarette|tabacco|cigar\w*)\b/i],['entertainment-3',/\b(concert\w*|disco|festival|event\w*|ticket\w*|cinema)\b/i],
  ['transportation-7',/\b(taxi|uber|bolt)\b/i],['transportation-3',/\b(flight\w*|volo|voli|ryanair|easyjet)\b/i],
  ['transportation-4',/\b(fuel|gas|petrol|benzina|diesel|gasolio)\b/i],['transportation-5',/\b(parking|parcheggio)\b/i],
  ['transportation-0',/\b(autostrada|toll|pedaggio)\b/i],['transportation-1',/\b(train|treno|trenitalia|italo|bus)\b/i],
  ['transportation-6',/\b(metro|tram|transport)\b/i],['transportation-2',/\b(mechanic|meccanico|car repair|revisione)\b/i],
  ['essentials-6',/\b(hotel|airbnb|hostel|albergo|accommodation)\b/i],['essentials-4',/\b(rent|affitto)\b/i],
  ['essentials-1',/\b(dentist\w*)\b/i],['essentials-2',/\b(doctor|medico|pharmacy|farmacia|medicine)\b/i],['essentials-3',/\b(iliad|internet|wifi|phone bill)\b/i],
  ['shopping-0',/\b(subscription|abbonamento|netflix|spotify|chatgpt)\b/i],['shopping-1',/\b(clothes|shoes|scarpe|vestiti|shirt|maglietta)\b/i],
  ['shopping-2',/\b(electronic\w*|gadget\w*|headphones|cuffie|charger)\b/i],['shopping-3',/\b(gift|regalo)\b/i],['shopping-4',/\b(haircut|barber|parrucchiere|self care)\b/i],
  ['wellness-3',/\b(supplement\w*|integrator\w*|protein\w*)\b/i],['wellness-2',/\b(gym equipment|attrezzi palestra)\b/i],['wellness-1',/\b(gym|palestra)\b/i],['wellness-0',/\b(coaching|coach)\b/i]
];
export function parseQuick(text,date,defaultTag=''){
  assert(typeof text==='string'&&text.trim().length>0&&text.length<=3000,'Type an expense, for example “€18 lunch #Roma”.');
  assert(validDate(date),'Choose a valid date.');
  // Currency amounts, decimals and thousands separators. Strip tags and ISO dates before matching.
  const lines=text.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean);
  assert(lines.length<=30,'Add up to 30 transactions at a time.');
  return lines.map(line=>{
    const tags=normalizedTags([...line.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map(m=>m[1]));if(!tags.length&&defaultTag)tags.push(cleanTag(defaultTag));
    let cleaned=line.replace(/#[\p{L}\p{N}_-]+/gu,'');
    let actualDate=date;const iso=cleaned.match(/\b\d{4}-\d{2}-\d{2}\b/);if(iso){assert(validDate(iso[0]),'Invalid date in your entry.');actualDate=iso[0];cleaned=cleaned.replace(iso[0],'');}
    else if(/\b(yesterday|ieri)\b/i.test(cleaned)){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);actualDate=d.toISOString().slice(0,10);cleaned=cleaned.replace(/\b(yesterday|ieri)\b/ig,'');}
    cleaned=cleaned.replace(/\b(today|oggi)\b/ig,'');
    assert(!/[\$£¥]|\b(usd|gbp|dollars?|pounds?|chf)\b/i.test(cleaned),'Pocket uses EUR. Convert this amount to euros first.');
    const amounts=[...cleaned.matchAll(/(?:€\s*)?\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?(?:\s*(?:€|euros?|eur))?/gi)];
    assert(amounts.length===1,'Use one amount per line. For several expenses, put each on a new line.');
    const amount=amounts[0];assert(!/-\s*$/.test(cleaned.slice(0,amount.index)),'Enter the expense as a positive amount.');
    const amount_cents=euroCents(amount[0].replace(/euros?|eur/gi,''));
    const note=cleaned.replace(amount[0],'').replace(/^[\s,:-]+|[\s,:-]+$/g,'').trim().slice(0,250);
    assert(!/\b(salary|stipendio|paycheck|entrata|earned|guadagnato)\b/i.test(note),'Pocket tracks expenses only.');
    const guess=MATCHERS.find(([,re])=>re.test(note));const category_id=guess?.[0]||'shopping-5';
    return {...validateTransaction({amount_cents,category_id,occurred_on:actualDate,note,tags}),needs_review:!guess};
  });
}

export const amountCents=euroCents;
