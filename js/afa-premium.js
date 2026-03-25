// ============================================
// PREMIUM AFA PORTAL — afa-premium.js
// Handles premium registration, payments, and history
// ============================================

let afaPremiumPrice = 30;
let afaCurrentUser  = null;
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    afaCurrentUser = user;

    await updateAfaWallet();
    await loadAfaPricing();
    await loadPremiumHistory();

  } catch (e) {
    console.error('AFA Premium init error:', e);
  }
});

async function updateAfaWallet() {
  const { data } = await supabase.from('users').select('wallet_balance').eq('id', afaCurrentUser.id).single();
  const balance = parseFloat(data?.wallet_balance || 0);
  const walletDisplay = document.getElementById('afaWalletDisplay');
  if (walletDisplay) {
      walletDisplay.textContent = `₵${balance.toFixed(2)}`;
  }
  return balance;
}

// Keep legacy for compatibility in form handler
async function getWallet() {
    return await updateAfaWallet();
}

async function loadAfaPricing() {
  try {
    // 1. Get the user's role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', afaCurrentUser.id)
      .single();

    const userRole = userData?.role || 'client';
    // admins use super_agent pricing as a fallback
    const effectiveRole = userRole === 'admin' ? 'super_agent' : userRole;

    // 2. Fetch price from the pricing table for this role + afa_premium
    const { data: priceRow } = await supabase
      .from('pricing')
      .select('price')
      .eq('product', 'afa_premium')
      .eq('role', effectiveRole)
      .single();

    if (priceRow && priceRow.price !== undefined) {
      afaPremiumPrice = parseFloat(priceRow.price);
    } else {
      // Fallback: system_config
      const { data: config } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'afa_settings')
        .single();
      if (config?.value?.premium_tier_price !== undefined) {
        afaPremiumPrice = parseFloat(config.value.premium_tier_price);
      }
    }

    // 3. Update the fee display box
    const feeAmountEl = document.getElementById('premiumFeeAmount');
    const feeRoleEl   = document.getElementById('premiumFeeRole');
    if (feeAmountEl) feeAmountEl.textContent = `₵${afaPremiumPrice.toFixed(2)}`;
    if (feeRoleEl)   feeRoleEl.textContent   = effectiveRole.replace(/_/g, ' ');

    // 4. Also update any inline price labels (legacy support)
    document.querySelectorAll('.premium-price-label').forEach(el => {
      el.textContent = `₵${afaPremiumPrice.toFixed(2)}`;
    });

  } catch (e) {
    console.error('Failed to load AFA pricing:', e);
    const feeRoleEl = document.getElementById('premiumFeeRole');
    if (feeRoleEl) feeRoleEl.textContent = 'Price unavailable';
  }
}

async function loadPremiumHistory() {
  try {
    const { data: history, error } = await supabase
      .from('afa_registrations')
      .select('*')
      .eq('user_id', afaCurrentUser.id)
      .eq('tier', 'premium')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Update Global Count Stat
    const totalCountElem = document.getElementById('totalAfaCount');
    if (totalCountElem) {
        totalCountElem.innerText = history ? history.length : 0;
    }

    const tbody = document.querySelector('#premiumHistoryTable tbody');
    tbody.innerHTML = '';

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:60px; color:#94a3b8;"><div class="loading-state"><span style="font-size:32px;">📑</span><span>No premium registrations found.</span></div></td></tr>';
      return;
    }

    history.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { 
          day:'numeric', 
          month:'short', 
          year:'numeric' 
      });
      
      let statusHtml = '';
      if (item.status === 'completed' || item.status === 'approved') {
        statusHtml = `<span class="status-pill status-success">Success</span>`;
      } else if (item.status === 'failed' || item.status === 'rejected') {
        statusHtml = `<span class="status-pill status-failed">Failed</span>`;
      } else {
        statusHtml = `<span class="status-pill status-pending">Pending</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Date"><div class="row-date">${dateStr}</div></td>
        <td data-label="Beneficiary">
            <span class="row-name">${item.full_name}</span>
            <span class="row-sub">Premium Route</span>
        </td>
        <td data-label="Phone"><div class="row-date">${item.phone}</div></td>
        <td data-label="Identity Details">
            <div class="id-badge">${item.id_type}</div>
            <div class="id-details">
                <div>${item.id_number}</div>
                <div style="font-size:11px; opacity:0.7; margin-top:4px;">DOB: ${item.dob || 'N/A'}</div>
            </div>
        </td>
        <td data-label="Status">${statusHtml}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error loading premium history:', err);
    document.querySelector('#premiumHistoryTable tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:40px;">Failed to load history matrix.</td></tr>';
  }
}

document.getElementById('premiumAfaForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Processing...';

  try {
    const walletBalance = await updateAfaWallet();
    
    // Ensure we use the freshly fetched role-based price 
    const price = afaPremiumPrice;

    if (walletBalance < price) {
      alert(`Insufficient wallet balance. You need ₵${price.toFixed(2)} but have ₵${walletBalance.toFixed(2)}.`);
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    // ── Call the secure backend API for the entire process ──
    const response = await fetch(`${BACKEND_URL}/api/register-afa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id:     afaCurrentUser.id,
        full_name:    document.getElementById('pName').value,
        phone:        document.getElementById('pPhone').value,
        ghana_card:   document.getElementById('pIdNumber').value,
        id_type:      'Ghana Card',
        dob:          document.getElementById('pDob').value,
        tier:         'premium'
      })
    });
    
    const responseText = await response.text();
    if (!responseText) throw new Error(`Server returned an empty response (HTTP ${response.status} ${response.statusText}).`);
    
    let result;
    try {
        result = JSON.parse(responseText);
    } catch (e) {
        throw new Error("Invalid JSON response from server.");
    }

    if (!response.ok) throw new Error(result.error || 'AFA API error');

    if (window.sendSmsNotification) {
      window.sendSmsNotification(document.getElementById('pPhone').value, 'Welcome to Data4Ghana! Your Premium AFA Registration has been successfully completed.');
    }

    if (window.showSuccessPopup) {
      window.showSuccessPopup('AFA Registered!', `Your Premium AFA account has been configured. Wallet charged ₵${price.toFixed(2)}.`, () => {
        window.location.href = 'afa-history.html';
      });
    } else {
      alert(`Premium AFA Registered! Wallet charged ₵${price.toFixed(2)}.`);
      window.location.href = 'afa-history.html';
    }

  } catch (err) {
    console.error('Premium AFA error:', err);
    alert('Registration failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
