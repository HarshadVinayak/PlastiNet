import express from 'express';
import { handleRegisterQR, handleScan } from './scanController.js';

const router = express.Router();

router.post('/registerQR', handleRegisterQR);
router.post('/scan', handleScan);

export default router;
