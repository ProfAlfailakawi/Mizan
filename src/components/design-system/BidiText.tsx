import React from 'react';

/*
 * Keeps participant / ticket codes such as «B-1237» readable inside Arabic sentences.
 *
 * Without isolation the bidi algorithm lets the closing parenthesis and the digits of a
 * Latin code jump around («(1237-B)»). Each code is wrapped in <bdi dir="ltr"> so it stays
 * one left-to-right unit whatever surrounds it. Display only; the string is never altered.
 */
const CODE = /(\b[A-Z]{1,4}-\d{2,6}\b)/g;

export const BidiText: React.FC<{ text: string | undefined | null }> = ({ text }) => {
  const value = String(text ?? '');
  const parts = value.split(CODE);
  if (parts.length === 1) return <>{value}</>;
  return <>{parts.map((part, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{part}</bdi> : part))}</>;
};

/** Plain-string counterpart (alerts, dialog bodies): isolates each code with LRI…PDI. */
export function isolateCodes(text: string): string {
  return text.replace(CODE, '⁦$1⁩');
}
