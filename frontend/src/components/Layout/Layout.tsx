import React from 'react';
import OnlineIndicator from '../OnlineIndicator/OnlineIndicator';
import { APP_VERSION } from '../../config';

export type PageId = 'inventory' | 'recipes' | 'meal-plan' | 'shopping-list' | 'add-item' | 'item-detail';

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
}

const Layout: React.FC<LayoutProps> = ({ activePage, onNavigate, children }) => {
  const isInventory = activePage === 'inventory';
  const activeColor = isInventory ? '#d4829a' : '#4a90d9';

  return (
    <div className="layout" style={styles.layout}>
      {/* Header */}
      <header style={{
        ...styles.header,
        backgroundColor: isInventory ? '#fffaf8' : '#ffffff',
        borderBottom: `1px solid ${isInventory ? '#f0ddd5' : '#e5e7eb'}`,
      }}>
        <div style={styles.titleGroup}>
          <h1 style={{
            ...styles.title,
            color: isInventory ? '#4a3f3a' : '#1a1a1a',
          }}>Pantry Tracking App</h1>
          <span style={styles.version}>v{APP_VERSION}</span>
        </div>
        <OnlineIndicator />
      </header>

      {/* Main content */}
      <main style={{
        ...styles.main,
        backgroundColor: isInventory ? '#fdf6f0' : undefined,
      }}>{children}</main>

      {/* Bottom navigation */}
      <nav style={{
        ...styles.nav,
        backgroundColor: isInventory ? '#fffaf8' : '#ffffff',
        borderTop: `1px solid ${isInventory ? '#f0ddd5' : '#e5e7eb'}`,
      }} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...styles.navButton,
                color: isActive ? activeColor : '#6b7280',
                borderTop: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
              }}
            >
              <span style={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span style={styles.navLabel}>{item.label}</span>
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
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    zIndex: 10,
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
    color: '#9ca3af',
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
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
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
};

export default Layout;
