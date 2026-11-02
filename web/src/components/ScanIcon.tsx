import type { ReactNode } from 'react'
type IconName = 'upload' | 'camera' | 'shirt' | 'jeans' | 'jacket' | 'shoe' | 'check' | 'arrow' | 'plus' | 'minus' | 'close' | 'leaf' | 'ruler' | 'image' | 'gift' | 'key' | 'refresh' | 'receipt'
const paths: Record<IconName, ReactNode> = {
  gift: <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></>,
  key: <><circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-1 5 3-3"/><path d="M7 8h.01"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M19 12a7 7 0 0 0-12-6L4 9m1 3a7 7 0 0 0 12 6l3-3"/></>,
  receipt: <><path d="M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M9 9h6m-6 4h6m-6 4h3"/></>,
  upload: <><path d="M12 16V3m-4 4 4-4 4 4"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></>,
  camera: <><path d="m8 5 1-2h6l1 2h4v15H4V5z"/><circle cx="12" cy="12" r="4"/></>,
  shirt: <path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 3-7 3-8 0Z"/>,
  jeans: <><path d="M6 3h12l2 18h-6l-2-10-2 10H4L6 3Z"/><path d="M6 7h12m-6-4v8M7 7l-1 4m11-4 1 4"/></>,
  jacket: <><path d="m8 3-4 3-2 12 4 1 2-8v10h8V11l2 8 4-1-2-12-4-3-4 4-4-4Z"/><path d="M12 7v14m-4-9 2 1m4 0 2-1"/></>,
  shoe: <><path d="M3 13V8h5l3 5 4 2 5 1 1 4H3v-7Z"/><path d="M3 17h17m-10-5 2-2m1 4 2-2"/></>,
  check: <path d="m5 12 4 4L19 6"/>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  leaf: <><path d="M20 3c-10 0-16 3-16 10a7 7 0 0 0 7 7c7 0 9-7 9-17Z"/><path d="M3 22 15 10"/></>,
  ruler: <><path d="m3 16 13-13 5 5L8 21l-5-5Z"/><path d="m12 7 2 2m-5 1 2 2m-5 1 2 2"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
}
export function ScanIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`scan-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
