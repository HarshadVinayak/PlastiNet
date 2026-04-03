import mongoose from 'mongoose';

const registeredQRSchema = new mongoose.Schema({
  qrId: { type: String, required: true, unique: true },
  binId: { type: String, required: true },
  timestamp: { type: Number, required: true },
  uniqueId: { type: String, required: true },
  registeredAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

registeredQRSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RegisteredQR = mongoose.model('RegisteredQR', registeredQRSchema);

export default RegisteredQR;
