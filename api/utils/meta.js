import crypto from 'crypto';

const PIXEL_ID = '1287887989919259';
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events`;

/**
 * SHA-256 hash after normalizing — Meta requires all PII to be hashed
 */
function hashValue(value) {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Build user_data from order + request. Includes _fbp, _fbc, external_id
 * when forwarded from the browser in req.body.
 */
function buildUserData(order, req) {
  const nameParts = (order.nombre || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const userData = {};

  // Hashed PII fields
  if (order.email) userData.em = [hashValue(order.email)];
  if (order.telefono) {
    let phone = String(order.telefono).replace(/\D/g, '');
    if (!phone.startsWith('506')) phone = '506' + phone;
    userData.ph = [hashValue(phone)];
  }
  if (firstName) userData.fn = [hashValue(firstName)];
  if (lastName) userData.ln = [hashValue(lastName)];
  if (order.canton) userData.ct = [hashValue(order.canton)];
  if (order.provincia) userData.st = [hashValue(order.provincia)];
  userData.country = [hashValue('cr')];
  userData.zp = [hashValue('10101')];

  // Raw fields (NOT hashed)
  if (req) {
    const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers?.['x-real-ip']
      || req.socket?.remoteAddress || '';
    if (ip) userData.client_ip_address = ip;
    const ua = req.headers?.['user-agent'] || '';
    if (ua) userData.client_user_agent = ua;
  }

  // _fbp / _fbc / external_id — forwarded from browser via req.body
  const body = req?.body || {};
  if (body._fbp) userData.fbp = body._fbp;
  if (body._fbc) userData.fbc = body._fbc;
  if (body.external_id) userData.external_id = [hashValue(body.external_id)];

  return userData;
}

/**
 * Deterministic event_id — same format used in browser for dedup
 */
export function generateEventId(prefix, orderId, extra) {
  return [prefix, orderId, extra].filter(Boolean).join('_');
}

/**
 * Send event to Meta Graph API. Fire-and-forget with .catch(() => {})
 */
export async function sendMetaEvent(eventName, eventId, order, req, customData, sourceUrl) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('[Meta CAPI] META_CAPI_ACCESS_TOKEN not configured — skipping');
    return { success: false, error: 'Not configured' };
  }

  try {
    const eventData = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: sourceUrl || 'https://deepclean.shopping',
      user_data: buildUserData(order || {}, req),
    };

    if (customData && Object.keys(customData).length > 0) {
      eventData.custom_data = customData;
    }

    const response = await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [eventData], access_token: accessToken }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error(`[Meta CAPI] ${eventName} failed:`, result);
      return { success: false, error: result };
    }
    console.log(`[Meta CAPI] ${eventName} sent (id: ${eventId})`);
    return { success: true, result };
  } catch (error) {
    console.error(`[Meta CAPI] ${eventName} error:`, error.message);
    return { success: false, error: error.message };
  }
}
