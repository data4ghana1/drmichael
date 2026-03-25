// js/admin-wallets.js

let allTransactionsCache = [];

async function initWalletsPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadWalletMetrics();
    loadWalletTransactions();
    initWalletsRealtime();
}

async function refreshWalletDashboard() {
    const btn = document.querySelector('button[onclick="refreshWalletDashboard()"]');
    if (btn) btn.style.transform = 'rotate(360deg)';
    
    await Promise.all([
        loadWalletMetrics(),
        loadWalletTransactions()
    ]);
    
    setTimeout(() => {
        if (btn) btn.style.transform = 'none';
    }, 500);
}

async function loadWalletMetrics() {
    // Total Active Wallets
    const { data: usersData } = await supabase.from('users').select('wallet_balance');
    const totalWallets = (usersData || []).reduce((acc, u) => acc + (Number(u.wallet_balance) || 0), 0);
    document.getElementById('walletMetricTotal').innerText = `₵${totalWallets.toFixed(2)}`;

    // Credits Issued Today
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const { data: creditsData } = await supabase.from('transactions')
        .select('amount')
        .gte('created_at', todayStart.toISOString())
        .ilike('type', '%Credit%');
    const totalCredits = (creditsData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricCredits').innerText = `₵${totalCredits.toFixed(2)}`;

    // Debits Issued Today
    const { data: debitsData } = await supabase.from('transactions')
        .select('amount')
        .gte('created_at', todayStart.toISOString())
        .ilike('type', '%Debit%');
    const totalDebits = (debitsData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricDebits').innerText = `₵${totalDebits.toFixed(2)}`;

    // Pending Funding
    const { data: pendingData } = await supabase.from('transactions')
        .select('amount')
        .eq('status', 'Pending')
        .ilike('type', '%Funding%');
    const totalPending = (pendingData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricPending').innerText = `₵${totalPending.toFixed(2)}`;
}

async function loadWalletTransactions() {
    const tbody = document.getElementById('walletTransactionsTableBody');
    if(!tbody) return;
    
    const { data, error } = await supabase.from('transactions')
        .select('*, users!transactions_user_id_fkey(email, first_name, last_name, merchant_id)')
        .order('created_at', { ascending: false })
        .limit(100);
        
    if(error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error loading ledger.</td></tr>`;
        return;
    }
    
    allTransactionsCache = data || [];
    renderWalletTransactions(allTransactionsCache);
}

function renderWalletTransactions(transactions) {
    const tbody = document.getElementById('walletTransactionsTableBody');
    if(!tbody) return;

    if(!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:24px;">No wallet transactions found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    transactions.forEach(tx => {
        const dateObj = new Date(tx.created_at);
        const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
        const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
        
        const fn = tx.users?.first_name || '';
        const ln = tx.users?.last_name || '';
        const fullName = `${fn} ${ln}`.trim() || tx.users?.email || 'Unknown';
        const cid = tx.users?.merchant_id || '—';
        const typeIsDebit = tx.type.toLowerCase().includes('debit');
        const typeColor = typeIsDebit ? '#ef4444' : '#10b981';
        const amountSign = typeIsDebit ? '-' : '+';
        
        let balBefore = Number(tx.balance_before);
        if (isNaN(balBefore) || tx.balance_before === null) {
            balBefore = typeIsDebit ? Number(tx.balance_after || 0) + Number(tx.amount) : Number(tx.balance_after || 0) - Number(tx.amount);
        }

        const amountDisplay = `<strong style="font-size:15px; color:${typeColor}; font-family:monospace;">${amountSign}₵${Math.abs(Number(tx.amount)).toFixed(2)}</strong>`;

        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="color:var(--text-muted); font-size:12px; white-space:nowrap;">
                    <div style="color:white; font-weight:600;">${dateStr}</div>
                    <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                </td>
                <td>
                    <div style="font-family:monospace; font-size:11px; color:var(--blue); font-weight:700; margin-bottom:4px;">${cid}</div>
                    <div style="font-weight:600; color:white; margin-bottom:6px; font-size:14px;">${fullName}</div>
                    <div style="font-size:10px; color:${typeColor}; font-weight:800; text-transform:uppercase; letter-spacing:1px; background:${typeColor}22; display:inline-block; padding:3px 8px; border-radius:12px; border:1px solid ${typeColor}44;">${tx.type}</div>
                </td>
                <td><code style="color:var(--text-muted); font-size:11px;">${tx.reference || '—'}</code></td>
                <td>
                    <div style="margin-bottom:6px;">${amountDisplay}</div>
                    <div style="font-size:11px; color:var(--text-muted); display:inline-flex; gap:8px; background:rgba(0,0,0,0.4); padding:4px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                        <span>Before: <span style="color:#94a3b8;">₵${balBefore.toFixed(2)}</span></span>
                        <span style="color:var(--glass-border);">|</span>
                        <span>After: <span style="color:white; font-weight:600;">₵${Number(tx.balance_after || 0).toFixed(2)}</span></span>
                    </div>
                </td>
            </tr>
        `;
    });
}

function filterWalletTransactions() {
    const q = (document.getElementById('walletSearchInput')?.value || '').toLowerCase().trim();
    if (!q) return renderWalletTransactions(allTransactionsCache);

    const filtered = allTransactionsCache.filter(tx => 
        (tx.users?.email || '').toLowerCase().includes(q) ||
        (tx.users?.first_name || '').toLowerCase().includes(q) ||
        (tx.users?.last_name || '').toLowerCase().includes(q) ||
        (tx.users?.merchant_id || '').toLowerCase().includes(q) ||
        (tx.type || '').toLowerCase().includes(q)
    );
    renderWalletTransactions(filtered);
}

// Realtime update
let walletsRealtimeChannel = null;
function initWalletsRealtime() {
    if (walletsRealtimeChannel) return;
    walletsRealtimeChannel = supabase
        .channel('admin-wallets-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
            loadWalletMetrics();
            loadWalletTransactions();
        })
        .subscribe();
}

// Global exposure
window.loadWalletMetrics = loadWalletMetrics;
window.loadWalletTransactions = loadWalletTransactions;
window.refreshWalletDashboard = refreshWalletDashboard;
window.filterWalletTransactions = filterWalletTransactions;

document.addEventListener("DOMContentLoaded", initWalletsPage);
