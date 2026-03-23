import React, { useMemo } from 'react';

interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

const rules: Rule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Number', test: (pw) => /\d/.test(pw) },
  { label: 'Special character (!@#$…)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
const strengthColors = ['#d1d5db', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#16a34a'];

interface PasswordStrengthProps {
  password: string;
}

const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
  const passed = useMemo(() => rules.map((r) => r.test(password)), [password]);
  const score = passed.filter(Boolean).length;

  if (!password) return null;

  const color = strengthColors[score];
  const label = strengthLabels[score];

  return (
    <div style={styles.container} aria-live="polite">
      <div style={styles.barTrack}>
        {rules.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.barSegment,
              backgroundColor: i < score ? color : '#e5e7eb',
            }}
          />
        ))}
      </div>
      <span style={{ ...styles.label, color }}>{label}</span>
      <ul style={styles.ruleList}>
        {rules.map((rule, i) => (
          <li key={i} style={{ ...styles.ruleItem, color: passed[i] ? '#16a34a' : '#9ca3af' }}>
            {passed[i] ? '✓' : '○'} {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  barTrack: { display: 'flex', gap: 3, height: 5, borderRadius: 3 },
  barSegment: { flex: 1, borderRadius: 3, transition: 'background-color 0.2s' },
  label: { fontSize: '0.75rem', fontWeight: 600 },
  ruleList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  ruleItem: { fontSize: '0.75rem', transition: 'color 0.2s' },
};

export default PasswordStrength;
