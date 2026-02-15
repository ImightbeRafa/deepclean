/**
 * Send customer confirmation email
 */
async function sendCustomerEmail(order) {
  const resendApiKey = process.env.RESEND_API_KEY;

  const customerEmailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; text-align: center; }
      .header h1 { color: white; margin: 0; font-size: 28px; }
      .content { padding: 30px; }
      h2 { color: #059669; margin-top: 0; }
      .order-box { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669; }
      .label { font-weight: bold; color: #059669; display: inline-block; min-width: 120px; }
      .footer { margin-top: 30px; padding: 20px 30px; background: #f9fafb; text-align: center; font-size: 14px; color: #6b7280; }
      .btn { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      .highlight { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🔬 DeepClean</h1>
        <p style="color: white; margin: 5px 0 0;">OtoView – Otoscopio WiFi HD</p>
      </div>
      <div class="content">
        <h2>✅ ¡Confirmación de Pedido!</h2>
        <p>Hola <strong>${order.nombre}</strong>,</p>
        <p>Gracias por tu pedido. Aquí están los detalles:</p>

        <div class="order-box">
          <p><span class="label">Número de Orden:</span> ${order.orderId}</p>
          <p><span class="label">Producto:</span> OtoView Otoscopio WiFi HD 1080p</p>
          <p><span class="label">Cantidad:</span> ${order.cantidad}</p>
          ${order.subtotal ? `<p><span class="label">Subtotal:</span> ₡${order.subtotal.toLocaleString('es-CR')}</p>` : ''}
          <p><span class="label">Envío:</span> GRATIS 🎉</p>
          <p><span class="label">Total:</span> <strong>₡${order.total.toLocaleString('es-CR')}</strong></p>
        </div>

        ${order.paymentMethod === 'SINPE' ? `
        <div class="highlight">
          <h3>📱 Instrucciones de Pago SINPE</h3>
          <p>📱 <strong>Número SINPE:</strong> 7033-9763</p>
          <p>👤 <strong>Nombre:</strong> Rafael Garcia</p>
          <p>💰 <strong>Monto:</strong> ₡${order.total.toLocaleString('es-CR')}</p>

          <p><strong>Pasos a seguir:</strong></p>
          <ol>
            <li>Abrí la aplicación SINPE Móvil de tu banco</li>
            <li>Realizá la transferencia al número <strong>7033-9763</strong></li>
            <li>⚠️ <strong>Importante:</strong> En el concepto/descripción escribí: <code>${order.orderId}</code></li>
            <li>Guardá el comprobante de pago</li>
            <li>Enviá el comprobante por WhatsApp al <strong>6201-9914</strong></li>
          </ol>
        </div>
        ` : `
        <p>✅ Tu pago con tarjeta ha sido procesado exitosamente.</p>
        `}

        <div class="order-box">
          <p>📍 <strong>Dirección de Envío:</strong></p>
          <p>${order.direccion}</p>
          <p>${order.distrito}, ${order.canton}, ${order.provincia}</p>
        </div>

        <p style="text-align: center;">Te contactaremos pronto para coordinar la entrega 🚛</p>
      </div>
      <div class="footer">
        <p>¿Tenés preguntas?</p>
        <p>WhatsApp: <strong>6201-9914</strong></p>
        <p>Instagram: <strong>@deepclean.cr</strong></p>
        <p>Email: deepclean.cr@gmail.com</p>
        <br>
        <p>© 2025 DeepClean. Todos los derechos reservados.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`
    },
    body: JSON.stringify({
      from: 'DeepClean <orders@deepclean.cr>',
      to: order.email,
      subject: `Confirmación de Pedido ${order.orderId} - DeepClean OtoView`,
      html: customerEmailHtml
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send customer email');
  }

  return await response.json();
}

/**
 * Send admin notification email
 */
async function sendAdminEmail(order) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const notificationEmail = process.env.ORDER_NOTIFICATION_EMAIL;

  const adminEmailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      h2 { color: #059669; border-bottom: 3px solid #10b981; padding-bottom: 10px; }
      h3 { color: #059669; margin-top: 25px; }
      .info-section { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0; }
      .info-item { margin: 8px 0; }
      .label { font-weight: bold; color: #059669; }
      .total { font-size: 20px; font-weight: bold; color: #059669; }
      .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 14px; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>🎉 Nueva Orden Recibida - ${order.orderId}</h2>

      <div class="info-section">
        <h3>📋 Información del Cliente:</h3>
        <p class="info-item"><span class="label">Nombre:</span> ${order.nombre}</p>
        <p class="info-item"><span class="label">Teléfono:</span> ${order.telefono}</p>
        <p class="info-item"><span class="label">Email:</span> ${order.email}</p>
      </div>

      <div class="info-section">
        <h3>🛍️ Detalles del Producto:</h3>
        <p class="info-item"><span class="label">Producto:</span> OtoView Otoscopio WiFi HD 1080p</p>
        <p class="info-item"><span class="label">Cantidad:</span> ${order.cantidad}</p>
        <p class="info-item"><span class="label">Precio Unitario:</span> ₡15.900</p>
        ${order.subtotal ? `<p class="info-item"><span class="label">Subtotal:</span> ₡${order.subtotal.toLocaleString('es-CR')}</p>` : ''}
        <p class="info-item"><span class="label">Envío:</span> GRATIS</p>
        <p class="info-item"><span class="label total">Total:</span> <span class="total">₡${order.total.toLocaleString('es-CR')}</span></p>
      </div>

      <div class="info-section">
        <h3>📍 Dirección de Envío:</h3>
        <p class="info-item"><span class="label">Provincia:</span> ${order.provincia}</p>
        <p class="info-item"><span class="label">Cantón:</span> ${order.canton}</p>
        <p class="info-item"><span class="label">Distrito:</span> ${order.distrito}</p>
        <p class="info-item"><span class="label">Dirección Completa:</span> ${order.direccion}</p>
      </div>

      ${order.comentarios ? `
      <div class="info-section">
        <h3>💬 Comentarios del Cliente:</h3>
        <p>${order.comentarios}</p>
      </div>
      ` : ''}

      <div class="info-section">
        <h3>💳 Información de Pago:</h3>
        <p class="info-item"><span class="label">Método:</span> ${order.paymentMethod || 'Tilopay'}</p>
        <p class="info-item"><span class="label">ID de Transacción:</span> ${order.paymentId || 'Pendiente'}</p>
        <p class="info-item"><span class="label">Estado:</span> ${order.paymentStatus === 'completed' ? 'PAGADO ✅' : 'PENDIENTE'}</p>
        <p class="info-item"><span class="label">Fecha:</span> ${new Date(order.paidAt || order.createdAt).toLocaleString('es-CR')}</p>
      </div>

      <div class="footer">
        <p>Por favor, procese esta orden y coordine el envío lo antes posible.</p>
        <p>Este es un correo automático generado por el sistema DeepClean.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`
    },
    body: JSON.stringify({
      from: 'DeepClean <orders@deepclean.cr>',
      to: notificationEmail,
      subject: `Nueva Orden: ${order.orderId} - ${order.nombre} (OtoView)`,
      html: adminEmailHtml
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send admin email');
  }

  return await response.json();
}

/**
 * Send both customer and admin emails
 */
export async function sendOrderEmail(order) {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const notificationEmail = process.env.ORDER_NOTIFICATION_EMAIL;

    if (!resendApiKey || !notificationEmail) {
      console.warn('⚠️ Email not configured');
      throw new Error('Email configuration missing');
    }

    // Send customer confirmation email
    if (order.email) {
      try {
        await sendCustomerEmail(order);
        console.log('✅ Customer email sent to:', order.email);
      } catch (error) {
        console.error('❌ Failed to send customer email:', error);
      }
    }

    // Send admin notification email
    await sendAdminEmail(order);
    console.log('✅ Admin email sent to:', notificationEmail);

    return { success: true };

  } catch (error) {
    console.error('❌ Email sending error:', error);
    throw error;
  }
}
