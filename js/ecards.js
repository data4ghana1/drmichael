// js/ecards.js  — PIN Inventory Dispenser

let currentUser  = null;
let walletBalance = 0;
let userRole     = 'client';
let prices       = { wassce: 0, bece: 0 };
let selectedProduct = null;
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://data4ghana.com';

document.addEventListener('DOMContentLoaded', async () => {
    await initEcards();
});

async function initEcards() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = 'login.html'; return; }
        currentUser = user;

        // Fetch wallet & role
        const { data: userData } = await supabase
            .from('users')
            .select('wallet_balance, role')
            .eq('id', user.id)
            .single();

        if (userData) {
            walletBalance = parseFloat(userData.wallet_balance || 0);
            userRole = userData.role === 'admin' ? 'super_agent' : (userData.role || 'client');
            document.getElementById('ecWalletDisplay').textContent = `₵${walletBalance.toFixed(2)}`;
        }

        // Fetch pricing
        const { data: pricingData } = await supabase
            .from('pricing')
            .select('product, price')
            .eq('role', userRole)
            .in('product', ['ecard_wassce', 'ecard_bece']);

        if (pricingData && pricingData.length > 0) {
            pricingData.forEach(p => {
                if (p.product === 'ecard_wassce') {
                    prices.wassce = parseFloat(p.price);
                    document.querySelector('.wassce-price-label').textContent = `₵${prices.wassce.toFixed(2)}`;
                }
                if (p.product === 'ecard_bece') {
                    prices.bece = parseFloat(p.price);
                    document.querySelector('.bece-price-label').textContent = `₵${prices.bece.toFixed(2)}`;
                }
            });
        } else {
            document.querySelector('.wassce-price-label').textContent = 'N/A';
            document.querySelector('.bece-price-label').textContent   = 'N/A';
        }

        await loadHistory();
    } catch (err) {
        console.error('E-Cards init error:', err);
    }
}

async function loadHistory() {
    try {
        const { data: orders } = await supabase
            .from('orders')
            .select('created_at, product, amount, status, ecard_pin, ecard_serial')
            .eq('user_id', currentUser.id)
            .in('product', ['ecard_wassce', 'ecard_bece'])
            .order('created_at', { ascending: false })
            .limit(20);

        const tbody = document.getElementById('ecardsHistoryBody');
        if (!orders || orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:#94a3b8;">No e-card purchases yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = orders.map(o => {
            const typeLabel = o.product === 'ecard_wassce' ? 'WASSCE' : 'BECE';
            const date = new Date(o.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
            const badgeClass = o.status === 'completed' ? 'badge-success' : o.status === 'failed' ? 'badge-failed' : 'badge-pending';
            const badgeLabel = o.status === 'completed' ? 'Delivered' : o.status === 'failed' ? 'Failed' : 'Pending';
            const pinInfo = o.ecard_pin ? `<div style="font-size:11px; color:#94a3b8; margin-top:3px;">PIN: <code style="color:#60a5fa; font-weight:700;">${o.ecard_pin}</code></div>` : '';
            const serialInfo = o.ecard_serial ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">S/N: <code>${o.ecard_serial}</code></div>` : '';
            return `
                <tr>
                    <td>${date}</td>
                    <td><span style="font-weight:600;">${typeLabel}</span>${pinInfo}${serialInfo}</td>
                    <td>₵${parseFloat(o.amount || 0).toFixed(2)}</td>
                    <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load history:', err);
    }
}

// ── Modal ─────────────────────────────────────────────────────────────────
window.openModal = function(product) {
    selectedProduct = product;
    const isWassce = product === 'wassce';
    const price = isWassce ? prices.wassce : prices.bece;

    document.getElementById('modalIcon').textContent  = isWassce ? '🎓' : '📋';
    document.getElementById('modalTitle').textContent = isWassce ? 'Purchase WASSCE E-Card' : 'Purchase BECE E-Card';
    document.getElementById('modalDesc').textContent  = isWassce
        ? 'Confirm purchase and an available PIN will be instantly revealed to you.'
        : 'Confirm purchase and an available PIN will be instantly revealed to you.';

    document.getElementById('modalPrice').textContent   = `₵${price.toFixed(2)}`;
    document.getElementById('modalBalance').textContent = `₵${walletBalance.toFixed(2)}`;
    document.getElementById('ecModalError').style.display = 'none';

    // Hide result area if previously shown
    const result = document.getElementById('ecPinResult');
    if (result) result.style.display = 'none';

    const btn = document.getElementById('ecSubmitBtn');
    btn.className = `ec-submit-btn ${isWassce ? '' : 'bece-mode'}`;
    document.getElementById('ecSubmitText').textContent = 'Confirm Purchase';
    btn.disabled = false;

    document.getElementById('candidatePhone').value = '';
    document.getElementById('ecardModal').style.display = 'flex';
};

window.closeModal = function(e) {
    if (e.target === document.getElementById('ecardModal')) closeModalDirect();
};

window.closeModalDirect = function() {
    document.getElementById('ecardModal').style.display = 'none';
};

// ── Purchase & Dispense PIN ───────────────────────────────────────────────
window.submitEcard = async function() {
    const errorEl = document.getElementById('ecModalError');
    errorEl.style.display = 'none';

    const phone = document.getElementById('candidatePhone').value.trim();
    const price = selectedProduct === 'wassce' ? prices.wassce : prices.bece;
    const productKey = `ecard_${selectedProduct}`;

    if (price === 0) {
        errorEl.textContent = 'This product is not yet configured by the admin. Please try later.';
        errorEl.style.display = 'block';
        return;
    }

    if (walletBalance < price) {
        errorEl.textContent = `Insufficient balance. Need ₵${price.toFixed(2)}, you have ₵${walletBalance.toFixed(2)}.`;
        errorEl.style.display = 'block';
        return;
    }

    if (!phone || phone.length < 10) {
        errorEl.textContent = 'Please enter a valid 10-digit phone number.';
        errorEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('ecSubmitBtn');
    btn.disabled = true;
    document.getElementById('ecSubmitText').textContent = 'Dispensing PIN...';

    try {
        const response = await fetch(`${BACKEND_URL}/api/buy-ecard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agent_id: currentUser.id,
                phone:    phone,
                product:  productKey
            })
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Server error');

        const pin = result.pin;
        const serial = result.serial;

        // Dispatch SMS Notification
        if (window.sendSmsNotification) {
            const smsMsg = `Your Data4Ghana E-Card is ready. PIN: ${pin}. Serial: ${serial}. Please share these details with your recipient. Thank you for using Data4Ghana.`;
            await window.sendSmsNotification(phone, smsMsg);
        }

        // 6. Update local balance
        walletBalance = result.new_balance;
        document.getElementById('ecWalletDisplay').textContent = `₵${walletBalance.toFixed(2)}`;

        // 7. Show the PIN result card inside the modal
        showPinResult(pin, serial, selectedProduct);
        btn.style.display = 'none';
        
        // Let Supabase sync, then fetch history
        setTimeout(() => loadHistory(), 800);

    } catch (err) {
        console.error('E-Card purchase error:', err);
        errorEl.textContent = `Purchase failed: ${err.message}`;
        errorEl.style.display = 'block';
        btn.disabled = false;
        document.getElementById('ecSubmitText').textContent = 'Confirm Purchase';
    }
};

function showPinResult(pin, serial, product) {
    const isWassce = product === 'wassce';
    const color = isWassce ? '#60a5fa' : '#34d399';
    const label = isWassce ? 'WASSCE' : 'BECE';

    let resultEl = document.getElementById('ecPinResult');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'ecPinResult';
        document.getElementById('ecardModal').querySelector('.ec-modal').appendChild(resultEl);
    }

    resultEl.style.display = 'block';
    resultEl.innerHTML = `
        <div style="margin-top:20px; background:rgba(0,0,0,0.4); border:1px solid ${color}33; border-radius:14px; padding:20px; text-align:center;">
            <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">✅ ${label} E-Card Dispensed</div>
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">PIN</div>
            <div style="font-family:monospace; font-size:26px; font-weight:800; color:${color}; letter-spacing:2px; margin-bottom:16px;">${pin}</div>
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">SERIAL NUMBER</div>
            <div style="font-family:monospace; font-size:14px; color:#e2e8f0; letter-spacing:1px;">${serial}</div>
            <button onclick="navigator.clipboard.writeText('PIN: ${pin} | SERIAL: ${serial}').then(() => this.textContent = '✅ Copied!')"
                style="margin-top:16px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#f1f5f9; padding:8px 20px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">
                📋 Copy PIN &amp; Serial
            </button>
        </div>
    `;
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast() {
    const toast = document.getElementById('ecSuccessToast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}
