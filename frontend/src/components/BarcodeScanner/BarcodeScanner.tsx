import { t, useLanguage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quagga from '@ericblade/quagga2';
import { lookupBarcode } from '../../api/inventory/inventory';

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
  useLanguage();
  const [scanning, setScanning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SCAN_TIMEOUT_SECONDS);
  const [error, setError] = useState<'permission-denied' | 'camera-unavailable' | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [scanAttempt, setScanAttempt] = useState(0);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quaggaRunningRef = useRef(false);
  const detectedRef = useRef(false);
  const sessionRef = useRef(0);
  const onDetectedRef = useRef(onBarcodeDetected);
  onDetectedRef.current = onBarcodeDetected;

  const stopQuagga = useCallback(() => {
    sessionRef.current += 1;
    Quagga.offDetected();
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

  const startScanning = useCallback(async () => {
    if (!videoContainerRef.current) return;

    stopQuagga();
    const session = sessionRef.current;

    setScanning(true);
    setTimedOut(false);
    setTimeLeft(SCAN_TIMEOUT_SECONDS);
    setError(null);
    detectedRef.current = false;

    let deviceId: string | undefined;
    try {
      // Permission unlocks device labels. Release this temporary stream before
      // Quagga opens the selected physical camera, avoiding two competing streams.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      const track = stream.getVideoTracks()[0];
      deviceId = track?.getSettings().deviceId;
      stream.getTracks().forEach((entry) => entry.stop());
      if (session !== sessionRef.current) return;
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'videoinput',
      );
      const macro = cameras.find((camera) => /macro/i.test(camera.label));
      const rear = cameras.find(
        (camera) => /back|rear|environment/i.test(camera.label) && !/wide|tele/i.test(camera.label),
      );
      deviceId = macro?.deviceId || rear?.deviceId || deviceId;
    } catch (err) {
      if (session !== sessionRef.current) return;
      setError(
        (err as { name?: string }).name === 'NotAllowedError'
          ? 'permission-denied'
          : 'camera-unavailable',
      );
      setScanning(false);
      return;
    }
    if (session !== sessionRef.current || !videoContainerRef.current) return;

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: videoContainerRef.current,
          constraints: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader'],
        },
        locate: true,
      },
      (err) => {
        if (session !== sessionRef.current) {
          Quagga.stop();
          return;
        }
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
      if (session !== sessionRef.current) return;
      if (detectedRef.current) return;
      const code = result?.codeResult?.code;
      if (!code) return;

      detectedRef.current = true;
      stopQuagga();
      const lookupSession = sessionRef.current;
      setScanning(false);
      setLookingUp(true);

      try {
        const lookupResult = await lookupBarcode(code);
        if (lookupSession !== sessionRef.current) return;
        onDetectedRef.current({
          barcode: code,
          found: lookupResult.found,
          product: lookupResult.product,
        });
      } catch {
        if (lookupSession !== sessionRef.current) return;
        onDetectedRef.current({
          barcode: code,
          found: false,
        });
      } finally {
        if (lookupSession === sessionRef.current) setLookingUp(false);
      }
    });
  }, [stopQuagga]);

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
      return () => {
        clearTimeout(timeout);
        stopQuagga();
      };
    } else {
      stopQuagga();
      setScanning(false);
    }
  }, [isOpen, startScanning, stopQuagga, scanAttempt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopQuagga();
    };
  }, [stopQuagga]);

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    setScanAttempt((attempt) => attempt + 1);
  }, []);

  const handleManualEntry = useCallback(() => {
    stopQuagga();
    onDetectedRef.current({ barcode: '', found: false });
  }, [stopQuagga]);

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
            {t('Scan Barcode')}{' '}
          </h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label={t('Close barcode scanner')}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Looking up state */}
        {lookingUp && <div style={styles.statusMessage}>{t('Looking up barcode…')}</div>}

        {/* Permission denied */}
        {error === 'permission-denied' && (
          <div style={styles.errorContent} data-testid="permission-denied">
            <div style={styles.errorIcon}>📷</div>
            <p style={styles.errorText}>{t('Camera permission was denied.')}</p>
            <p style={styles.instructionText}>
              {t(
                'To enable camera access, go to your browser settings and allow camera permissions for this site. Then reload the page and try again.',
              )}{' '}
            </p>
            <button onClick={onClose} style={styles.primaryButton} type="button">
              {t('Close')}{' '}
            </button>
          </div>
        )}

        {/* Camera unavailable — manual fallback */}
        {(error === 'camera-unavailable' || error === 'permission-denied') && (
          <div style={styles.errorContent} data-testid="camera-unavailable">
            <div style={styles.errorIcon}>📷</div>
            {error === 'camera-unavailable' && (
              <p style={styles.errorText}>{t('Camera is not available on this device.')}</p>
            )}
            <p style={styles.instructionText}>{t('You can enter a barcode manually below.')}</p>
            <div style={styles.manualInputGroup}>
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder={t('Enter barcode number')}
                style={styles.input}
                aria-label={t('Manual barcode entry')}
                data-testid="manual-barcode-input"
              />
              <button
                onClick={handleManualLookup}
                style={styles.primaryButton}
                disabled={!manualBarcode.trim() || lookingUp}
                type="button"
                data-testid="manual-lookup-button"
              >
                {lookingUp ? t('Looking up…') : t('Look Up')}
              </button>
            </div>
          </div>
        )}

        {/* Timeout prompt */}
        {timedOut && !error && (
          <div style={styles.errorContent} data-testid="timeout-prompt">
            <div style={styles.errorIcon}>⏱️</div>
            <p style={styles.errorText}>{t('No barcode detected within 30 seconds.')}</p>
            <div style={styles.buttonGroup}>
              <button
                onClick={handleRetry}
                style={styles.primaryButton}
                type="button"
                data-testid="retry-button"
              >
                {t('Retry')}{' '}
              </button>
              <button
                onClick={handleManualEntry}
                style={styles.secondaryButton}
                type="button"
                data-testid="manual-entry-button"
              >
                {t('Enter Manually')}{' '}
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
                <span style={styles.timerText}>
                  {timeLeft}
                  {t('s remaining')}
                </span>
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
    backgroundColor: 'var(--color-surface)',
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
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    color: 'var(--color-text)',
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'var(--color-text)',
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
    border: '2px solid var(--color-action)',
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
    color: 'var(--color-text)',
  },
  statusMessage: {
    textAlign: 'center',
    padding: '2rem 1rem',
    fontSize: '1rem',
    color: 'var(--color-secondary)',
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
    color: 'var(--color-text)',
    margin: 0,
  },
  instructionText: {
    fontSize: '0.875rem',
    color: 'var(--color-secondary)',
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
    border: '1px solid var(--color-border)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
