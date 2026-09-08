import React from 'react';
import { usePreferences } from './store';
export default function Emoji({
  children,
  fallback = '',
}: {
  children: React.ReactNode;
  fallback?: string;
}) {
  const { appearance } = usePreferences();
  return (
    <span aria-hidden="true" data-app-emoji>
      {appearance === 'minimal' ? fallback : children}
    </span>
  );
}
