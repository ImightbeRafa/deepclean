// Import styles
import '../styles/main.css';

// Constants
const API_BASE_URL = '/api'; // Vercel serverless functions

// Pricing structure - MUST match backend pricing
const pricing = {
  1: 15900,  // 1 unit: ₡15,900
  2: 28900,  // 2 units: ₡28,900 (₡14,450 each)
  3: 39900,  // 3 units: ₡39,900 (₡13,300 each)
  4: 49900,  // 4 units: ₡49,900 (₡12,475 each)
  5: 58900   // 5 units: ₡58,900 (₡11,780 each)
};

// Shipping is always FREE
const SHIPPING_COST = 0;

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// FAQ accordion functionality
document.querySelectorAll('.faq-question').forEach(button => {
  button.addEventListener('click', function() {
    const item = this.parentElement;
    const isActive = item.classList.contains('active');
    
    // Close all items
    document.querySelectorAll('.faq-item').forEach(faq => {
      faq.classList.remove('active');
    });
    
    // Open clicked item if it wasn't active
    if (!isActive) {
      item.classList.add('active');
    }
  });
});

// Update total price based on quantity
const quantitySelect = document.getElementById('cantidad');
const totalElement = document.querySelector('.summary-total span:last-child');
const summaryItemElement = document.querySelector('.summary-item span:last-child');
const savingsElement = document.querySelector('.summary-savings');

function updateTotal() {
  if (!quantitySelect || !totalElement) return;

  const quantity = parseInt(quantitySelect.value) || 1;
  const subtotal = pricing[quantity] || pricing[1];
  const unitPrice = pricing[1];

  // Shipping is always FREE
  const shippingCost = 0;
  const total = subtotal + shippingCost;

  // Update quantity and total display
  if (summaryItemElement) {
    if (quantity === 1) {
      summaryItemElement.textContent = `₡${subtotal.toLocaleString('es-CR')}`;
    } else {
      summaryItemElement.textContent = `${quantity} x ₡${subtotal.toLocaleString('es-CR')}`;
    }
  }

  // Calculate and show savings for multiple units
  if (savingsElement) {
    if (quantity > 1) {
      const regularPrice = unitPrice * quantity;
      const savings = regularPrice - subtotal;
      savingsElement.style.display = 'flex';
      savingsElement.querySelector('.savings-amount').textContent = `-₡${savings.toLocaleString('es-CR')}`;
    } else {
      savingsElement.style.display = 'none';
    }
  }

  // Format total
  totalElement.textContent = `₡${total.toLocaleString('es-CR')}`;

  // Update submit button text
  const submitBtn = document.querySelector('.btn-submit');
  if (submitBtn) {
    submitBtn.textContent = `CONFIRMAR PEDIDO – ₡${total.toLocaleString('es-CR')} (envío incluido)`;
  }
}

if (quantitySelect) {
  quantitySelect.addEventListener('change', updateTotal);
  // Initialize pricing on page load
  updateTotal();
}

// Payment method change handler
const paymentMethodSelect = document.getElementById('metodo-pago');
const paymentInfoBox = document.getElementById('payment-info');

if (paymentMethodSelect && paymentInfoBox) {
  paymentMethodSelect.addEventListener('change', function() {
    const selectedMethod = this.value;

    if (selectedMethod === 'SINPE') {
      paymentInfoBox.style.display = 'block';
      paymentInfoBox.innerHTML = `
        <div class="payment-instructions sinpe">
          <h4>📱 Instrucciones SINPE Móvil</h4>
          <p>📱 <strong>Número:</strong> 7033-9763</p>
          <p>👤 <strong>Nombre:</strong> Rafael Garcia</p>
          <p>⚠️ <strong>Importante:</strong></p>
          <ul style="margin-left: 1.5rem; margin-top: 0.5rem;">
            <li>Use el número de su orden en el concepto del SINPE</li>
            <li>Guarde el comprobante de pago</li>
            <li>Envíe el comprobante por WhatsApp al 6201-9914</li>
          </ul>
        </div>
      `;
    } else if (selectedMethod === 'Tarjeta') {
      paymentInfoBox.style.display = 'block';
      paymentInfoBox.innerHTML = `
        <div class="payment-instructions tilopay">
          <h4>💳 Pago con Tarjeta</h4>
          <p>Será redirigido a la pasarela de pago segura de Tilopay para completar su compra.</p>
          <p>Aceptamos todas las tarjetas de crédito y débito.</p>
        </div>
      `;
    } else {
      paymentInfoBox.style.display = 'none';
    }
  });
}

// Form submission handler
const orderForm = document.getElementById('order-form');

if (orderForm) {
  orderForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Get form data
    const formData = new FormData(orderForm);
    const data = Object.fromEntries(formData);

    const paymentMethod = data['metodo-pago'];

    if (!paymentMethod) {
      showMessage('Por favor, seleccioná un método de pago', 'error');
      return;
    }

    // Show loading overlay
    showLoading(true);

    try {
      if (paymentMethod === 'SINPE') {
        await handleSinpePayment(data);
      } else if (paymentMethod === 'Tarjeta') {
        await handleTilopayPayment(data);
      }
    } catch (error) {
      console.error('Payment error:', error);
      showMessage('Error al procesar el pedido. Por favor, intentá de nuevo.', 'error');
      showLoading(false);
    }
  });
}

// Handle SINPE payment
async function handleSinpePayment(data) {
  try {
    const response = await fetch(`${API_BASE_URL}/email/send-sinpe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to process SINPE order');
    }

    const result = await response.json();

    showLoading(false);

    // Hide payment info box
    const paymentInfoBox = document.getElementById('payment-info');
    if (paymentInfoBox) {
      paymentInfoBox.style.display = 'none';
    }

    // Show success message
    showMessage(`¡Pedido recibido! Número de orden: ${result.orderId}. Revisá tu correo para las instrucciones de pago SINPE.`, 'success');

    // Reset form
    orderForm.reset();
    updateTotal();

  } catch (error) {
    console.error('SINPE payment error:', error);
    throw error;
  }
}

// Handle Tilopay payment
async function handleTilopayPayment(data) {
  try {
    const response = await fetch(`${API_BASE_URL}/tilopay/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Tilopay API error:', errorData);
      throw new Error(errorData.message || 'Failed to create payment link');
    }

    const result = await response.json();

    showLoading(false);

    // Redirect to Tilopay payment page
    if (result.paymentUrl) {
      window.location.href = result.paymentUrl;
    } else {
      throw new Error('No payment URL received');
    }

  } catch (error) {
    console.error('Tilopay payment error:', error);
    throw error;
  }
}

// Show message function
function showMessage(text, type = 'success') {
  // Remove existing messages
  const existingMessage = document.querySelector('.message');
  if (existingMessage) {
    existingMessage.remove();
  }

  // Create new message
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;
  message.style.maxWidth = '100%';
  message.style.width = '100%';

  // Insert before form
  const orderForm = document.getElementById('order-form');
  if (orderForm) {
    orderForm.parentNode.insertBefore(message, orderForm);

    // Scroll to message
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Auto remove after 8 seconds
    setTimeout(() => {
      message.remove();
    }, 8000);
  }
}

// Show/hide loading overlay
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
}

// Initialize total on page load
document.addEventListener('DOMContentLoaded', function() {
  updateTotal();
});
