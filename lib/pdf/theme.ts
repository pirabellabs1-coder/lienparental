/**
 * PDF theme & shared primitives for Lien Parental documents.
 *
 * Fonts are registered from Google-hosted TTF URLs for simplicity. For fully
 * offline PDF generation (e.g. a serverless runtime without egress), copy the
 * TTF files locally (e.g. /public/fonts/) and swap the `src` to a local
 * file path or a `fs.readFileSync` Buffer.
 */
import { Font, StyleSheet } from '@react-pdf/renderer';

// --- Font registration -----------------------------------------------------
// Google Fonts raw TTFs (public, stable URLs). Replace with local files for
// air-gapped environments.
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa05L7.ttf',
      fontWeight: 500,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa2JL7.ttf',
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: 'Fraunces',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/fraunces/v31/6NUh8FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lKqZTnbB-gQfQ.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/fraunces/v31/6NUh8FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lLqZTnbB-gQfQ.ttf',
      fontWeight: 600,
    },
    {
      src: 'https://fonts.gstatic.com/s/fraunces/v31/6NUh8FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lL9ZTnbB-gQfQ.ttf',
      fontWeight: 700,
    },
  ],
});

// Avoid breaking long words on hyphenation (react-pdf default is overly eager)
Font.registerHyphenationCallback((word) => [word]);

// --- Brand tokens ----------------------------------------------------------
export const colors = {
  night: '#0b1a3f',
  leaf: '#1faf5c',
  iris: '#8347d1',
  gold: '#d49918',
  alert: '#c42727',
  ink: '#111318',
  muted: '#5b6478',
  line: '#dfe3eb',
  surface: '#f6f7fb',
  white: '#ffffff',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  xxl: 40,
} as const;

export const fonts = {
  sans: 'Inter',
  serif: 'Fraunces',
} as const;

export const pageSize = 'A4' as const;

// --- Shared stylesheet -----------------------------------------------------
export const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 72,
    paddingHorizontal: 48,
    fontFamily: fonts.sans,
    fontSize: 10.5,
    color: colors.ink,
    lineHeight: 1.5,
    backgroundColor: colors.white,
  },

  // Header bar at the top of each page
  header: {
    position: 'absolute',
    top: 22,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    fontSize: 8.5,
    color: colors.muted,
  },
  brand: {
    fontFamily: fonts.serif,
    fontWeight: 700,
    fontSize: 11,
    color: colors.night,
    letterSpacing: 0.2,
  },

  // Footer at bottom of every page
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    fontSize: 8,
    color: colors.muted,
  },
  footerCenter: { textAlign: 'center' },

  // Titles
  h1: {
    fontFamily: fonts.serif,
    fontWeight: 700,
    fontSize: 24,
    color: colors.night,
    marginBottom: spacing.sm,
  },
  h2: {
    fontFamily: fonts.serif,
    fontWeight: 600,
    fontSize: 16,
    color: colors.night,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  h3: {
    fontFamily: fonts.sans,
    fontWeight: 700,
    fontSize: 11.5,
    color: colors.night,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Paragraphs
  p: { marginBottom: spacing.sm },
  small: { fontSize: 8.5, color: colors.muted },

  // Primitives
  section: {
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  rowLabel: {
    width: '38%',
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowValue: {
    flex: 1,
    fontSize: 10.5,
    color: colors.ink,
  },

  // Badge
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 8,
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Cover
  cover: {
    marginTop: 80,
    marginBottom: spacing.xxl,
  },
  coverEyebrow: {
    fontSize: 10,
    color: colors.iris,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    fontWeight: 700,
  },
  coverTitle: {
    fontFamily: fonts.serif,
    fontWeight: 700,
    fontSize: 32,
    color: colors.night,
    marginBottom: spacing.md,
    lineHeight: 1.15,
  },
  coverSub: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  coverMeta: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },

  // Letter
  letterAddress: {
    marginBottom: spacing.lg,
    lineHeight: 1.4,
  },
  letterRight: { alignItems: 'flex-end' },
  letterObjet: {
    fontWeight: 700,
    marginVertical: spacing.lg,
  },
  letterCorps: {
    marginBottom: spacing.lg,
    lineHeight: 1.6,
    textAlign: 'justify',
  },
  signature: {
    marginTop: spacing.xl,
    alignItems: 'flex-end',
  },

  // Timeline
  timelineMonth: {
    fontFamily: fonts.serif,
    fontWeight: 600,
    fontSize: 14,
    color: colors.night,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tlEntry: {
    marginBottom: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.leaf,
  },
  tlEntryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tlDate: {
    fontSize: 9,
    color: colors.muted,
  },
  tlTitle: {
    fontWeight: 700,
    fontSize: 11,
    color: colors.night,
  },

  // Legal notice
  legalNotice: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.alert,
    fontSize: 9,
    color: colors.ink,
  },

  // TOC
  tocItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderBottomStyle: 'dotted',
  },
});
