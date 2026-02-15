import express from 'express';
import { sendSinpeEmail } from '../controllers/emailController.js';

const router = express.Router();

// Send Sinpe payment email
router.post('/send-sinpe', sendSinpeEmail);

export default router;
