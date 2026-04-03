import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quagga from '@ericblade/quagga2';
import { lookupBarcode } from '../api/inventory';

export interface BarcodeLookupResult {
  barcode: string;
  found: boolean;
  product?: {
    name: string;
    brand?: string;
    category?: string;
  };
}

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeDetected: (result: BarcodeLookupResult) => void;
}

const SCAN_TIMEOUT_SECONDS = 30;

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ isOpen, onClose, onBarcodeDetected }) => {
  const [scanning, setScanning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SCAN_TIMEOUT_SECONDS);
  const [error, setError] = useState<'permission-denied' | 'camera-unavailable' | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quaggaRunningRef = useRef(false);
  const detectedRef = useRef(false);

  const stopQuagga = useCallback(() => {
    if (quaggaRunningRef.current) {
      Quagga.offDetected();
      Quagga.stop();
      quaggaRunningRef.current = false;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startScanning = useCallback(() => {
    if (!videoContainerRef.current) return;

    setScanning(true);
    setTimedOut(false);
    setTimeLeft(SCAN_TIMEOUT_SECONDS);
    setError(null);
    detectedRef.current = false;

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: videoContainerRef.current,
          constraints: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        },
        decoder: {
          readers: ['ean_reader', 'upc_reader'],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          const errorName = (err as { name?: string }).name || '';
          if (errorName === 'NotAllowedError') {
            setError('permission-denied');
          } else {
            setError('camera-unavailable');
          }
          setScanning(false);
          return;
        }

        quaggaRunningRef.current = true;
        Quagga.start();

        // Start countdown timer
        let remaining = SCAN_TIMEOUT_SECONDS;
        timerRef.current = setInterval(() => {
          remaining -= 1;
          setTimeLeft(remaining);
          if (remaining <= 0) {
            stopQuagga();
            setScanning(false);
            setTimedOut(true);
          }
        }, 1000);
      },
    );

    Quagga.onDetected(async (result) => {
      if (detectedRef.current) return;
      const code = result?.codeResult?.code;
      if (!code) return;

      detectedRef.current = true;
      stopQuagga();
      setScanning(false);
      setLookingUp(true);

      try {
        const lookupResult = await lookupBarcode(code);
        onBarcodeDetected({
          barcode: code,
          found: lookupResult.found,
          product: lookupResult.product,
        });
      } catch {
        onBarcodeDetected({
          barcode: code,
          found: false,
        });
      } finally {
        setLookingUp(false);
      }
    });
  }, [stopQuagga, onBarcodeDetected]);

  // Start scanning when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTimedOut(false);
      setManualBarcode('');
      setLookingUp(false);
      detectedRef.current = false;
      // Delay to allow the DOM to render the video container
      const timeout = setTimeout(() => startScanning(), 100);
      return () => clearTimeout(timeout);
    } else {
      stopQuagga();
      setScanning(false);
    }
  }, [isOpen, startScanning, stopQuagga]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopQuagga();
    };
  }, [stopQuagga]);

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    startScanning();
  }, [startScanning]);

  const handleManualEntry = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleManualLookup = useCallback(async () => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;

    setLookingUp(true);
    try {
      const lookupResult = await lookupBarcode(trimmed);
      onBarcodeDetected({
        barcode: trimmed,
        found: lookupResult.found,
        product: lookupResult.product,
      });
    } catch {
      onBarcodeDetected({
        barcode: trimmed,
        found: false,
      });
    } finally {
      setLookingUp(false);
    }
  }, [manualBarcode, onBarcodeDetected]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose} data-testid="barcode-scanner-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 id="barcode-scanner-title" style={styles.title}>
            Scan Barcode
          </h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close barcode scanner"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Looking up state */}
        {lookingUp && (
          <div style={styles.statusMessage}>Looking up barcode…</div>
        )}

        {/* Permission denied */}
        {error === 'permission-denied' && (
          <div style={styles.errorContent} data-testid="permission-denied">
            <div style={styles.errorIcon}>📷</div>
            <p style={styles.errorText}>Camera permission was denied.</p>
            <p style={styles.instructionText}>
              To enable camera access, go to your browser settings and allow camera permissions for
              this site. Then reload the page and try again.
            </p>
            <button onClick={onClose} style={styles.primaryButton} type="button">
              Close
            </button>
          </div>
        )}

        {/* Camera unavailable — manual fallback */}
        {error === 'camera-unavailable' && (
          <div style={styles.errorContent} data-testid="camera-unavailable">
            <div style={styles.errorIcon}>📷</div>
            <p style={styles.errorText}>Camera is not available on this device.</p>
            <p style={styles.instructionText}>
              You can enter a barcode manually below.
            </p>
            <div style={styles.manualInputGroup}>
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Enter barcode number"
                style={styles.input}
                aria-label="Manual barcode entry"
                data-testid="manual-barcode-input"
              />
              <button
                onClick={handleManualLookup}
                style={styles.primaryButton}
                disabled={!manualBarcode.trim() || lookingUp}
                type="button"
                data-testid="manual-lookup-button"
              >
                {lookingUp ? 'Looking up…' : 'Look Up'}
              </button>
            </div>
          </div>
        )}

        {/* Timeout prompt */}
        {timedOut && !error && (
          <div style={styles.errorContent} data-testid="timeout-prompt">
            <div style={styles.errorIcon}>⏱️</div>
            <p style={styles.errorText}>No barcode detected within 30 seconds.</p>
            <div style={styles.buttonGroup}>
              <button
                onClick={handleRetry}
                style={styles.primaryButton}
                type="button"
                data-testid="retry-button"
              >
                Retry
              </button>
              <button
                onClick={handleManualEntry}
                style={styles.secondaryButton}
                type="button"
                data-testid="manual-entry-button"
              >
                Enter Manually
              </button>
            </div>
          </div>
        )}

        {/* Scanning view */}
        {!error && !timedOut && !lookingUp && (
          <>
            <div style={styles.videoWrapper}>
              <div
                ref={videoContainerRef}
                style={styles.videoContainer}
                data-testid="video-container"
              />
              {scanning && <div style={styles.scanRegion} data-testid="scan-region" />}
            </div>
            {scanning && (
              <div style={styles.timerContainer} data-testid="countdown-timer">
                <span style={styles.timerText}>{timeLeft}s remaining</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;


const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '1.25rem',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#374151',
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
    aspectRatio: '4 / 3',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
  },
  scanRegion: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    width: '80%',
    height: '50%',
    border: '2px solid #16a34a',
    borderRadius: 8,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  timerContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '0.75rem',
  },
  timerText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
  },
  statusMessage: {
    textAlign: 'center',
    padding: '2rem 1rem',
    fontSize: '1rem',
    color: '#6b7280',
  },
  errorContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1.5rem 0.5rem',
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: '2.5rem',
  },
  errorText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    margin: 0,
  },
  instructionText: {
    fontSize: '0.875rem',
    color: '#6b7280',
    margin: 0,
    lineHeight: 1.5,
  },
  manualInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%',
    marginTop: '0.5rem',
  },
  input: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  buttonGroup: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  primaryButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  secondaryButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
