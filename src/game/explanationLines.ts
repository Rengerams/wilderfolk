/** Shape of one read-only inspector explanation row. No gameplay rules or state. */
export interface ExplanationLine {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'neutral';
}
