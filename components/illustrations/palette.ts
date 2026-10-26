// Shared flat-illustration palette (matches the client mockups).
export const ILLU = {
  navy: '#0b2d5b',
  navySoft: '#2a3a93',
  green: '#2e7d32',
  greenDark: '#18692f',
  skin: '#f2c9a5',
  skinShade: '#e5b38c',
  hair: '#3b2a20',
  leafLight: '#d3ecda',
  leafMid: '#a7d8b5',
  leafBg: '#ecf6ef',
  navyBg: '#eef0fb',
  white: '#ffffff',
  shirt: '#f4f6fd',
  blush: '#f2a28f',
} as const

export type IllustrationProps = {
  className?: string
  /** Accessible title. When omitted the SVG is decorative (aria-hidden). */
  title?: string
}

export function a11yProps(title?: string) {
  return title
    ? ({ role: 'img', 'aria-label': title } as const)
    : ({ 'aria-hidden': true, focusable: false } as const)
}
