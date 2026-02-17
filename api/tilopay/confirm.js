import { sendOrderEmail } from '../utils/email.js';
import { sendOrderToBetsyWithRetry } from '../utils/betsy.js';

/**
 * In-memory set of already-processed order IDs.
 * Prevents duplicate emails/CRM submissions when the success page is
 * refreshed or the browser retries the fetch. Not persistent across
 * cold starts, but covers the most common duplicate scenario.
 */
const processedOrders = new Set();

/**
 * Confirm payment and send emails, then sync order to Betsy CRM.
 * Called from success page after Tilopay redirect.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('📨 [Confirm] Payment confirmation request');

  try {
    const { orderId, transactionId, code, returnData } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    if (!returnData) {
      return res.status(400).json({ error: 'Missing order data (returnData)' });
    }

    console.log(`📋 [Confirm] Order: ${orderId}, Transaction: ${transactionId}, Code: ${code}`);

    // Server-side deduplication: if we already processed this order, return early
    const dedupeKey = `${orderId}_${transactionId || ''}`;
    if (processedOrders.has(dedupeKey)) {
      console.log(`⚠️ [Confirm] Order ${orderId} already processed — skipping duplicate`);
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: 'Order already processed',
        orderId
      });
    }

    // Verify payment code BEFORE doing anything else
    const isPaymentApproved = code === '1' || code === 1 || String(code) === '1';
    if (!isPaymentApproved) {
      console.log(`❌ [Confirm] Payment declined for order ${orderId}, code: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'Payment declined',
        message: 'Payment was not approved',
        code: code
      });
    }

    // Decode order data from returnData
    let order;
    try {
      const decodedData = Buffer.from(returnData, 'base64').toString('utf-8');
      order = JSON.parse(decodedData);
      console.log(`✅ [Confirm] Order data decoded from returnData`);
    } catch (decodeError) {
      console.error(`❌ [Confirm] Failed to decode returnData:`, decodeError);
      return res.status(400).json({
        error: 'Invalid order data',
        message: 'Could not decode order information'
      });
    }

    // Validate decoded order has essential fields
    if (!order.nombre || !order.email || !order.total) {
      console.error(`❌ [Confirm] Decoded order missing essential fields:`, Object.keys(order));
      return res.status(400).json({
        error: 'Incomplete order data',
        message: 'Order is missing required fields'
      });
    }

    // Mark as processed IMMEDIATELY to prevent race conditions
    processedOrders.add(dedupeKey);

    // Payment is approved — enrich the order object
    order.paymentStatus = 'completed';
    order.paymentId = transactionId;
    order.paymentMethod = 'Tilopay';
    order.paidAt = new Date().toISOString();

    console.log(`✅ [Confirm] Order ${orderId} confirmed as paid`);

    // Send emails (non-blocking — don't let failure break the response)
    try {
      await sendOrderEmail(order);
      console.log(`📧 [Confirm] Emails sent for order ${orderId}`);
    } catch (emailError) {
      console.error(`❌ [Confirm] Failed to send emails:`, emailError);
    }

    // Send order to Betsy CRM
    try {
      await sendOrderToBetsyWithRetry({
        ...order,
        paymentMethod: 'Tilopay',
        transactionId: transactionId
      });
      console.log(`✅ [Confirm] Order synced to Betsy CRM: ${orderId}`);
    } catch (betsyError) {
      console.error(`❌ [Confirm] Failed to sync order to Betsy CRM:`, betsyError);
    }

    return res.json({
      success: true,
      message: 'Payment confirmed, emails sent, and order synced to CRM',
      orderId
    });

  } catch (error) {
    console.error(`❌ [Confirm] Error:`, error);
    return res.status(500).json({
      error: 'Confirmation failed',
      message: error.message
    });
  }
}
