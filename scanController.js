import { QR_EXPIRY_MINUTES, parseAndValidateQR } from './qrValidator.js';
import RegisteredQR from './RegisteredQR.js';
import UsedQR from './UsedQR.js';
import User from './User.js';

const MATERIAL_PROFILES = [
  { type: 'PET', points: 15, servoAngle: 20, keywords: ['pet', 'bottle', 'clear'] },
  { type: 'HDPE', points: 12, servoAngle: 70, keywords: ['hdpe', 'milk', 'detergent'] },
  { type: 'ALUMINUM', points: 18, servoAngle: 120, keywords: ['can', 'metal', 'aluminum'] },
  { type: 'MIXED', points: 8, servoAngle: 160, keywords: ['mixed', 'unknown', 'blur'] }
];

const normalize = (value = '') => value.toString().toLowerCase();

const hashString = (value = '') => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const inferMaterial = ({ qrId, imageData }) => {
  const normalizedImage = normalize(imageData);
  const keywordMatch = MATERIAL_PROFILES.find((profile) =>
    profile.keywords.some((keyword) => normalizedImage.includes(keyword))
  );

  if (keywordMatch) {
    return keywordMatch;
  }

  const index = hashString(`${qrId}:${normalizedImage}`) % MATERIAL_PROFILES.length;
  return MATERIAL_PROFILES[index];
};

const buildDisplayText = (type, points) => `${type} detected | +${points} pts`;

export const handleRegisterQR = async (req, res) => {
  try {
    const { qrId } = req.body;

    if (!qrId) {
      return res.status(400).json({ success: false, message: 'Missing qrId.' });
    }

    const validation = parseAndValidateQR(qrId);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { binId, timestamp, uniqueId } = validation.data;
    const expiresAt = new Date((timestamp + QR_EXPIRY_MINUTES * 60) * 1000);

    const registered = await RegisteredQR.findOneAndUpdate(
      { qrId },
      { qrId, binId, timestamp, uniqueId, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      qrId: registered.qrId,
      binId: registered.binId,
      expiresAt: registered.expiresAt,
      message: 'QR registered with cloud.'
    });
  } catch (error) {
    console.error('[REGISTER QR ERROR]', error);
    return res.status(500).json({ success: false, message: 'Failed to register QR.' });
  }
};

export const handleScan = async (req, res) => {
  try {
    const { qrId, userId, sensor = false, imageData = '' } = req.body;

    if (!qrId) {
      return res.status(400).json({ success: false, message: 'Missing qrId.' });
    }

    const validation = parseAndValidateQR(qrId);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const registeredQR = await RegisteredQR.findOne({ qrId });
    if (!registeredQR) {
      return res.status(404).json({
        success: false,
        message: 'QR not registered with cloud. Call /registerQR first.'
      });
    }

    const existingScan = await UsedQR.findOne({ qrId });
    if (existingScan) {
      return res.status(409).json({ success: false, message: 'This QR code has already been used.' });
    }

    const material = inferMaterial({ qrId, imageData });
    const scanRecord = await UsedQR.create({
      qrId,
      binId: validation.data.binId,
      sensor: Boolean(sensor),
      imageData,
      type: material.type,
      points: material.points,
      userId
    });

    let userStats = null;
    if (userId) {
      const updatedUser = await User.findOneAndUpdate(
        { email: userId },
        { $inc: { points: material.points, totalScans: 1 } },
        { upsert: true, new: true }
      );

      userStats = {
        currentPoints: updatedUser.points,
        totalScans: updatedUser.totalScans
      };
    }

    console.log(
      `[SCAN SUCCESS] Bin: ${validation.data.binId} | Type: ${material.type} | Points: ${material.points} | Sensor: ${sensor}`
    );

    return res.json({
      success: true,
      type: material.type,
      points: material.points,
      message: 'Recycled successfully',
      action: {
        servoAngle: material.servoAngle,
        displayText: buildDisplayText(material.type, material.points)
      },
      qr: {
        qrId: scanRecord.qrId,
        binId: scanRecord.binId
      },
      userStats
    });
  } catch (error) {
    console.error('[SCAN ERROR]', error);
    return res.status(500).json({ success: false, message: 'Failed to process scan.' });
  }
};
