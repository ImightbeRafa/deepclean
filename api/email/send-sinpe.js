import { sendOrderEmail } from '../utils/email.js';
import { sendOrderToBetsyWithRetry } from '../utils/betsy.js';

/**
 * Vercel Serverless Function - Send SINPE Email
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    if (!nombre || !telefono || !email || !provincia || !canton || !distrito || !direccion || !cantidad) {
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

    // Generate simple order ID (6-digit number)
    const orderId = Math.floor(100000 + Math.random() * 900000).toString();

    // Prepare order data
    const order = {
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
      paymentMethod: 'SINPE',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    // Send email with SINPE instructions and order details
    let emailSent = false;
    try {
      await sendOrderEmail(order);
      emailSent = true;
      console.log('✅ SINPE order email sent:', orderId);
    } catch (emailError) {
      console.error('❌ Failed to send SINPE email:', emailError.message);
    }

    // Send order to Betsy CRM
    try {
      await sendOrderToBetsyWithRetry(order);
      console.log('✅ SINPE order synced to Betsy CRM');
    } catch (betsyError) {
      console.error('❌ Failed to sync SINPE order to Betsy CRM:', betsyError.message);
    }

    return res.json({
      success: true,
      orderId,
      emailSent,
      message: emailSent
        ? 'Order received. Please check your email for SINPE payment instructions.'
        : 'Order received. Email could not be sent — please contact us via WhatsApp for payment instructions.'
    });

  } catch (error) {
    console.error('❌ Send SINPE email error:', error);
    return res.status(500).json({
      error: 'Failed to send email',
      message: error.message
    });
  }
}
