// Tailwind Compatibility Layer for NyxCode
// Maps Tailwind utility class names → CSS declarations
// Used by expandUtility() in compiler.ts

export const TAILWIND_MAP: Record<string, {name: string, value: string}[]> = {
  // Display
  'block': [{ name: 'display', value: 'block' }],
  'inline-block': [{ name: 'display', value: 'inline-block' }],
  'inline': [{ name: 'display', value: 'inline' }],
  'flex': [{ name: 'display', value: 'flex' }],
  'inline-flex': [{ name: 'display', value: 'inline-flex' }],
  'grid': [{ name: 'display', value: 'grid' }],
  'inline-grid': [{ name: 'display', value: 'inline-grid' }],
  'hidden': [{ name: 'display', value: 'none' }],
  'contents': [{ name: 'display', value: 'contents' }],

  // Flex direction
  'flex-row': [{ name: 'flex-direction', value: 'row' }],
  'flex-col': [{ name: 'flex-direction', value: 'column' }],
  'flex-row-reverse': [{ name: 'flex-direction', value: 'row-reverse' }],
  'flex-col-reverse': [{ name: 'flex-direction', value: 'column-reverse' }],
  'flex-wrap': [{ name: 'flex-wrap', value: 'wrap' }],
  'flex-nowrap': [{ name: 'flex-wrap', value: 'nowrap' }],
  'flex-1': [{ name: 'flex', value: '1 1 0%' }],
  'flex-auto': [{ name: 'flex', value: '1 1 auto' }],
  'flex-initial': [{ name: 'flex', value: '0 1 auto' }],
  'flex-none': [{ name: 'flex', value: 'none' }],
  'grow': [{ name: 'flex-grow', value: '1' }],
  'grow-0': [{ name: 'flex-grow', value: '0' }],
  'shrink': [{ name: 'flex-shrink', value: '1' }],
  'shrink-0': [{ name: 'flex-shrink', value: '0' }],

  // Alignment
  'items-start': [{ name: 'align-items', value: 'flex-start' }],
  'items-center': [{ name: 'align-items', value: 'center' }],
  'items-end': [{ name: 'align-items', value: 'flex-end' }],
  'items-baseline': [{ name: 'align-items', value: 'baseline' }],
  'items-stretch': [{ name: 'align-items', value: 'stretch' }],
  'justify-start': [{ name: 'justify-content', value: 'flex-start' }],
  'justify-center': [{ name: 'justify-content', value: 'center' }],
  'justify-end': [{ name: 'justify-content', value: 'flex-end' }],
  'justify-between': [{ name: 'justify-content', value: 'space-between' }],
  'justify-around': [{ name: 'justify-content', value: 'space-around' }],
  'justify-evenly': [{ name: 'justify-content', value: 'space-evenly' }],
  'self-auto': [{ name: 'align-self', value: 'auto' }],
  'self-start': [{ name: 'align-self', value: 'flex-start' }],
  'self-center': [{ name: 'align-self', value: 'center' }],
  'self-end': [{ name: 'align-self', value: 'flex-end' }],
  'self-stretch': [{ name: 'align-self', value: 'stretch' }],

  // Position
  'static': [{ name: 'position', value: 'static' }],
  'fixed': [{ name: 'position', value: 'fixed' }],
  'absolute': [{ name: 'position', value: 'absolute' }],
  'relative': [{ name: 'position', value: 'relative' }],
  'sticky': [{ name: 'position', value: 'sticky' }],
  'inset-0': [{ name: 'inset', value: '0' }],
  'top-0': [{ name: 'top', value: '0' }],
  'right-0': [{ name: 'right', value: '0' }],
  'bottom-0': [{ name: 'bottom', value: '0' }],
  'left-0': [{ name: 'left', value: '0' }],

  // Sizing
  'w-full': [{ name: 'width', value: '100%' }],
  'w-screen': [{ name: 'width', value: '100vw' }],
  'w-auto': [{ name: 'width', value: 'auto' }],
  'w-fit': [{ name: 'width', value: 'fit-content' }],
  'h-full': [{ name: 'height', value: '100%' }],
  'h-screen': [{ name: 'height', value: '100vh' }],
  'h-auto': [{ name: 'height', value: 'auto' }],
  'min-h-screen': [{ name: 'min-height', value: '100vh' }],
  'min-h-full': [{ name: 'min-height', value: '100%' }],
  'max-w-sm': [{ name: 'max-width', value: '24rem' }],
  'max-w-md': [{ name: 'max-width', value: '28rem' }],
  'max-w-lg': [{ name: 'max-width', value: '32rem' }],
  'max-w-xl': [{ name: 'max-width', value: '36rem' }],
  'max-w-2xl': [{ name: 'max-width', value: '42rem' }],
  'max-w-3xl': [{ name: 'max-width', value: '48rem' }],
  'max-w-4xl': [{ name: 'max-width', value: '56rem' }],
  'max-w-5xl': [{ name: 'max-width', value: '64rem' }],
  'max-w-6xl': [{ name: 'max-width', value: '72rem' }],
  'max-w-7xl': [{ name: 'max-width', value: '80rem' }],
  'max-w-full': [{ name: 'max-width', value: '100%' }],
  'max-w-prose': [{ name: 'max-width', value: '65ch' }],

  // Overflow
  'overflow-hidden': [{ name: 'overflow', value: 'hidden' }],
  'overflow-auto': [{ name: 'overflow', value: 'auto' }],
  'overflow-scroll': [{ name: 'overflow', value: 'scroll' }],
  'overflow-visible': [{ name: 'overflow', value: 'visible' }],

  // Typography
  'text-left': [{ name: 'text-align', value: 'left' }],
  'text-center': [{ name: 'text-align', value: 'center' }],
  'text-right': [{ name: 'text-align', value: 'right' }],
  'text-xs': [{ name: 'font-size', value: '0.75rem' }, { name: 'line-height', value: '1rem' }],
  'text-sm': [{ name: 'font-size', value: '0.875rem' }, { name: 'line-height', value: '1.25rem' }],
  'text-base': [{ name: 'font-size', value: '1rem' }, { name: 'line-height', value: '1.5rem' }],
  'text-lg': [{ name: 'font-size', value: '1.125rem' }, { name: 'line-height', value: '1.75rem' }],
  'text-xl': [{ name: 'font-size', value: '1.25rem' }, { name: 'line-height', value: '1.75rem' }],
  'text-2xl': [{ name: 'font-size', value: '1.5rem' }, { name: 'line-height', value: '2rem' }],
  'text-3xl': [{ name: 'font-size', value: '1.875rem' }, { name: 'line-height', value: '2.25rem' }],
  'text-4xl': [{ name: 'font-size', value: '2.25rem' }, { name: 'line-height', value: '2.5rem' }],
  'text-5xl': [{ name: 'font-size', value: '3rem' }, { name: 'line-height', value: '1' }],
  'font-thin': [{ name: 'font-weight', value: '100' }],
  'font-light': [{ name: 'font-weight', value: '300' }],
  'font-normal': [{ name: 'font-weight', value: '400' }],
  'font-medium': [{ name: 'font-weight', value: '500' }],
  'font-semibold': [{ name: 'font-weight', value: '600' }],
  'font-bold': [{ name: 'font-weight', value: '700' }],
  'font-extrabold': [{ name: 'font-weight', value: '800' }],
  'italic': [{ name: 'font-style', value: 'italic' }],
  'not-italic': [{ name: 'font-style', value: 'normal' }],
  'underline': [{ name: 'text-decoration', value: 'underline' }],
  'line-through': [{ name: 'text-decoration', value: 'line-through' }],
  'no-underline': [{ name: 'text-decoration', value: 'none' }],
  'whitespace-nowrap': [{ name: 'white-space', value: 'nowrap' }],
  'whitespace-pre': [{ name: 'white-space', value: 'pre' }],
  'break-words': [{ name: 'overflow-wrap', value: 'break-word' }],
  'break-all': [{ name: 'word-break', value: 'break-all' }],
  'normal-case': [{ name: 'text-transform', value: 'none' }],

  // Border radius
  'rounded': [{ name: 'border-radius', value: '0.25rem' }],
  'rounded-sm': [{ name: 'border-radius', value: '0.125rem' }],
  'rounded-md': [{ name: 'border-radius', value: '0.375rem' }],
  'rounded-lg': [{ name: 'border-radius', value: '0.5rem' }],
  'rounded-xl': [{ name: 'border-radius', value: '0.75rem' }],
  'rounded-2xl': [{ name: 'border-radius', value: '1rem' }],
  'rounded-3xl': [{ name: 'border-radius', value: '1.5rem' }],
  'rounded-full': [{ name: 'border-radius', value: '9999px' }],
  'rounded-none': [{ name: 'border-radius', value: '0' }],

  // Borders
  'border': [{ name: 'border-width', value: '1px' }],
  'border-0': [{ name: 'border-width', value: '0' }],
  'border-2': [{ name: 'border-width', value: '2px' }],
  'border-4': [{ name: 'border-width', value: '4px' }],
  'border-solid': [{ name: 'border-style', value: 'solid' }],
  'border-dashed': [{ name: 'border-style', value: 'dashed' }],
  'border-none': [{ name: 'border-style', value: 'none' }],

  // Shadow
  'shadow': [{ name: 'box-shadow', value: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' }],
  'shadow-sm': [{ name: 'box-shadow', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }],
  'shadow-md': [{ name: 'box-shadow', value: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }],
  'shadow-lg': [{ name: 'box-shadow', value: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }],
  'shadow-xl': [{ name: 'box-shadow', value: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }],
  'shadow-none': [{ name: 'box-shadow', value: 'none' }],

  // Opacity
  'opacity-0': [{ name: 'opacity', value: '0' }],
  'opacity-50': [{ name: 'opacity', value: '0.5' }],
  'opacity-75': [{ name: 'opacity', value: '0.75' }],
  'opacity-100': [{ name: 'opacity', value: '1' }],

  // Cursor
  'cursor-pointer': [{ name: 'cursor', value: 'pointer' }],
  'cursor-default': [{ name: 'cursor', value: 'default' }],
  'cursor-not-allowed': [{ name: 'cursor', value: 'not-allowed' }],
  'pointer-events-none': [{ name: 'pointer-events', value: 'none' }],
  'pointer-events-auto': [{ name: 'pointer-events', value: 'auto' }],

  // Selection
  'select-none': [{ name: 'user-select', value: 'none' }],
  'select-all': [{ name: 'user-select', value: 'all' }],
  'select-auto': [{ name: 'user-select', value: 'auto' }],
  'resize-none': [{ name: 'resize', value: 'none' }],
  'list-none': [{ name: 'list-style', value: 'none' }],
  'list-disc': [{ name: 'list-style', value: 'disc' }],
  'appearance-none': [{ name: 'appearance', value: 'none' }],
  'outline-none': [{ name: 'outline', value: '2px solid transparent' }, { name: 'outline-offset', value: '2px' }],

  // Transitions
  'transition': [{ name: 'transition-property', value: 'color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter' }, { name: 'transition-timing-function', value: 'cubic-bezier(0.4, 0, 0.2, 1)' }, { name: 'transition-duration', value: '150ms' }],
  'transition-all': [{ name: 'transition-property', value: 'all' }, { name: 'transition-timing-function', value: 'cubic-bezier(0.4, 0, 0.2, 1)' }, { name: 'transition-duration', value: '150ms' }],
  'transition-colors': [{ name: 'transition-property', value: 'color, background-color, border-color, text-decoration-color, fill, stroke' }, { name: 'transition-timing-function', value: 'cubic-bezier(0.4, 0, 0.2, 1)' }, { name: 'transition-duration', value: '150ms' }],
  'transition-none': [{ name: 'transition-property', value: 'none' }],
  'duration-75': [{ name: 'transition-duration', value: '75ms' }],
  'duration-100': [{ name: 'transition-duration', value: '100ms' }],
  'duration-150': [{ name: 'transition-duration', value: '150ms' }],
  'duration-200': [{ name: 'transition-duration', value: '200ms' }],
  'duration-300': [{ name: 'transition-duration', value: '300ms' }],
  'duration-500': [{ name: 'transition-duration', value: '500ms' }],
  'ease-linear': [{ name: 'transition-timing-function', value: 'linear' }],
  'ease-in': [{ name: 'transition-timing-function', value: 'cubic-bezier(0.4, 0, 1, 1)' }],
  'ease-out': [{ name: 'transition-timing-function', value: 'cubic-bezier(0, 0, 0.2, 1)' }],
  'ease-in-out': [{ name: 'transition-timing-function', value: 'cubic-bezier(0.4, 0, 0.2, 1)' }],

  // Z-index
  'z-0': [{ name: 'z-index', value: '0' }],
  'z-10': [{ name: 'z-index', value: '10' }],
  'z-20': [{ name: 'z-index', value: '20' }],
  'z-30': [{ name: 'z-index', value: '30' }],
  'z-40': [{ name: 'z-index', value: '40' }],
  'z-50': [{ name: 'z-index', value: '50' }],

  // Object fit
  'object-contain': [{ name: 'object-fit', value: 'contain' }],
  'object-cover': [{ name: 'object-fit', value: 'cover' }],
  'object-fill': [{ name: 'object-fit', value: 'fill' }],
  'object-none': [{ name: 'object-fit', value: 'none' }],

  // Aspect ratio
  'aspect-auto': [{ name: 'aspect-ratio', value: 'auto' }],
  'aspect-square': [{ name: 'aspect-ratio', value: '1 / 1' }],
  'aspect-video': [{ name: 'aspect-ratio', value: '16 / 9' }],

  // Grid
  'grid-cols-1': [{ name: 'grid-template-columns', value: 'repeat(1, minmax(0, 1fr))' }],
  'grid-cols-2': [{ name: 'grid-template-columns', value: 'repeat(2, minmax(0, 1fr))' }],
  'grid-cols-3': [{ name: 'grid-template-columns', value: 'repeat(3, minmax(0, 1fr))' }],
  'grid-cols-4': [{ name: 'grid-template-columns', value: 'repeat(4, minmax(0, 1fr))' }],
  'grid-cols-6': [{ name: 'grid-template-columns', value: 'repeat(6, minmax(0, 1fr))' }],
  'grid-cols-12': [{ name: 'grid-template-columns', value: 'repeat(12, minmax(0, 1fr))' }],
  'col-span-1': [{ name: 'grid-column', value: 'span 1 / span 1' }],
  'col-span-2': [{ name: 'grid-column', value: 'span 2 / span 2' }],
  'col-span-3': [{ name: 'grid-column', value: 'span 3 / span 3' }],
  'col-span-4': [{ name: 'grid-column', value: 'span 4 / span 4' }],
  'col-span-6': [{ name: 'grid-column', value: 'span 6 / span 6' }],
  'col-span-full': [{ name: 'grid-column', value: '1 / -1' }],
  'place-items-center': [{ name: 'place-items', value: 'center' }],
  'place-content-center': [{ name: 'place-content', value: 'center' }],
};

// Dynamic Tailwind patterns: p-4 → padding: 1rem, m-2 → margin: 0.5rem, etc.
// Tailwind spacing scale: 1 = 0.25rem, 2 = 0.5rem, 4 = 1rem, 8 = 2rem, etc.
const SPACING_SCALE: Record<string, string> = {
  '0': '0', '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
  '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem', '3.5': '0.875rem',
  '4': '1rem', '5': '1.25rem', '6': '1.5rem', '7': '1.75rem',
  '8': '2rem', '9': '2.25rem', '10': '2.5rem', '11': '2.75rem',
  '12': '3rem', '14': '3.5rem', '16': '4rem', '20': '5rem',
  '24': '6rem', '28': '7rem', '32': '8rem', '36': '9rem',
  '40': '10rem', '44': '11rem', '48': '12rem', '52': '13rem',
  '56': '14rem', '60': '15rem', '64': '16rem', '72': '18rem',
  '80': '20rem', '96': '24rem',
  'px': '1px', 'auto': 'auto',
};

// Dynamic spacing patterns
const SPACING_PROPS: Record<string, string[]> = {
  'p': ['padding'],
  'px': ['padding-left', 'padding-right'],
  'py': ['padding-top', 'padding-bottom'],
  'pt': ['padding-top'],
  'pr': ['padding-right'],
  'pb': ['padding-bottom'],
  'pl': ['padding-left'],
  'm': ['margin'],
  'mx': ['margin-left', 'margin-right'],
  'my': ['margin-top', 'margin-bottom'],
  'mt': ['margin-top'],
  'mr': ['margin-right'],
  'mb': ['margin-bottom'],
  'ml': ['margin-left'],
  'gap': ['gap'],
  'gap-x': ['column-gap'],
  'gap-y': ['row-gap'],
  'space-x': ['column-gap'], // simplified — real Tailwind uses > * + * selector
  'space-y': ['row-gap'],
  'w': ['width'],
  'h': ['height'],
  'size': ['width', 'height'],
};

// Text color patterns
const TW_COLORS: Record<string, string> = {
  'white': '#ffffff',
  'black': '#000000',
  'transparent': 'transparent',
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0',
  'slate-300': '#cbd5e1', 'slate-400': '#94a3b8', 'slate-500': '#64748b',
  'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b', 'slate-900': '#0f172a',
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280',
  'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937', 'gray-900': '#111827',
  'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca',
  'red-300': '#fca5a5', 'red-400': '#f87171', 'red-500': '#ef4444',
  'red-600': '#dc2626', 'red-700': '#b91c1c', 'red-800': '#991b1b', 'red-900': '#7f1d1d',
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe',
  'blue-300': '#93c5fd', 'blue-400': '#60a5fa', 'blue-500': '#3b82f6',
  'blue-600': '#2563eb', 'blue-700': '#1d4ed8', 'blue-800': '#1e40af', 'blue-900': '#1e3a8a',
  'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0',
  'green-300': '#86efac', 'green-400': '#4ade80', 'green-500': '#22c55e',
  'green-600': '#16a34a', 'green-700': '#15803d', 'green-800': '#166534', 'green-900': '#14532d',
  'yellow-50': '#fefce8', 'yellow-100': '#fef9c3', 'yellow-200': '#fef08a',
  'yellow-300': '#fde047', 'yellow-400': '#facc15', 'yellow-500': '#eab308',
  'yellow-600': '#ca8a04', 'yellow-700': '#a16207', 'yellow-800': '#854d0e', 'yellow-900': '#713f12',
  'purple-50': '#faf5ff', 'purple-100': '#f3e8ff', 'purple-200': '#e9d5ff',
  'purple-300': '#d8b4fe', 'purple-400': '#c084fc', 'purple-500': '#a855f7',
  'purple-600': '#9333ea', 'purple-700': '#7e22ce', 'purple-800': '#6b21a8', 'purple-900': '#581c87',
  'pink-50': '#fdf2f8', 'pink-100': '#fce7f3', 'pink-200': '#fbcfe8',
  'pink-300': '#f9a8d4', 'pink-400': '#f472b6', 'pink-500': '#ec4899',
  'pink-600': '#db2777', 'pink-700': '#be185d', 'pink-800': '#9d174d', 'pink-900': '#831843',
  'indigo-50': '#eef2ff', 'indigo-100': '#e0e7ff', 'indigo-200': '#c7d2fe',
  'indigo-300': '#a5b4fc', 'indigo-400': '#818cf8', 'indigo-500': '#6366f1',
  'indigo-600': '#4f46e5', 'indigo-700': '#4338ca', 'indigo-800': '#3730a3', 'indigo-900': '#312e81',
  'cyan-400': '#22d3ee', 'cyan-500': '#06b6d4', 'cyan-600': '#0891b2',
  'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669',
  'amber-400': '#fbbf24', 'amber-500': '#f59e0b', 'amber-600': '#d97706',
  'rose-400': '#fb7185', 'rose-500': '#f43f5e', 'rose-600': '#e11d48',
  'sky-400': '#38bdf8', 'sky-500': '#0ea5e9', 'sky-600': '#0284c7',
  'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c',
};

/**
 * Try to resolve a Tailwind utility class to CSS declarations.
 * Returns null if not a Tailwind class.
 */
export function resolveTailwindClass(className: string): {name: string, value: string}[] | null {
  // 1. Direct static lookup
  if (TAILWIND_MAP[className]) return TAILWIND_MAP[className];

  // 2. Dynamic spacing: p-4, mx-auto, gap-2, etc.
  const spacingMatch = className.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|size)-(.+)$/);
  if (spacingMatch) {
    const [, prefix, size] = spacingMatch;
    const props = SPACING_PROPS[prefix];
    const val = SPACING_SCALE[size];
    if (props && val) {
      return props.map(p => ({ name: p, value: val }));
    }
  }

  // 3. Text color: text-red-500, text-white, etc.
  const textColorMatch = className.match(/^text-(.+)$/);
  if (textColorMatch) {
    const color = TW_COLORS[textColorMatch[1]];
    if (color) return [{ name: 'color', value: color }];
  }

  // 4. Background color: bg-blue-500, bg-white, etc.
  const bgColorMatch = className.match(/^bg-(.+)$/);
  if (bgColorMatch) {
    const color = TW_COLORS[bgColorMatch[1]];
    if (color) return [{ name: 'background-color', value: color }];
  }

  // 5. Border color: border-red-500, etc.
  const borderColorMatch = className.match(/^border-(.+)$/);
  if (borderColorMatch) {
    const color = TW_COLORS[borderColorMatch[1]];
    if (color) return [{ name: 'border-color', value: color }];
  }

  return null;
}
