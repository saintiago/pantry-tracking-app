import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthScreen from './auth/AuthScreen';
import Layout, { PageId } from './components/Layout';
import InventoryPage from './pages/InventoryPage';
import RecipesPage from './pages/RecipesPage';
import MealPlanPage from './pages/MealPlanPage';
import ShoppingListPage from './pages/ShoppingListPage';

const pages: Record<PageId, React.FC> = {
  inventory: InventoryPage,
  recipes: RecipesPage,
  'meal-plan': MealPlanPage,
  'shopping-list': ShoppingListPage,
};

const LoadingSpinner: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '1rem',
      backgroundColor: '#f5f5f5',
    }}
    role="status"
    aria-label="Loading"
  >
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
      maxWidth: 440,
      padding: '2rem 1.5rem',
      backgroundColor: '#ffffff',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>
        🥫 Pantry Tracker
      </h1>
      <div
        style={{
          width: 40,
          height: 40,
          border: '4px solid #e5e7eb',
          borderTopColor: '#4a90d9',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </div>
);

const AuthenticatedApp: React.FC = () => {
  const [activePage, setActivePage] = useState<PageId>('inventory');
  const ActiveComponent = pages[activePage];

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      <ActiveComponent />
    </Layout>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  React.useEffect(() => {
    if (!isLoading && !initialCheckDone) {
      setInitialCheckDone(true);
    }
  }, [isLoading, initialCheckDone]);

  // Only show spinner during the initial session check on mount
  if (!initialCheckDone && isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return <AuthenticatedApp />;
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
