import { t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import LanguageSwitcher from '../LanguageSwitcher/LanguageSwitcher';
import OnlineIndicator from '../OnlineIndicator/OnlineIndicator';
import { APP_VERSION } from '../../config';

export type PageId =
  | 'inventory'
  | 'recipes'
  | 'meal-plan'
  | 'shopping-list'
  | 'purchase'
  | 'shopping-edit'
  | 'add-item'
  | 'item-detail'
  | 'cooking';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'recipes', label: 'Recipes', icon: '📖' },
  { id: 'meal-plan', label: 'Meal Plan', icon: '📅' },
  { id: 'shopping-list', label: 'Shopping List', icon: '🛒' },
];

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
  cookingSession?: { recipeName: string } | null;
  onReturnToCooking?: () => void;
}

const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  children,
  cookingSession,
  onReturnToCooking,
}) => {
  useLanguage();
  const isInventory = activePage === 'inventory';
  const isCooking = activePage === 'cooking';
  const activeColor = 'var(--color-action)';
  const showCookingBanner = cookingSession != null && activePage !== 'cooking';

  return (
    <div className="layout" style={styles.layout}>
      {/* Header */}
      <header
        style={{
          ...styles.header,
          backgroundColor: 'var(--color-surface)',
          borderBottom: `1px solid ${'var(--color-border)'}`,
        }}
      >
        <div style={styles.titleGroup}>
          <h1
            style={{
              ...styles.title,
              color: 'var(--color-text)',
            }}
          >
            {t('Pantry Tracking App')}{' '}
          </h1>
          <span style={styles.version}>v{APP_VERSION}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <OnlineIndicator />
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main content */}
      <main
        style={{
          ...styles.main,
          backgroundColor: isInventory ? 'var(--color-canvas)' : undefined,
          paddingBottom: showCookingBanner ? '6.75rem' : '5rem',
          ...(isCooking ? { overflow: 'hidden', position: 'relative', padding: 0 } : {}),
        }}
      >
        {children}
      </main>

      {/* Return to Cooking banner */}
      {showCookingBanner && (
        <div style={styles.cookingBanner} data-testid="return-to-cooking-banner">
          <div style={styles.cookingBannerInner}>
            <span style={styles.cookingBannerIcon} aria-hidden="true">
              🍳
            </span>
            <span style={styles.cookingBannerText}>
              {t('Cooking: “')}
              {cookingSession!.recipeName}&rdquo;
            </span>
          </div>
          <button
            type="button"
            onClick={onReturnToCooking}
            style={styles.cookingBannerButton}
            aria-label={t('Return to cooking')}
          >
            {t('Return to Cooking')}{' '}
          </button>
        </div>
      )}

      {/* Bottom navigation */}
      <nav
        style={{
          ...styles.nav,
          backgroundColor: 'var(--color-surface)',
          borderTop: `1px solid ${'var(--color-border)'}`,
        }}
        aria-label={t('Main navigation')}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...styles.navButton,
                color: isActive ? activeColor : 'var(--color-secondary)',
                backgroundColor: isActive ? 'var(--color-mint)' : 'var(--color-surface)',
                borderTop: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
              }}
            >
              <span style={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span style={styles.navLabel}>{t(item.label)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    maxWidth: 1920,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: '1.125rem',
    fontWeight: 700,
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.4rem',
  },
  version: {
    fontSize: '0.6875rem',
    color: 'var(--color-secondary)',
    fontWeight: 400,
  },
  main: {
    flex: 1,
    padding: '1rem',
    paddingBottom: '5rem', // space for bottom nav
    overflowY: 'auto',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    zIndex: 10,
    maxWidth: 1920,
    margin: '0 auto',
  },
  navButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 56,
    minWidth: 44,
    padding: '6px 4px',
    background: 'none',
    border: 'none',
    transition: 'color 0.15s',
  },
  navIcon: {
    fontSize: '1.25rem',
    lineHeight: 1,
  },
  navLabel: {
    fontSize: '0.6875rem',
    marginTop: 2,
  },
  cookingBanner: {
    position: 'fixed',
    bottom: 56, // sits right above the bottom nav
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--color-mint)',
    borderTop: '1px solid var(--color-mint)',
    borderBottom: '1px solid var(--color-mint)',
    zIndex: 9,
    maxWidth: 1920,
    margin: '0 auto',
    minHeight: 48,
    boxSizing: 'border-box',
  },
  cookingBannerInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
    flex: 1,
  },
  cookingBannerIcon: {
    fontSize: '1.25rem',
    flexShrink: 0,
  },
  cookingBannerText: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-action)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cookingBannerButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: '0.5rem',
  },
};

export default Layout;
