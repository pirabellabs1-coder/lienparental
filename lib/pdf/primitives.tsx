/**
 * Reusable PDF primitives: Header, Footer, Section, Row, Label, Value, Badge, Divider.
 * Kept in a separate file so theme.ts stays JSX-free.
 */
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { colors, styles } from './theme';

type ChildrenProps = { children?: React.ReactNode };

export function Section({
  title,
  children,
}: ChildrenProps & { title?: string }) {
  return (
    <View style={styles.section} wrap>
      {title ? <Text style={styles.h2}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({
  label,
  value,
  children,
}: {
  label?: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row} wrap={false}>
      {label !== undefined ? <Text style={styles.rowLabel}>{label}</Text> : null}
      {children ? (
        <View style={{ flex: 1 }}>{children}</View>
      ) : (
        <Text style={styles.rowValue}>{value ?? '—'}</Text>
      )}
    </View>
  );
}

export function Label({ children }: ChildrenProps) {
  return <Text style={styles.rowLabel}>{children}</Text>;
}

export function Value({ children }: ChildrenProps) {
  return <Text style={styles.rowValue}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

type BadgeTone = 'night' | 'leaf' | 'iris' | 'gold' | 'alert';
export function Badge({
  children,
  tone = 'night',
}: ChildrenProps & { tone?: BadgeTone }) {
  const bg = colors[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 8, color: colors.white, letterSpacing: 0.4 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Header rendered on every page. Light bar with brand + document title.
 */
export function Header({
  title,
  reference,
}: {
  title: string;
  reference?: string;
}) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brand}>Lien Parental</Text>
      <Text>{title}</Text>
      <Text>{reference ?? ''}</Text>
    </View>
  );
}

/**
 * Footer rendered on every page.
 * left = "Lien Parental" · center = reference + page X / Y · right = generated date (ISO).
 */
export function Footer({
  reference,
  generatedAt,
}: {
  reference: string;
  generatedAt: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>Lien Parental</Text>
      <Text
        style={styles.footerCenter}
        render={({ pageNumber, totalPages }) =>
          `Document généré par Lien Parental · ${reference} · page ${pageNumber}/${totalPages}`
        }
      />
      <Text>{generatedAt}</Text>
    </View>
  );
}
