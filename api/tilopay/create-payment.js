/**
 * Authenticate with Tilopay API
 */
async function authenticateTilopay() {
  const baseUrl = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com/api/v1';
  const apiUser = process.env.TILOPAY_USER;
  const apiPassword = process.env.TILOPAY_PASSWORD;

  console.log('🔍 [Tilopay Auth] Checking credentials...', {
    hasUser: !!apiUser,
    hasPassword: !!apiPassword,
    baseUrl
  });

  if (!apiUser || !apiPassword) {
    throw new Error('Tilopay credentials not configured in environment variables');
  }

  console.log('🔍 [Tilopay Auth] Sending login request...');

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
    console.error('❌ [Tilopay Auth] Login failed:', errorText);
    throw new Error(`Failed to authenticate with Tilopay: ${loginResponse.status} ${errorText}`);
  }

  const loginData = await loginResponse.json();
  console.log('✅ [Tilopay Auth] Token received');

  if (!loginData.access_token) {
    throw new Error('No access token in Tilopay response');
  }

  return loginData.access_token;
}

/**
 * Vercel Serverless Function
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

  console.log('🔵 [Tilopay] Creating payment link...');

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

    // Shipping is always FREE for DeepClean
    const shippingCost = 0;
    const total = subtotal + shippingCost;

    // Generate simple order ID (6-digit number)
    const orderId = Math.floor(100000 + Math.random() * 900000).toString();

    // Store order data in global object
    if (!global.pendingOrders) {
      global.pendingOrders = {};
    }

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
    console.log('🔑 [Tilopay] Authenticating...');
    const accessToken = await authenticateTilopay();
    console.log('✅ [Tilopay] Authentication successful');

    // Create payment link using /processPayment endpoint
    const baseUrl = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com/api/v1';
    const apiKey = process.env.TILOPAY_API_KEY;
    const appUrl = process.env.APP_URL || 'https://deepclean.shopping';

    if (!apiKey) {
      throw new Error('TILOPAY_API_KEY not configured in environment variables');
    }

    // Split name into first and last name
    const nameParts = nombre.split(' ');
    const firstName = nameParts[0] || nombre;
    const lastName = nameParts.slice(1).join(' ') || nombre;

    // Encode order data to pass through Tilopay redirect
    const orderData = {
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
    const encodedOrderData = Buffer.from(JSON.stringify(orderData)).toString('base64');

    const paymentPayload = {
      key: apiKey,
      amount: Math.round(total),
      currency: 'CRC',
      description: `DeepClean x${quantity} – Orden #${orderId}`,
      redirect: `${appUrl}/success.html`,
      notification_url: `${appUrl}/api/tilopay/webhook`,
      hashVersion: 'V2',
      billToFirstName: firstName,
      billToLastName: lastName,
      billToAddress: direccion,
      billToAddress2: `${distrito}, ${canton}`,
      billToCity: canton,
      billToState: 'CR-' + (provincia === 'San José' ? 'SJ' : 'OT'),
      billToZipPostCode: '10101',
      billToCountry: 'CR',
      billToTelephone: telefono,
      billToEmail: email,
      orderNumber: orderId,
      capture: '1',
      subscription: '0',
      platform: 'DeepClean',
      returnData: encodedOrderData
    };

    console.log('📤 [Tilopay] Sending payment request to:', `${baseUrl}/processPayment`);
    console.log('📦 [Tilopay] Payload:', JSON.stringify(paymentPayload, null, 2));

    const captureResponse = await fetch(`${baseUrl}/processPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(paymentPayload)
    });

    console.log('📥 [Tilopay] Response status:', captureResponse.status);

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('❌ [Tilopay] Payment error:', errorText);
      throw new Error(`Failed to create payment link: ${captureResponse.status} - ${errorText}`);
    }

    const paymentData = await captureResponse.json();

    console.log('✅ Payment link created:', paymentData);

    // Extract payment URL from response
    const paymentUrl = paymentData.urlPaymentForm || paymentData.url || paymentData.payment_url;

    if (!paymentUrl) {
      console.error('❌ [Tilopay] No payment URL in response:', paymentData);
      throw new Error('No payment URL received from Tilopay');
    }

    return res.json({
      success: true,
      orderId,
      paymentUrl: paymentUrl,
      transactionId: paymentData.id || paymentData.transaction_id
    });

  } catch (error) {
    console.error('❌ [Tilopay] Create payment error:', error);
    console.error('❌ [Tilopay] Error stack:', error.stack);
    return res.status(500).json({
      error: 'Failed to create payment',
      message: error.message,
      details: error.toString()
    });
  }
}
