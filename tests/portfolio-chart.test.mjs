import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { computed, signal } from '@angular/core'
import { catchError, defer, EMPTY, exhaustMap, firstValueFrom, forkJoin, from, map, merge, mergeMap, of, Subject, switchMap, tap, throwError, timeout, toArray } from 'rxjs'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8')
function compile(source,names,dependencies) {
  const {outputText}=ts.transpileModule(source.replace(/export (default )?/g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}})
  return new Function(...Object.keys(dependencies),`${outputText}\nreturn {${names.join(',')}}`)(...Object.values(dependencies))
}
const source = await read('src/app/core/api/portfolio-value.service.ts')
const helpers = compile(source.slice(source.indexOf('export const portfolioPeriods'),source.indexOf('@Injectable')),
  ['portfolioPeriods','portfolioRange','portfolioSeries','portfolioHistorySeries','hasMissingPrices','quoteValue'],{})
const now=Date.parse('2026-10-26T12:00:00Z')
const historyPoint = (timestamp, invested, complete = true, missingPrices = []) => ({ timestamp, invested, total: 9999, cash: 1000, complete, missingPrices })
const historyPoints = [
  historyPoint('2026-10-26T09:00:00Z', 100),
  historyPoint('2026-10-26T10:00:00Z', null, false, ['AAPL']),
  historyPoint('2026-10-26T11:00:00Z', 120),
  historyPoint('2026-10-26T11:00:00Z', 125),
]
assert.deepEqual(helpers.portfolioHistorySeries(historyPoints, '1D', now).map(point => point.invested), [100, null, 125])
assert.equal(helpers.portfolioHistorySeries([historyPoint('2026-10-26T09:00:00Z', 100, true, ['AAPL'])], '1D', now)[0].invested, null)
assert.equal(helpers.portfolioHistorySeries([historyPoint('2026-10-26T09:00:00Z', 0)], '1D', now)[0].invested, 0)
assert.deepEqual(helpers.portfolioHistorySeries([], '1D', now), [])
const points=[0,2,10,60,400].map((days,index)=>({timestamp:new Date(now-days*86400000).toISOString(),cash:100,invested:200,total:300+index,positions:1,oldestQuote:null}))
for(const [period,length] of [['1D',1],['1W',2],['1M',3],['1Y',4]]) {
  assert.equal(helpers.portfolioSeries(points,period,now).length,length)
}
assert.equal(helpers.portfolioSeries([...points,{timestamp:'bad',total:20},{timestamp:new Date(now+1).toISOString(),total:20}],'1Y',now).length,4)
const quote=(ticker,bid,ask,recorded='2026-10-26T11:59:00Z')=>({ticker,bid_price:bid,ask_price:ask,recorded_at:recorded})
assert.equal(helpers.quoteValue([quote('BTC-USD',90,100)],'BTC/USD',now).price,90)
assert.equal(helpers.quoteValue([quote('DEMO',null,100)],'DEMO',now).price,100)
assert.equal(helpers.quoteValue([quote('DEMO',1,2,'2026-10-25T00:00:00Z'),quote('DEMO',10,20)],'DEMO',now).price,10)
assert.throws(()=>helpers.quoteValue([quote('OTHER',10,20)],'DEMO',now),/No usable latest quote/)
assert.throws(()=>helpers.quoteValue([quote('DEMO',10,20,'2026-10-27T00:00:00Z')],'DEMO',now),/No usable latest quote/)
assert.throws(()=>helpers.quoteValue([quote('DEMO',null,null)],'DEMO',now),/No usable latest quote/)
let user={sub:'47',actorType:'client'}
let profile={clientId:47,cashAmount:'1000'}
let holdings=[{clientId:47,ticker:'BTC/USD',quantity:2}]
let prices=[quote('BTC-USD',100,120,new Date(Date.now()-60000).toISOString())]
const requested=[]
const providers={
  http:{get:(path,options)=>{requested.push(options ? {path,options} : path);return of(path === '/api/v1/portfolio/history' ? {currency:'USD',coverage:{complete:true},points:historyPoints} : holdings)}},
  profile:{getProfile:()=>of(profile)},
  market:{getLatestPrice:ticker=>{requested.push(ticker);return of(prices)}},
  token:{currentUser:()=>user},
}
const {PortfolioValueService}=compile(source.slice(source.indexOf('export class PortfolioValueService')),['PortfolioValueService'],{
  inject:key=>providers[key],HttpClient:'http',ClientProfileApiService:'profile',MarketDataService:'market',TokenStore:'token',
  forkJoin,from,map,mergeMap,of,switchMap,timeout,toArray,quoteValue:helpers.quoteValue,portfolioRange:helpers.portfolioRange,
})
const api=new PortfolioValueService()
assert.equal((await firstValueFrom(api.history('1W', now))).points.length, 4)
assert.deepEqual(requested.at(-1), {path:'/api/v1/portfolio/history',options:{params:{from:'2026-10-19T12:00:00.000Z',to:'2026-10-26T12:00:00.000Z'}}})
const observation=await firstValueFrom(api.observe())
assert.equal(observation.cash,1000)
assert.equal(observation.invested,200)
assert.equal(observation.total,1200)
assert.equal(observation.positions,1)
assert.ok(requested.includes('/api/v1/holdings'))
holdings=[]
assert.equal((await firstValueFrom(api.observe())).total,1000,'Cash-only accounts are still valued')
profile={clientId:48,cashAmount:1000}
await assert.rejects(firstValueFrom(api.observe()),/does not belong/)
profile={clientId:47,cashAmount:1000}
holdings=[{clientId:48,ticker:'BTC-USD',quantity:2}]
await assert.rejects(firstValueFrom(api.observe()),/does not belong/)
holdings=[{clientId:47,ticker:'BTC-USD',quantity:2}]
prices=[]
await assert.rejects(firstValueFrom(api.observe()),/Total value is unavailable/)
profile={clientId:47}
await assert.rejects(firstValueFrom(api.observe()),/valid cash balance/)
for (const invalid of [null,{sub:'47',actorType:'employee'},{sub:'bad',actorType:'client'}]) {
  user=invalid
  const before=requested.length
  assert.throws(()=>api.observe(),/signed-in client/)
  assert.throws(()=>api.history('1D'),/signed-in client/)
  assert.equal(requested.length,before)
}

const componentSource=await read('src/app/shared/charts/portfolio-value.component.ts')
const {PortfolioValueComponent}=compile(componentSource.slice(componentSource.indexOf('export default class')),['PortfolioValueComponent'],{
  inject:()=>({}),PortfolioValueService:'api',TokenStore:'token',effect:()=>{},signal,computed,Subject,
  portfolioPeriods:helpers.portfolioPeriods,portfolioHistorySeries:helpers.portfolioHistorySeries,hasMissingPrices:helpers.hasMissingPrices,
})
const component=new PortfolioValueComponent()
const actualNow=Date.now()
component.history.set({currency:'USD',coverage:{complete:true},points:[0,2,10,60].map(days=>({...historyPoint(new Date(actualNow-days*86400000).toISOString(),100+days)}))})
for (const [period,length] of [['1D',1],['1W',2],['1M',3],['1Y',4]]) {
  component.selectPeriod(period)
  assert.equal(component.period(),period)
  assert.equal(component.chart().values.length,length,`${period} must change the actual series range`)
}
const chartSource=await read('src/app/shared/analytics/analytics-chart.component.ts')
let chartInput={kind:'pie',labels:['stock','crypto','bitcoin'],values:[600,300,100],format:'money'}
const {AnalyticsChart}=compile(chartSource.slice(chartSource.indexOf('export default class')),['AnalyticsChart'],{
  input:Object.assign(value=>()=>value,{required:()=>()=>chartInput}),computed,
})
let chart=new AnalyticsChart()
assert.deepEqual(chart.slices().map(slice=>slice.percent),[60,30,10])
assert.match(chart.pieDescription(),/bitcoin 10.00%/)
chartInput={kind:'line',labels:['2026-10-01T00:00:00Z','2026-10-02T00:00:00Z','2026-10-11T00:00:00Z'],values:[1,2,3],format:'number',timeBased:true}
chart=new AnalyticsChart()
assert.equal(chart.points()[1].x,95,'Time spacing must be based on elapsed time, not sample index')
chartInput={kind:'line',labels:['2026-10-01'],values:[1200],format:'money',timeBased:true}
chart=new AnalyticsChart()
assert.equal(chart.points()[0].x,355,'One actual observation is a point, not an invented historical line')
assert.equal(chart.area(),'','Do not draw a filled area for a single point')
chartInput={kind:'line',labels:['2026-10-01T00:00:00Z','2026-10-02T00:00:00Z'],values:[1200,1300],format:'money',timeBased:true}
chart=new AnalyticsChart()
assert.ok(chart.area().startsWith('30,200 '))
assert.ok(chart.area().endsWith(' 680,200'))
chartInput={kind:'line',labels:['2026-10-01','2026-10-02','2026-10-03','2026-10-04'],values:[100,null,120,130],format:'money',timeBased:true}
chart=new AnalyticsChart()
assert.equal(chart.points().length,3)
assert.deepEqual(chart.segments().map(segment=>segment.length),[1,2],'Missing prices must break both line and area')
assert.equal(chart.segmentArea(chart.segments()[0]),'')

const storeSource=await read('src/app/core/state/portfolio.store.ts')
const {Store}=compile(storeSource.slice(storeSource.indexOf('export default class')),['Store'],{
  signal, assets:[],initialClients:[],initialReporters:[],initialOrders:[],initialTransactions:[],tap,
})
const liveStore=new Store({get:()=>of([{clientId:47,ticker:'NEW/USD',quantity:3}])},{})
liveStore.session.set({role:'client',username:'client'})
liveStore.positions.set([{client:'client',symbol:'NEW/USD',quantity:2,average:10}])
liveStore.instruments.set([{ticker:'NEW-USD',bidPrice:100,askPrice:110}])
assert.equal(liveStore.holdingValue('new/usd',2),200,'Holdings outside the seeded assets must use live instruments')
assert.equal(liveStore.invested,200)
liveStore.instruments.set([{ticker:'NEW-USD',bidPrice:125,askPrice:130}])
assert.equal(liveStore.invested,250,'Market updates must change holdings value')
await firstValueFrom(liveStore.refreshHoldings())
assert.equal(liveStore.holdings[0].quantity,3)
assert.equal(liveStore.invested,375,'Refreshed quantities must affect valuation')
liveStore.instruments.set([])
assert.equal(liveStore.holdingValue('NEW/USD',3),null)
assert.equal(liveStore.invested,null,'Missing prices must not silently become zero')
console.log('Portfolio/chart tests passed: real cash+quotes, missing values, ownership, all time buttons, pie percentages, and elapsed-time axes.')