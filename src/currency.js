import {assert,InputError,validDate,validateTransaction} from './domain.js';
export class RateUnavailableError extends InputError {}
export const SUPPORTED_CURRENCIES=['EUR','USD','ARS'];
export function currencyCode(value='EUR'){assert(typeof value==='string'&&SUPPORTED_CURRENCIES.includes(value.toUpperCase()),'Choose EUR, USD or ARS.');return value.toUpperCase();}
function fxToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function dayBefore(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
function validRateDate(date,requested){return validDate(date)&&date<=requested&&date>=dayBefore(requested,7);}
function decimal(value){const text=String(value);assert(/^\d+(\.\d{1,14})?$/.test(text)&&Number(text)>0,'Invalid exchange rate.');const [whole,fraction='']=text.split('.');return [BigInt(whole+fraction),10n**BigInt(fraction.length)];}
// ARS -> USD -> EUR without rounding the intermediate USD amount.
export function convertCents(cents,usdToEur='1',arsPerUsd='1'){
 assert(Number.isSafeInteger(cents)&&cents>0&&cents<=100000000000,'Enter a valid positive amount.');
 const [en,ed]=decimal(usdToEur),[an,ad]=decimal(arsPerUsd),n=BigInt(cents)*en*ad,d=ed*an;
 const converted=Number((2n*n+d)/(2n*d));assert(Number.isSafeInteger(converted)&&converted>0&&converted<=100000000000,'Converted amount must be between €0.01 and €1,000,000,000.');return converted;
}
export async function dailyRate(env,currency,date){
 currency=currencyCode(currency);assert(validDate(date),'Choose a valid expense date.');
 if(currency==='EUR')return {rate:'1',rate_date:date,provider:'EUR',ars_per_usd:'1',ars_rate_date:null};
 assert(date<=(env.FX_TODAY||fxToday()),'A future exchange rate is not available. Choose today or an earlier expense date.');
 const cached=await env.DB.prepare('SELECT * FROM fx_rates WHERE currency=? AND requested_date=?').bind(currency,date).first();if(cached)return cached;
 const fetchRate=env.FX_FETCH||fetch;let rate,ars_per_usd='1',ars_rate_date=null;
 try{
  const r=await fetchRate('https://api.frankfurter.dev/v2/rate/usd/eur?date='+date,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();
  rate=await r.json();if(rate.base!=='USD'||rate.quote!=='EUR'||!validRateDate(rate.date,date))throw Error();decimal(rate.rate);
  if(currency==='ARS'){
   let found=false;
   for(let days=0;days<=7;days++){
    const r=await fetchRate('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/'+dayBefore(date,days).replaceAll('-','/'),{signal:AbortSignal.timeout(10000)});
    if(r.status===404)continue;if(!r.ok)throw Error();const a=await r.json();
    if(a.casa!=='oficial'||!validRateDate(a.fecha,date))throw Error();decimal(a.venta);
    ars_per_usd=String(a.venta);ars_rate_date=a.fecha;found=true;break;
   }
   if(!found)throw Error();
  }
 }catch{throw new RateUnavailableError('Could not get the '+(currency==='ARS'?'official ARS/USD and USD/EUR':'USD/EUR')+' rates for '+date+'. Nothing has been saved. Please retry.');}
 const provider=currency==='ARS'?'ArgentinaDatos official venta + Frankfurter USD/EUR':'Frankfurter USD/EUR';
 await env.DB.prepare('INSERT INTO fx_rates (currency,requested_date,rate_date,rate,provider,ars_per_usd,ars_rate_date) VALUES (?,?,?,?,?,?,?) ON CONFLICT(currency,requested_date) DO NOTHING').bind(currency,date,rate.date,String(rate.rate),provider,ars_per_usd,ars_rate_date).run();
 return env.DB.prepare('SELECT * FROM fx_rates WHERE currency=? AND requested_date=?').bind(currency,date).first();
}
export async function normalizeExpense(env,input){
 assert(input&&typeof input==='object','Provide an expense.');
 const source=input.fx?{amount_cents:input.fx.original_amount_cents,currency:input.fx.original_currency,note:input.fx.original_note}:input;
 const currency=currencyCode(source.currency),note=source.note??'';
 const original=validateTransaction({...input,amount_cents:source.amount_cents,note});
 // Existing EUR expenses remain byte-for-byte unchanged, including descriptions.
 if(currency==='EUR')return {...original,currency:'EUR',fx:null};
 const rate=await dailyRate(env,currency,original.occurred_on),amount_cents=convertCents(original.amount_cents,rate.rate,rate.ars_per_usd);
 const amount=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(original.amount_cents/100);
 const details='Original: '+amount+' '+currency+(currency==='ARS'?'; official ARS/USD venta '+rate.ars_per_usd+' ('+rate.ars_rate_date+')':'')+'; USD/EUR '+rate.rate+' ('+rate.rate_date+')';
 return {...original,amount_cents,currency:'EUR',note:(original.note?original.note+' | ':'')+details,fx:{original_amount_cents:original.amount_cents,original_currency:currency,original_note:original.note,rate:rate.rate,rate_date:rate.rate_date,ars_per_usd:rate.ars_per_usd,ars_rate_date:rate.ars_rate_date,expense_date:original.occurred_on,provider:rate.provider}};
}
export async function normalizeExpenses(env,items){assert(Array.isArray(items)&&items.length>=1&&items.length<=30,'Add 1–30 expenses at a time.');const out=[];for(const item of items)out.push(await normalizeExpense(env,item));return out;}
