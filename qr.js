const SCAN_STORAGE_KEY = 'plastinetBinScans';
const QR_PREFIX = 'BIN_';
const MAX_SCAN_HISTORY = 200;

const readStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(SCAN_STORAGE_KEY)) || [];
  } catch (err) {
    console.warn('Failed to parse scanned bins', err);
    return [];
  }
};

const writeStorage = (data) => {
  localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(data.slice(0, MAX_SCAN_HISTORY)));
};

const safeTimestamp = (value) => {
  const floored = Math.floor(Number(value));
  return Number.isNaN(floored) ? null : floored;
};

const generateRandomIdentifier = (length = 5) => {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
};

export const simulateBinQRCode = (binId = '001') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const unique = generateRandomIdentifier(5);
  return `${QR_PREFIX}${binId}_${timestamp}_${unique}`;
};

export const parseBinQRCode = (value) => {
  if (!value || typeof value !== 'string' || !value.startsWith(QR_PREFIX)) return null;
  const trimmed = value.slice(QR_PREFIX.length);
  const parts = trimmed.split('_');
  if (parts.length < 3) return null;
  const binId = parts[0];
  const timestamp = safeTimestamp(parts[1]);
  const uniqueId = parts.slice(2).join('_');
  if (!binId || !timestamp || !uniqueId) return null;
  return {
    binId,
    timestamp,
    uniqueId,
    raw: value
  };
};

export const isExpired = (timestamp, expiryMinutes = 5) => {
  if (!timestamp) return true;
  const ageMs = Date.now() - timestamp * 1000;
  return ageMs > expiryMinutes * 60 * 1000;
};

export const hasScanned = (qrId) => {
  const history = readStorage();
  return history.some((item) => item.id === qrId);
};

export const markScanned = (qrId, binData = {}) => {
  const history = readStorage();
  history.unshift({ id: qrId, recordedAt: Date.now(), ...binData });
  writeStorage(history);
};

export const getScannedHistory = () => readStorage();
