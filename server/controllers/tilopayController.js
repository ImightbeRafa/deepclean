import { sendOrderEmail } from './emailController.js';
import { sendOrderToBetsyWithRetry } from '../utils/betsy.js';

/**
 * Authenticate with Tilopay API
 */
async function authenticateTilopay() {
  const baseUrl = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com/api/v1';
  const apiUser = process.env.TILOPAY_USER;
  const apiPassword = process.env.TILOPAY_PASSWORD;

  if (!apiUser || !apiPassword) {
    throw new Error('Tilopay credentials not configured');
  }

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiuser: apiUser,
      password: apiPassword
    })
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    console.error('Tilopay login error:', errorText);
    throw new Error('Failed to authenticate with Tilopay');
  }

  const loginData = await loginResponse.json();
  return loginData.access_token;
}

/**
 * Create payment link with Tilopay
 */
export async function createPaymentLink(req, res) {
  try {
    const {
      nombre,
      telefono,
      email,
      provincia,
      canton,
      distrito,
      direccion,
      cantidad,
      color,
      comentarios
    } = req.body;

    // Validation
    if (!nombre || !telefono || !provincia || !canton || !distrito || !direccion || !cantidad) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Calculate total with tiered pricing
    const pricing = {
      1: 15900,  // 1 unit: ₡15,900
      2: 28900,  // 2 units: ₡28,900
      3: 39900,  // 3 units: ₡39,900
      4: 49900,  // 4 units: ₡49,900
      5: 58900   // 5 units: ₡58,900
    };

    const quantity = parseInt(cantidad) || 1;
    const subtotal = pricing[quantity] || pricing[1];

    // Shipping is always FREE
    const shippingCost = 0;
    const total = subtotal + shippingCost;

    // Generate unique order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Store order data in memory
    global.pendingOrders = global.pendingOrders || {};
    global.pendingOrders[orderId] = {
      orderId,
      nombre,
      telefono,
      email,
      provincia,
      canton,
      distrito,
      direccion,
      cantidad: quantity,
      color: color || 'Blanco',
      subtotal,
      shippingCost,
      total,
      comentarios,
      createdAt: new Date().toISOString()
    };

    // Authenticate with Tilopay
    const accessToken = await authenticateTilopay();

    // Create payment link
    const baseUrl = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com/api/v1';
    const apiKey = process.env.TILOPAY_API_KEY;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const apiPort = process.env.API_PORT || 3001;

    const capturePayload = {
      key: apiKey,
      amount: Math.round(total),
      currency: 'CRC',
      description: `Orden ${orderId}: DeepClean Cámara WiFi HD (x${quantity})`,
      order_id: orderId,
      redirect_success: `${appUrl}/success.html?orderId=${orderId}`,
      redirect_error: `${appUrl}/error.html?orderId=${orderId}`,
      notification_url: `http://localhost:${apiPort}/api/tilopay/webhook`,
      email: email || '',
      platform: '5'
    };

    const captureResponse = await fetch(`${baseUrl}/captures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(capturePayload)
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('Tilopay capture error:', errorText);
      throw new Error('Failed to create payment link');
    }

    const captureData = await captureResponse.json();

    console.log('✅ Payment link created:', {
      orderId,
      paymentUrl: captureData.payment_url || captureData.url
    });

    return res.json({
      success: true,
      orderId,
      paymentUrl: captureData.payment_url || captureData.url,
      transactionId: captureData.transaction_id || captureData.id
    });

  } catch (error) {
    console.error('❌ Create payment error:', error);
    return res.status(500).json({
      error: 'Failed to create payment',
      message: error.message
    });
  }
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(req) {
  const expectedSecret = process.env.TILOPAY_WEBHOOK_SECRET || '';
  const providedSecret = req.headers['x-tilopay-secret'] || '';
  const providedHash = req.headers['hash-tilopay'] || '';

  if (providedSecret && providedSecret === expectedSecret) {
    return true;
  }

  if (providedHash && expectedSecret) {
    try {
      const crypto = await import('crypto');
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const computedHash = crypto.createHmac('sha256', expectedSecret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(computedHash));
    } catch (e) {
      return false;
    }
  }

  return false;
}

/**
 * Handle Tilopay webhook notifications
 */
export async function handleWebhook(req, res) {
  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`📨 [Webhook] Received payment notification [${webhookId}]`);

  try {
    if (!verifyWebhookSignature(req)) {
      console.error(`❌ [Webhook] Unauthorized [${webhookId}]`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    console.log(`📦 [Webhook] Payload:`, JSON.stringify(payload, null, 2));

    const orderId = payload.order || payload.order_id || payload.orderNumber || payload.referencia || payload.reference;
    const transactionId = payload['tilopay-transaction'] || payload.tpt || payload.transaction_id || payload.transaccion_id || payload.id;
    const code = payload.code;
    const status = String(payload.estado || payload.status || '').toLowerCase();

    console.log(`🔍 [Webhook] Payment details - Order: ${orderId}, Code: ${code}, Status: ${status} [${webhookId}]`);

    if (!orderId) {
      console.error(`❌ [Webhook] No order ID in payload [${webhookId}]`);
      return res.status(400).json({ error: 'No order ID' });
    }

    const order = global.pendingOrders && global.pendingOrders[orderId];

    if (!order) {
      console.error(`❌ [Webhook] Order not found: ${orderId} [${webhookId}]`);
      return res.status(200).json({
        success: true,
        message: 'Order not found but webhook acknowledged'
      });
    }

    if (order.processed) {
      console.log(`⚠️ [Webhook] Order already processed: ${orderId} [${webhookId}]`);
      return res.json({
        success: true,
        message: 'Order already processed',
        alreadyProcessed: true
      });
    }

    const isCodeApproved = code === '1' || code === 1;
    const isStatusApproved = ['aprobada', 'approved', 'success', 'paid', 'completed'].includes(status);
    const isSuccess = isCodeApproved || (isStatusApproved && code === undefined);

    if (isSuccess) {
      order.processed = true;
      order.paymentStatus = 'completed';
      order.paymentId = transactionId;
      order.paidAt = new Date().toISOString();

      console.log(`✅ [Webhook] Order ${orderId} marked as paid [${webhookId}]`);

      try {
        await sendOrderEmail(order);
        console.log(`📧 [Webhook] Email sent for order ${orderId} [${webhookId}]`);
      } catch (emailError) {
        console.error(`❌ [Webhook] Failed to send email for order ${orderId}:`, emailError);
      }

      try {
        await sendOrderToBetsyWithRetry({
          ...order,
          paymentMethod: 'Tilopay',
          transactionId: transactionId
        });
        console.log(`✅ [Webhook] Order synced to Betsy CRM: ${orderId}`);
      } catch (error) {
        console.error(`❌ [Webhook] Failed to sync order to Betsy CRM:`, error);
      }

      return res.json({
        success: true,
        orderId,
        message: 'Payment confirmed and order created',
        webhookId
      });

    } else {
      const isCodeDeclined = code !== undefined && code !== '1' && code !== 1;
      const isStatusDeclined = ['rechazada', 'declined', 'failed', 'canceled', 'cancelled', 'rejected'].includes(status);

      if (isCodeDeclined || isStatusDeclined) {
        order.processed = true;
        order.paymentStatus = 'failed';
        order.paymentId = transactionId;

        console.log(`❌ [Webhook] Payment failed for order ${orderId} - Code: ${code}, Status: ${status} [${webhookId}]`);

        return res.json({
          success: true,
          orderId,
          message: 'Payment failed - order cancelled',
          paymentStatus: 'failed',
          code: code,
          status: status,
          webhookId
        });
      } else {
        console.warn(`⚠️ [Webhook] Unknown payment status for order ${orderId} [${webhookId}]`);
        return res.json({
          success: true,
          orderId,
          message: 'Webhook received but status unknown',
          code: code,
          status: status,
          webhookId
        });
      }
    }

  } catch (error) {
    console.error(`❌ [Webhook] Error [${webhookId}]:`, error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
      webhookId
    });
  }
}
