import React from 'react';
import OnlineIndicator from '../OnlineIndicator/OnlineIndicator';

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
  return (
    <div className="layout" style={styles.layout}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Pantry Tracking App</h1>
        <OnlineIndicator />
      </header>

      {/* Main content */}
      <main style={styles.main}>{children}</main>

      {/* Bottom navigation */}
      <nav style={styles.nav} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...styles.navButton,
                color: isActive ? '#4a90d9' : '#6b7280',
                borderTop: isActive ? '2px solid #4a90d9' : '2px solid transparent',
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
