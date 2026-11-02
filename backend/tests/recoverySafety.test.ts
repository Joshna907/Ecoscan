import { randomUUID } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll,afterEach,beforeAll,describe,expect,it,vi } from 'vitest'
import request from 'supertest'
import { Pool } from 'pg'
import { DemoSessionStore } from '../src/store/demoSessions'
import { PostgresSessionStore } from '../src/store/postgresSessions'
import { reliabilityConfigSchema } from '../src/config'
import { ScanService } from '../src/services/scanService'
import { OfferService } from '../src/services/offerService'
import { MemorySafetyStore,PostgresSafetyStore,RewardSafetyService,sessionSubject,partnerSubject } from '../src/services/rewardSafety'
import { createApp } from '../src/app'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { ActivityEvidenceService } from '../src/services/activityEvidence'
import { MemoryEvidenceStore } from '../src/store/activityEvidence'
import type { EcoScanStore } from '../src/services/ports'

afterEach(()=>vi.unstubAllEnvs())
async function fund(store:EcoScanStore,owner:string) {
  const id=randomUUID()
  await store.addAnalysis(owner,id,{imageHash:randomUUID(),recognitionMode:'vision',suggestions:[{id:'one',category:'tshirt'}]})
  await new ScanService(store).confirm(owner,{analysisId:id,items:[{category:'tshirt',quantity:1}],replacesPlannedNewPurchase:true})
}
describe('account-free receipt recovery',()=>{
  it('recovers after session expiry, preserves settled status and revokes a replaced key',async()=>{
    let now=Date.now()
    const store=new DemoSessionStore(reliabilityConfigSchema.parse({sessionTtlMs:1000}),()=>now)
    const owner=await store.getOrCreate(undefined),offers=new OfferService(store)
    await fund(store,owner);await offers.redeem(owner,'repair-kit')
    const old=await offers.createRecovery(owner,'repair-kit'),current=await offers.createRecovery(owner,'repair-kit')
    await expect(offers.recover(old.recoveryKey)).rejects.toMatchObject({code:'VOUCHER_UNAVAILABLE'})
    await offers.refund(owner,'repair-kit')
    expect((await offers.recover(current.recoveryKey)).receipt.status).toBe('refunded')
    now+=31*86400_000
    await store.cleanup()
    expect(await store.getOrCreate(owner)).not.toBe(owner)
    expect((await offers.recover(current.recoveryKey)).receipt.status).toBe('refunded')
    expect((await offers.recover(current.recoveryKey)).readOnly).toBe(true)
    now+=150*86400_000
    await expect(offers.recover(current.recoveryKey)).rejects.toMatchObject({code:'VOUCHER_UNAVAILABLE'})
  })
  it('does not expose recovery keys to other sessions and does not create a balance on recovery',async()=>{
    const store=new DemoSessionStore(),owner=await store.getOrCreate(undefined),other=await store.getOrCreate(undefined)
    await fund(store,owner)
    const offers=new OfferService(store);await offers.redeem(owner,'repair-kit')
    await expect(offers.createRecovery(other,'repair-kit')).rejects.toMatchObject({code:'VOUCHER_UNAVAILABLE'})
    const key=await offers.createRecovery(owner,'repair-kit')
    expect(JSON.stringify(await offers.list(owner))).not.toContain(key.recoveryKey)
    await offers.recover(key.recoveryKey)
    expect((await offers.list(other)).demoPointsBalance).toBe(0)
  })
  it('rate limits invalid recovery attempts and creates a private operator flag',async()=>{
    const safetyStore=new MemorySafetyStore(),app=createApp(mockRecognizer,{safetyStore,logger:()=>{},config:{scanRateCapacity:3,scanRateRefillMs:60000}})
    for(let i=0;i<3;i++)await request(app).post('/api/offers/recover').send({recoveryKey:'a'.repeat(43)}).expect(409)
    await request(app).post('/api/offers/recover').send({recoveryKey:'a'.repeat(43)}).expect(429)
    const snapshot=await safetyStore.snapshot()
    expect(snapshot.reviews).toHaveLength(1)
    expect(snapshot.reviews[0]).toMatchObject({rule:'recovery_failed',status:'open',eventCount:3})
    expect(JSON.stringify(snapshot)).not.toContain('a'.repeat(43))
    expect(JSON.stringify(snapshot)).not.toContain('127.0.0.1')
  })
})
describe('operational reward review',()=>{
  it('deduplicates scan retries, audits operator decisions and releases holds safely',async()=>{
    const store=new MemorySafetyStore(),service=new RewardSafetyService(store,'test-hash-key'),subject=sessionSubject(randomUUID())
    for(let i=0;i<3;i++)await service.record('duplicate_image',subject,'same-analysis')
    expect((await store.snapshot()).reviews).toHaveLength(0)
    await service.record('duplicate_image',subject,'second-analysis');await service.record('duplicate_image',subject,'third-analysis')
    const review=(await store.snapshot()).reviews[0]
    // A stream of new flags must not prevent an operator from acting on a review.
    await service.record('duplicate_image',subject,'fourth-analysis')
    const held=await store.review(review.id,review.version,'hold','investigating','operator-one')
    await expect(service.assertAllowed(subject)).rejects.toMatchObject({code:'REWARD_REVIEW_HOLD'})
    await expect(store.review(review.id,review.version,'dismiss','false_positive','operator-two')).rejects.toMatchObject({code:'REVIEW_CONFLICT'})
    await store.review(held.id,held.version,'release','resolved','operator-one')
    await service.assertAllowed(subject)
    expect((await store.audit(review.id)).map(a=>a.decision)).toEqual(['hold','release'])
  })
  it('blocks new partner attestations and new redemptions on held subjects',async()=>{
    const safetyStore=new MemorySafetyStore(),safety=new RewardSafetyService(safetyStore,'test-hash-key'),store=new DemoSessionStore()
    const owner=await store.getOrCreate(undefined);await fund(store,owner)
    for(let i=0;i<3;i++)await safety.record('duplicate_image',sessionSubject(owner))
    const review=(await safetyStore.snapshot()).reviews[0];await safetyStore.review(review.id,review.version,'hold','confirmed_abuse','operator')
    await expect(new OfferService(store,safety).redeem(owner,'repair-kit')).rejects.toMatchObject({code:'REWARD_REVIEW_HOLD'})
    const partner={id:'test',name:'Test Partner',secret:'s'.repeat(40),activities:['repair' as const]}
    for(let i=0;i<3;i++)await safety.record('activity_claim_conflict',partnerSubject(partner.id))
    const partnerReview=(await safetyStore.snapshot()).reviews.find(r=>r.subject===partnerSubject(partner.id))!
    await safetyStore.review(partnerReview.id,partnerReview.version,'hold','investigating','operator')
    const evidence=new ActivityEvidenceService({hashKey:'h'.repeat(40),partners:[partner]},new MemoryEvidenceStore(),Date.now,safety)
    await expect(evidence.confirm(partner,{code:'a'.repeat(43),eventReference:'event',participantReference:'person',activity:'repair',occurredAt:new Date().toISOString()})).rejects.toMatchObject({code:'REWARD_REVIEW_HOLD'})
  })
  it('requires operator credentials and rejects stale review decisions',async()=>{
    vi.stubEnv('REWARD_REVIEW_OPERATORS',JSON.stringify([{id:'reviewer',token:'s'.repeat(40)}]))
    const safetyStore=new MemorySafetyStore(),app=createApp(mockRecognizer,{safetyStore,logger:()=>{},config:{scanRateCapacity:20}})
    for(let i=0;i<3;i++)await safetyStore.record({id:randomUUID(),rule:'recovery_failed',subject:'network:opaque',dedupKey:null,at:Date.now()})
    await request(app).get('/api/internal/rewards-risk').expect(401)
    const queue=await request(app).get('/api/internal/rewards-risk').set('Authorization','Bearer '+'s'.repeat(40)).expect(200)
    const review=queue.body.reviews[0]
    await request(app).post('/api/internal/rewards-risk/'+review.id).set('Authorization','Bearer '+'s'.repeat(40)).send({expectedVersion:review.version,decision:'dismiss',reason:'false_positive'}).expect(200)
    expect((await request(app).get('/api/internal/rewards-risk/'+review.id+'/audit').set('Authorization','Bearer '+'s'.repeat(40)).expect(200)).body.audit[0].operatorId).toBe('reviewer')
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('persistent recovery and review',()=>{
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:4}),store=new PostgresSessionStore(pool,reliabilityConfigSchema.parse({})),owners:string[]=[],archives:string[]=[],subjects:string[]=[]
  beforeAll(async()=>{
    const directory=fileURLToPath(new URL('../db/',import.meta.url))
    for(const name of readdirSync(directory).filter(n=>/^\d+_.*\.sql$/.test(n)).sort())await pool.query(readFileSync(directory+name,'utf8'))
  })
  afterAll(async()=>{
    for(const reference of archives)await pool.query('DELETE FROM eco_receipt_archive WHERE reference=$1',[reference])
    for(const subject of subjects){await pool.query('DELETE FROM eco_reward_review_audit WHERE review_id IN (SELECT id FROM eco_reward_reviews WHERE subject=$1)',[subject]);await pool.query('DELETE FROM eco_reward_reviews WHERE subject=$1',[subject]);await pool.query('DELETE FROM eco_reward_holds WHERE subject=$1',[subject]);await pool.query('DELETE FROM eco_reward_security_events WHERE subject=$1',[subject])}
    for(const id of owners)await pool.query('DELETE FROM eco_sessions WHERE id=$1',[id])
    await pool.end()
  })
  it('keeps receipt status transactional and recovers after the original session is deleted',async()=>{
    const owner=await store.getOrCreate(undefined);owners.push(owner);await fund(store,owner)
    const offers=new OfferService(store),issued=await offers.redeem(owner,'repair-kit');archives.push(issued.receipt.reference)
    const key=await offers.createRecovery(owner,'repair-kit')
    await offers.refund(owner,'repair-kit')
    await pool.query('DELETE FROM eco_sessions WHERE id=$1',[owner])
    const recovered=await new OfferService(new PostgresSessionStore(pool,reliabilityConfigSchema.parse({}))).recover(key.recoveryKey)
    expect(recovered.receipt.status).toBe('refunded')
    expect(recovered.receipt.reference).toBe(issued.receipt.reference)
    const stored=(await pool.query('SELECT recovery_hash FROM eco_receipt_archive WHERE reference=$1',[issued.receipt.reference])).rows[0]
    expect(stored.recovery_hash).toMatch(/^[a-f0-9]{64}$/);expect(stored.recovery_hash).not.toBe(key.recoveryKey)
  })
  it('shares alerts and holds across replicas with one winning operator decision',async()=>{
    const first=new PostgresSafetyStore(pool),second=new PostgresSafetyStore(pool),subject=sessionSubject(randomUUID());subjects.push(subject)
    await Promise.all([0,1,2].map(i=>first.record({id:randomUUID(),rule:'duplicate_image',subject,dedupKey:randomUUID(),at:Date.now()+i})))
    const review=(await second.snapshot()).reviews.find(r=>r.subject===subject)!
    const decisions=await Promise.allSettled([first.review(review.id,review.version,'hold','investigating','one'),second.review(review.id,review.version,'dismiss','false_positive','two')])
    expect(decisions.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(await second.audit(review.id)).toHaveLength(1)
  })
})
