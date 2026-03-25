# Implementation Plan: Foundation & Authentication (Stage 0 + Stage 1)

## Overview

Deployable shell with working authentication and stubbed module navigation. Covers environment setup, CDK infrastructure, Cognito auth, React PWA shell, and responsive layout.

- [x] 1. Set up project structure and AWS CDK infrastructure
  - [x] 1.1 Initialize project with monorepo structure (infrastructure/, backend/, frontend/)
    - Create package.json with workspaces configuration
    - Set up TypeScript configuration for each workspace
    - Configure ESLint and Prettier

  - [x] 1.2 Set up AWS CDK infrastructure stack with core resources
    - Create CDK app with DynamoDB single-table design (PantryApp table with GSI1)
    - Configure S3 bucket for receipts, inventory item pictures, and exports
    - Set up Cognito User Pool with email authentication
    - Create API Gateway REST API with Cognito authorizer
    - Configure CloudFront distribution (using default CloudFront URL initially)

  - [ ]* 1.3 Write unit tests for CDK infrastructure constructs
    - Test DynamoDB table configuration and GSI
    - Test S3 bucket policies and CORS
    - Test API Gateway routes and authorizer

- [x] 2. Implement authentication Lambda and Cognito integration
  - [x] 2.1 Create Auth Lambda for token verification
    - Implement POST /auth/verify endpoint
    - Return userId, email, and validation status

  - [ ]* 2.2 Write property tests for authentication
    - **Property 23: Authentication Scope Isolation**
    - **Property 24: Unauthenticated Access Denial**
    - **Property 25: Authentication Failure Error Display**

- [x] 3. Set up React PWA frontend shell
  - [x] 3.1 Initialize React PWA with service worker placeholder
    - Create React app with TypeScript
    - Configure PWA manifest for installability
    - Set up basic service worker (caching static assets only)

  - [x] 3.2 Implement responsive layout with stubbed navigation
    - Create responsive shell with mobile-first design (320px to 1920px)
    - Implement touch-friendly navigation with 44x44px minimum tap targets
    - Create placeholder pages for: Inventory, Recipes, Meal Plan, Shopping List
    - Add online/offline status indicator (placeholder)

  - [x] 3.3 Implement authentication UI
    - Create AuthProvider React context for auth state
    - Create LoginForm with email/password
    - Create SignupForm for registration
    - Implement TokenManager for JWT refresh and storage
    - Display authentication error messages

  - [x] 3.4 Implement dynamic password strength checker
    - Create PasswordStrength component with five rules: min 8 chars, uppercase, lowercase, number, special character
    - Display visual strength bar with five color-coded segments (red → green gradient)
    - Show strength label: Weak, Fair, Good, Strong, Very strong
    - Display checklist with pass/fail indicators (✓/○) for each rule
    - Use aria-live="polite" for screen reader accessibility
    - Integrate into SignupForm below the password input

- [x] 4. Deploy and verify authentication flow works end-to-end
