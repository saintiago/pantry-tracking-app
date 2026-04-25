import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext/AuthContext';
import AuthScreen from './auth/AuthScreen/AuthScreen';
import Layout, { PageId } from './components/Layout/Layout';
import InventoryPage from './pages/InventoryPage/InventoryPage';
import AddItemPage from './pages/AddItemPage/AddItemPage';
import ItemDetailPage from './pages/ItemDetailPage/ItemDetailPage';
import RecipesPage from './pages/RecipesPage/RecipesPage';
import MealPlanPage from './pages/MealPlanPage/MealPlanPage';
import ShoppingListPage from './pages/ShoppingListPage/ShoppingListPage';
import type { AddItemData } from './pages/AddItemPage/AddItemPage';
import type { InventoryItem } from './components/InventoryList/InventoryList';
import type { StorageLocation } from './api/locations/locations';

interface AddItemPageState {
  prefillData?: { name?: string; brand?: string; category?: string; barcode?: string };
  locations: StorageLocation[];
  onSubmit: (item: AddItemData) => Promise<{ error?: string }>;
}

interface ItemDetailPageState {
  selectedItem: InventoryItem | null;
  locations: StorageLocation[];
  onItemUpdated: (
    updatedItem: InventoryItem,
    lowStockTransition?: boolean,
    notification?: { type: string; message: string; itemId: string },
  ) => void;
}

const mainPages: Partial<Record<PageId, React.FC>> = {
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
  const [inventoryKey, setInventoryKey] = useState(0);
  const [addItemPageProps, setAddItemPageProps] = useState<AddItemPageState | null>(null);
  const [itemDetailPageProps, setItemDetailPageProps] = useState<ItemDetailPageState | null>(null);

  const handleNavigate = (page: PageId) => {
    // Bump key when navigating back to inventory from another page — forces a fresh data fetch
    if (page === 'inventory' && activePage !== 'inventory' && activePage !== 'add-item' && activePage !== 'item-detail') {
      setInventoryKey((k) => k + 1);
    }
    setActivePage(page);
  };

  const handleNavigateToAddItem = (
    locations: StorageLocation[],
    onSubmit: (item: AddItemData) => Promise<{ error?: string }>,
    prefillData?: AddItemPageState['prefillData'],
  ) => {
    setAddItemPageProps({ prefillData, locations, onSubmit });
    setActivePage('add-item');
  };

  const handleNavigateToItemDetail = (
    selectedItem: InventoryItem,
    locations: StorageLocation[],
    onItemUpdated: ItemDetailPageState['onItemUpdated'],
  ) => {
    setItemDetailPageProps({ selectedItem, locations, onItemUpdated });
    setActivePage('item-detail');
  };

  const renderPage = () => {
    if (activePage === 'add-item' && addItemPageProps) {
      return (
        <AddItemPage
          onBack={() => {
            setActivePage('inventory');
            setAddItemPageProps(null);
          }}
          onSubmit={addItemPageProps.onSubmit}
          locations={addItemPageProps.locations}
          prefillData={addItemPageProps.prefillData}
        />
      );
    }
    if (activePage === 'item-detail' && itemDetailPageProps && itemDetailPageProps.selectedItem) {
      return (
        <ItemDetailPage
          item={itemDetailPageProps.selectedItem}
          locations={itemDetailPageProps.locations}
          onBack={() => {
            setActivePage('inventory');
            setItemDetailPageProps(null);
          }}
          onItemUpdated={itemDetailPageProps.onItemUpdated}
        />
      );
    }
    if (activePage === 'inventory' || activePage === 'add-item' || activePage === 'item-detail') {
      return (
        <InventoryPage
          key={inventoryKey}
          onNavigate={handleNavigate}
          onNavigateToAddItem={handleNavigateToAddItem}
          onNavigateToItemDetail={handleNavigateToItemDetail}
        />
      );
    }
    const ActiveComponent = mainPages[activePage];
    if (!ActiveComponent) return null;
    return <ActiveComponent />;
  };

  return (
    <Layout activePage={activePage} onNavigate={handleNavigate}>
      {renderPage()}
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
