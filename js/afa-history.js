// ============================================
// AFA HISTORY DASHBOARD — afa-history.js
// Handles centralized history fetching & filtering
// ============================================

let afaCurrentUser = null;
let fullHistoryData = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = 'login.html'; return; }
        afaCurrentUser = user;

        await updateAfaWallet();
        await loadFullHistory();
        setupFilters();

    } catch (e) {
        console.error('History init error:', e);
        const grid = document.getElementById('fullHistoryGrid');
        if (grid) {
            grid.innerHTML = `<div style="text-align:center; color:#ef4444; padding:40px; grid-column: 1 / -1; width: 100%;">System Initialization Failed. Please refresh.<br><small>${e.message}</small></div>`;
        }
    }
});

async function updateAfaWallet() {
    const { data } = await supabase.from('users').select('wallet_balance').eq('id', afaCurrentUser.id).single();
    const balance = parseFloat(data?.wallet_balance || 0);
    const walletDisplay = document.getElementById('afaWalletDisplay');
    if (walletDisplay) {
        walletDisplay.textContent = `₵${balance.toFixed(2)}`;
    }
}

async function loadFullHistory() {
    try {
        const { data: history, error } = await supabase
            .from('afa_registrations')
            .select('*')
            .eq('user_id', afaCurrentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Normalize AFA Data for display
        fullHistoryData = (history || []).map(item => ({
            id: item.id,
            tier: item.tier === 'premium' ? 'Premium' : 'Standard',
            full_name: item.full_name,
            phone: item.phone,
            amount: item.amount_paid ? Number(item.amount_paid) : (item.tier === 'premium' ? 30 : 25), // Use db amount or fallback
            location: item.location || 'N/A',
            dob: item.dob || 'N/A',
            id_number: item.id_number || 'N/A',
            status: item.status,
            created_at: item.created_at
        }));

        updateStats(fullHistoryData);
        renderTable(fullHistoryData);

    } catch (err) {
        console.error('Error consolidating history:', err);
        const grid = document.getElementById('fullHistoryGrid');
        if (grid) {
            grid.innerHTML = `<div style="text-align:center; color:#ef4444; padding:40px; grid-column: 1 / -1; width: 100%;">Failed to consolidate activity. <br><small>${err.message}</small></div>`;
        }
    }
}

function updateStats(data) {
    const total = data.length;
    const premium = data.filter(i => i.tier === 'Premium').length;
    const standard = data.filter(i => i.tier === 'Standard').length;
    const success = data.filter(i => i.status === 'completed' || i.status === 'approved' || i.status === 'true' || i.status === 'received' || i.status === 'Verified').length;
    
    document.getElementById('totalLogs').innerText = total;
    document.getElementById('countTotal').innerText = total;
    document.getElementById('countPremium').innerText = premium; 
    document.getElementById('countNormal').innerText = standard;
    
    const labels = document.querySelectorAll('.scm-label');
    if (labels[0]) labels[0].innerText = 'Total History';
    if (labels[2]) labels[2].innerText = 'Premium Enrollments';
    if (labels[3]) labels[3].innerText = 'Standard Enrollments';

    const rate = total > 0 ? Math.round((success / total) * 100) : 0;
    document.getElementById('successRate').innerText = `${rate}%`;
}

function renderTable(data) {
    const grid = document.getElementById('fullHistoryGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!data || data.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:60px; color:#94a3b8; grid-column: 1 / -1; width: 100%;"><div class="loading-state"><span>No registration records found.</span></div></div>';
        return;
    }

    data.forEach(item => {
        const dateStr = new Date(item.created_at).toLocaleString('en-GB', { 
            day:'2-digit', 
            month:'2-digit', 
            year:'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        let statusClass = 'status-pending';
        const s = String(item.status).toLowerCase();
        if (s === 'completed' || s === 'approved' || s === 'true' || s === 'received' || s === 'verified' || s === 'success') {
            statusClass = 'status-success';
        } else if (s === 'failed' || s === 'rejected') {
            statusClass = 'status-failed';
        }

        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="hc-header">
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">${item.full_name}</h3>
                    <span style="font-size: 12px; color: var(--text-muted);">${item.phone}</span>
                </div>
                <span class="tier-badge ${item.tier.toLowerCase()}">${item.tier}</span>
            </div>
            
            <div class="hc-body">
                <div class="hc-row">
                    <span class="hc-label">Amount Paid</span>
                    <span class="hc-value" style="color: var(--primary);">₵${Number(item.amount).toFixed(2)}</span>
                </div>
                <div class="hc-row">
                    <span class="hc-label">Location</span>
                    <span class="hc-value">${item.location}</span>
                </div>
                <div class="hc-row">
                    <span class="hc-label">Date of Birth</span>
                    <span class="hc-value">${item.dob}</span>
                </div>
                <div class="hc-row">
                    <span class="hc-label">Card ID</span>
                    <span class="hc-value" style="font-family: monospace;">${item.id_number}</span>
                </div>
            </div>

            <div class="hc-footer">
                <div>
                    <span class="status-pill ${statusClass}">${item.status || 'Pending'}</span>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 6px;">${dateStr}</div>
                </div>
                <button onclick="viewActivityDetails('${item.id}', 'afa')" class="btn-check" style="padding:8px 16px; font-size:12px; font-weight: 700; border-radius:10px; background:var(--bg-tint); border:1px solid #e2e8f0; color:var(--text-main); cursor:pointer; transition: all 0.2s;">
                    View Details
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.viewActivityDetails = function(id) {
    const record = fullHistoryData.find(item => item.id === id);
    if (!record) return;

    const modal = document.getElementById('recordModal');
    const modalBody = document.getElementById('modalBody');
    const contentObj = modal.querySelector('.modal-content');
    
    let statusClass = 'status-pending';
    const s = String(record.status).toLowerCase();
    if (s === 'completed' || s === 'approved' || s === 'true' || s === 'received' || s === 'verified' || s === 'success') {
        statusClass = 'status-success';
    } else if (s === 'failed' || s === 'rejected') {
        statusClass = 'status-failed';
    }

    const dateStr = new Date(record.created_at).toLocaleString('en-GB', { 
        day:'2-digit', month:'short', year:'numeric', hour: '2-digit', minute: '2-digit'
    });

    const rows = [
        { label: 'Reference ID', value: record.id.split('-')[0].toUpperCase(), mono: true },
        { label: 'Date Submitted', value: dateStr },
        { label: 'Beneficiary Name', value: record.full_name },
        { label: 'Platform Tier', value: `<span class="tier-badge ${record.tier.toLowerCase()}">${record.tier}</span>`, raw: true },
        { label: 'Phone Number', value: record.phone },
        { label: 'Registration Fee', value: `₵${Number(record.amount).toFixed(2)}`, color: 'var(--primary)' },
        { label: 'ID Number', value: record.id_number, mono: true },
        { label: 'Location', value: record.location },
        { label: 'Date of Birth', value: record.dob },
        { label: 'Current Status', value: `<span class="status-pill ${statusClass}">${record.status}</span>`, raw: true }
    ];

    modalBody.innerHTML = rows.map(r => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">${r.label}</span>
            <span style="font-size: 14px; font-weight: 700; color: ${r.color || '#0f172a'}; ${r.mono ? 'font-family: monospace; letter-spacing: 0.5px;' : ''} text-align: right;">
                ${r.raw ? r.value : r.value}
            </span>
        </div>
    `).join('');

    modal.style.display = 'flex';
    // Trigger animation frame for CSS transition
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        contentObj.style.transform = 'translateY(0)';
    });
}

window.closeModal = function() {
    const modal = document.getElementById('recordModal');
    const contentObj = modal.querySelector('.modal-content');
    
    modal.style.opacity = '0';
    contentObj.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300); // match transition duration
}

function setupFilters() {
    const search = document.getElementById('searchFilter');
    const tier = document.getElementById('tierFilter');
    const status = document.getElementById('statusFilter');

    const handleFilter = () => {
        const query = search.value.toLowerCase();
        const tierVal = tier.value;
        const statusVal = status.value;

        const filtered = fullHistoryData.filter(item => {
            const matchesSearch = String(item.full_name || '').toLowerCase().includes(query) || 
                                 String(item.phone || '').toLowerCase().includes(query) ||
                                 String(item.id_number || '').toLowerCase().includes(query);
            
            let matchesTier = true;
            if (tierVal !== 'all') {
                matchesTier = item.tier.toLowerCase() === tierVal.toLowerCase();
            }

            let matchesStatus = true;
            if (statusVal !== 'all') {
                const s = String(item.status).toLowerCase();
                if (statusVal === 'completed') matchesStatus = (s === 'completed' || s === 'approved' || s === 'true' || s === 'received' || s === 'verified' || s === 'success');
                if (statusVal === 'failed') matchesStatus = (s === 'failed' || s === 'rejected');
                if (statusVal === 'pending') matchesStatus = (s !== 'completed' && s !== 'approved' && s !== 'true' && s !== 'received' && s !== 'verified' && s !== 'success' && s !== 'failed' && s !== 'rejected');
            }

            return matchesSearch && matchesTier && matchesStatus;
        });

        renderTable(filtered);
    };

    search.addEventListener('input', handleFilter);
    tier.addEventListener('change', handleFilter);
    status.addEventListener('change', handleFilter);
}
