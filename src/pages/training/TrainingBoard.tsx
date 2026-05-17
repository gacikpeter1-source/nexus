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
    { id: 'ladder',  icon: '🪜', label: 'Agility Ladder' },
    { id: 'hurdle',  icon: '⊓',  label: 'Jump Bar' },
    { id: 'label',   icon: 'T',  label: 'Text' },
  ]},
]

const LBLS = ['A', 'B', 'C', 'D', 'R', 'M', 'G', '1', '2', '3', '4', '5']

const PLAYGROUNDS = [
  { id: 'blank',           label: '— Blank canvas',            src: null },
  { id: 'hockey-realistic', label: '🏒 Ice Hockey Rink (3D)',   src: '/playgrounds/hockey-rink-realistic.png' },
  { id: 'hockey-rink',     label: '🏒 Ice Hockey Rink',        src: '/playgrounds/hockey-rink.png' },
  { id: 'hockey-ai',       label: '🏒 Ice Hockey Rink (AI)',   src: '/playgrounds/hockey-rink-ai.png' },
  { id: 'ice-rink',        label: '⛸️  Ice Rink',               src: '/playgrounds/ice-rink.jpg' },
  { id: 'football',        label: '⚽ Football Pitch',          src: '/playgrounds/football.png' },
  { id: 'football-ai',     label: '⚽ Football Pitch (AI)',     src: '/playgrounds/football-field-ai.png' },
  { id: 'tennis',          label: '🎾 Tennis Court',            src: '/playgrounds/tennis.png' },
  { id: 'tennis-ai',       label: '🎾 Tennis Court (AI)',       src: '/playgrounds/tennis-court-ai.png' },
  { id: 'volleyball',      label: '🏐 Volleyball Court (AI)',   src: '/playgrounds/volleyball-court-ai.png' },
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
  // Larger hit area for ladder and hurdle (and all complex objects)
  if (el.type === 'ladder' || el.type === 'hurdle' || el.type === 'goalS' || el.type === 'goalL' || el.type === 'cone') {
    return dist(el.x || 0, el.y || 0) < 50
  }
  return dist(el.x || 0, el.y || 0) < 25
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
  // All objects with x,y can rotate
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
function renderEl(el: any, isSelected: boolean, shouldAnimate: boolean = false, isAnimVisible: boolean = true, isHovered: boolean = false) {
  const glowFilter = isSelected 
    ? 'drop-shadow(0 0 8px rgba(255,210,40,1))' 
    : isHovered 
    ? 'drop-shadow(0 0 6px rgba(100,180,255,0.8))' 
    : undefined
  const style = glowFilter ? { filter: glowFilter } : undefined
  const rot = el.rot || 0
  const tf = (el.x !== undefined && rot !== 0)
    ? 'rotate(' + rot + ',' + el.x + ',' + el.y + ')'
    : undefined

  if (el.type === 'path') {
    const d = el.wavy ? wavyPath(el.pts) : smoothPath(el.pts)
    const dash = el.dashed ? '10 6' : undefined
    
    // Animation: hide if animating and not yet visible
    if (shouldAnimate && !isAnimVisible) return null
    
    // Animated drawing effect
    const animStyle = shouldAnimate && isAnimVisible ? {
      ...style,
      animation: 'drawLine 0.8s ease-out forwards',
    } : style
    
    return (
      <>
        {shouldAnimate && isAnimVisible && (
          <style>{`
            @keyframes drawLine {
              from { stroke-dasharray: 1000; stroke-dashoffset: 1000; }
              to { stroke-dasharray: 1000; stroke-dashoffset: 0; }
            }
          `}</style>
        )}
        <path key={el.id} d={d} fill="none" stroke={el.color} strokeWidth={el.sw}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={dash} style={animStyle} pointerEvents="none" />
      </>
    )
  }

  if (el.type === 'arrow') {
    const mid = 'mk' + el.color.replace('#', '')
    const dash = el.dashed ? '10 6' : undefined
    
    // Animation: hide if animating and not yet visible
    if (shouldAnimate && !isAnimVisible) return null
    
    const animStyle = shouldAnimate && isAnimVisible ? {
      ...style,
      animation: 'drawLine 0.8s ease-out forwards',
    } : style
    
    return (
      <>
        {shouldAnimate && isAnimVisible && (
          <style>{`
            @keyframes drawLine {
              from { stroke-dasharray: 1000; stroke-dashoffset: 1000; }
              to { stroke-dasharray: 1000; stroke-dashoffset: 0; }
            }
          `}</style>
        )}
        <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
          stroke={el.color} strokeWidth={el.sw} strokeLinecap="round"
          strokeDasharray={dash} markerEnd={'url(#' + mid + ')'}
          style={animStyle} pointerEvents="none" />
      </>
    )
  }

  if (el.type === 'shot') {
    const mid = 'mk' + el.color.replace('#', '')
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1
    const len = Math.hypot(dx, dy) || 1
    const ox = -dy / len * 3, oy = dx / len * 3
    
    // Animation: hide if animating and not yet visible
    if (shouldAnimate && !isAnimVisible) return null
    
    const animStyle = shouldAnimate && isAnimVisible ? {
      ...style,
      animation: 'drawLine 0.8s ease-out forwards',
    } : style
    
    return (
      <>
        {shouldAnimate && isAnimVisible && (
          <style>{`
            @keyframes drawLine {
              from { stroke-dasharray: 1000; stroke-dashoffset: 1000; }
              to { stroke-dasharray: 1000; stroke-dashoffset: 0; }
            }
          `}</style>
        )}
        <g key={el.id} style={animStyle} pointerEvents="none">
          <line x1={el.x1 + ox} y1={el.y1 + oy} x2={el.x2 + ox} y2={el.y2 + oy}
            stroke={el.color} strokeWidth={el.sw + 1.5} strokeLinecap="round"
            markerEnd={'url(#' + mid + ')'} />
          <line x1={el.x1 - ox} y1={el.y1 - oy} x2={el.x2 - ox} y2={el.y2 - oy}
            stroke={el.color} strokeWidth={el.sw + 1.5} strokeLinecap="round" />
        </g>
      </>
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

  if (el.type === 'ladder') {
    const ladderW = 60, rungs = 8, spacing = 16
    const hw = ladderW / 2
    return (
      <g key={el.id} style={style} pointerEvents="none"
        transform={'translate(' + el.x + ',' + el.y + ')' + (rot ? ' rotate(' + rot + ')' : '')}>
        {/* Side rails */}
        <line x1={-hw} y1={-spacing * (rungs - 1) / 2} x2={-hw} y2={spacing * (rungs - 1) / 2}
          stroke="#f0a500" strokeWidth="4" strokeLinecap="round" />
        <line x1={hw} y1={-spacing * (rungs - 1) / 2} x2={hw} y2={spacing * (rungs - 1) / 2}
          stroke="#f0a500" strokeWidth="4" strokeLinecap="round" />
        {/* Rungs */}
        {Array.from({ length: rungs }).map((_, i) => {
          const y = -spacing * (rungs - 1) / 2 + i * spacing
          return (
            <line key={i} x1={-hw + 4} y1={y} x2={hw - 4} y2={y}
              stroke="#ffcc00" strokeWidth="2.5" strokeLinecap="round" />
          )
        })}
      </g>
    )
  }

  if (el.type === 'hurdle') {
    const w = 35
    const h = 28
    const hw = w / 2
    const hurdleColor = '#ff3333'
    const hurdleColorDark = '#cc0000'
    
    return (
      <g key={el.id} style={style} pointerEvents="none"
        transform={'translate(' + el.x + ',' + el.y + ')' + (rot ? ' rotate(' + rot + ')' : '')}>
        {/* A-frame structure (hexagonal shape like in photo) */}
        {/* Left leg */}
        <line x1={-hw} y1={0} x2={-hw/3} y2={-h}
          stroke={hurdleColor} strokeWidth="3.5" strokeLinecap="round" />
        {/* Right leg */}
        <line x1={hw} y1={0} x2={hw/3} y2={-h}
          stroke={hurdleColor} strokeWidth="3.5" strokeLinecap="round" />
        {/* Top bar */}
        <line x1={-hw/3} y1={-h} x2={hw/3} y2={-h}
          stroke={hurdleColor} strokeWidth="3.5" strokeLinecap="round" />
        {/* Bottom support bars */}
        <line x1={-hw} y1={0} x2={-hw/2} y2={0}
          stroke={hurdleColorDark} strokeWidth="2.5" strokeLinecap="round" />
        <line x1={hw/2} y1={0} x2={hw} y2={0}
          stroke={hurdleColorDark} strokeWidth="2.5" strokeLinecap="round" />
        {/* Middle cross support */}
        <line x1={-hw/4} y1={-h/2} x2={hw/4} y2={-h/2}
          stroke={hurdleColor} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        {/* Diagonal supports for 3D effect */}
        <line x1={-hw/3} y1={-h} x2={-hw/2.5} y2={-h + 6}
          stroke={hurdleColorDark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1={hw/3} y1={-h} x2={hw/2.5} y2={-h + 6}
          stroke={hurdleColorDark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        {/* Base feet */}
        <ellipse cx={-hw} cy={0} rx="4" ry="2" fill={hurdleColorDark} opacity="0.6" />
        <ellipse cx={hw} cy={0} rx="4" ry="2" fill={hurdleColorDark} opacity="0.6" />
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
  const [zoom,     setZoom]     = useState(1)
  const [panX,     setPanX]     = useState(0)
  const [panY,     setPanY]     = useState(0)
  const [bgRotation, setBgRotation] = useState(0) // 0, 90, 180, 270
  
  // Animation state
  const [isPlaying, setIsPlaying] = useState(false)
  const [animStep, setAnimStep] = useState(0)
  const [animSpeed, setAnimSpeed] = useState(1000) // ms per step
  const [hoverElId, setHoverElId] = useState<number | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

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
  const panRef  = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  const pushHist = useCallback((snap: any[] | null) => setHist(h => [...h.slice(-30), snap as any[]]), [])

  // Animation effect
  React.useEffect(() => {
    if (!isPlaying) return
    
    const lineElements = els.filter(el => 
      el.type === 'path' || el.type === 'arrow' || el.type === 'shot'
    ).sort((a, b) => a.id - b.id)
    
    if (animStep >= lineElements.length) {
      setIsPlaying(false)
      setAnimStep(0)
      return
    }
    
    const timer = setTimeout(() => {
      setAnimStep(s => s + 1)
    }, animSpeed)
    
    return () => clearTimeout(timer)
  }, [isPlaying, animStep, els, animSpeed])

  const isPenTool  = (t: string) => t === 'pen' || t === 'dashed' || t === 'wavy' || t === 'wavyd'
  const isLineTool = (t: string) => t === 'arrow' || t === 'darrow' || t === 'shot' || t === 'barrier'

  const toSVG = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    const s = (e as any).changedTouches
      ? (e as any).changedTouches[0]
      : ((e as any).touches ? (e as any).touches[0] : e)
    
    // Get normalized position (0-1)
    const normX = (s.clientX - r.left) / r.width
    const normY = (s.clientY - r.top) / r.height
    
    // Swap dimensions when rotated 90° or 270°
    const isVertical = bgRotation === 90 || bgRotation === 270
    const vbW = isVertical ? VH : VW
    const vbH = isVertical ? VW : VH
    
    // Calculate current viewBox dimensions
    const viewBoxW = vbW / zoom
    const viewBoxH = vbH / zoom
    const viewBoxX = (vbW / 2) - (vbW / 2 / zoom) + panX
    const viewBoxY = (vbH / 2) - (vbH / 2 / zoom) + panY
    
    // Convert to SVG coordinates accounting for zoom and pan
    return {
      x: viewBoxX + normX * viewBoxW,
      y: viewBoxY + normY * viewBoxH,
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
    setOpenDropdown(null) // Close any open dropdown
    const p = toSVG(e)

    // Pan with Space key or when zoomed and clicking empty space
    const isPanning = e.shiftKey || (zoom > 1 && tool === 'select')
    
    if (tool === 'select') {
      const hit = els.slice().reverse().find(el => hitTest(el, p.x, p.y))
      if (hit && !isPanning) {
        setSelId(hit.id)
        dragRef.current = { id: hit.id, ox: p.x, oy: p.y, moved: false }
        active.current = true
      } else if (isPanning || !hit) {
        // Start panning
        setSelId(null)
        dragRef.current = null
        panRef.current = { 
          startX: e.clientX, 
          startY: e.clientY, 
          startPanX: panX, 
          startPanY: panY 
        }
        active.current = true
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
    if (tool === 'ladder')  { setEls(prev => [...prev, { id, type: 'ladder',  x: p.x, y: p.y, rot: 0 }]); return }
    if (tool === 'hurdle')  { setEls(prev => [...prev, { id, type: 'hurdle',  x: p.x, y: p.y, rot: 0 }]); return }
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toSVG(e)
    
    // Update hover state when not dragging
    if (!active.current && tool === 'select') {
      const hit = els.slice().reverse().find(el => hitTest(el, p.x, p.y))
      setHoverElId(hit ? hit.id : null)
    }
    
    if (!active.current) return
    e.preventDefault()
    
    // Handle panning
    if (panRef.current) {
      const dx = (e.clientX - panRef.current.startX) / zoom
      const dy = (e.clientY - panRef.current.startY) / zoom
      setPanX(panRef.current.startPanX - dx)
      setPanY(panRef.current.startPanY - dy)
      return
    }
    
    if (tool === 'select' && dragRef.current) {
      const dx = p.x - dragRef.current.ox, dy = p.y - dragRef.current.oy
      // Remove threshold for smoother dragging
      if (dx !== 0 || dy !== 0) {
        dragRef.current.moved = true
        dragRef.current.ox = p.x
        dragRef.current.oy = p.y
        // Capture ID before state update to avoid race condition
        const dragId = dragRef.current.id
        setEls(prev => prev.map(el => el.id === dragId ? moveEl(el, dx, dy) : el))
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
    
    // End panning
    if (panRef.current) {
      panRef.current = null
      return
    }
    
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

  // Animation controls
  const playAnimation = () => {
    setAnimStep(0)
    setIsPlaying(true)
  }
  const pauseAnimation = () => setIsPlaying(false)
  const resetAnimation = () => {
    setIsPlaying(false)
    setAnimStep(0)
  }
  
  // Get line elements in drawing order
  const lineElements = els.filter(el => 
    el.type === 'path' || el.type === 'arrow' || el.type === 'shot'
  ).sort((a, b) => a.id - b.id)

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
  const canRotate = selEl && selEl.type !== 'path' && selEl.type !== 'arrow' && selEl.type !== 'shot' && selEl.type !== 'barrier' && selEl.type !== 'puck'

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
    select:  selId ? 'Drag · rotate · delete' : zoom > 1 ? 'Drag to pan · Click object to select' : 'Click object to select, then drag',
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
    ladder:  'Click → agility ladder (select + rotate)',
    hurdle:  'Click → jump bar (select + rotate)',
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

  const toggleDropdown = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name)
  }

  const selectTool = (toolId: string) => {
    setTool(toolId)
    setSelId(null)
    setOpenDropdown(null)
  }

  const selectColor = (colorVal: string) => {
    setColor(colorVal)
    setOpenDropdown(null)
  }

  // Dropdown menu style
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    background: '#1C2447',
    border: '1px solid #243060',
    borderRadius: 8,
    padding: 8,
    minWidth: 200,
    zIndex: 1001,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  }

  const menuItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    background: isActive ? '#0066FF' : 'transparent',
    color: isActive ? '#fff' : '#ddeeff',
    border: 'none',
    width: '100%',
    fontSize: '.85rem',
    fontWeight: 600,
    transition: 'all .1s',
  })

  return (
    <div className="min-h-screen bg-app-primary" style={{ fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}>

      {/* ── Compact Header Bar with Dropdowns ── */}
      <div className="px-6 py-3 border-b border-white/5" style={{ 
        background: '#0f1629', 
        position: 'sticky', 
        top: 0, 
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          
          {/* Left: Title */}
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('trainingBoard.title')}</h1>
          </div>

          {/* Center: Dropdown Menus */}
          <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap' }}>
            
            {/* Select/Erase Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('select')}
                style={{
                  background: openDropdown === 'select' ? '#1C2447' : 'transparent',
                  border: '1px solid #243060',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ddeeff',
                  cursor: 'pointer',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                {tool === 'select' ? '↖ Select' : tool === 'eraser' ? '⌫ Erase' : 'Select/Erase'} ▾
              </button>
              {openDropdown === 'select' && (
                <div style={dropdownStyle}>
                  <button onClick={() => selectTool('select')} style={menuItemStyle(tool === 'select')}>
                    <span style={{ fontSize: '1.2rem' }}>↖</span> Select/Move
                  </button>
                  <button onClick={() => selectTool('eraser')} style={menuItemStyle(tool === 'eraser')}>
                    <span style={{ fontSize: '1.2rem' }}>⌫</span> Erase
                  </button>
                </div>
              )}
            </div>

            {/* Lines Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('lines')}
                style={{
                  background: openDropdown === 'lines' ? '#1C2447' : 'transparent',
                  border: '1px solid #243060',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ddeeff',
                  cursor: 'pointer',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                Lines ▾
              </button>
              {openDropdown === 'lines' && (
                <div style={dropdownStyle}>
                  <button onClick={() => selectTool('pen')} style={menuItemStyle(tool === 'pen')}>
                    <span style={{ fontSize: '1.2rem' }}>—</span> Solid Line
                  </button>
                  <button onClick={() => selectTool('dashed')} style={menuItemStyle(tool === 'dashed')}>
                    <span style={{ fontSize: '1.2rem' }}>╌</span> Dashed Line
                  </button>
                  <button onClick={() => selectTool('wavy')} style={menuItemStyle(tool === 'wavy')}>
                    <span style={{ fontSize: '1.2rem' }}>〜</span> Wavy Line
                  </button>
                  <button onClick={() => selectTool('wavyd')} style={menuItemStyle(tool === 'wavyd')}>
                    <span style={{ fontSize: '1.2rem' }}>∿</span> Wavy Dashed
                  </button>
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <button onClick={() => selectTool('arrow')} style={menuItemStyle(tool === 'arrow')}>
                    <span style={{ fontSize: '1.2rem' }}>➤</span> Arrow
                  </button>
                  <button onClick={() => selectTool('darrow')} style={menuItemStyle(tool === 'darrow')}>
                    <span style={{ fontSize: '1.2rem' }}>⇢</span> Dashed Arrow
                  </button>
                  <button onClick={() => selectTool('shot')} style={menuItemStyle(tool === 'shot')}>
                    <span style={{ fontSize: '1.2rem' }}>▶▶</span> Shot
                  </button>
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <button onClick={() => selectTool('barrier')} style={menuItemStyle(tool === 'barrier')}>
                    <span style={{ fontSize: '1.2rem' }}>▬</span> Barrier
                  </button>
                </div>
              )}
            </div>

            {/* Objects Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('objects')}
                style={{
                  background: openDropdown === 'objects' ? '#1C2447' : 'transparent',
                  border: '1px solid #243060',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ddeeff',
                  cursor: 'pointer',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                Objects ▾
              </button>
              {openDropdown === 'objects' && (
                <div style={dropdownStyle}>
                  <button onClick={() => selectTool('player')} style={menuItemStyle(tool === 'player')}>
                    <span style={{ fontSize: '1.2rem' }}>●</span> Player
                  </button>
                  <button onClick={() => selectTool('figure')} style={menuItemStyle(tool === 'figure')}>
                    <span style={{ fontSize: '1.2rem' }}>🏒</span> Skater
                  </button>
                  <button onClick={() => selectTool('puck')} style={menuItemStyle(tool === 'puck')}>
                    <span style={{ fontSize: '1.2rem' }}>⬤</span> Puck
                  </button>
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <button onClick={() => selectTool('cone')} style={menuItemStyle(tool === 'cone')}>
                    <span style={{ fontSize: '1.2rem' }}>🔶</span> Cone
                  </button>
                  <button onClick={() => selectTool('goalS')} style={menuItemStyle(tool === 'goalS')}>
                    <span style={{ fontSize: '1.2rem' }}>⬜</span> Small Goal
                  </button>
                  <button onClick={() => selectTool('goalL')} style={menuItemStyle(tool === 'goalL')}>
                    <span style={{ fontSize: '1.2rem' }}>⬛</span> Large Goal
                  </button>
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <button onClick={() => selectTool('ladder')} style={menuItemStyle(tool === 'ladder')}>
                    <span style={{ fontSize: '1.2rem' }}>🪜</span> Agility Ladder
                  </button>
                  <button onClick={() => selectTool('hurdle')} style={menuItemStyle(tool === 'hurdle')}>
                    <span style={{ fontSize: '1.2rem' }}>⊓</span> Jump Bar
                  </button>
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <button onClick={() => selectTool('label')} style={menuItemStyle(tool === 'label')}>
                    <span style={{ fontSize: '1.2rem' }}>T</span> Text Label
                  </button>
                </div>
              )}
            </div>

            {/* Colors Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('colors')}
                style={{
                  background: openDropdown === 'colors' ? '#1C2447' : 'transparent',
                  border: '1px solid #243060',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ddeeff',
                  cursor: 'pointer',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, border: '1px solid #fff' }} />
                Color ▾
              </button>
              {openDropdown === 'colors' && (
                <div style={{ ...dropdownStyle, padding: 12 }}>
                  <div style={{ marginBottom: 8, fontSize: '.75rem', color: '#7ab4e0', fontWeight: 600 }}>Color</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                    {COLORS.map(c => (
                      <button key={c.v} onClick={() => selectColor(c.v)} title={c.n}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          padding: 0,
                          cursor: 'pointer',
                          background: c.v,
                          border: color === c.v ? '3px solid #fff' : '2px solid #2a4260',
                          boxShadow: c.v === '#ffffff' ? '0 0 0 1px #555' : undefined,
                        }} />
                    ))}
                  </div>
                  <div style={{ height: 1, background: '#243060', margin: '8px 0' }} />
                  <div style={{ marginBottom: 8, fontSize: '.75rem', color: '#7ab4e0', fontWeight: 600 }}>Stroke Width</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[2, 3, 5, 8].map(w => (
                      <button key={w} onClick={() => { setSw(w); setOpenDropdown(null) }}
                        style={{
                          width: 40,
                          height: 32,
                          border: '1px solid #243060',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: sw === w ? '#0066FF' : '#141B3D',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <div style={{ width: 16, height: w, background: sw === w ? '#fff' : '#5a8aaa', borderRadius: 99 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('actions')}
                style={{
                  background: openDropdown === 'actions' ? '#1C2447' : 'transparent',
                  border: '1px solid #243060',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#ddeeff',
                  cursor: 'pointer',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                Actions ▾
              </button>
              {openDropdown === 'actions' && (
                <div style={{ ...dropdownStyle, minWidth: 240 }}>
                  {/* Animation section */}
                  {lineElements.length > 0 && (
                    <>
                      <div style={{ padding: '4px 8px', fontSize: '.7rem', color: '#7ab4e0', fontWeight: 600, textTransform: 'uppercase' }}>
                        🎬 Animation
                      </div>
                      <button onClick={() => { playAnimation(); setOpenDropdown(null) }}
                        style={{
                          ...menuItemStyle(false),
                          background: '#2ecc71',
                          color: '#fff',
                        }}>
                        ▶ Play Animation
                      </button>
                      <button onClick={() => { pauseAnimation(); setOpenDropdown(null) }}
                        style={{
                          ...menuItemStyle(false),
                          background: '#e67e22',
                          color: '#fff',
                        }}>
                        ⏸ Pause Animation
                      </button>
                      <button onClick={() => { resetAnimation(); setOpenDropdown(null) }}
                        style={menuItemStyle(false)}>
                        ⏹ Reset Animation
                      </button>
                      <div style={{ padding: '8px 12px', fontSize: '.75rem' }}>
                        <div style={{ color: '#7ab4e0', marginBottom: 6, fontWeight: 600 }}>Speed:</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setAnimSpeed(1500)}
                            style={{
                              flex: 1,
                              padding: '6px',
                              background: animSpeed === 1500 ? '#0066FF' : '#141B3D',
                              border: '1px solid #243060',
                              borderRadius: 4,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '.7rem',
                              fontWeight: 700,
                            }}>
                            Slow
                          </button>
                          <button onClick={() => setAnimSpeed(1000)}
                            style={{
                              flex: 1,
                              padding: '6px',
                              background: animSpeed === 1000 ? '#0066FF' : '#141B3D',
                              border: '1px solid #243060',
                              borderRadius: 4,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '.7rem',
                              fontWeight: 700,
                            }}>
                            Normal
                          </button>
                          <button onClick={() => setAnimSpeed(500)}
                            style={{
                              flex: 1,
                              padding: '6px',
                              background: animSpeed === 500 ? '#0066FF' : '#141B3D',
                              border: '1px solid #243060',
                              borderRadius: 4,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '.7rem',
                              fontWeight: 700,
                            }}>
                            Fast
                          </button>
                        </div>
                      </div>
                      <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                    </>
                  )}
                  
                  {/* Save/Export */}
                  <div style={{ padding: '4px 8px', fontSize: '.7rem', color: '#7ab4e0', fontWeight: 600, textTransform: 'uppercase' }}>
                    💾 Save
                  </div>
                  <button onClick={() => { exportPNG(); setOpenDropdown(null) }}
                    style={menuItemStyle(false)}>
                    💾 Save as PNG
                  </button>
                  
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  
                  {/* Edit Actions */}
                  <div style={{ padding: '4px 8px', fontSize: '.7rem', color: '#7ab4e0', fontWeight: 600, textTransform: 'uppercase' }}>
                    ✏️ Edit
                  </div>
                  <button onClick={() => { undo(); setOpenDropdown(null) }}
                    style={menuItemStyle(false)}>
                    ↩️ Undo
                  </button>
                  {selId && (
                    <button onClick={() => { deleteSelected(); setOpenDropdown(null) }}
                      style={{
                        ...menuItemStyle(false),
                        background: '#6a0a0a',
                        color: '#fff',
                      }}>
                      🗑 Delete Selected
                    </button>
                  )}
                  <button onClick={() => { clearAll(); setOpenDropdown(null) }}
                    style={{
                      ...menuItemStyle(false),
                      background: '#6a0a0a',
                      color: '#fff',
                    }}>
                    🗑️ Clear All
                  </button>
                  
                  {/* Rotate options for selected element */}
                  {canRotate && (
                    <>
                      <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                      <div style={{ padding: '4px 8px', fontSize: '.7rem', color: '#7ab4e0', fontWeight: 600, textTransform: 'uppercase' }}>
                        ↻ Rotate
                      </div>
                      <div style={{ display: 'flex', gap: 4, padding: '0 8px 8px' }}>
                        <button onClick={() => rotateSelected(-45)}
                          style={{
                            flex: 1,
                            padding: '6px',
                            background: '#141B3D',
                            border: '1px solid #243060',
                            borderRadius: 4,
                            color: '#7ab4e0',
                            cursor: 'pointer',
                            fontSize: '.75rem',
                            fontWeight: 700,
                          }}>
                          ↺ -45°
                        </button>
                        <button onClick={() => rotateSelected(45)}
                          style={{
                            flex: 1,
                            padding: '6px',
                            background: '#141B3D',
                            border: '1px solid #243060',
                            borderRadius: 4,
                            color: '#7ab4e0',
                            cursor: 'pointer',
                            fontSize: '.75rem',
                            fontWeight: 700,
                          }}>
                          ↻ +45°
                        </button>
                        <button onClick={() => rotateSelected(90)}
                          style={{
                            flex: 1,
                            padding: '6px',
                            background: '#141B3D',
                            border: '1px solid #243060',
                            borderRadius: 4,
                            color: '#7ab4e0',
                            cursor: 'pointer',
                            fontSize: '.75rem',
                            fontWeight: 700,
                          }}>
                          ↻ 90°
                        </button>
                      </div>
                    </>
                  )}
                  
                  {/* Background/Playground */}
                  <div style={{ height: 1, background: '#243060', margin: '4px 0' }} />
                  <div style={{ padding: '4px 8px', fontSize: '.7rem', color: '#7ab4e0', fontWeight: 600, textTransform: 'uppercase' }}>
                    🏟️ Background
                  </div>
                  <div style={{ padding: '0 8px 8px' }}>
                    <select
                      onChange={e => {
                        const pg = PLAYGROUNDS.find(p => p.id === e.target.value)
                        if (!pg) return
                        if (pg.src === null) { setBgImg(null); setBgName(null) }
                        else { setBgImg(pg.src); setBgName(pg.label) }
                      }}
                      value={PLAYGROUNDS.find(p => p.src === bgImg)?.id ?? (bgImg ? '__custom__' : 'blank')}
                      style={{
                        width: '100%',
                        background: '#141B3D',
                        border: '1px solid #243060',
                        borderRadius: 6,
                        color: '#ddeeff',
                        fontSize: '.8rem',
                        padding: '6px 8px',
                        cursor: 'pointer',
                        outline: 'none',
                      }}>
                      {PLAYGROUNDS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                      {bgImg && !PLAYGROUNDS.find(p => p.src === bgImg) && (
                        <option value="__custom__">📁 {bgName}</option>
                      )}
                    </select>
                    <button onClick={() => { fileRef.current && fileRef.current.click(); setOpenDropdown(null) }}
                      style={{
                        width: '100%',
                        marginTop: 6,
                        background: '#0066FF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '.8rem',
                      }}>
                      📁 Upload Custom
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Player/Figure Label Cycler (when applicable) */}
          {(tool === 'player' || tool === 'figure') && (
            <button onClick={() => setLabelIdx(i => (i + 1) % LBLS.length)}
              style={{
                background: '#0066FF',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '.9rem',
              }}>
              Label: {LBLS[labelIdx]} ›
            </button>
          )}
        </div>
      </div>

      {/* ── Drawing board ── */}
      <div style={{ padding: '12px 8px 24px', color: '#ddeeff' }}>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />

        {/* Zoom controls - Always visible */}
        <div style={{ maxWidth: 1080, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: 2, background: '#1C2447', borderRadius: 7, padding: '2px 3px', border: '1px solid #243060' }}>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              title="Zoom Out"
              style={{
                background: '#0066FF',
                border: 'none',
                borderRadius: 5,
                padding: '5px 10px',
                cursor: 'pointer',
                color: '#fff',
                fontWeight: 900,
                fontSize: '.9rem',
              }}>
              −
            </button>
            <span style={{ padding: '5px 8px', color: '#7ab4e0', fontSize: '.75rem', fontWeight: 700, minWidth: 45, textAlign: 'center' }}>
              {(zoom * 100).toFixed(0)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              title="Zoom In"
              style={{
                background: '#0066FF',
                border: 'none',
                borderRadius: 5,
                padding: '5px 10px',
                cursor: 'pointer',
                color: '#fff',
                fontWeight: 900,
                fontSize: '.9rem',
              }}>
              +
            </button>
            <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
              title="Reset Zoom & Pan"
              style={{
                background: '#1C2447',
                border: '1px solid #243060',
                borderRadius: 5,
                padding: '5px 8px',
                cursor: 'pointer',
                color: '#7ab4e0',
                fontSize: '.7rem',
                fontWeight: 700,
              }}>
              Reset
            </button>
          </div>
          
          {/* Playground rotation */}
          <div style={{ display: 'flex', gap: 2, background: '#1C2447', borderRadius: 7, padding: '2px 3px', border: '1px solid #243060' }}>
            <button onClick={() => {
              setBgRotation(r => (r + 90) % 360)
              // Reset pan when rotating to avoid disorientation
              setPanX(0)
              setPanY(0)
            }}
              title="Rotate Playground 90°"
              style={{
                background: '#0066FF',
                border: 'none',
                borderRadius: 5,
                padding: '5px 10px',
                cursor: 'pointer',
                color: '#fff',
                fontWeight: 900,
                fontSize: '.85rem',
              }}>
              ↻
            </button>
            <span style={{ padding: '5px 8px', color: '#7ab4e0', fontSize: '.7rem', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>
              {bgRotation}°
            </span>
          </div>
        </div>

        {/* Hint */}
        <div style={{ textAlign: 'center', fontSize: '.7rem', marginBottom: 8, color: ac, fontWeight: 600, minHeight: 20 }}>
          {HINTS[tool] || ''}
          {selEl && <span style={{ color: '#f0a500', marginLeft: 8 }}>▶ {selEl.type} {selEl.label || ''} {selEl.rot ? selEl.rot + '°' : ''}</span>}
        </div>

        {/* Canvas */}
        <div style={{ 
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 20px'
        }}>
          <svg ref={svgRef}
            viewBox={(() => {
              // Swap dimensions when rotated 90° or 270°
              const isVertical = bgRotation === 90 || bgRotation === 270
              const vbW = isVertical ? VH : VW
              const vbH = isVertical ? VW : VH
              return ((vbW / 2) - (vbW / 2 / zoom) + panX) + ' ' + 
                     ((vbH / 2) - (vbH / 2 / zoom) + panY) + ' ' + 
                     (vbW / zoom) + ' ' + (vbH / zoom)
            })()}
            style={{ 
              maxWidth: bgRotation === 90 || bgRotation === 270 ? '600px' : '1080px',
              width: '100%',
              height: 'auto', 
              display: 'block', 
              cursor: tool === 'select' ? 'default' : 'crosshair',
              touchAction: 'none',
              boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
              borderRadius: bgImg ? 8 : 0
            }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
            onPointerLeave={() => setHoverElId(null)}>

            <defs>
              {allColors.map((c: string) => (
                <marker key={c} id={'mk' + c.replace('#', '')}
                  markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
                  <polygon points="0,0 9,4.5 0,9" fill={c} />
                </marker>
              ))}
            </defs>

            {bgImg ? (
              <image 
                href={bgImg} 
                x="0" 
                y="0" 
                width={VW} 
                height={VH} 
                preserveAspectRatio="xMidYMid meet"
                transform={bgRotation ? `rotate(${bgRotation} ${VW/2} ${VH/2})` : undefined}
              />
            ) : (
              <rect x="0" y="0" width={VW} height={VH} fill="#f5f8fa" />
            )}

            {els.map((el: any) => {
              const isLine = el.type === 'path' || el.type === 'arrow' || el.type === 'shot'
              const lineIdx = isLine ? lineElements.findIndex(le => le.id === el.id) : -1
              const shouldAnimate = isPlaying || animStep > 0
              const isAnimVisible = !isLine || lineIdx < animStep
              const isHovered = el.id === hoverElId && tool === 'select'
              
              return renderEl(el, el.id === selId, shouldAnimate && isLine, isAnimVisible, isHovered)
            })}

            {selEl && (
              <>
                <circle cx={selRingX} cy={selRingY} r="26" fill="none"
                  stroke="#f0c030" strokeWidth="2.2" strokeDasharray="5 3"
                  opacity="0.9" pointerEvents="none" />
                
                {/* Rotation handle - only for rotatable items */}
                {canRotate && (
                  <g
                    onClick={(e) => {
                      e.stopPropagation()
                      rotateSelected(45)
                    }}
                    style={{ cursor: 'pointer' }}
                    pointerEvents="all">
                    <circle
                      cx={selRingX}
                      cy={selRingY - 40}
                      r="12"
                      fill="#0066FF"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <text
                      x={selRingX}
                      y={selRingY - 40}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="14"
                      fontWeight="900"
                      fill="#fff"
                      pointerEvents="none">
                      ↻
                    </text>
                  </g>
                )}
              </>
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
