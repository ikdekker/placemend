import React from 'react';
import { FurnitureType, FurnitureShape } from '../types';

interface FurnitureGraphicProps {
  type: FurnitureType;
  shape?: FurnitureShape;
  name: string;
  color?: string;
  width: number;
  height: number;
  rotation?: number;
  mirrored?: boolean;
  itemCount?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  showLabels?: boolean;
  showDimensions?: boolean;
  dimensionText?: string;
  /** 1/zoom: keeps the name/dimension badge a constant size on screen */
  labelScale?: number;
}

export const FurnitureGraphic: React.FC<FurnitureGraphicProps> = ({
  type,
  shape = 'rectangle',
  name,
  color,
  width,
  height,
  mirrored = false,
  itemCount = 0,
  isSelected = false,
  isHighlighted = false,
  showLabels = true,
  showDimensions = false,
  dimensionText,
  labelScale = 1,
}) => {
  // Auto-detect shape if not explicitly set (e.g. Round Dining Table or Sectional L-Couch by name)
  const effectiveShape: FurnitureShape = shape !== 'rectangle'
    ? shape
    : (name.toLowerCase().includes('round') || name.toLowerCase().includes('circular'))
      ? 'round'
      : (name.toLowerCase().includes('sectional') || name.toLowerCase().includes('l-couch'))
        ? 'l_shape'
        : (name.toLowerCase().includes('zone') || name.toLowerCase().includes('mat') || name.toLowerCase().includes('rug'))
          ? 'zone'
          : 'rectangle';

  // Determine dominant wood/material tones based on provided color or type defaults
  const baseColor = color || getDefaultColor(type);
  const isDark = isDarkColor(baseColor);
  const textColor = isDark ? '#ffffff' : '#1e293b';

  // SVG Unique IDs for masking / clipping
  const clipId = `clip-${name.replace(/\s+/g, '-').toLowerCase()}-${Math.round(width)}x${Math.round(height)}`;

  return (
    <div
      className={`relative w-full h-full transition-all duration-150 select-none ${
        effectiveShape === 'round' ? 'rounded-full' : effectiveShape === 'zone' ? 'rounded-2xl' : 'rounded-lg'
      } ${
        isSelected
          ? effectiveShape === 'round'
            ? 'ring-4 ring-blue-500 ring-offset-2 ring-offset-white shadow-xl scale-[1.01] rounded-full'
            : effectiveShape === 'l_shape'
              ? 'scale-[1.01]'
              : 'ring-3 ring-blue-500 ring-offset-2 ring-offset-white shadow-xl scale-[1.01]'
          : effectiveShape === 'zone'
            ? 'shadow-xs hover:shadow-md'
            : 'shadow-md hover:shadow-lg'
      } ${isHighlighted ? 'ring-4 ring-amber-400 animate-pulse' : ''}`}
      style={{
        backgroundColor: effectiveShape === 'l_shape' ? 'transparent' : effectiveShape === 'zone' ? `${baseColor}22` : baseColor,
        borderRadius: effectiveShape === 'round' ? '9999px' : effectiveShape === 'zone' ? '14px' : undefined,
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

          {/* L-Shape Sectional Clip Path */}
          {effectiveShape === 'l_shape' && (
            <clipPath id={clipId}>
              <path
                d={
                  mirrored
                    ? `M 0 0 L ${width} 0 L ${width} ${height} L ${width * 0.55} ${height} L ${width * 0.55} ${height * 0.45} L 0 ${height * 0.45} Z`
                    : `M 0 0 L ${width} 0 L ${width} ${height * 0.45} L ${width * 0.45} ${height * 0.45} L ${width * 0.45} ${height} L 0 ${height} Z`
                }
              />
            </clipPath>
          )}
        </defs>

        {/* Ambient bevel surface */}
        {effectiveShape === 'round' ? (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={width / 2 - 1}
            ry={height / 2 - 1}
            fill={`url(#grad-${type})`}
          />
        ) : effectiveShape === 'l_shape' ? (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width={width} height={height} fill={baseColor} />
            <rect x="0" y="0" width={width} height={height} fill={`url(#grad-${type})`} />
          </g>
        ) : effectiveShape === 'zone' ? (
          <rect
            x="1.5"
            y="1.5"
            width={width - 3}
            height={height - 3}
            rx="12"
            fill="none"
            stroke={baseColor}
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        ) : (
          <rect
            x="1"
            y="1"
            width={width - 2}
            height={height - 2}
            rx="6"
            fill={`url(#grad-${type})`}
          />
        )}

        {/* Type-Specific Architectural Graphic Elements */}
        {renderArchitecturalDetails(type, effectiveShape, width, height, isDark, mirrored)}

        {/* Outer perimeter architectural stroke */}
        {effectiveShape === 'round' ? (
          <>
            <ellipse
              cx={width / 2}
              cy={height / 2}
              rx={width / 2 - 1.5}
              ry={height / 2 - 1.5}
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}
              strokeWidth="1.5"
            />
            {isSelected && (
              <ellipse
                cx={width / 2}
                cy={height / 2}
                rx={width / 2 - 2}
                ry={height / 2 - 2}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
              />
            )}
          </>
        ) : effectiveShape === 'l_shape' ? (
          <>
            <path
              d={
                mirrored
                  ? `M 1 1 L ${width - 1} 1 L ${width - 1} ${height - 1} L ${width * 0.55} ${height - 1} L ${width * 0.55} ${height * 0.45} L 1 ${height * 0.45} Z`
                  : `M 1 1 L ${width - 1} 1 L ${width - 1} ${height * 0.45} L ${width * 0.45} ${height * 0.45} L ${width * 0.45} ${height - 1} L 1 ${height - 1} Z`
              }
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}
              strokeWidth="1.5"
            />
            {isSelected && (
              <path
                d={
                  mirrored
                    ? `M 2 2 L ${width - 2} 2 L ${width - 2} ${height - 2} L ${width * 0.55} ${height - 2} L ${width * 0.55} ${height * 0.45} L 2 ${height * 0.45} Z`
                    : `M 2 2 L ${width - 2} 2 L ${width - 2} ${height * 0.45} L ${width * 0.45} ${height * 0.45} L ${width * 0.45} ${height - 2} L 2 ${height - 2} Z`
                }
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
              />
            )}
          </>
        ) : effectiveShape === 'zone' ? null : (
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
        )}
      </svg>

      {/* Item Count Pip / Badge (Top Right) */}
      {itemCount > 0 && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-bold shadow-md border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>{itemCount}</span>
        </div>
      )}

      {/* Elegant, Unobtrusive Furniture Title & Dimensions Badge (Zero Cut-Offs) */}
      {(showLabels || showDimensions) && (
        <div
          className={`absolute z-10 pointer-events-none flex flex-col items-center justify-center gap-0.5 w-max max-w-[max(94%,140px)] px-1 ${
            height > width * 1.25 ? 'top-1/2 left-1/2' : 'bottom-1.5 left-1/2'
          }`}
          style={{
            transform: height > width * 1.25
              ? `translate(-50%, -50%) scale(${labelScale})`
              : `translateX(-50%) scale(${labelScale})`,
            transformOrigin: height > width * 1.25 ? 'center' : 'bottom center',
          }}
        >
          {showLabels && (
            <div
              className="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold tracking-tight shadow-md leading-tight text-center max-w-full whitespace-normal break-words"
              style={{
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                color: textColor,
                backdropFilter: 'blur(4px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
              }}
            >
              {name}
            </div>
          )}
          {showDimensions && dimensionText && (
            <div
              className="px-1.5 py-0.5 rounded bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono font-bold tracking-tight shadow-xs border border-white/10 leading-none whitespace-nowrap"
            >
              {dimensionText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Top-down visual architectural renderer
function renderArchitecturalDetails(
  type: FurnitureType,
  shape: FurnitureShape,
  w: number,
  h: number,
  isDark: boolean,
  mirrored?: boolean
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
      // L-Shaped Sectional Sofa
      if (shape === 'l_shape') {
        const armW = Math.min(16, w * 0.14);
        const backrestThick = Math.min(16, h * 0.16);
        if (mirrored) {
          // Right-Hand Chaise Sectional
          return (
            <g>
              {/* L-Shaped Backrest wrapping top and right */}
              <path
                d={`M ${armW} 3 L ${w - 3} 3 L ${w - 3} ${h - 4} L ${w - backrestThick} ${h - 4} L ${w - backrestThick} ${backrestThick} L ${armW} ${backrestThick} Z`}
                fill={fillSubtle}
                stroke={lineCol}
                strokeWidth="1.2"
              />
              {/* Left Armrest on main sofa */}
              <rect x={3} y={3} width={armW - 3} height={h * 0.45 - 6} rx="3" fill={fillSubtle} stroke={lineCol} strokeWidth="1.2" />
              {/* Bottom edge of Right Chaise Lounge */}
              <line x1={w * 0.55 + 3} y1={h - 3} x2={w - 3} y2={h - 3} stroke={lineCol} strokeWidth="1.5" />
              {/* Chaise cushion inner seam */}
              <line x1={w * 0.55 + 3} y1={h * 0.45} x2={w * 0.55 + 3} y2={h - 3} stroke={lineCol} strokeWidth="1.5" />
              <line x1={w * 0.55 + 3} y1={h * 0.55} x2={w - 3} y2={h * 0.55} stroke={lineCol} strokeWidth="1.2" strokeDasharray="3 3" />
              {/* Main sofa cushion divider */}
              <line x1={(w * 0.55) / 2} y1={backrestThick} x2={(w * 0.55) / 2} y2={h * 0.45 - 3} stroke={lineCol} strokeWidth="1.5" />
            </g>
          );
        }

        // Left-Hand Chaise Sectional
        return (
          <g>
            {/* L-Shaped Backrest wrapping top and left */}
            <path
              d={`M ${armW} 3 L ${w - armW} 3 L ${w - armW} ${backrestThick} L ${backrestThick} ${backrestThick} L ${backrestThick} ${h - 4} L 3 ${h - 4} L 3 3 Z`}
              fill={fillSubtle}
              stroke={lineCol}
              strokeWidth="1.2"
            />
            {/* Right Armrest on main sofa */}
            <rect x={w - armW} y={3} width={armW - 3} height={h * 0.45 - 6} rx="3" fill={fillSubtle} stroke={lineCol} strokeWidth="1.2" />
            {/* Bottom edge of Chaise Lounge */}
            <line x1={3} y1={h - 3} x2={w * 0.45 - 3} y2={h - 3} stroke={lineCol} strokeWidth="1.5" />
            {/* Chaise cushion seam */}
            <line x1={w * 0.45 - 3} y1={h * 0.45} x2={w * 0.45 - 3} y2={h - 3} stroke={lineCol} strokeWidth="1.5" />
            <line x1={3} y1={h * 0.55} x2={w * 0.45 - 3} y2={h * 0.55} stroke={lineCol} strokeWidth="1.2" strokeDasharray="3 3" />
            {/* Main sofa cushion divider */}
            <line x1={(w * 0.45 + w) / 2} y1={backrestThick} x2={(w * 0.45 + w) / 2} y2={h * 0.45 - 3} stroke={lineCol} strokeWidth="1.5" />
          </g>
        );
      }

      // Standard Straight Sofa / Couch: Deep backrest, armrests, seat cushion dividing lines
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
      // Round / Circular Table (shape === 'round')
      if (shape === 'round') {
        const radius = Math.min(w, h) / 2;
        const centerX = w / 2;
        const centerY = h / 2;
        return (
          <g>
            {/* Inner beveled ring */}
            <ellipse
              cx={centerX}
              cy={centerY}
              rx={radius - 6}
              ry={radius - 6}
              fill="none"
              stroke={lineCol}
              strokeWidth="1.5"
            />
            {/* Center pedestal / woodgrain focal ring */}
            <ellipse
              cx={centerX}
              cy={centerY}
              rx={Math.max(4, radius * 0.28)}
              ry={Math.max(4, radius * 0.28)}
              fill={fillSubtle}
              stroke={accentCol}
              strokeWidth="1.2"
            />
            {/* 4 Radial Tucked Chairs around circular edge */}
            <g opacity={0.65}>
              {/* Top chair */}
              <rect x={centerX - radius * 0.25} y={1} width={radius * 0.5} height={4} rx="1.5" fill={accentCol} />
              {/* Bottom chair */}
              <rect x={centerX - radius * 0.25} y={h - 5} width={radius * 0.5} height={4} rx="1.5" fill={accentCol} />
              {/* Left chair */}
              <rect x={1} y={centerY - radius * 0.25} width={4} height={radius * 0.5} rx="1.5" fill={accentCol} />
              {/* Right chair */}
              <rect x={w - 5} y={centerY - radius * 0.25} width={4} height={radius * 0.5} rx="1.5" fill={accentCol} />
            </g>
          </g>
        );
      }

      // Rectangular Table: Dining or coffee table with inner rim and tucked-in seating indication
      const isLargeDining = w >= 60 && h >= 40;
      return (
        <g>
          {/* Table surface border / bevel */}
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
          {/* Wood grain / center runner */}
          <line
            x1={14}
            y1={h / 2}
            x2={w - 14}
            y2={h / 2}
            stroke={lineCol}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.4}
          />
          {/* Tucked chair outlines for large dining tables */}
          {isLargeDining && (
            <g opacity={0.6}>
              {/* Top chairs */}
              <rect x={w * 0.22} y={1} width={w * 0.2} height={4} rx="1" fill={accentCol} />
              <rect x={w * 0.58} y={1} width={w * 0.2} height={4} rx="1" fill={accentCol} />
              {/* Bottom chairs */}
              <rect x={w * 0.22} y={h - 5} width={w * 0.2} height={4} rx="1" fill={accentCol} />
              <rect x={w * 0.58} y={h - 5} width={w * 0.2} height={4} rx="1" fill={accentCol} />
            </g>
          )}
        </g>
      );
    }

    case 'kitchen_counter': {
      // Kitchen Counter: Stainless sink basin with drain and faucet + cooktop burners
      const sinkW = Math.min(28, w * 0.32);
      const sinkH = Math.min(22, h * 0.65);
      const cooktopW = Math.min(28, w * 0.32);
      const cooktopH = Math.min(22, h * 0.65);

      return (
        <g>
          {/* Countertop Backsplash line */}
          <line x1={2} y1={4} x2={w - 2} y2={4} stroke={lineCol} strokeWidth="2" />
          
          {/* Sink (Left or center) */}
          {w >= 45 && (
            <g transform={`translate(${Math.max(6, w * 0.1)}, ${Math.max(6, (h - sinkH) / 2)})`}>
              {/* Basin outer */}
              <rect
                x={0}
                y={0}
                width={sinkW}
                height={sinkH}
                rx="3"
                fill={fillSubtle}
                stroke={accentCol}
                strokeWidth="1.5"
              />
              {/* Drain hole */}
              <circle cx={sinkW / 2} cy={sinkH / 2} r={2.5} fill={accentCol} />
              {/* Faucet spout */}
              <line
                x1={sinkW / 2}
                y1={-2}
                x2={sinkW / 2}
                y2={4}
                stroke={accentCol}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Induction / Gas Cooktop Burners (Right side) */}
          {w >= 70 && (
            <g transform={`translate(${w - cooktopW - Math.max(6, w * 0.08)}, ${Math.max(6, (h - cooktopH) / 2)})`}>
              <rect
                x={0}
                y={0}
                width={cooktopW}
                height={cooktopH}
                rx="3"
                fill="none"
                stroke={accentCol}
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
              {/* 2 circular burner rings */}
              <circle cx={cooktopW * 0.3} cy={cooktopH / 2} r={Math.min(cooktopW * 0.22, cooktopH * 0.35)} fill="none" stroke={accentCol} strokeWidth="1.5" />
              <circle cx={cooktopW * 0.72} cy={cooktopH / 2} r={Math.min(cooktopW * 0.18, cooktopH * 0.28)} fill="none" stroke={accentCol} strokeWidth="1.5" />
            </g>
          )}

          {/* Under-counter cabinet divider lines */}
          <line x1={4} y1={h - 3} x2={w - 4} y2={h - 3} stroke={lineCol} strokeWidth="1" />
        </g>
      );
    }

    case 'kitchen_island': {
      // Kitchen Island: Solid stone prep surface, prep sink or prep cutouts, and barstool outlines along back
      const prepSinkW = Math.min(22, w * 0.22);
      const prepSinkH = Math.min(18, h * 0.45);
      return (
        <g>
          {/* Beveled edge border */}
          <rect
            x={5}
            y={5}
            width={w - 10}
            height={h - 10}
            rx="5"
            fill="none"
            stroke={lineCol}
            strokeWidth="1.5"
          />
          {/* Prep sink in center-left */}
          {w >= 50 && (
            <rect
              x={w * 0.18}
              y={(h - prepSinkH) / 2}
              width={prepSinkW}
              height={prepSinkH}
              rx="3"
              fill={fillSubtle}
              stroke={accentCol}
              strokeWidth="1.5"
            />
          )}
          {/* Prep cutting board or contrast inlay */}
          {w >= 60 && (
            <rect
              x={w * 0.55}
              y={(h - prepSinkH) / 2}
              width={prepSinkW}
              height={prepSinkH}
              rx="2"
              fill={fillSubtle}
              stroke={lineCol}
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          )}
          {/* Barstools along top or bottom overhang */}
          {Array.from({ length: Math.max(2, Math.floor(w / 35)) }).map((_, i) => (
            <circle
              key={i}
              cx={20 + (i * (w - 40)) / Math.max(1, Math.floor(w / 35) - 1)}
              cy={h - 2}
              r={3}
              fill={accentCol}
              opacity={0.7}
            />
          ))}
        </g>
      );
    }

    case 'appliance': {
      // Refrigerator or Large Kitchen Appliance: Stainless door handle, interior freezer split
      return (
        <g>
          {/* Freezer / fridge split line */}
          <line x1={4} y1={h * 0.35} x2={w - 4} y2={h * 0.35} stroke={lineCol} strokeWidth="1.5" />
          {/* Appliance Door Handle along edge */}
          <rect
            x={w - 6}
            y={8}
            width={3}
            height={h - 16}
            rx="1.5"
            fill={accentCol}
          />
          {/* Brand badge or LED display */}
          <rect
            x={w * 0.25}
            y={6}
            width={Math.min(16, w * 0.5)}
            height={3}
            rx="1"
            fill={accentCol}
            opacity={0.8}
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
    case 'table':
      return '#b45309'; // Rich Amber Wood
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
    case 'kitchen_counter':
      return '#334155'; // Granite / Slate Countertop
    case 'kitchen_island':
      return '#475569'; // Quartz / Slate Island
    case 'appliance':
      return '#64748b'; // Brushed Stainless Steel
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
