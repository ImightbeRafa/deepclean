/**
 * Betsy CRM Integration Utility
 * Sends orders to Betsy CRM for automatic logging
 */

/**
 * Send order to Betsy CRM
 * @param {Object} orderData - Order information
 * @returns {Promise} - Betsy CRM response
 */
export async function sendOrderToBetsy(orderData) {
  const apiKey = process.env.BETSY_API_KEY;
  const apiUrl = process.env.BETSY_API_URL;

  console.log('🔍 [Betsy] Environment check - API Key exists:', !!apiKey);
  console.log('🔍 [Betsy] Environment check - API URL exists:', !!apiUrl);
  console.log('🔍 [Betsy] Environment check - API URL value:', apiUrl);

  if (!apiKey || !apiUrl) {
    console.warn('⚠️ [Betsy] API credentials not configured, skipping CRM sync');
    console.warn('⚠️ [Betsy] Missing - API Key:', !apiKey);
    console.warn('⚠️ [Betsy] Missing - API URL:', !apiUrl);
    return { success: false, error: 'Not configured' };
  }

  try {
    console.log('📤 [Betsy] Sending order to CRM:', orderData.orderId);

    // Determine payment status for comments
    const paymentMethod = orderData.paymentMethod || 'Tilopay';
    const paymentStatus = orderData.paymentStatus === 'completed' ? 'PAGADO' : 'PENDIENTE';
    const transactionId = orderData.paymentId || orderData.transactionId || 'PENDING';

    // Build payment status comment
    let paymentComment = '';
    if (paymentStatus === 'PAGADO') {
      paymentComment = `Pago: Tarjeta (Tilopay) - Estado: PAGADO - ID Transacción: ${transactionId}`;
    } else {
      paymentComment = `Pago: Tarjeta (Tilopay) - Estado: Pendiente`;
    }

    // Build color details for comments
    const colorValue = orderData.color || 'Blanco';
    const quantity = parseInt(orderData.cantidad) || 1;
    let colorComment = '';
    if (quantity > 1 && colorValue.includes(',')) {
      const colorList = colorValue.split(',').map(c => c.trim());
      colorComment = 'Colores por unidad: ' + colorList.map((c, i) => `Unidad ${i + 1}: ${c}`).join(', ');
    } else {
      colorComment = `Color: ${colorValue}`;
    }

    // Combine user comments with payment status and color info
    const userComments = orderData.comentarios || '';
    const parts = [paymentComment, colorComment];
    if (userComments) parts.push(`Comentarios del cliente: ${userComments}`);
    const fullComments = parts.join('\n');

    // Map DeepClean order data to Betsy CRM format
    const betsyOrder = {
      orderId: orderData.orderId,
      customer: {
        name: orderData.nombre,
        phone: orderData.telefono,
        email: orderData.email,
      },
      product: {
        name: `DeepClean – Cámara WiFi HD 1080p (${orderData.color || 'Blanco'})`,
        quantity: parseInt(orderData.cantidad) || 1,
        unitPrice: '₡15.900',
      },
      shipping: {
        cost: 'GRATIS',
        courier: 'Correos de Costa Rica',
        address: {
          province: orderData.provincia,
          canton: orderData.canton,
          district: orderData.distrito,
          fullAddress: orderData.direccion,
        },
      },
      total: `₡${orderData.total.toLocaleString('es-CR')}`,
      payment: {
        method: paymentMethod,
        transactionId: transactionId,
        status: 'PENDIENTE',
        date: new Date().toLocaleString('es-CR', {
          timeZone: 'America/Costa_Rica',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
      },
      source: 'DeepClean Website',
      salesChannel: 'Website',
      seller: 'Website',
      metadata: {
        campaign: orderData.campaign || 'organic',
        referrer: orderData.referrer || 'direct',
        comments: fullComments,
        createdAt: orderData.createdAt || new Date().toISOString(),
      },
    };

    console.log('📦 [Betsy] Order payload:', JSON.stringify(betsyOrder, null, 2));
    console.log('🌐 [Betsy] Sending to URL:', apiUrl);
    console.log('🔑 [Betsy] Using API key:', apiKey.substring(0, 20) + '...');

    // Create timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      console.log('🚀 [Betsy] Making fetch request...');
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(betsyOrder),
        signal: controller.signal,
      });
      console.log('✅ [Betsy] Fetch completed');
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('❌ [Betsy] Fetch failed:', fetchError.message);
      console.error('❌ [Betsy] Fetch error name:', fetchError.name);
      console.error('❌ [Betsy] Fetch error stack:', fetchError.stack);
      throw fetchError;
    }

    clearTimeout(timeoutId);

    console.log('📥 [Betsy] Response status:', response.status, response.statusText);
    console.log('📥 [Betsy] Response content-type:', response.headers.get('content-type'));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Betsy] CRM sync failed:', response.status, errorText);
      console.error('❌ [Betsy] Failed order ID:', orderData.orderId);
      console.error('❌ [Betsy] Response headers:', JSON.stringify([...response.headers.entries()]));

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        status: response.status,
      };
    }

    const result = await response.json();
    console.log('✅ [Betsy] Order synced to CRM:', result.crmOrderId || result.id);
    console.log('✅ [Betsy] Full response:', JSON.stringify(result));

    return {
      success: true,
      crmOrderId: result.crmOrderId || result.id,
      data: result,
    };

  } catch (error) {
    console.error('❌ [Betsy] CRM sync error:', error.message);
    console.error('❌ [Betsy] Error type:', error.name);
    console.error('❌ [Betsy] Error details:', error);
    console.error('❌ [Betsy] Order ID that failed:', orderData.orderId);

    if (error.name === 'AbortError') {
      console.error('❌ [Betsy] Request timed out after 10 seconds');
    }

    return {
      success: false,
      error: error.message,
      errorType: error.name,
    };
  }
}

/**
 * Send order to Betsy with retry logic
 * @param {Object} orderData - Order information
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise} - Betsy CRM response
 */
export async function sendOrderToBetsyWithRetry(orderData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 [Betsy] Attempt ${attempt}/${maxRetries} for order ${orderData.orderId}`);

    const result = await sendOrderToBetsy(orderData);

    if (result.success) {
      return result;
    }

    // If not last attempt and error is retryable, wait and retry
    if (attempt < maxRetries && isRetryableError(result)) {
      const waitTime = 1000 * attempt;
      console.log(`⏳ [Betsy] Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // Last attempt or non-retryable error
    console.error(`❌ [Betsy] Failed after ${attempt} attempts:`, result.error);
    return result;
  }
}

/**
 * Check if error is retryable
 * @param {Object} result - Result from sendOrderToBetsy
 * @returns {boolean}
 */
function isRetryableError(result) {
  if (result.error === 'Not configured') {
    return false;
  }

  if (result.status >= 500) {
    return true;
  }

  if (result.error && (
    result.error.includes('timeout') ||
    result.error.includes('network') ||
    result.error.includes('ECONNREFUSED') ||
    result.error.includes('ETIMEDOUT')
  )) {
    return true;
  }

  return false;
}
