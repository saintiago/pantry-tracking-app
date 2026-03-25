# Implementation Plan: Offline Sync (Stage 7)

## Overview

Full offline functionality with automatic sync. Covers Sync Lambda, IndexedDB schema, SyncManager/SyncQueue, and updating all modules for offline support.

- [ ] 1. Implement Sync Lambda
  - [ ] 1.1 Create Sync Lambda with batch operations
    - Implement POST /sync for batch sync operations
    - Handle create, update, delete operations for all entity types (inventoryItem, recipe, mealPlan, storageLocation)
    - Implement last-write-wins conflict resolution using timestamps
    - Return applied operations, conflicts, and server timestamp

  - [ ]* 1.2 Write property test for conflict resolution
    - **Property 22: Conflict Resolution Last-Write-Wins**

- [ ] 2. Implement frontend offline sync module
  - [ ] 2.1 Set up IndexedDB schema
    - Configure IndexedDB stores (inventoryItems, recipes, mealPlans, storageLocations, syncQueue, metadata)
    - Set up indexes for efficient querying

  - [ ] 2.2 Create SyncManager and SyncQueue components
    - Implement SyncManager for coordinating offline/online sync
    - Create SyncQueue for managing pending operations
    - Implement ConflictResolver with last-write-wins strategy
    - Handle storageLocation entity type in sync operations
    - Update OnlineIndicator to show sync status and pending count

  - [ ] 2.3 Update all modules to use IndexedDB for offline support
    - Modify API client to save to IndexedDB first, then sync
    - Add retry logic with exponential backoff for network errors (1s, 2s, 4s, 8s, max 30s)
    - Queue operations when offline

  - [ ]* 2.4 Write property tests for offline operations
    - **Property 19: Offline CRUD Operations**
    - **Property 20: Sync Queue Persistence**
    - **Property 21: Sync on Reconnection**

- [ ] 3. Deploy and verify offline functionality works
