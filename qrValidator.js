export const QR_EXPIRY_MINUTES = 5;
const QR_PREFIX = 'BIN_';

export const parseAndValidateQR = (qrId) => {
    if (!qrId || typeof qrId !== 'string' || !qrId.startsWith(QR_PREFIX)) {
        return { valid: false, message: 'Invalid format. Must start with BIN_.' };
    }

    const parts = qrId.slice(QR_PREFIX.length).split('_');
    if (parts.length < 3) {
        return { valid: false, message: 'Incomplete QR data structure.' };
    }

    const binId = parts[0];
    const timestamp = parseInt(parts[1], 10);
    const uniqueId = parts.slice(2).join('_');

    if (isNaN(timestamp)) {
        return { valid: false, message: 'Invalid timestamp in QR.' };
    }

    // Expiry check (5 minutes)
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = nowSeconds - timestamp;

    if (ageSeconds > QR_EXPIRY_MINUTES * 60) {
        return { valid: false, message: 'QR code has expired (valid for 5 mins).' };
    }

    return { valid: true, data: { binId, timestamp, uniqueId } };
};