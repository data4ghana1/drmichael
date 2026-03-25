// js/admin-modals.js

let walletCurrentAction = 'credit';

async function injectAdminModals() {
    if (document.getElementById('walletControlModal')) return;

    try {
        const response = await fetch('components/admin-modals.html');
        if (!response.ok) throw new Error("Failed to fetch admin modals");
        const html = await response.text();
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div);
    } catch (err) {
        console.error("Error injecting admin modals:", err);
    }
}

window.openUserWalletModal = function(userId, currentBal) {
    injectAdminModals().then(() => {
        document.getElementById('walletControlUserSelect').value = userId;
        populateWalletModalUser(userId, currentBal);
        openGlobalWalletModal('credit');
    });
}

function populateWalletModalUser(userId, bal) {
    // This assumes allUsersCache is available from admin-users.js or admin-core.js
    const user = (window.allUsersCache || []).find(u => u.id === userId);
    document.getElementById('walletControlUserSelect').value = userId;
    if (user) {
        const phone = user.phone || 'No Phone';
        document.getElementById('walletControlUserSearch').value = `${user.email} (${phone})`;
    }
    document.getElementById('walletControlCurrentBal').innerText = `₵${Number(bal).toFixed(2)}`;
}

window.openGlobalWalletModal = function(actionType = 'credit') {
    const modal = document.getElementById('walletControlModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setWalletAction(actionType);
}

window.closeWalletControlModal = function() {
    const modal = document.getElementById('walletControlModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.getElementById('walletControlAmount').value = '';
    document.getElementById('walletControlUserSelect').value = '';
    document.getElementById('walletControlUserSearch').value = '';
    document.getElementById('walletControlCurrentBal').innerText = '₵0.00';
    document.getElementById('walletControlUserResults').style.display = 'none';
}

window.setWalletAction = function(action) {
    walletCurrentAction = action;
    const btnCredit = document.getElementById('btnCreditToggle');
    const btnDebit = document.getElementById('btnDebitToggle');
    
    if (action === 'credit') {
        btnCredit.style.background = 'rgba(16,185,129,0.1)';
        btnCredit.style.borderColor = '#10b981';
        btnCredit.style.color = '#10b981';
        
        btnDebit.style.background = 'rgba(239,68,68,0.1)';
        btnDebit.style.borderColor = 'var(--glass-border)';
        btnDebit.style.color = 'var(--text-muted)';
    } else {
        btnDebit.style.background = 'rgba(239,68,68,0.1)';
        btnDebit.style.borderColor = '#ef4444';
        btnDebit.style.color = '#ef4444';
        
        btnCredit.style.background = 'rgba(16,185,129,0.1)';
        btnCredit.style.borderColor = 'var(--glass-border)';
        btnCredit.style.color = 'var(--text-muted)';
    }
}

window.executeWalletAdjustment = async function() {
    const userId = document.getElementById('walletControlUserSelect').value;
    const amountStr = document.getElementById('walletControlAmount').value;
    const amount = Number(amountStr);
    
    if (!userId) {
        alert("Please select a user.");
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert("Amount must be greater than 0.");
        return;
    }
    
    const isCredit = walletCurrentAction === 'credit';
    const amountChange = isCredit ? amount : -amount;
    const trxType = isCredit ? "Admin Credit" : "Admin Debit";
    
    const btn = document.getElementById('btnExecuteWallet');
    btn.disabled = true;
    btn.innerText = 'Processing...';
    
    try {
        const { data, error } = await supabase.rpc("admin_adjust_wallet", {
          target_user_id: userId,
          amount_change: amountChange,
          trx_type: trxType
        });

        if (error) throw error;
        
        alert(`Success! New balance is ₵${Number(data.new_balance).toFixed(2)}`);
        
        closeWalletControlModal();
        if (window.loadUsers) window.loadUsers();
        if (window.loadWalletMetrics) window.loadWalletMetrics();
        if (window.loadWalletTransactions) window.loadWalletTransactions();
    } catch(err) {
        alert("Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Confirm Adjustment';
    }
}

window.filterWalletUsers = async function() {
    const q = (document.getElementById('walletControlUserSearch').value || '').toLowerCase().trim();
    const resultsDiv = document.getElementById('walletControlUserResults');
    
    if (!window.allUsersCache || window.allUsersCache.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:10px 12px; color:var(--text-muted); font-size:13px;">Loading users...</div>';
        resultsDiv.style.display = 'block';
        
        try {
            const { data, error } = await supabase.from('users').select('id, email, phone, first_name, last_name, merchant_id, wallet_balance, role');
            if (error) throw error;
            window.allUsersCache = data || [];
        } catch (err) {
            resultsDiv.innerHTML = '<div style="padding:10px 12px; color:#ef4444; font-size:13px;">Error loading users.</div>';
            return;
        }
    }
    
    let filtered = window.allUsersCache;
    if (q) {
        filtered = window.allUsersCache.filter(u => 
            (u.email || '').toLowerCase().includes(q) ||
            (u.phone || '').toLowerCase().includes(q) ||
            (u.merchant_id || '').toLowerCase().includes(q) ||
            (u.first_name || '').toLowerCase().includes(q) ||
            (u.last_name || '').toLowerCase().includes(q)
        );
    }
    
    filtered = filtered.slice(0, 20);
    
    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:10px 12px; color:var(--text-muted); font-size:13px;">No matching users.</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(u => {
            const code = u.merchant_id || 'N/A';
            const phone = u.phone || 'No Phone';
            const bal = Number(u.wallet_balance || 0).toFixed(2);
            return `<div onclick="selectWalletUser('${u.id}', ${u.wallet_balance}, '${escapeQuote(u.email)}', '${escapeQuote(phone)}')" style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; font-size:13px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <div style="font-weight:600; color:white;">${u.email}</div>
                <div style="display:flex; gap:10px; color:var(--text-muted); font-size:11px; margin-top:4px;">
                    <span>📞 ${phone}</span>
                    <span style="color:var(--blue);">${code}</span>
                    <span style="color:#10b981; font-weight:700;">₵${bal}</span>
                </div>
            </div>`;
        }).join('');
    }
    resultsDiv.style.display = 'block';
}

window.selectWalletUser = function(userId, bal, email, phone) {
    document.getElementById('walletControlUserSelect').value = userId;
    document.getElementById('walletControlUserSearch').value = `${email} (${phone})`;
    document.getElementById('walletControlCurrentBal').innerText = `₵${Number(bal).toFixed(2)}`;
    document.getElementById('walletControlUserResults').style.display = 'none';
}

// User Transactions Ledger
async function switchUtTab(tab) {
    document.getElementById('utTabOrders').style.color = tab === 'orders' ? 'white' : 'var(--text-muted)';
    document.getElementById('utTabOrders').style.borderBottomColor = tab === 'orders' ? 'var(--blue)' : 'transparent';
    document.getElementById('utTabWallets').style.color = tab === 'wallets' ? 'white' : 'var(--text-muted)';
    document.getElementById('utTabWallets').style.borderBottomColor = tab === 'wallets' ? 'var(--blue)' : 'transparent';
    
    document.getElementById('utViewOrders').style.display = tab === 'orders' ? 'block' : 'none';
    document.getElementById('utViewWallets').style.display = tab === 'wallets' ? 'block' : 'none';
}

window.openUserTransactionsModal = async function(userId, userName) {
    await injectAdminModals();
    document.getElementById('userTransactionsModal').style.display = 'flex';
    document.getElementById('utmUserName').innerText = userName;
    
    loadUserOrders(userId);
    loadUserWalletLedger(userId);
    switchUtTab('orders');
}

window.closeUserTransactionsModal = function() {
    document.getElementById('userTransactionsModal').style.display = 'none';
}

async function loadUserOrders(userId) {
    const tbody = document.getElementById('utOrdersBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading...</td></tr>';
    
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error || !data) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error loading orders.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(o => `
        <tr>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td style="font-family:monospace; font-size:11px;">${o.id.split('-')[0]}...</td>
            <td>${o.network} ${o.plan}</td>
            <td>₵${Number(o.amount).toFixed(2)}</td>
            <td>${o.status}</td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No orders found.</td></tr>';
}

async function loadUserWalletLedger(userId) {
    const tbody = document.getElementById('utWalletsBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading...</td></tr>';
    
    const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error || !data) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error loading ledger.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(t => {
        let balBefore = Number(t.balance_before);
        if (isNaN(balBefore) || t.balance_before === null) {
            const isDebit = t.type.toLowerCase().includes('debit');
            balBefore = isDebit ? Number(t.balance_after || 0) + Number(t.amount) : Number(t.balance_after || 0) - Number(t.amount);
        }

        return `
            <tr>
                <td>${new Date(t.created_at).toLocaleDateString()}</td>
                <td style="font-family:monospace; font-size:11px;">${t.id.split('-')[0]}...</td>
                <td>${t.type}</td>
                <td>
                    <h3 style="margin-top:0; margin-bottom:8px; font-size:18px;">Transaction Ledger</h3>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Username: <strong id="utmUserName" style="color:white; font-family:monospace;">-</strong></div>
                    <div style="font-weight:600;">₵${Number(t.amount).toFixed(2)}</div>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                        Bf: ₵${balBefore.toFixed(2)} | Af: ₵${Number(t.balance_after || 0).toFixed(2)}
                    </div>
                </td>
                <td>${t.status || 'Completed'}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No transactions found.</td></tr>';
}

window.switchUtTab = switchUtTab;

document.addEventListener('DOMContentLoaded', injectAdminModals);
