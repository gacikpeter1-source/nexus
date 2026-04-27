import React, { useState, useRef, useCallback } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'

const VW = 1100, VH = 550

const COLORS = [
  { v: '#e07b00', n: 'Orange' },
  { v: '#1a7a3c', n: 'Green' },
  { v: '#1565c0', n: 'Blue' },
  { v: '#d62828', n: 'Red' },
  { v: '#ffffff', n: 'White' },
  { v: '#111827', n: 'Black' },
  { v: '#e8d500', n: 'Yellow' },
  { v: '#9b59b6', n: 'Purple' },
]

const TOOL_GROUPS = [
  { label: 'Select/Erase', tools: [
    { id: 'select', icon: '↖', label: 'Select/Move' },
    { id: 'eraser', icon: '⌫', label: 'Erase' },
  ]},
  { label: 'Lines', tools: [
    { id: 'pen',    icon: '—',  label: 'Solid line' },
    { id: 'dashed', icon: '╌',  label: 'Dashed' },
    { id: 'wavy',   icon: '〜', label: 'Wavy' },
    { id: 'wavyd',  icon: '∿',  label: 'Wavy dashed' },
    { id: 'arrow',  icon: '➤',  label: 'Arrow' },
    { id: 'darrow', icon: '⇢',  label: 'Dashed arrow' },
    { id: 'shot',   icon: '▶▶', label: 'Shot' },
  ]},
  { label: 'Objects', tools: [
    { id: 'player',  icon: '●',  label: 'Player' },
    { id: 'figure',  icon: '🏒', label: 'Skater' },
    { id: 'puck',    icon: '⬤',  label: 'Puck' },
    { id: 'cone',    icon: '🔶', label: 'Cone' },
    { id: 'goalS',   icon: '⬜', label: 'Small goal' },
    { id: 'goalL',   icon: '⬛', label: 'Large goal' },
    { id: 'barrier', icon: '▬',  label: 'Barrier' },
    { id: 'label',   icon: 'T',  label: 'Text' },
  ]},
]

const LBLS = ['A', 'B', 'C', 'D', 'R', 'M', 'G', '1', '2', '3', '4', '5']

const PLAYGROUNDS = [
  { id: 'blank',       label: '— Blank canvas',            src: null },
  { id: 'hockey-rink', label: '🏒 Ice Hockey Rink',        src: '/playgrounds/hockey-rink.png' },
  { id: 'ice-rink',    label: '⛸️  Ice Rink',               src: '/playgrounds/ice-rink.jpg' },
  { id: 'football',    label: '⚽ Football Pitch',          src: '/playgrounds/football.png' },
  { id: 'tennis',      label: '🎾 Tennis Court',            src: '/playgrounds/tennis.png' },
]

interface Point { x: number; y: number }

// ── path helpers ──────────────────────────────────────────────
function smoothPath(pts: Point[]): string {
  if (!pts || pts.length < 2) return ''
  let d = 'M' + pts[0].x + ' ' + pts[0].y
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ' Q' + pts[i].x + ' ' + pts[i].y + ' ' + mx + ' ' + my
  }
  return d + ' L' + pts[pts.length - 1].x + ' ' + pts[pts.length - 1].y
}

function wavyPath(pts: Point[]): string {
  if (!pts || pts.length < 2) return ''
  const AMP = 10, WL = 24
  const total = pts.reduce((a, p, i) =>
    i === 0 ? 0 : a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y), 0)
  if (total < 2) return ''
  const steps = Math.max(40, Math.floor(total / 4))
  const out: Point[] = []
  let trav = 0, seg = 0
  for (let s = 0; s <= steps; s++) {
    const want = (s / steps) * total
    while (seg < pts.length - 2) {
      const sl = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].y - pts[seg].y)
      if (trav + sl >= want) break
      trav += sl; seg++
    }
    const sl = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].y - pts[seg].y)
    const t = sl > 0 ? (want - trav) / sl : 0
    const px = pts[seg].x + t * (pts[seg + 1].x - pts[seg].x)
    const py = pts[seg].y + t * (pts[seg + 1].y - pts[seg].y)
    const dx = pts[seg + 1].x - pts[seg].x
    const dy = pts[seg + 1].y - pts[seg].y
    const len = Math.hypot(dx, dy) || 1
    const wave = Math.sin((want / WL) * Math.PI * 2) * AMP
    out.push({ x: px + (-dy / len) * wave, y: py + (dx / len) * wave })
  }
  let d = 'M' + out[0].x.toFixed(1) + ' ' + out[0].y.toFixed(1)
  for (let i = 1; i < out.length; i++) d += ' L' + out[i].x.toFixed(1) + ' ' + out[i].y.toFixed(1)
  return d
}

// ── hit test ──────────────────────────────────────────────────
function hitTest(el: any, px: number, py: number): boolean {
  const THR = 18
  const dist = (x: number, y: number) => Math.hypot(px - x, py - y)
  const distSeg = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    if (l2 === 0) return dist(ax, ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  if (el.type === 'path') {
    if (!el.pts) return false
    for (let i = 0; i < el.pts.length - 1; i++) {
      if (distSeg(el.pts[i].x, el.pts[i].y, el.pts[i + 1].x, el.pts[i + 1].y) < THR) return true
    }
    return false
  }
  if (el.type === 'arrow' || el.type === 'shot' || el.type === 'barrier') {
    return distSeg(el.x1, el.y1, el.x2, el.y2) < THR
  }
  return dist(el.x || 0, el.y || 0) < THR
}

function moveEl(el: any, dx: number, dy: number): any {
  if (el.type === 'path') return { ...el, pts: el.pts.map((p: Point) => ({ x: p.x + dx, y: p.y + dy })) }
  if (el.type === 'arrow' || el.type === 'shot' || el.type === 'barrier') {
    return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
  }
  return { ...el, x: el.x + dx, y: el.y + dy }
}

function rotateEl(el: any, deg: number): any {
  if (el.type === 'path' || el.type === 'arrow' || el.type === 'shot' || el.type === 'barrier') return el
  return { ...el, rot: ((el.rot || 0) + deg + 360) % 360 }
}

// ── goal net SVG ──────────────────────────────────────────────
function goalNetSVG(w: number, d: number) {
  const hw = w / 2
  const pipeR = 3
  const backPath = 'M' + (-hw) + ',' + (-d) +
    ' C' + (-hw) + ',' + (-d - 8) + ' ' + hw + ',' + (-d - 8) + ' ' + hw + ',' + (-d)
  const leftPipe  = 'M' + (-hw) + ',0 L' + (-hw) + ',' + (-d)
  const rightPipe = 'M' + hw    + ',0 L' + hw    + ',' + (-d)
  const meshH: React.ReactNode[] = []
  const meshV: React.ReactNode[] = []
  const cols = 6, rows = 5
  for (let r = 1; r < rows; r++) {
    const y = -d * r / rows
    meshH.push(<line key={'h' + r} x1={-hw + pipeR} y1={y} x2={hw - pipeR} y2={y}
      stroke="#aac8d8" strokeWidth="0.8" opacity="0.7" />)
  }
  for (let c = 1; c < cols; c++) {
    const x = -hw + w * c / cols
    meshV.push(<line key={'v' + c} x1={x} y1={0} x2={x} y2={-d}
      stroke="#aac8d8" strokeWidth="0.8" opacity="0.7" />)
  }
  return { backPath, leftPipe, rightPipe, meshH, meshV, hw, d, pipeR }
}

// ── render one element ────────────────────────────────────────
function renderEl(el: any, isSelected: boolean) {
  const glowFilter = isSelected ? 'drop-shadow(0 0 8px rgba(255,210,40,1))' : undefined
  const style = glowFilter ? { filter: glowFilter } : undefined
  const rot = el.rot || 0
  const tf = (el.x !== undefined && rot !== 0)
    ? 'rotate(' + rot + ',' + el.x + ',' + el.y + ')'
    : undefined

  if (el.type === 'path') {
    const d = el.wavy ? wavyPath(el.pts) : smoothPath(el.pts)
    const dash = el.dashed ? '10 6' : undefined
    return (
      <path key={el.id} d={d} fill="none" stroke={el.color} strokeWidth={el.sw}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={dash} style={style} pointerEvents="none" />
    )
  }

  if (el.type === 'arrow') {
    const mid = 'mk' + el.color.replace('#', '')
    const dash = el.dashed ? '10 6' : undefined
    return (
      <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
        stroke={el.color} strokeWidth={el.sw} strokeLinecap="round"
        strokeDasharray={dash} markerEnd={'url(#' + mid + ')'}
        style={style} pointerEvents="none" />
    )
  }

  if (el.type === 'shot') {
    const mid = 'mk' + el.color.replace('#', '')
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1
    const len = Math.hypot(dx, dy) || 1
    const ox = -dy / len * 3, oy = dx / len * 3
    return (
      <g key={el.id} style={style} pointerEvents="none">
        <line x1={el.x1 + ox} y1={el.y1 + oy} x2={el.x2 + ox} y2={el.y2 + oy}
          stroke={el.color} strokeWidth={el.sw + 1.5} strokeLinecap="round"
          markerEnd={'url(#' + mid + ')'} />
        <line x1={el.x1 - ox} y1={el.y1 - oy} x2={el.x2 - ox} y2={el.y2 - oy}
          stroke={el.color} strokeWidth={el.sw + 1.5} strokeLinecap="round" />
      </g>
    )
  }

  if (el.type === 'barrier') {
    return (
      <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
        stroke="#1a1a2e" strokeWidth="12" strokeLinecap="round"
        style={style} pointerEvents="none" />
    )
  }

  if (el.type === 'puck') {
    return (
      <g key={el.id} style={style} pointerEvents="none" transform={tf}>
        <circle cx={el.x} cy={el.y} r="11" fill="#111" stroke="#333" strokeWidth="1.5" />
        <circle cx={el.x} cy={el.y} r="7.5" fill="none" stroke="#444" strokeWidth="1.0" />
        <circle cx={el.x - 3} cy={el.y - 3} r="2.5" fill="#555" />
      </g>
    )
  }

  if (el.type === 'player') {
    const tc = (el.color === '#ffffff' || el.color === '#e8d500') ? '#111' : '#fff'
    return (
      <g key={el.id} style={style} pointerEvents="none" transform={tf}>
        <circle cx={el.x} cy={el.y} r="16" fill={el.color} stroke="#fff" strokeWidth="2.5" />
        <text x={el.x} y={el.y} textAnchor="middle" dominantBaseline="central"
          fontSize="11" fontWeight="900" fill={tc} fontFamily="system-ui">{el.label}</text>
      </g>
    )
  }

  if (el.type === 'figure') {
    const light = (el.color === '#ffffff' || el.color === '#e8d500')
    const tc = light ? '#111' : '#fff'
    return (
      <g key={el.id} style={style} pointerEvents="none"
        transform={'translate(' + el.x + ',' + el.y + ')' + (rot ? ' rotate(' + rot + ')' : '')}>
        <ellipse cx="0" cy="5" rx="10" ry="12" fill={el.color} stroke="#fff" strokeWidth="1.5" />
        <circle cx="0" cy="-13" r="8" fill={el.color} stroke="#fff" strokeWidth="1.5" />
        <path d="M-7,-17 Q0,-22 7,-17" fill="none" stroke={tc} strokeWidth="1.2" opacity="0.5" />
        <line x1="9" y1="2" x2="20" y2="17" stroke="#7a4a10" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="16" y1="13" x2="24" y2="11" stroke="#7a4a10" strokeWidth="3" strokeLinecap="round" />
        <text x="0" y="8" textAnchor="middle" dominantBaseline="central"
          fontSize="9" fontWeight="900" fill={tc} fontFamily="system-ui">{el.label}</text>
      </g>
    )
  }

  if (el.type === 'cone') {
    const pts = el.x + ',' + (el.y - 13) + ' ' + (el.x - 10) + ',' + (el.y + 9) + ' ' + (el.x + 10) + ',' + (el.y + 9)
    return (
      <g key={el.id} style={style} pointerEvents="none" transform={tf}>
        <polygon points={pts} fill="#f0a500" stroke="#b07000" strokeWidth="1.5" />
        <ellipse cx={el.x} cy={el.y + 9} rx="10" ry="4" fill="#c08000" opacity="0.55" />
        <line x1={el.x - 6} y1={el.y + 1} x2={el.x + 6} y2={el.y + 1} stroke="#fff" strokeWidth="1" opacity="0.5" />
      </g>
    )
  }

  if (el.type === 'goalS') {
    const w = 36, d = 20
    const { backPath, leftPipe, rightPipe, meshH, meshV, hw, pipeR } = goalNetSVG(w, d)
    return (
      <g key={el.id} style={style} pointerEvents="none"
        transform={'translate(' + el.x + ',' + el.y + ')' + (rot ? ' rotate(' + rot + ')' : '')}>
        {meshH}{meshV}
        <path d={backPath} fill="none" stroke="#c82020" strokeWidth="2.5" strokeLinecap="round" />
        <path d={leftPipe}  fill="none" stroke="#c82020" strokeWidth="2.5" strokeLinecap="round" />
        <path d={rightPipe} fill="none" stroke="#c82020" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={-hw} cy="0" r={pipeR + 1} fill="#c82020" />
        <circle cx={hw}  cy="0" r={pipeR + 1} fill="#c82020" />
        <line x1={-hw} y1="0" x2={hw} y2="0" stroke="#c82020" strokeWidth="3" />
      </g>
    )
  }

  if (el.type === 'goalL') {
    const w = 70, d = 42
    const { backPath, leftPipe, rightPipe, meshH, meshV, hw, pipeR } = goalNetSVG(w, d)
    return (
      <g key={el.id} style={style} pointerEvents="none"
        transform={'translate(' + el.x + ',' + el.y + ')' + (rot ? ' rotate(' + rot + ')' : '')}>
        {meshH}{meshV}
        <path d={backPath} fill="none" stroke="#c82020" strokeWidth="3" strokeLinecap="round" />
        <path d={leftPipe}  fill="none" stroke="#c82020" strokeWidth="3" strokeLinecap="round" />
        <path d={rightPipe} fill="none" stroke="#c82020" strokeWidth="3" strokeLinecap="round" />
        <circle cx={-hw} cy="0" r={pipeR + 1.5} fill="#c82020" />
        <circle cx={hw}  cy="0" r={pipeR + 1.5} fill="#c82020" />
        <line x1={-hw} y1="0" x2={hw} y2="0" stroke="#c82020" strokeWidth="4" />
      </g>
    )
  }

  if (el.type === 'minigoal') {
    const gw = 24, gh = 34, gx = el.side === 'left' ? el.x : el.x - gw, gy = el.y - gh / 2
    const openX = el.side === 'left' ? gx + gw : gx
    return (
      <g key={el.id} style={style} pointerEvents="none">
        <rect x={gx} y={gy} width={gw} height={gh} rx="2" fill="#ddeef8" stroke="#1a2a3a" strokeWidth="2.2" />
        <line x1={gx + gw / 2} y1={gy} x2={gx + gw / 2} y2={gy + gh} stroke="#1a2a3a" strokeWidth="0.8" opacity="0.3" />
        <line x1={gx} y1={gy + gh / 2} x2={gx + gw} y2={gy + gh / 2} stroke="#1a2a3a" strokeWidth="0.8" opacity="0.3" />
        <line x1={openX} y1={gy} x2={openX} y2={gy + gh} stroke="#c82020" strokeWidth="2.5" />
      </g>
    )
  }

  if (el.type === 'textlabel' || el.type === 'zonelabel' || el.type === 'timelabel' || el.type === 'turnx') {
    const txt = el.type === 'turnx' ? '✕' : el.text
    const fs = el.type === 'timelabel' ? 9 : el.type === 'turnx' ? 15 : 13
    return (
      <text key={el.id} x={el.x} y={el.y} textAnchor="middle" dominantBaseline="central"
        fontSize={fs} fontWeight="700" fill={el.color || '#d62828'}
        style={style} pointerEvents="none" fontFamily="system-ui">{txt}</text>
    )
  }

  return null
}

// ── Main Page ──────────────────────────────────────────────────
export default function TrainingBoard() {
  const { t } = useLanguage()

  const [tool,     setTool]     = useState('select')
  const [color,    setColor]    = useState('#e07b00')
  const [sw,       setSw]       = useState(3)
  const [els,      setEls]      = useState<any[]>([])
  const [labelIdx, setLabelIdx] = useState(0)
  const [selId,    setSelId]    = useState<number | null>(null)
  const [livePts,  setLivePts]  = useState<Point[] | null>(null)
  const [liveArr,  setLiveArr]  = useState<any>(null)
  const [_hist,    setHist]     = useState<any[][]>([])
  const [bgImg,    setBgImg]    = useState<string | null>(null)
  const [bgName,   setBgName]   = useState<string | null>(null)

  // Text label modal (replaces window.prompt)
  const [labelModal, setLabelModal] = useState<{ open: boolean; x: number; y: number; id: number }>({
    open: false, x: 0, y: 0, id: 0,
  })
  const [labelText, setLabelText] = useState('')

  const svgRef  = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const active  = useRef(false)
  const ptsRef  = useRef<Point[]>([])
  const a0Ref   = useRef<Point | null>(null)
  const dragRef = useRef<any>(null)

  const pushHist = useCallback((snap: any[] | null) => setHist(h => [...h.slice(-30), snap as any[]]), [])

  const isPenTool  = (t: string) => t === 'pen' || t === 'dashed' || t === 'wavy' || t === 'wavyd'
  const isLineTool = (t: string) => t === 'arrow' || t === 'darrow' || t === 'shot' || t === 'barrier'

  const toSVG = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    const s = (e as any).changedTouches
      ? (e as any).changedTouches[0]
      : ((e as any).touches ? (e as any).touches[0] : e)
    return {
      x: (s.clientX - r.left) / r.width  * VW,
      y: (s.clientY - r.top)  / r.height * VH,
    }
  }

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setBgImg(ev.target!.result as string); setBgName(file.name) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const confirmLabel = () => {
    if (labelText.trim() && labelModal.id) {
      pushHist(els)
      setEls(prev => [...prev, {
        id: labelModal.id,
        type: 'textlabel',
        x: labelModal.x,
        y: labelModal.y,
        color,
        text: labelText.trim(),
      }])
    }
    setLabelModal(m => ({ ...m, open: false }))
    setLabelText('')
  }

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault()
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    const p = toSVG(e)

    if (tool === 'select') {
      const hit = els.slice().reverse().find(el => hitTest(el, p.x, p.y))
      if (hit) {
        setSelId(hit.id)
        dragRef.current = { id: hit.id, ox: p.x, oy: p.y, moved: false }
        active.current = true
      } else {
        setSelId(null)
        dragRef.current = null
      }
      return
    }
    if (tool === 'eraser') {
      const hit = els.slice().reverse().find(el => hitTest(el, p.x, p.y))
      if (hit) {
        pushHist(els)
        setEls(prev => prev.filter(el => el.id !== hit.id))
        setSelId(null)
      }
      return
    }
    if (isPenTool(tool)) {
      active.current = true; ptsRef.current = [p]; setLivePts([p]); return
    }
    if (isLineTool(tool)) {
      active.current = true; a0Ref.current = p
      setLiveArr({ x1: p.x, y1: p.y, x2: p.x, y2: p.y }); return
    }
    if (tool === 'label') {
      setLabelModal({ open: true, x: p.x, y: p.y, id: Date.now() })
      setLabelText('')
      return
    }
    pushHist(els)
    const id = Date.now()
    if (tool === 'player')  { setEls(prev => [...prev, { id, type: 'player',  x: p.x, y: p.y, color, label: LBLS[labelIdx], rot: 0 }]); return }
    if (tool === 'figure')  { setEls(prev => [...prev, { id, type: 'figure',  x: p.x, y: p.y, color, label: LBLS[labelIdx], rot: 0 }]); return }
    if (tool === 'puck')    { setEls(prev => [...prev, { id, type: 'puck',    x: p.x, y: p.y, rot: 0 }]); return }
    if (tool === 'cone')    { setEls(prev => [...prev, { id, type: 'cone',    x: p.x, y: p.y, rot: 0 }]); return }
    if (tool === 'goalS')   { setEls(prev => [...prev, { id, type: 'goalS',   x: p.x, y: p.y, rot: 0 }]); return }
    if (tool === 'goalL')   { setEls(prev => [...prev, { id, type: 'goalL',   x: p.x, y: p.y, rot: 0 }]); return }
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active.current) return
    e.preventDefault()
    const p = toSVG(e)
    if (tool === 'select' && dragRef.current) {
      const dx = p.x - dragRef.current.ox, dy = p.y - dragRef.current.oy
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
        dragRef.current.moved = true; dragRef.current.ox = p.x; dragRef.current.oy = p.y
        setEls(prev => prev.map(el => el.id === dragRef.current.id ? moveEl(el, dx, dy) : el))
      }
      return
    }
    if (isPenTool(tool)) {
      ptsRef.current.push(p)
      if (ptsRef.current.length % 3 === 0) setLivePts([...ptsRef.current])
      return
    }
    if (isLineTool(tool)) {
      setLiveArr((prev: any) => prev ? { ...prev, x2: p.x, y2: p.y } : null)
    }
  }

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active.current) return
    e.preventDefault()
    active.current = false
    const p = toSVG(e)
    if (tool === 'select') {
      if (dragRef.current && dragRef.current.moved) pushHist(null)
      dragRef.current = null; return
    }
    if (isPenTool(tool)) {
      const fp = [...ptsRef.current, p]
      if (fp.length > 2) {
        pushHist(els)
        setEls(prev => [...prev, {
          id: Date.now(), type: 'path', pts: fp, color, sw,
          dashed: tool === 'dashed' || tool === 'wavyd',
          wavy:   tool === 'wavy'   || tool === 'wavyd',
        }])
      }
      ptsRef.current = []; setLivePts(null); return
    }
    if (isLineTool(tool) && a0Ref.current) {
      const dx = p.x - a0Ref.current.x, dy = p.y - a0Ref.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 15) {
        pushHist(els)
        const type = tool === 'barrier' ? 'barrier' : tool === 'shot' ? 'shot' : 'arrow'
        const x1 = a0Ref.current.x, y1 = a0Ref.current.y
        setEls(prev => [...prev, {
          id: Date.now(), type, x1, y1, x2: p.x, y2: p.y,
          color, sw, dashed: tool === 'darrow',
        }])
      }
      a0Ref.current = null; setLiveArr(null)
    }
  }

  const undo = () => setHist(h => {
    if (!h.length) return h
    const prev = h[h.length - 1]
    if (prev) setEls(prev); else setEls(e => e.slice(0, -1))
    setSelId(null); return h.slice(0, -1)
  })
  const deleteSelected = () => { if (!selId) return; pushHist(els); setEls(p => p.filter(e => e.id !== selId)); setSelId(null) }
  const clearAll = () => { pushHist(els); setEls([]); setSelId(null); setLivePts(null); setLiveArr(null) }
  const rotateSelected = (deg: number) => { if (!selId) return; setEls(prev => prev.map(el => el.id === selId ? rotateEl(el, deg) : el)) }

  const exportPNG = () => {
    const xml = new XMLSerializer().serializeToString(svgRef.current!)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = VW * 2; c.height = VH * 2
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'training-plan.png'; a.click()
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const selEl     = selId ? els.find(e => e.id === selId) : null
  const allColors = [...new Set(els.map((e: any) => e.color).concat([color]))].filter(Boolean)
  const ac        = tool === 'eraser' ? '#d62828' : tool === 'select' ? '#2ecc71' : '#0066FF'
  const canRotate = selEl && selEl.type !== 'path' && selEl.type !== 'arrow' && selEl.type !== 'shot' && selEl.type !== 'barrier'

  const livePtsIsWavy = tool === 'wavy' || tool === 'wavyd'
  const livePenD      = (livePts && livePts.length > 1) ? (livePtsIsWavy ? wavyPath(livePts) : smoothPath(livePts)) : null
  const livePenDash   = (tool === 'dashed' || tool === 'wavyd') ? '10 6' : undefined

  const liveLineIsBarrier = tool === 'barrier'
  const liveLineMid       = 'mk' + color.replace('#', '')
  const liveLineMarker    = (tool === 'arrow' || tool === 'darrow') ? ('url(#' + liveLineMid + ')') : undefined
  const liveLineDash      = tool === 'darrow' ? '10 6' : undefined

  const selRingX = selEl ? (selEl.x !== undefined ? selEl.x : (selEl.x1 !== undefined ? selEl.x1 : (selEl.pts ? selEl.pts[0].x : 0))) : 0
  const selRingY = selEl ? (selEl.y !== undefined ? selEl.y : (selEl.y1 !== undefined ? selEl.y1 : (selEl.pts ? selEl.pts[0].y : 0))) : 0

  const HINTS: Record<string, string> = {
    select:  selId ? 'Drag · rotate · delete' : 'Click object to select, then drag',
    eraser:  'Click object or line to erase',
    pen:     'Hold and drag → solid line',
    dashed:  'Hold and drag → dashed line',
    wavy:    'Hold and drag → wavy line',
    wavyd:   'Hold and drag → wavy dashed',
    arrow:   'Hold and drag → arrow',
    darrow:  'Hold and drag → dashed arrow',
    shot:    'Hold and drag → shot',
    barrier: 'Hold and drag → foam barrier',
    player:  'Click → player ' + LBLS[labelIdx],
    figure:  'Click → skater ' + LBLS[labelIdx],
    puck:    'Click → puck', cone: 'Click → cone',
    goalS:   'Click → small goal (select + rotate)',
    goalL:   'Click → large goal (select + rotate)',
    label:   'Click → add text label',
  }

  const btnS = (isActive: boolean): React.CSSProperties => ({
    border: 'none', borderRadius: 5, padding: '5px 8px', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 800, minWidth: 28,
    background: isActive ? ac : 'transparent',
    color: isActive ? '#fff' : '#7a9cc0',
    outline: isActive ? '2px solid ' + ac : 'none',
    transition: 'all .1s',
  })

  return (
    <div className="min-h-screen bg-app-primary" style={{ fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}>

      {/* ── Nexus-style page header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <h1 className="text-2xl font-bold text-text-primary">{t('trainingBoard.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('trainingBoard.subtitle')}</p>
      </div>

      {/* ── Drawing board ── */}
      <div style={{ padding: '12px 8px 24px', color: '#ddeeff' }}>

        {/* Pitch selector */}
        <div style={{ maxWidth: 900, margin: '0 auto 7px', background: '#141B3D',
          border: '1px solid #1b3a6a', borderRadius: 10,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>

          {/* Preset dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '.65rem', color: '#4a90b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {t('trainingBoard.presetLabel')}
            </span>
            <select
              onChange={e => {
                const pg = PLAYGROUNDS.find(p => p.id === e.target.value)
                if (!pg) return
                if (pg.src === null) { setBgImg(null); setBgName(null) }
                else { setBgImg(pg.src); setBgName(pg.label) }
              }}
              value={PLAYGROUNDS.find(p => p.src === bgImg)?.id ?? (bgImg ? '__custom__' : 'default')}
              style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6,
                color: '#ddeeff', fontSize: '.7rem', padding: '4px 8px', cursor: 'pointer', outline: 'none' }}>
              {PLAYGROUNDS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {bgImg && !PLAYGROUNDS.find(p => p.src === bgImg) && (
                <option value="__custom__">📁 {bgName}</option>
              )}
            </select>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#243060', flexShrink: 0 }} />

          {/* Custom upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '.65rem', color: '#4a7090', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {t('trainingBoard.customLabel')}
            </span>
            <button onClick={() => fileRef.current && fileRef.current.click()}
              style={{ background: '#0066FF', border: 'none', borderRadius: 6, padding: '4px 10px',
                color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.7rem' }}>
              📁 {t('trainingBoard.uploadImage')}
            </button>
            {bgImg && !PLAYGROUNDS.find(p => p.src === bgImg) && (
              <button onClick={() => { setBgImg(null); setBgName(null) }}
                style={{ background: '#1C2447', border: '1px solid #2a4470', borderRadius: 6,
                  padding: '4px 8px', color: '#aaa', cursor: 'pointer', fontSize: '.7rem' }}>
                ✕
              </button>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4, alignItems: 'flex-start' }}>
          {TOOL_GROUPS.map(g => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <div style={{ fontSize: '.44rem', color: '#4a7090', letterSpacing: 1, textTransform: 'uppercase' }}>{g.label}</div>
              <div style={{ display: 'flex', gap: 1, background: '#1C2447', borderRadius: 7, padding: '2px 3px', border: '1px solid #243060' }}>
                {g.tools.map(t => (
                  <button key={t.id} onClick={() => { setTool(t.id); setSelId(null) }}
                    title={t.label} style={btnS(tool === t.id)}>{t.icon}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: '.44rem', color: '#4a7090', letterSpacing: 1, textTransform: 'uppercase' }}>Color / Label</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', maxWidth: 190 }}>
              {COLORS.map(c => (
                <button key={c.v} onClick={() => setColor(c.v)} title={c.n}
                  style={{ width: 19, height: 19, borderRadius: '50%', padding: 0, cursor: 'pointer',
                    background: c.v, flexShrink: 0,
                    border: color === c.v ? '3px solid #fff' : '1.5px solid #2a4260',
                    boxShadow: c.v === '#ffffff' ? '0 0 0 1px #555' : undefined }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {[2, 3, 5, 8].map(w => (
                <button key={w} onClick={() => setSw(w)}
                  style={{ width: 25, height: 25, border: '1px solid #243060', borderRadius: 5,
                    cursor: 'pointer', background: sw === w ? '#0066FF' : '#1C2447',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 10, height: w, background: sw === w ? '#fff' : '#5a8aaa', borderRadius: 99 }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4, alignItems: 'center' }}>
          {(tool === 'player' || tool === 'figure') && (
            <button onClick={() => setLabelIdx(i => (i + 1) % LBLS.length)}
              style={{ background: ac, border: 'none', borderRadius: 6, padding: '4px 10px',
                color: '#fff', cursor: 'pointer', fontWeight: 900 }}>
              {LBLS[labelIdx]} ›
            </button>
          )}
          {selId && (
            <button onClick={deleteSelected}
              style={{ background: '#6a0a0a', border: '1px solid #c82020', borderRadius: 6,
                padding: '4px 9px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '.7rem' }}>
              🗑 {t('common.delete')}
            </button>
          )}
          {canRotate && (
            <>
              <button onClick={() => rotateSelected(-45)}
                style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6,
                  padding: '4px 9px', color: '#7ab4e0', cursor: 'pointer', fontSize: '.8rem', fontWeight: 700 }}>
                ↺ -45°
              </button>
              <button onClick={() => rotateSelected(45)}
                style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6,
                  padding: '4px 9px', color: '#7ab4e0', cursor: 'pointer', fontSize: '.8rem', fontWeight: 700 }}>
                ↻ +45°
              </button>
              <button onClick={() => rotateSelected(90)}
                style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6,
                  padding: '4px 9px', color: '#7ab4e0', cursor: 'pointer', fontSize: '.8rem', fontWeight: 700 }}>
                ↻ 90°
              </button>
            </>
          )}
          <button onClick={undo}
            style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: '#aaccee' }}>↩️</button>
          <button onClick={clearAll}
            style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: '#aaccee' }}>🗑️</button>
          <button onClick={exportPNG}
            style={{ background: '#1C2447', border: '1px solid #243060', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: '#aaccee' }}>💾 PNG</button>
        </div>

        {/* Hint */}
        <div style={{ textAlign: 'center', fontSize: '.6rem', marginBottom: 4, color: ac, fontWeight: 600, minHeight: 15 }}>
          {HINTS[tool] || ''}
          {selEl && <span style={{ color: '#f0a500', marginLeft: 8 }}>▶ {selEl.type} {selEl.label || ''} {selEl.rot ? selEl.rot + '°' : ''}</span>}
        </div>

        {/* Canvas */}
        <div style={{ maxWidth: 1080, margin: '0 auto', touchAction: 'none',
          boxShadow: '0 4px 32px rgba(0,0,0,0.6)', borderRadius: bgImg ? 8 : 0, overflow: 'hidden' }}>
          <svg ref={svgRef} viewBox={'0 0 ' + VW + ' ' + VH}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>

            <defs>
              {allColors.map((c: string) => (
                <marker key={c} id={'mk' + c.replace('#', '')}
                  markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
                  <polygon points="0,0 9,4.5 0,9" fill={c} />
                </marker>
              ))}
            </defs>

            {bgImg
              ? <image href={bgImg} x="0" y="0" width={VW} height={VH} preserveAspectRatio="xMidYMid meet" />
              : <rect x="0" y="0" width={VW} height={VH} fill="#f5f8fa" />
            }

            {els.map((el: any) => renderEl(el, el.id === selId))}

            {selEl && (
              <circle cx={selRingX} cy={selRingY} r="26" fill="none"
                stroke="#f0c030" strokeWidth="2.2" strokeDasharray="5 3"
                opacity="0.9" pointerEvents="none" />
            )}

            {livePenD && (
              <path d={livePenD} fill="none" stroke={color} strokeWidth={sw}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={livePenDash}
                pointerEvents="none" opacity="0.8" />
            )}

            {liveArr && liveLineIsBarrier && (
              <line x1={liveArr.x1} y1={liveArr.y1} x2={liveArr.x2} y2={liveArr.y2}
                stroke="#1a1a2e" strokeWidth="12" strokeLinecap="round"
                pointerEvents="none" opacity="0.7" />
            )}

            {liveArr && !liveLineIsBarrier && (
              <line x1={liveArr.x1} y1={liveArr.y1} x2={liveArr.x2} y2={liveArr.y2}
                stroke={color} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={liveLineDash}
                markerEnd={liveLineMarker}
                pointerEvents="none" opacity="0.8" />
            )}

          </svg>
        </div>

        <div style={{ textAlign: 'center', marginTop: 6, fontSize: '.52rem', color: '#1a3a54', letterSpacing: 1 }}>
          {t('trainingBoard.footerHint')}
        </div>
      </div>

      {/* ── Text Label Modal ── */}
      {labelModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-app-card border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-card">
            <h3 className="text-text-primary font-semibold text-lg mb-4">
              {t('trainingBoard.addLabel')}
            </h3>
            <input
              type="text"
              value={labelText}
              onChange={e => setLabelText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmLabel()
                if (e.key === 'Escape') setLabelModal(m => ({ ...m, open: false }))
              }}
              placeholder={t('trainingBoard.labelPlaceholder')}
              autoFocus
              className="w-full bg-app-secondary border border-white/10 rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-app-blue/50 transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setLabelModal(m => ({ ...m, open: false }))}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmLabel}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-primary text-white font-semibold shadow-button hover:shadow-button-hover transition-all"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
