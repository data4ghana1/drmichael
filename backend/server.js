/**
 * Data4Ghana — Multi-Provider VTU & AFA Backend
 * -----------------------------------------------
 * Routes:
 *   POST /api/buy-data         — Purchase data (MTN, Telecel, Ishare)
 *   POST /api/register-afa     — Register AFA via 'Since' engine
 *   POST /api/buy-ecard        — Securely purchase E-Card PINs
 *   POST /webhook/mtn-update   — Handle MTN/Telecel provider callbacks
 */

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ─── Supabase Client (Service Role for backend operations) ───────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Dispatch to the correct MTN provider based on DB endpoint config
// ═══════════════════════════════════════════════════════════════════════════════
async function dispatchToProvider(endpoint, phone, gb, orderId) {
  const provider = (endpoint.provider || '').toLowerCase();
  const baseUrl  = endpoint.base_url;
  const apiKey   = endpoint.api_key;

  let url, headers, body;

  if (provider === 'cleanheart' || baseUrl.includes('cleanheartsolutions')) {
    // ── Engine: Since ──────────────────────────────────────────────────────
    let netKey = 'YELLO';
    if (endpoint.network === 'Telecel') netKey = 'VODA';
    if (endpoint.network === 'Ishare') netKey = 'AIRTELTIGO';

    url     = baseUrl.endsWith('/') ? `${baseUrl}purchase` : `${baseUrl}/purchase`;
    headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
    body    = { networkKey: netKey, recipient: phone, capacity: gb };

  } else if (provider === 'datawavegh' || baseUrl.includes('datawavegh')) {
    // ── Engine: Dennis ──────────────────────────────────────────────────────
    const authString = apiKey.includes(':') ? Buffer.from(apiKey).toString('base64') : apiKey;
    url     = baseUrl.endsWith('/') ? `${baseUrl}place-order` : `${baseUrl}/place-order`;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` };
    body    = {
      network:      endpoint.network.toLowerCase(),
      recipient:    phone,
      package_size: gb,
      order_id:     `TXN-${String(orderId).replace(/-/g, '').substring(0, 10)}`
    };

  } else if (provider === 'jaybart' || baseUrl.includes('jaybartservices')) {
    // ── Engine: Justices ────────────────────────────────────────────────────
    url     = `${baseUrl}/place-order`;
    headers = { 'Content-Type': 'application/json' };
    body    = {
      api_key:    apiKey,
      package_id: endpoint.provider_package_id,
      phone:      phone
    };

  } else if (provider === 'spfastit' || baseUrl.includes('spfastit')) {
    // ── SPFastIT — form-encoded, size in MB ─────────────────────────────────
    const mb   = Math.round(gb * 1024);
    url        = baseUrl;
    headers    = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const params = new URLSearchParams({ api_key: apiKey, phone, data_plan: mb });
    body       = params.toString();

  } else {
    // ── Data4Ghana (default) ─────────────────────────────────────────────────
    url     = `${baseUrl}/buy-data`;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    body    = { phone, network: endpoint.network, plan: `${gb}GB` };
  }

  const response = await axios.post(url, body, { headers, timeout: 20000 });
  return response;
}


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 1: POST /api/buy-data
// Handles agent requests to purchase data bundles (MTN, Telecel, Ishare).
// Automatically picks the active provider for the requested network.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/buy-data', async (req, res) => {
  const { agent_id, phone, network, plan_gb, plan_cost } = req.body;

  if (!agent_id || !phone || !network || !plan_gb || !plan_cost) {
    return res.status(400).json({ error: 'Missing required fields: agent_id, phone, network, plan_gb, plan_cost' });
  }

  try {
    // 1. Fetch agent wallet balance
    const { data: agent, error: agentErr } = await supabase
      .from('users')
      .select('id, wallet_balance')
      .eq('id', agent_id)
      .single();

    if (agentErr || !agent) return res.status(404).json({ error: 'Agent not found.' });

    // 2. Check balance
    if (agent.wallet_balance < plan_cost) {
      return res.status(402).json({
        error: 'Insufficient wallet balance.',
        current_balance: agent.wallet_balance,
        required: plan_cost
      });
    }

    // 3. Deduct wallet
    const newBalance = parseFloat((agent.wallet_balance - plan_cost).toFixed(2));
    const { error: deductErr } = await supabase
      .from('users')
      .update({ wallet_balance: newBalance })
      .eq('id', agent_id);

    if (deductErr) throw new Error('Wallet deduction failed: ' + deductErr.message);

    // 4. Get the active provider for the requested network from DB
    const { data: endpoint, error: epErr } = await supabase
      .from('vtu_api_endpoints')
      .select('*')
      .eq('network', network)
      .eq('is_active', true)
      .single();

    if (epErr || !endpoint) throw new Error(`No active provider configured for ${network}.`);

    // 5. Log the order as 'pending' before dispatching
    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: agent_id,
        phone,
        network: network,
        plan: `${plan_gb}GB`,
        amount: plan_cost,
        status: 'pending'
      })
      .select('id')
      .single();

    if (orderErr) throw new Error('Order logging failed: ' + orderErr.message);

    // 6. Dispatch to provider (non-blocking failure — order still saved)
    let providerRef = null;
    try {
      const provRes = await dispatchToProvider(endpoint, phone, plan_gb, newOrder.id);
      const data    = provRes.data;

      // Detect success across providers (200 or 201)
      const isSuccess = data?.status === 'success' || data?.success === true ||
                        provRes.status === 200 || provRes.status === 201;

      if (isSuccess) {
        providerRef = data?.data?.reference || data?.reference || null;
        // Update order status to 'processing' and store reference
        await supabase
          .from('orders')
          .update({ status: 'processing', vtu_reference: providerRef })
          .eq('id', newOrder.id);
      }
    } catch (provErr) {
      console.error(`[${endpoint.provider}] Provider dispatch failed:`, provErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `${plan_gb}GB ${network} data order placed for ${phone}.`,
      order_id:    newOrder.id,
      provider:    endpoint.provider,
      reference:   providerRef,
      new_balance: newBalance
    });

  } catch (err) {
    console.error('[POST /api/buy-data]', err.message);
    return res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 2: POST /api/register-afa
// Submits an AFA Normal registration via 'Since' engine.
// Uses the agent's registered region as the location field.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/register-afa', async (req, res) => {
  const { agent_id, full_name, phone, ghana_card, dob, id_front_url, id_back_url, tier } = req.body;

  if (!agent_id || !full_name || !phone || !ghana_card) {
    return res.status(400).json({ error: 'Missing required fields: agent_id, full_name, phone, ghana_card' });
  }

  // Validate Ghana Card format (GHA-XXXXXXXXX-X)
  if (!/^GHA-\d{9}-\d$/.test(ghana_card)) {
    return res.status(400).json({ error: 'Invalid Ghana Card format. Expected: GHA-XXXXXXXXX-X' });
  }

  try {
    // 1. Fetch agent profile (wallet + region)
    const { data: agent, error: agentErr } = await supabase
      .from('users')
      .select('wallet_balance, region')
      .eq('id', agent_id)
      .single();

    if (agentErr || !agent) return res.status(404).json({ error: 'Agent not found.' });

    // 2. Get AFA pricing from system config
    const { data: config } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'afa_settings')
      .single();

    const selectedTier = tier || 'normal';
    const afaPrice = parseFloat(config?.value?.[`${selectedTier}_tier_price`] || (selectedTier === 'premium' ? 30 : 25));

    // 3. Check wallet balance
    if (agent.wallet_balance < afaPrice) {
      return res.status(402).json({
        error: 'Insufficient wallet balance for AFA registration.',
        current_balance: agent.wallet_balance,
        required: afaPrice
      });
    }

    // 4. Deduct AFA fee from wallet
    const newBalance = parseFloat((agent.wallet_balance - afaPrice).toFixed(2));
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', agent_id);

    // 5. Log AFA registration as 'pending'
    const { data: afaReg, error: afaErr } = await supabase
      .from('afa_registrations')
      .insert({
        user_id:   agent_id,
        full_name,
        phone,
        id_type:   'Ghana Card',
        id_number: ghana_card,
        dob:       dob || null,
        id_front_url: id_front_url || null,
        id_back_url:  id_back_url || null,
        tier:      selectedTier,
        status:    'pending'
      })
      .select('id')
      .single();

    if (afaErr) throw new Error('AFA record creation failed: ' + afaErr.message);

    // 6. Submit to 'Since' AFA API
    let afaReference = null;
    try {
      const afaRes = await axios.post(
        'https://cleanheartsolutions.com/api/afa',
        {
          full_name,
          phone,
          ghana_card,
          location: agent.region || 'Ghana'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.CLEANHEART_API_KEY
          },
          timeout: 15000
        }
      );

      if (afaRes.status === 201 || afaRes.data?.status === 'success') {
        afaReference = afaRes.data?.data?.reference || null;
        // Save reference to DB record
        if (afaReference) {
          await supabase
            .from('afa_registrations')
            .update({ vtu_reference: afaReference })
            .eq('id', afaReg.id);
        }
      }
    } catch (afaApiErr) {
      console.warn('[AFA] Activation engine (Since) failed (record still saved):', afaApiErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `AFA registration submitted for ${full_name}.`,
      registration_id: afaReg.id,
      reference:   afaReference,
      new_balance: newBalance
    });

  } catch (err) {
    console.error('[POST /api/register-afa]', err.message);
    return res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 3: POST /api/buy-ecard
// Securely dispenses an E-Card PIN and deducts balance.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/buy-ecard', async (req, res) => {
  const { agent_id, phone, product } = req.body; // product: 'ecard_wassce' or 'ecard_bece'

  if (!agent_id || !phone || !product) {
    return res.status(400).json({ error: 'Missing required fields: agent_id, phone, product' });
  }

  try {
    // 1. Fetch agent profile
    const { data: agent, error: agentErr } = await supabase
      .from('users')
      .select('id, wallet_balance, role')
      .eq('id', agent_id)
      .single();

    if (agentErr || !agent) return res.status(404).json({ error: 'Agent not found.' });

    // 2. Get pricing for the e-card
    const role = agent.role === 'admin' ? 'super agent' : (agent.role || 'client');
    const { data: pricing } = await supabase
      .from('pricing')
      .select('price')
      .eq('role', role)
      .eq('product', product)
      .single();

    if (!pricing) return res.status(404).json({ error: 'Pricing not found for this product/role.' });
    const price = parseFloat(pricing.price);

    // 3. Check wallet balance
    if (agent.wallet_balance < price) {
      return res.status(402).json({ error: 'Insufficient wallet balance.' });
    }

    // 4. Find an unused PIN in inventory
    const { data: pins, error: pinErr } = await supabase
      .from('ecard_inventory')
      .select('id, pin, serial')
      .eq('product', product)
      .eq('is_used', false)
      .limit(1);

    if (pinErr || !pins || pins.length === 0) {
      return res.status(503).json({ error: 'Out of stock. No PINs available.' });
    }
    const pinRecord = pins[0];

    // 5. SECURE TRANSACTION: Update everything
    // Mark used
    await supabase.from('ecard_inventory').update({ 
      is_used: true, used_by: agent_id, used_at: new Date().toISOString() 
    }).eq('id', pinRecord.id);

    // Deduct wallet
    const newBalance = parseFloat((agent.wallet_balance - price).toFixed(2));
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', agent_id);

    // Record order
    const { data: newOrder } = await supabase.from('orders').insert({
      user_id: agent_id,
      product: product,
      plan: product.includes('wassce') ? 'WASSCE' : 'BECE',
      amount: price,
      phone: phone,
      status: 'completed',
      network: 'ecard',
      ecard_pin: pinRecord.pin,
      ecard_serial: pinRecord.serial
    }).select('id').single();

    // Record transaction
    await supabase.from('transactions').insert({
      user_id: agent_id,
      type: 'debit',
      amount: price,
      description: `${product.replace('ecard_', '').toUpperCase()} E-Card purchase`,
      status: 'completed',
      balance_before: agent.wallet_balance,
      balance_after: newBalance
    });

    return res.status(201).json({
      success: true,
      message: `${product.toUpperCase()} E-Card dispensed successfully.`,
      pin: pinRecord.pin,
      serial: pinRecord.serial,
      order_id: newOrder.id,
      new_balance: newBalance
    });

  } catch (err) {
    console.error('[POST /api/buy-ecard]', err.message);
    return res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 4: POST /webhook/mtn-update
// Receives provider callbacks and updates order status to 'completed'.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/webhook/mtn-update', async (req, res) => {
  const { reference, status, phone } = req.body;

  // Acknowledge immediately to prevent provider retries
  res.status(200).json({ received: true });

  if (!reference || !status) {
    console.warn('[Webhook] Incomplete payload received:', req.body);
    return;
  }

  try {
    if (String(status).toLowerCase() !== 'completed') {
      console.log(`[Webhook] Skipping status: ${status}`);
      return;
    }

    // Find the order by provider reference
    const { data: order, error: findErr } = await supabase
      .from('orders')
      .select('id, phone')
      .eq('vtu_reference', reference)
      .single();

    if (findErr || !order) {
      console.error(`[Webhook] Order not found for ref: ${reference}`);
      return;
    }

    // Update order status to 'completed'
    await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    console.log(`[Webhook] Order ${order.id} → completed`);

    // Send SMS confirmation to the customer
    const customerPhone = phone || order.phone;
    if (customerPhone) {
      await sendSmsNotification(
        customerPhone,
        `Data4Ghana: Your MTN data bundle has been delivered to ${customerPhone}. Thank you!`
      );
    }

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});


// ─── Helper: Send SMS notification ───────────────────────────────────────────
async function sendSmsNotification(phone, message) {
  if (!process.env.SMS_API_URL || !process.env.SMS_API_KEY) return;
  try {
    await axios.post(
      process.env.SMS_API_URL,
      { phone, message },
      { headers: { 'Authorization': `Bearer ${process.env.SMS_API_KEY}` }, timeout: 10000 }
    );
    console.log(`[SMS] Sent to ${phone}`);
  } catch (err) {
    console.warn(`[SMS] Failed to send to ${phone}:`, err.message);
  }
}


// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Data4Ghana Backend running on port ${PORT}`);
  console.log(`   POST /api/buy-data`);
  console.log(`   POST /api/register-afa`);
  console.log(`   POST /api/buy-ecard`);
  console.log(`   POST /webhook/mtn-update`);
});
