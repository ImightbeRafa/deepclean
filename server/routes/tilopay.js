import express from 'express';
import { createPaymentLink, handleWebhook } from '../controllers/tilopayController.js';

const router = express.Router();

// Create payment link
router.post('/create-payment', createPaymentLink);

// Webhook handler for payment notifications
router.post('/webhook', handleWebhook);

// Test endpoint for webhook
router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    message: 'DeepClean Tilopay webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

export default router;
