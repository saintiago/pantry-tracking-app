import { styles } from './styles';
import Emoji from '../../preferences/Emoji';
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
const REQUIRED_MATCHING_DETECTIONS = 2;
const DETECTION_WINDOW_MS = 1500;

function validBarcodeChecksum(code: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

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
  const candidatesRef = useRef<Map<string, { count: number; firstSeen: number }>>(new Map());
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
    candidatesRef.current.clear();

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
        frequency: 10,
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
      if (!code || !validBarcodeChecksum(code)) return;

      const now = Date.now();
      const current = candidatesRef.current.get(code);
      const next =
        current && now - current.firstSeen <= DETECTION_WINDOW_MS
          ? { count: current.count + 1, firstSeen: current.firstSeen }
          : { count: 1, firstSeen: now };
      candidatesRef.current.set(code, next);
      if (next.count < REQUIRED_MATCHING_DETECTIONS) return;

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
      candidatesRef.current.clear();
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
            <div style={styles.errorIcon}>
              <Emoji>📷</Emoji>
            </div>
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
            <div style={styles.errorIcon}>
              <Emoji>📷</Emoji>
            </div>
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
            <div style={styles.errorIcon}>
              <Emoji>⏱️</Emoji>
            </div>
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
