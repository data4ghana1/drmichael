// ============================================
// NORMAL AFA PORTAL — afa-normal.js
// Handles normal registration, file uploads, and history
// ============================================

let afaNormalPrice = 25;
let afaCurrentUser = null;
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    afaCurrentUser = user;

    await updateNormalWallet();
    await loadAfaPricing();
    await loadNormalHistory();

    // File input feedback
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function() {
            const dummy = this.nextElementSibling;
            if (this.files && this.files[0]) {
                dummy.querySelector('.file-msg').textContent = this.files[0].name;
                dummy.querySelector('.file-icon').textContent = '✅';
            }
        });
    });

  } catch (e) {
    console.error('AFA Normal init error:', e);
  }
});

async function updateNormalWallet() {
  const { data } = await supabase.from('users').select('wallet_balance').eq('id', afaCurrentUser.id).single();
  const balance = parseFloat(data?.wallet_balance || 0);
  const walletDisplay = document.getElementById('afaWalletDisplay');
  if (walletDisplay) {
      walletDisplay.textContent = `₵${balance.toFixed(2)}`;
  }
  return balance;
}

// Keep legacy for compatibility
async function getWallet() {
    return await updateNormalWallet();
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

    // 2. Fetch price from the pricing table for this role + afa_normal
    const { data: priceRow } = await supabase
      .from('pricing')
      .select('price')
      .eq('product', 'afa_normal')
      .eq('role', effectiveRole)
      .single();

    if (priceRow && priceRow.price !== undefined) {
      afaNormalPrice = parseFloat(priceRow.price);
    } else {
      // Fallback: system_config
      const { data: config } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'afa_settings')
        .single();
      if (config?.value?.normal_tier_price !== undefined) {
        afaNormalPrice = parseFloat(config.value.normal_tier_price);
      }
    }

    // 3. Update the fee display box
    const feeAmountEl = document.getElementById('normalFeeAmount');
    const feeRoleEl   = document.getElementById('normalFeeRole');
    if (feeAmountEl) feeAmountEl.textContent = `₵${afaNormalPrice.toFixed(2)}`;
    if (feeRoleEl)   feeRoleEl.textContent   = effectiveRole.replace(/_/g, ' ');

    // 4. Also update any inline price labels (legacy support)
    document.querySelectorAll('.normal-price-label').forEach(el => {
      el.textContent = `₵${afaNormalPrice.toFixed(2)}`;
    });

  } catch (e) {
    console.error('Failed to load AFA pricing:', e);
    const feeRoleEl = document.getElementById('normalFeeRole');
    if (feeRoleEl) feeRoleEl.textContent = 'Price unavailable';
  }
}

async function loadNormalHistory() {
  try {
    const { data: history, error } = await supabase
      .from('afa_registrations')
      .select('*')
      .eq('user_id', afaCurrentUser.id)
      .eq('tier', 'normal')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Update Pending Stat
    const pendingCount = history ? history.filter(i => i.status === 'pending' || i.status === 'pending_verification').length : 0;
    const totalCountElem = document.getElementById('totalAfaCount');
    if (totalCountElem) {
        totalCountElem.innerText = pendingCount;
    }

    const tbody = document.querySelector('#normalHistoryTable tbody');
    tbody.innerHTML = '';

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:60px; color:#94a3b8;"><div class="loading-state"><span style="font-size:32px;">📑</span><span>No normal registrations found.</span></div></td></tr>';
      return;
    }

    history.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      
      let statusHtml = '';
      if (item.status === 'completed' || item.status === 'approved') {
        statusHtml = `<span class="status-pill status-success">Success</span>`;
      } else if (item.status === 'failed' || item.status === 'rejected') {
        statusHtml = `<span class="status-pill status-failed">Failed</span>`;
      } else if (item.status === 'pending_verification' || item.status === 'pending') {
        statusHtml = `<span class="status-pill status-pending">Reviewing</span>`;
      } else {
        statusHtml = `<span class="status-pill status-pending">Pending</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Date"><div class="row-date">${dateStr}</div></td>
        <td data-label="Beneficiary">
            <span class="row-name">${item.full_name}</span>
            <span class="row-sub">Standard Route</span>
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
    console.error('Error loading normal history:', err);
    document.querySelector('#normalHistoryTable tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:40px;">Failed to load history matrix.</td></tr>';
  }
}

document.getElementById('normalAfaForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const idFront = document.getElementById('nIdFront').files[0];
  const idBack  = document.getElementById('nIdBack').files[0];

  if (!idFront || !idBack) {
    alert('Please upload both the front and back of your ID card.');
    return;
  }

  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Processing...';

  try {
    const walletBalance = await updateNormalWallet();
    const price = afaNormalPrice;

    // Fetch user's region for the CleanHeart AFA API
    const { data: profileData } = await supabase
      .from('users')
      .select('region')
      .eq('id', afaCurrentUser.id)
      .single();
    const userRegion = profileData?.region || 'Ghana';

    if (walletBalance < price) {
      alert(`Insufficient wallet balance. You need ₵${price.toFixed(2)} but have ₵${walletBalance.toFixed(2)}.`);
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Uploading Docs...';

    const frontPath = `afa/${afaCurrentUser.id}/id_front_${Date.now()}.${idFront.name.split('.').pop()}`;
    const { error: frontErr } = await supabase.storage.from('tickets').upload(frontPath, idFront);
    if (frontErr) throw new Error('ID front upload failed: ' + frontErr.message);

    const backPath = `afa/${afaCurrentUser.id}/id_back_${Date.now()}.${idBack.name.split('.').pop()}`;
    const { error: backErr } = await supabase.storage.from('tickets').upload(backPath, idBack);
    if (backErr) throw new Error('ID back upload failed: ' + backErr.message);

    btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Finalizing...';

    // ── Call the secure backend API for the entire process ──
    const response = await fetch(`${BACKEND_URL}/api/register-afa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id:     afaCurrentUser.id,
        full_name:    document.getElementById('nName').value,
        phone:        document.getElementById('nPhone').value,
        ghana_card:   document.getElementById('nIdNumber').value,
        id_type:      document.getElementById('nIdType').value || 'Ghana Card',
        dob:          document.getElementById('nDob').value,
        location:     document.getElementById('nLocation').value,
        id_front_url: frontPath,
        id_back_url:  backPath,
        tier:         'normal'
      })
    });
    
    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Server returned an error: HTTP ${response.status}`);
    }
    
    let result;
    try {
        result = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`Invalid JSON response from server.`);
    }

    if (window.sendSmsNotification) {
      window.sendSmsNotification(document.getElementById('nPhone').value, 'Data4Ghana: Your Normal AFA Registration has been submitted and is currently pending verification.');
    }

    if (window.showSuccessPopup) {
      window.showSuccessPopup('Request Submitted!', `Your Normal AFA registration is pending verification. Wallet charged ₵${price.toFixed(2)}.`, () => {
        window.location.href = 'afa-history.html';
      });
    } else {
      alert(`Normal AFA Registered! Wallet charged ₵${price.toFixed(2)}.`);
      window.location.href = 'afa-history.html';
    }

  } catch (err) {
    console.error('Normal AFA error:', err);
    alert('Registration failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
