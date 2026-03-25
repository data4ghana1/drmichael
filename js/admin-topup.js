// js/admin-topup.js

async function initTopupPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadTopupRequests();
    initTopupRealtime();
}

async function loadTopupRequests() {
    const tbody = document.getElementById('topupTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading requests...</td></tr>';

    const { data: requests, error } = await supabase
        .from('transactions')
        .select('*, users(email, phone, first_name, last_name, wallet_balance)')
        .eq('status', 'Pending')
        .ilike('type', '%Funding%')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!requests || requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No pending top-up requests.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    requests.forEach(r => {
        const d = new Date(r.created_at).toLocaleString();
        const u = r.users || {};
        const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown';
        
        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap;">
                    <div style="font-size:12px; color:var(--text-muted);">${d}</div>
                    <div style="font-weight:600; color:white;">${userName}</div>
                </td>
                <td>
                    <div style="font-weight:700; color:white;">₵${Number(r.amount).toFixed(2)}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Method: ${r.type}</div>
                </td>
                <td style="font-size:12px;">Reference: <span style="font-family:monospace; color:var(--blue);">${r.id.split('-')[0]}...</span></td>
                <td style="white-space:nowrap; text-align:right;">
                    <button class="btn-action" style="background:#10b981; color:white; border:none; font-weight:700;" onclick="approveTopup('${r.id}', '${r.user_id}', ${r.amount})">Approve</button>
                    <button class="btn-action" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); font-weight:700;" onclick="rejectTopup('${r.id}')">Reject</button>
                </td>
            </tr>
        `;
    });
}

window.approveTopup = async function(trxId, userId, amount) {
    if(!confirm(`Approve top-up of ₵${Number(amount).toFixed(2)}?`)) return;

    try {
        const { data, error } = await supabase.rpc('admin_approve_topup', {
            p_trx_id: trxId,
            p_user_id: userId,
            p_amount: amount
        });

        if (error) throw error;
        alert("Top-up approved successfully.");
        loadTopupRequests();
    } catch (err) {
        alert(err.message);
    }
}

window.rejectTopup = async function(trxId) {
    if(!confirm(`Reject this top-up request?`)) return;

    const { error } = await supabase.from('transactions').update({ status: 'Rejected' }).eq('id', trxId);
    if(error) alert(error.message);
    else loadTopupRequests();
}

// Realtime
let topupRealtimeChannel = null;
function initTopupRealtime() {
    if (topupRealtimeChannel) return;
    topupRealtimeChannel = supabase
        .channel('admin-topup-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
            loadTopupRequests();
        })
        .subscribe();
}

document.addEventListener("DOMContentLoaded", initTopupPage);
