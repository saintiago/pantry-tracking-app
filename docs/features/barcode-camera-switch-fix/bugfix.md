# Bugfix Requirements Document

## Introduction

On multi-camera mobile phones, the barcode scanner breaks when the user moves their phone close to a barcode. The OS/browser automatically switches between rear cameras at close focal distances, causing the video stream to change mid-scan, the barcode to jump out of the scanning frame, and detection to fail. The fix must select the best available camera for close-up barcode scanning at initialization — preferring a dedicated macro camera if one is available, falling back to the main rear camera otherwise — and lock to that camera for the entire scanning session.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user holds their phone close to a barcode on a multi-camera device THEN the system switches to a different rear camera mid-scan, causing the video stream to change and the barcode to leave the scanning frame

1.2 WHEN the camera switches mid-scan THEN the system fails to detect the barcode and the scanning session continues without result until timeout

1.3 WHEN a dedicated macro camera is available on the device THEN the system does not select it, missing the optimal lens for close-up barcode scanning

### Expected Behavior (Correct)

2.1 WHEN the barcode scanner is initialized and a dedicated macro camera is available THEN the system SHALL lock to the macro camera for the duration of the scanning session

2.2 WHEN the barcode scanner is initialized and no dedicated macro camera is available THEN the system SHALL lock to the main rear-facing camera for the duration of the scanning session

2.3 WHEN the camera is locked (macro or main rear) THEN the system SHALL prevent automatic camera switching mid-scan, keeping the barcode within the scanning frame

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user opens the barcode scanner on a single-camera device THEN the system SHALL CONTINUE TO access the rear camera and display a live preview normally

3.2 WHEN the user scans a barcode at a normal distance THEN the system SHALL CONTINUE TO detect and decode the barcode successfully

3.3 WHEN camera permission is denied THEN the system SHALL CONTINUE TO display the permission-denied error state

3.4 WHEN the device camera is unavailable THEN the system SHALL CONTINUE TO display the camera-unavailable error state with manual entry fallback

3.5 WHEN no barcode is detected within 30 seconds THEN the system SHALL CONTINUE TO show the timeout prompt with retry and manual entry options
