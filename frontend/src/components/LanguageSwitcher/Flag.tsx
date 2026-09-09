import React from 'react';
import type { Language } from '../../i18n/i18n';

/** SVG flags also render on Windows, where flag emoji may appear as country letters. */
export default function Flag({ language }: { language: Language }) {
  return (
    <svg
      className="language-flag"
      aria-hidden="true"
      focusable="false"
      width="24"
      height="16"
      viewBox="0 0 60 40"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 2,
        boxShadow: '0 0 0 1px #0002',
      }}
    >
      {language === 'it' ? (
        <>
          <path fill="#009246" d="M0 0h20v40H0z" />
          <path fill="#fff" d="M20 0h20v40H20z" />
          <path fill="#ce2b37" d="M40 0h20v40H40z" />
        </>
      ) : language === 'es' ? (
        <>
          <path fill="#aa151b" d="M0 0h60v40H0z" />
          <path fill="#f1bf00" d="M0 10h60v20H0z" />
        </>
      ) : (
        <>
          <path fill="#012169" d="M0 0h60v40H0z" />
          <path stroke="#fff" strokeWidth="8" d="m0 0 60 40M60 0 0 40" />
          <path stroke="#c8102e" strokeWidth="3" d="m0 0 60 40M60 0 0 40" />
          <path stroke="#fff" strokeWidth="13" d="M30 0v40M0 20h60" />
          <path stroke="#c8102e" strokeWidth="7" d="M30 0v40M0 20h60" />
        </>
      )}
    </svg>
  );
}
