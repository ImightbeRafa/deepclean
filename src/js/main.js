// Import styles
import '../styles/main.css';

// Constants
const API_BASE_URL = '/api'; // Vercel serverless functions
const META_PIXEL_ID = '1287887989919259';

// =============================================
// Meta Pixel — Browser-side tracking helpers
// =============================================

function metaTrack(eventName, params, options) {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      if (params && options) { window.fbq('track', eventName, params, options); }
      else if (params) { window.fbq('track', eventName, params); }
      else { window.fbq('track', eventName); }
    }
  } catch { /* no-op — never break the site if Pixel fails */ }
}

function getOrCreateExternalId() {
  try {
    let id = localStorage.getItem('dc_external_id');
    if (!id) { id = 'dc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('dc_external_id', id); }
    return id;
  } catch { return ''; }
}

function captureFbclid() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (fbclid) {
      localStorage.setItem('dc_fbclid', fbclid);
      const fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      document.cookie = '_fbc=' + fbc + ';max-age=7776000;path=/;SameSite=Lax';
    }
  } catch { /* no-op */ }
}

function getMetaCookies() {
  const cookies = { _fbp: '', _fbc: '' };
  try {
    document.cookie.split(';').forEach(c => {
      c = c.trim();
      if (c.startsWith('_fbp=')) cookies._fbp = c.substring(5);
      if (c.startsWith('_fbc=')) cookies._fbc = c.substring(5);
    });
  } catch { /* no-op */ }
  return cookies;
}

function setupAdvancedMatching() {
  const fields = [
    { id: 'email', key: 'em' },
    { id: 'telefono', key: 'ph' },
    { id: 'nombre', key: 'fn' }
  ];
  fields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const val = el.value.trim();
      if (!val) return;
      try {
        const userData = { external_id: getOrCreateExternalId() };
        if (key === 'em') userData.em = val.toLowerCase();
        if (key === 'ph') { let p = val.replace(/\D/g, ''); if (!p.startsWith('506')) p = '506' + p; userData.ph = p; }
        if (key === 'fn') {
          const parts = val.split(/\s+/);
          userData.fn = (parts[0] || '').toLowerCase();
          if (parts.length > 1) userData.ln = parts.slice(1).join(' ').toLowerCase();
        }
        window.fbq('init', META_PIXEL_ID, userData);
      } catch { /* no-op */ }
    });
  });
}

function setupViewContentObserver() {
  const section = document.getElementById('producto');
  if (!section || typeof IntersectionObserver === 'undefined') return;
  let fired = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || fired) return;
      fired = true;
      metaTrack('ViewContent', {
        content_ids: ['deepclean'],
        content_name: 'DeepClean - Limpiador de Oídos WiFi HD',
        content_type: 'product',
        value: 15900,
        currency: 'CRC'
      });
      observer.disconnect();
    });
  }, { threshold: 0.55 });
  observer.observe(section);
}

// Capture fbclid on page load
captureFbclid();

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

// Dynamic color selector based on quantity
const colorContainer = document.getElementById('color-selector-container');

function updateColorSelectors() {
  if (!colorContainer || !quantitySelect) return;

  const quantity = parseInt(quantitySelect.value) || 1;

  if (quantity === 1) {
    // Single unit: simple radio buttons
    colorContainer.innerHTML = `
      <div class="color-selector">
        <label class="color-option">
          <input type="radio" name="color_1" value="Blanco" checked>
          <span class="color-swatch color-white"></span>
          <span>Blanco</span>
        </label>
        <label class="color-option">
          <input type="radio" name="color_1" value="Negro">
          <span class="color-swatch color-black"></span>
          <span>Negro</span>
        </label>
      </div>`;
  } else {
    // Multiple units: one color picker per unit
    let html = '';
    for (let i = 1; i <= quantity; i++) {
      html += `
      <div class="color-unit-row">
        <span class="color-unit-label">Unidad ${i}:</span>
        <div class="color-selector">
          <label class="color-option color-option-sm">
            <input type="radio" name="color_${i}" value="Blanco" checked>
            <span class="color-swatch color-white"></span>
            <span>Blanco</span>
          </label>
          <label class="color-option color-option-sm">
            <input type="radio" name="color_${i}" value="Negro">
            <span class="color-swatch color-black"></span>
            <span>Negro</span>
          </label>
        </div>
      </div>`;
    }
    colorContainer.innerHTML = html;
  }
}

// Collect all color selections into a single string
function getColorSelections() {
  const quantity = parseInt(quantitySelect?.value) || 1;
  const colors = [];
  for (let i = 1; i <= quantity; i++) {
    const selected = document.querySelector(`input[name="color_${i}"]:checked`);
    colors.push(selected ? selected.value : 'Blanco');
  }
  return colors;
}

let addToCartFired = false;
if (quantitySelect) {
  quantitySelect.addEventListener('change', () => {
    updateTotal();
    updateColorSelectors();
    // Fire AddToCart on first quantity interaction
    if (!addToCartFired) {
      addToCartFired = true;
      const qty = parseInt(quantitySelect.value) || 1;
      const total = pricing[qty] || pricing[1];
      metaTrack('AddToCart', {
        content_ids: ['deepclean'],
        content_name: 'DeepClean - Limpiador de Oídos WiFi HD',
        content_type: 'product',
        value: total,
        currency: 'CRC'
      });
    }
  });
  // Initialize on page load
  updateTotal();
  updateColorSelectors();
}


// Form submission handler
const orderForm = document.getElementById('order-form');

if (orderForm) {
  orderForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Get form data
    const formData = new FormData(orderForm);
    const data = Object.fromEntries(formData);

    // Collect per-unit color selections
    const colors = getColorSelections();
    data.color = colors.join(', ');

    // Show loading overlay
    showLoading(true);

    try {
      await handleTilopayPayment(data);
    } catch (error) {
      console.error('Payment error:', error);
      showMessage('Error al procesar el pedido. Por favor, intentá de nuevo.', 'error');
      showLoading(false);
    }
  });
}

// Handle Tilopay payment
async function handleTilopayPayment(data) {
  try {
    // Forward Meta cookies for CAPI
    const metaCookies = getMetaCookies();
    const payload = {
      ...data,
      _fbp: metaCookies._fbp,
      _fbc: metaCookies._fbc,
      external_id: getOrCreateExternalId()
    };

    const response = await fetch(`${API_BASE_URL}/tilopay/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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
      // InitiateCheckout for Tarjeta — fire AFTER API response with matching eventID for dedup
      if (result.metaEventId) {
        const qty = parseInt(data.cantidad) || 1;
        const total = pricing[qty] || pricing[1];
        metaTrack('InitiateCheckout', {
          content_ids: ['deepclean'],
          content_type: 'product',
          num_items: qty,
          value: total,
          currency: 'CRC'
        }, { eventID: result.metaEventId });
      }
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

// Countdown timer for announcement bar — counts to midnight local time
function startAnnouncementTimer() {
  const timerEl = document.getElementById('announcement-timer');
  if (!timerEl) return;

  function update() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;

    if (diff <= 0) {
      timerEl.textContent = '00:00:00';
      return;
    }

    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = h + ':' + m + ':' + s;
  }

  update();
  setInterval(update, 1000);
}

// Initialize total on page load + Meta Pixel optimizations
document.addEventListener('DOMContentLoaded', function() {
  updateTotal();
  setupAdvancedMatching();
  setupViewContentObserver();
  startAnnouncementTimer();
});
