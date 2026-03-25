# Implementation Plan: Optional Features (Stage 8 + Stage 9)

## Overview

Enhanced features for power users and custom domain setup. All tasks are optional.

- [ ]* 1. (Optional) Implement Amazon web store integration
  - [ ]* 1.1 Add Amazon cart link generation for low-stock items
    - Display order option on low-stock items view
    - Generate Amazon shopping cart link with selected items
    - Add marketplace configuration setting

  - [ ]* 1.2 Write property test for Amazon cart link generation
    - **Optional Property 27: Amazon Cart Link Generation**

- [ ]* 2. (Optional) Implement push notification system
  - [ ]* 2.1 Add SNS/SES notification infrastructure
    - Create SNS topic for push notifications
    - Configure SES for email notifications
    - Add notification preference settings (email, push, frequency: immediate/daily/weekly)
    - Trigger push notifications on low-stock threshold events

  - [ ]* 2.2 Write property test for push notification trigger
    - **Optional Property 28: Push Notification Trigger**

- [ ]* 3. (Optional) Implement web recipe import
  - [ ]* 3.1 Add recipe URL import functionality
    - Create recipe URL input and parser
    - Extract recipe name, ingredients, and instructions from supported sites
    - Display extracted recipe for review before saving
    - Handle extraction failures with manual entry fallback

  - [ ]* 3.2 Write property test for recipe URL extraction
    - **Optional Property 29: Recipe URL Extraction**

- [ ]* 4. (Optional) Configure custom domain with Route53
  - [ ]* 4.1 Register domain and set up Route53 hosted zone
    - Register domain via Route53 console (manual step)
    - Create hosted zone in CDK (or import existing)
    - Request SSL certificate via ACM with DNS validation

  - [ ]* 4.2 Update CloudFront distribution with custom domain
    - Add custom domain as alternate domain name (CNAME)
    - Attach ACM certificate to CloudFront
    - Create Route53 A/AAAA alias records pointing to CloudFront
    - Update Cognito callback URLs for custom domain

- [ ]* 5. Deploy and verify optional features
