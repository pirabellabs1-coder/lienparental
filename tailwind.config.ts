import type { Config } from 'tailwindcss'

// Palette du guide d'identité visuelle Lien Parental : bleu marine #0B2D5B, vert lien #4CAF50, gris clair #E5E7EB.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Bleu nuit — titres, boutons de parcours
        night: { 50:'#eef3f9',100:'#dce5f0',200:'#b6c8df',300:'#87a3c8',400:'#577bad',500:'#365c93',600:'#25497c',700:'#1a3c6a',800:'#123361',900:'#0b2d5b',950:'#071d3c' },
        // Vert lien : 400 = #4CAF50 (logo, accents). 500+ assombris pour garder un texte blanc lisible (AA) sur les boutons.
        leaf:  { 50:'#edf7ee',100:'#d4edd5',200:'#aadcac',300:'#7fc982',400:'#4caf50',500:'#2e7d32',600:'#256a29',700:'#1d5621',800:'#17451b',900:'#113314' },
        // Violet — Coach IA, témoignages
        iris:  { 50:'#f1eefe',100:'#e2dcfd',200:'#c6b9fb',300:'#a38ff6',400:'#8166ef',500:'#5b45e3',600:'#4a35c9',700:'#3c2aa3',800:'#2f2280',900:'#241a60' },
        // Or — Premium
        gold:  { 50:'#fff8e6',100:'#fdecc0',200:'#fad987',300:'#f5bd3a',400:'#e9a21b',500:'#c98410',600:'#a2670c',700:'#7b4e0a',800:'#573708',900:'#3a2506' },
        // Rouge — suppression, erreur
        alert: { 50:'#fdeced',100:'#fbd2d3',200:'#f6a5a8',300:'#f07a7e',400:'#e8474d',500:'#d92128',600:'#b8191f',700:'#8f1418',800:'#6a0f12',900:'#4a0a0c' },
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-montserrat)', 'Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        script: ['var(--font-allura)', 'Allura', 'cursive'],
      },
      borderRadius: { 'xl2': '0.875rem', 'xl3': '1.25rem' },
      boxShadow: {
        card: '0 8px 24px -12px rgba(11,45,91,0.22)',
        soft: '0 1px 3px rgba(11,45,91,0.06), 0 1px 2px rgba(11,45,91,0.04)',
      },
      animation: {
        'fade-up': 'fadeUp .5s ease-out both',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        // Mascotte de l'assistant : flottement léger et clignement (motion-safe uniquement).
        'float-soft': 'floatSoft 3.6s ease-in-out infinite',
        blink: 'blink 5.5s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        floatSoft: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        blink: { '0%, 92%, 100%': { transform: 'scaleY(1)' }, '95%': { transform: 'scaleY(0.15)' } },
      },
    },
  },
  plugins: [],
}
export default config
