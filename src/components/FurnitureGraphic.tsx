import React from 'react';
import { FurnitureType } from '../types';

interface FurnitureGraphicProps {
  type: FurnitureType;
  name: string;
  color?: string;
  width: number;
  height: number;
  rotation?: number;
  itemCount?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  showLabels?: boolean;
}

export const FurnitureGraphic: React.FC<FurnitureGraphicProps> = ({
  type,
  name,
  color,
  width,
  height,
  itemCount = 0,
  isSelected = false,
  isHighlighted = false,
  showLabels = true,
}) => {
  // Determine dominant wood/material tones based on provided color or type defaults
  const baseColor = color || getDefaultColor(type);
  const isDark = isDarkColor(baseColor);
  const textColor = isDark ? '#ffffff' : '#1e293b';

  return (
    <div
      className={`relative w-full h-full rounded-lg overflow-hidden transition-all duration-150 select-none ${
        isSelected
          ? 'ring-3 ring-blue-500 ring-offset-2 ring-offset-white shadow-xl scale-[1.01]'
          : 'shadow-md hover:shadow-lg'
      } ${isHighlighted ? 'ring-4 ring-amber-400 animate-pulse' : ''}`}
      style={{
        backgroundColor: baseColor,
      }}
    >
      {/* Top-Down Architectural Vector Graphic */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Subtle woodgrain / surface bevel gradient */}
          <linearGradient id={`grad-${type}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
          </linearGradient>

          {/* Chamfered inner border shadow */}
          <linearGradient id="bevel-edge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* Ambient bevel surface */}
        <rect
          x="1"
          y="1"
          width={width - 2}
          height={height - 2}
          rx="6"
          fill={`url(#grad-${type})`}
        />

        {/* Type-Specific Architectural Graphic Elements */}
        {renderArchitecturalDetails(type, width, height, isDark)}

        {/* Outer perimeter architectural stroke */}
        <rect
          x="0.75"
          y="0.75"
          width={width - 1.5}
          height={height - 1.5}
          rx="6"
          fill="none"
          stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
          strokeWidth="1.5"
        />
      </svg>

      {/* Item Count Pip / Badge (Top Right) */}
      {itemCount > 0 && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-bold shadow-md border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>{itemCount}</span>
        </div>
      )}

      {/* Elegant, Unobtrusive Furniture Title */}
      {showLabels && (
        <div className="absolute inset-x-1.5 bottom-1.5 z-10 pointer-events-none flex justify-center">
          <div
            className="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold tracking-tight truncate max-w-full shadow-xs"
            style={{
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.85)',
              color: textColor,
              backdropFilter: 'blur(4px)',
            }}
          >
            {name}
          </div>
        </div>
      )}
    </div>
  );
};

// Top-down visual architectural renderer
function renderArchitecturalDetails(
  type: FurnitureType,
  w: number,
  h: number,
  isDark: boolean
): React.ReactNode {
  const lineCol = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
  const fillSubtle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const accentCol = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';

  switch (type) {
    case 'bookshelf': {
      // Bookshelf: Grid compartments / shelf dividers with book spine lines
      const numBays = Math.max(2, Math.round(w / 40));
      const bayWidth = w / numBays;
      return (
        <g>
          {/* Back panel & shelf dividers */}
          {Array.from({ length: numBays - 1 }).map((_, i) => (
            <line
              key={i}
              x1={(i + 1) * bayWidth}
              y1={4}
              x2={(i + 1) * bayWidth}
              y2={h - 4}
              stroke={lineCol}
              strokeWidth="2"
            />
          ))}
          {/* Simulated book spines in compartments */}
          {Array.from({ length: numBays }).map((_, i) => (
            <g key={i} opacity={0.6}>
              <rect
                x={i * bayWidth + 5}
                y={6}
                width={Math.max(4, bayWidth - 10)}
                height={Math.max(4, h - 12)}
                rx="2"
                fill={fillSubtle}
              />
              <line
                x1={i * bayWidth + 10}
                y1={8}
                x2={i * bayWidth + 10}
                y2={h - 8}
                stroke={accentCol}
                strokeWidth="1.5"
                strokeDasharray="2 3"
              />
            </g>
          ))}
        </g>
      );
    }

    case 'desk': {
      // Desk: Desktop mat, monitor / laptop silhouette, and tucked-in office chair contour
      const chairW = Math.min(36, w * 0.45);
      const chairH = Math.min(18, h * 0.35);
      return (
        <g>
          {/* Desk Mat */}
          <rect
            x={w * 0.25}
            y={h * 0.2}
            width={w * 0.5}
            height={h * 0.5}
            rx="4"
            fill={fillSubtle}
            stroke={lineCol}
            strokeWidth="1"
          />
          {/* Monitor / Laptop Screen Silhouette */}
          <line
            x1={w * 0.32}
            y1={h * 0.32}
            x2={w * 0.68}
            y2={h * 0.32}
            stroke={accentCol}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Keyboard outline */}
          <rect
            x={w * 0.38}
            y={h * 0.44}
            width={w * 0.24}
            height={h * 0.18}
            rx="1.5"
            fill={accentCol}
            opacity={0.4}
          />
          {/* Office Chair (backrest arc tucked in) */}
          <path
            d={`M ${w / 2 - chairW / 2} ${h - 4} Q ${w / 2} ${h - chairH - 4} ${w / 2 + chairW / 2} ${h - 4}`}
            fill="none"
            stroke={accentCol}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      );
    }

    case 'cabinet': {
      // Cabinet / Credenza: Front bevel, drawer division lines, TV/soundbar silhouette
      const numDrawers = Math.max(2, Math.round(w / 60));
      const colWidth = w / numDrawers;
      return (
        <g>
          {/* Front edge shadow */}
          <line x1={4} y1={h - 6} x2={w - 4} y2={h - 6} stroke={lineCol} strokeWidth="1.5" />
          {/* Drawer vertical dividing seams */}
          {Array.from({ length: numDrawers - 1 }).map((_, i) => (
            <line
              key={i}
              x1={(i + 1) * colWidth}
              y1={4}
              x2={(i + 1) * colWidth}
              y2={h - 6}
              stroke={lineCol}
              strokeWidth="1.5"
            />
          ))}
          {/* Pull handles */}
          {Array.from({ length: numDrawers }).map((_, i) => (
            <line
              key={i}
              x1={i * colWidth + colWidth / 2 - 10}
              y1={h - 10}
              x2={i * colWidth + colWidth / 2 + 10}
              y2={h - 10}
              stroke={accentCol}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))}
          {/* Top Surface TV/Display screen contour if wide */}
          {w >= 120 && (
            <line
              x1={w * 0.15}
              y1={8}
              x2={w * 0.85}
              y2={8}
              stroke={accentCol}
              strokeWidth="3"
              strokeLinecap="round"
              opacity={0.7}
            />
          )}
        </g>
      );
    }

    case 'wardrobe':
    case 'closet': {
      // Wardrobe / Closet: Dual hinged/sliding doors, center door seam, hanger rail
      return (
        <g>
          {/* Center door seam */}
          <line x1={w / 2} y1={4} x2={w / 2} y2={h - 4} stroke={lineCol} strokeWidth="2" />
          {/* Door pull handles */}
          <line
            x1={w / 2 - 4}
            y1={h / 2 - 10}
            x2={w / 2 - 4}
            y2={h / 2 + 10}
            stroke={accentCol}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1={w / 2 + 4}
            y1={h / 2 - 10}
            x2={w / 2 + 4}
            y2={h / 2 + 10}
            stroke={accentCol}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Interior clothes rail suggestion */}
          <line
            x1={10}
            y1={h * 0.3}
            x2={w - 10}
            y2={h * 0.3}
            stroke={lineCol}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.5}
          />
        </g>
      );
    }

    case 'bed': {
      // Bed: Mattress border, pillows at the head, folded duvet line
      const pillowW = Math.min(32, w * 0.38);
      const pillowH = Math.min(20, h * 0.22);
      return (
        <g>
          {/* Left Pillow */}
          <rect
            x={w * 0.12}
            y={8}
            width={pillowW}
            height={pillowH}
            rx="4"
            fill={fillSubtle}
            stroke={lineCol}
            strokeWidth="1.5"
          />
          {/* Right Pillow */}
          <rect
            x={w - w * 0.12 - pillowW}
            y={8}
            width={pillowW}
            height={pillowH}
            rx="4"
            fill={fillSubtle}
            stroke={lineCol}
            strokeWidth="1.5"
          />
          {/* Duvet fold line */}
          <line
            x1={8}
            y1={h * 0.42}
            x2={w - 8}
            y2={h * 0.42}
            stroke={lineCol}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    }

    case 'sofa': {
      // Sofa / Couch: Deep backrest, armrests, seat cushion dividing lines
      const armW = Math.min(18, w * 0.16);
      return (
        <g>
          {/* Backrest */}
          <rect x={armW} y={4} width={w - armW * 2} height={h * 0.32} rx="4" fill={fillSubtle} />
          {/* Left Armrest */}
          <rect x={4} y={4} width={armW} height={h - 8} rx="4" fill={fillSubtle} stroke={lineCol} strokeWidth="1.5" />
          {/* Right Armrest */}
          <rect x={w - armW - 4} y={4} width={armW} height={h - 8} rx="4" fill={fillSubtle} stroke={lineCol} strokeWidth="1.5" />
          {/* Center cushion divider */}
          <line x1={w / 2} y1={h * 0.32 + 4} x2={w / 2} y2={h - 4} stroke={lineCol} strokeWidth="1.5" />
        </g>
      );
    }

    case 'storage_rack': {
      // Storage Rack: Corner metal posts, industrial crossbars, wire shelves
      return (
        <g>
          {/* 4 Corner Upright Posts */}
          <rect x={3} y={3} width={8} height={8} fill={accentCol} rx="1" />
          <rect x={w - 11} y={3} width={8} height={8} fill={accentCol} rx="1" />
          <rect x={3} y={h - 11} width={8} height={8} fill={accentCol} rx="1" />
          <rect x={w - 11} y={h - 11} width={8} height={8} fill={accentCol} rx="1" />
          {/* Wire shelf horizontal slats */}
          {Array.from({ length: 4 }).map((_, i) => (
            <line
              key={i}
              x1={14}
              y1={10 + (i * (h - 20)) / 3}
              x2={w - 14}
              y2={10 + (i * (h - 20)) / 3}
              stroke={lineCol}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          ))}
        </g>
      );
    }

    case 'workbench': {
      // Workbench: Heavy wood block surface, ruler grid lines, vice outline
      return (
        <g>
          {/* Edge ruler markings */}
          {Array.from({ length: 8 }).map((_, i) => (
            <line
              key={i}
              x1={12 + (i * (w - 24)) / 7}
              y1={4}
              x2={12 + (i * (w - 24)) / 7}
              y2={9}
              stroke={accentCol}
              strokeWidth="1"
            />
          ))}
          {/* Corner Vice Silhouette */}
          <rect x={w - 14} y={h - 12} width={10} height={8} rx="1" fill={accentCol} opacity={0.8} />
          {/* Groove line */}
          <line x1={10} y1={h - 12} x2={w - 20} y2={h - 12} stroke={lineCol} strokeWidth="1.5" />
        </g>
      );
    }

    case 'box_stack': {
      // Box Stack: Top flaps and center tape line
      return (
        <g>
          {/* Center packing tape seam */}
          <line x1={w / 2} y1={4} x2={w / 2} y2={h - 4} stroke={accentCol} strokeWidth="6" opacity={0.5} />
          {/* Flap fold creases */}
          <line x1={4} y1={h * 0.3} x2={w - 4} y2={h * 0.3} stroke={lineCol} strokeWidth="1" />
          <line x1={4} y1={h * 0.7} x2={w - 4} y2={h * 0.7} stroke={lineCol} strokeWidth="1" />
        </g>
      );
    }

    case 'dresser': {
      // Dresser: Multiple horizontal drawer lines with centered pull handles
      const numDrawers = 3;
      const drawerHeight = h / numDrawers;
      return (
        <g>
          {Array.from({ length: numDrawers - 1 }).map((_, i) => (
            <line
              key={i}
              x1={6}
              y1={(i + 1) * drawerHeight}
              x2={w - 6}
              y2={(i + 1) * drawerHeight}
              stroke={lineCol}
              strokeWidth="1.5"
            />
          ))}
          {Array.from({ length: numDrawers }).map((_, i) => (
            <line
              key={i}
              x1={w / 2 - 10}
              y1={i * drawerHeight + drawerHeight / 2}
              x2={w / 2 + 10}
              y2={i * drawerHeight + drawerHeight / 2}
              stroke={accentCol}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))}
        </g>
      );
    }

    case 'table': {
      // Table: Clean surface with subtle beveled rim
      return (
        <g>
          <rect
            x={6}
            y={6}
            width={w - 12}
            height={h - 12}
            rx="4"
            fill="none"
            stroke={lineCol}
            strokeWidth="1.5"
          />
        </g>
      );
    }

    default: {
      // Default: Subtle interior border
      return (
        <rect
          x={5}
          y={5}
          width={w - 10}
          height={h - 10}
          rx="4"
          fill="none"
          stroke={lineCol}
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      );
    }
  }
}

// Sophisticated architectural material palette
function getDefaultColor(type: FurnitureType): string {
  switch (type) {
    case 'desk':
      return '#c29b78'; // Warm Natural Oak
    case 'bookshelf':
      return '#475569'; // Slate Charcoal
    case 'cabinet':
      return '#0f766e'; // Deep Teal Wood
    case 'closet':
    case 'wardrobe':
      return '#52525b'; // Zinc / Birch
    case 'storage_rack':
      return '#475569'; // Industrial Steel
    case 'workbench':
      return '#b45309'; // Sturdy Amber Maple
    case 'bed':
      return '#6366f1'; // Indigo Linen
    case 'sofa':
      return '#334155'; // Dark Navy Fabric
    case 'dresser':
      return '#9a3412'; // Rich Mahogany
    case 'box_stack':
      return '#d97706'; // Kraft Cardboard
    default:
      return '#64748b'; // Slate Neutral
  }
}

// Helper to determine if text/lines should be light or dark
function isDarkColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false;
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 140;
}
