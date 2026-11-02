import { useState } from 'react'
import type { RecoveredReceipt } from 'shared'
import { api,messageOf } from '../lib/api'
import { ScanIcon } from './ScanIcon'

export function RecoveryKeyButton({ offerId }: { offerId: string }) {
  const [saved,setSaved]=useState<{recoveryKey:string;recoveryExpiresAt:string}|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function generate() {
    setBusy(true);setError('')
    try { setSaved(await api.createRecoveryKey(offerId)) } catch(cause) { setError(messageOf(cause)) } finally {setBusy(false)}
  }
  function download() {
    if (!saved) return
    const text=`EcoScan private receipt recovery key\n\n${saved.recoveryKey}\n\nValid until ${saved.recoveryExpiresAt}\nOpen EcoScan > Rewards > Recover a receipt and enter this key.\nKeep it private. Anyone with this key can view this receipt.\nIt does not restore balances, permit refunds, or issue goods.\n`
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),link=document.createElement('a')
    link.href=url;link.download='ecoscan-receipt-recovery.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <div className="note rewards-save-key"><p><ScanIcon name="key"/> Keep a way back to this receipt</p><p>Save a private key to view this receipt for up to 180 days after issuance. A new key replaces the previous one.</p>
    <button className="secondary" disabled={busy} onClick={()=>void generate()}>{busy?'Generating…':'Generate receipt recovery key'}</button>
    {error&&<p className="error" role="alert">{error}</p>}
    {saved&&<div role="status"><p className="verification-code">{saved.recoveryKey}</p><p>Keep this key private. Anyone holding it can view the receipt. Valid until {new Date(saved.recoveryExpiresAt).toLocaleString()}.</p><button className="secondary" onClick={download}>Download private recovery key</button></div>}
  </div>
}

export function ReceiptRecovery() {
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [receipt,setReceipt]=useState<RecoveredReceipt|null>(null)
  async function recover(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setReceipt(null)
    try { setReceipt(await api.recoverReceipt(key.trim()));setKey('') } catch(cause) {setError(messageOf(cause))} finally{setBusy(false)}
  }
  return <section className="panel rewards-tool rewards-recovery" aria-labelledby="recovery-title"><div className="rewards-tool-heading"><span className="rewards-tool-icon"><ScanIcon name="key"/></span><div><p className="eyebrow">SAVED SOMETHING GOOD?</p><h2 id="recovery-title">Recover a receipt</h2></div></div><p>Lost your browser session? Use the private key you saved with your receipt. No login needed.</p>
    <form onSubmit={event=>void recover(event)}><label>Private receipt recovery key<input type="password" autoComplete="off" placeholder="Enter your 43-character key" aria-describedby="recovery-help" value={key} onChange={event=>setKey(event.target.value)} required minLength={43} maxLength={43}/></label><button disabled={busy}>{busy?'Recovering…':'Recover saved receipt'}<ScanIcon name="arrow"/></button></form>
    <p id="recovery-help" className="rewards-recovery-help">View your receipt only. Recovery does not restore points or allow voucher use or refunds. Keep your key private.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {receipt&&<div className="demo-receipt" role="status"><h3>{receipt.title}</h3><p>{receipt.receipt.reference} · {receipt.receipt.status}</p><p>Issued {new Date(receipt.receipt.redeemedAt).toLocaleString()}{receipt.receipt.expiresAt&&<> · Voucher expires {new Date(receipt.receipt.expiresAt).toLocaleString()}</>}</p><p>Recovered receipt only. Current demo offers issue no real goods or vouchers.</p></div>}
  </section>
}
