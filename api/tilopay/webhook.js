import { sendOrderEmail } from '../utils/email.js';
import { sendOrderToBetsyWithRetry } from '../utils/betsy.js';
import crypto from 'crypto';

/**
 * In-memory set of processed webhook transaction IDs.
 * Prevents duplicate processing if Tilopay sends the same webhook twice.
 */
const processedWebhooks = new Set();

/**
 * Verify webhook signature using x-tilopay-secret header or HMAC hash.
 */
function verifyWebhookSignature(req) {
  const expectedSecret = process.env.TILOPAY_WEBHOOK_SECRET || '';
  if (!expectedSecret) {
    console.warn('⚠️ [Webhook] TILOPAY_WEBHOOK_SECRET not configured — skipping verification');
    return true;
  }

  // Method 1: Direct secret comparison
  const providedSecret = req.headers['x-tilopay-secret'] || '';
  if (providedSecret && providedSecret === expectedSecret) {
    return true;
  }

  // Method 2: HMAC hash verification
  const providedHash = req.headers['hash-tilopay'] || '';
  if (providedHash) {
    try {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const computedHash = crypto.createHmac('sha256', expectedSecret).update(rawBody).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(computedHash))) {
        return true;
      }
    } catch (e) {
      console.error('⚠️ [Webhook] HMAC verification error:', e.message);
    }
    return false;
  }

  return false;
}

/**
 * Vercel Serverless Function - Webhook Handler
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-tilopay-secret, hash-tilopay');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    return res.json({
      status: 'ok',
      message: 'Tilopay webhook endpoint is active (DeepClean)',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`📨 [Webhook] Received payment notification [${webhookId}]`);

  try {
    const payload = req.body;
    console.log(`📦 [Webhook] Payload:`, JSON.stringify(payload, null, 2));

    // Verify webhook authenticity
    const isVerified = verifyWebhookSignature(req);
    if (!isVerified) {
      console.error(`❌ [Webhook] Signature verification FAILED [${webhookId}]`);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    console.log(`✅ [Webhook] Signature verified [${webhookId}]`);

    // Extract data from webhook payload
    const orderId = payload.order || payload.order_id || payload.orderNumber || payload.referencia || payload.reference;
    const transactionId = payload['tilopay-transaction'] || payload.tpt || payload.transaction_id || payload.transaccion_id || payload.id;
    const code = payload.code;
    const status = String(payload.estado || payload.status || '').toLowerCase();

    console.log(`🔍 [Webhook] Payment details - Order: ${orderId}, Transaction: ${transactionId}, Code: ${code}, Status: ${status} [${webhookId}]`);

    if (!orderId) {
      console.error(`❌ [Webhook] No order ID in payload [${webhookId}]`);
      return res.status(400).json({ error: 'No order ID' });
    }

    // Deduplication: check if this webhook was already processed
    const dedupeKey = `${orderId}_${transactionId || ''}`;
    if (processedWebhooks.has(dedupeKey)) {
      console.log(`⚠️ [Webhook] Already processed: ${dedupeKey} [${webhookId}]`);
      return res.json({
        success: true,
        message: 'Webhook already processed',
        alreadyProcessed: true
      });
    }

    // Determine if payment is successful
    const isCodeApproved = code === '1' || code === 1 || String(code) === '1';
    const isStatusApproved = ['aprobada', 'approved', 'success', 'paid', 'completed'].includes(status);
    const isSuccess = isCodeApproved || (isStatusApproved && code === undefined);

    if (!isSuccess) {
      const isDeclined = (code !== undefined && !isCodeApproved) ||
        ['rechazada', 'declined', 'failed', 'canceled', 'cancelled', 'rejected'].includes(status);

      if (isDeclined) {
        console.log(`❌ [Webhook] Payment failed for order ${orderId} - Code: ${code}, Status: ${status} [${webhookId}]`);
        processedWebhooks.add(dedupeKey);
        return res.json({
          success: true,
          orderId,
          message: 'Payment failed — order cancelled',
          paymentStatus: 'failed',
          webhookId
        });
      }

      console.warn(`⚠️ [Webhook] Unknown status for order ${orderId} - Code: ${code}, Status: ${status} [${webhookId}]`);
      return res.json({
        success: true,
        orderId,
        message: 'Webhook received but status unknown — not confirmed',
        webhookId
      });
    }

    // Payment approved — try to get order data
    processedWebhooks.add(dedupeKey);

    // Try to decode order from returnData in the payload (Tilopay may echo it back)
    let order = null;
    const returnData = payload.returnData || payload.return_data;
    if (returnData) {
      try {
        const decoded = Buffer.from(returnData, 'base64').toString('utf-8');
        order = JSON.parse(decoded);
        console.log(`✅ [Webhook] Order data decoded from webhook returnData [${webhookId}]`);
      } catch (e) {
        console.warn(`⚠️ [Webhook] Could not decode returnData: ${e.message} [${webhookId}]`);
      }
    }

    if (!order) {
      // No order data available in webhook — the confirm endpoint (called from
      // the success page) is the primary processing path and carries full order
      // data via returnData in the redirect URL. Just acknowledge the webhook.
      console.log(`⚠️ [Webhook] No order data available — confirm endpoint will handle processing [${webhookId}]`);
      return res.json({
        success: true,
        orderId,
        message: 'Payment approved — order will be processed via redirect confirm',
        webhookId
      });
    }

    // We have order data — enrich and process
    order.paymentStatus = 'completed';
    order.paymentId = transactionId;
    order.paymentMethod = 'Tilopay';
    order.paidAt = new Date().toISOString();

    console.log(`✅ [Webhook] Order ${orderId} marked as paid [${webhookId}]`);

    // Send email
    try {
      await sendOrderEmail(order);
      console.log(`📧 [Webhook] Email sent for order ${orderId} [${webhookId}]`);
    } catch (emailError) {
      console.error(`❌ [Webhook] Failed to send email for order ${orderId}:`, emailError);
    }

    // Send to Betsy CRM
    try {
      await sendOrderToBetsyWithRetry({
        ...order,
        paymentMethod: 'Tilopay',
        transactionId: transactionId
      });
      console.log(`✅ [Webhook] Order synced to Betsy CRM: ${orderId} [${webhookId}]`);
    } catch (betsyError) {
      console.error(`❌ [Webhook] Failed to sync order to Betsy CRM:`, betsyError);
    }

    return res.json({
      success: true,
      orderId,
      message: 'Payment confirmed and order processed via webhook',
      webhookId
    });

  } catch (error) {
    console.error(`❌ [Webhook] Error [${webhookId}]:`, error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
      webhookId
    });
  }
}
