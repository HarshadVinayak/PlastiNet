import mongoose from 'mongoose';

const usedQRSchema = new mongoose.Schema({
    qrId: { type: String, required: true, unique: true },
    binId: { type: String },
    sensor: { type: Boolean, default: false },
    imageData: { type: String },
    type: { type: String },
    points: { type: Number, default: 0 },
    userId: { type: String },
    scannedAt: { type: Date, default: Date.now }
});

// Optional: Automatically remove old records after 24 hours to keep DB clean
usedQRSchema.index({ scannedAt: 1 }, { expireAfterSeconds: 86400 });

const UsedQR = mongoose.model('UsedQR', usedQRSchema);
export default UsedQR;
