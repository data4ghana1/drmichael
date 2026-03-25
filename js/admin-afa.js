// js/admin-afa.js

async function initAfaPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadAfaRegistrations();
    initAfaRealtime();
}

async function loadAfaRegistrations() {
    const tbody = document.getElementById('afaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading applications...</td></tr>';

    const { data: afa, error } = await supabase
        .from('afa_registrations')
        .select('*, users(email, phone, first_name, last_name)')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!afa || afa.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No registrations pending.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    afa.forEach(a => {
        const d = new Date(a.created_at).toLocaleDateString();
        const s = (a.status || 'pending').toLowerCase();
        let sClass = 'status-pending';
        if (s === 'approved') sClass = 'status-success';
        if (s === 'rejected') sClass = 'status-failed';
        
        const u = a.users || {};
        const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown';

        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap;">
                    <div style="font-size:12px; color:var(--text-muted);">${d}</div>
                    <div style="font-weight:600; color:white;">${a.full_name}</div>
                </td>
                <td>
                    <div style="font-size:13px; color:white;">${a.phone}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${a.id_type}: ${a.id_number}</div>
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${userName}</td>
                <td><span class="status-badge ${sClass}">${a.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn-action" onclick="openAfaReviewModal('${a.id}')">Review</button>
                </td>
            </tr>
        `;
    });
}

window.openAfaReviewModal = async function(id) {
    const { data: a, error } = await supabase.from('afa_registrations').select('*').eq('id', id).single();
    if(error || !a) return alert("Failed to load application details.");

    document.getElementById('afmId').value = a.id;
    document.getElementById('afmName').innerText = a.full_name;
    document.getElementById('afmPhone').innerText = a.phone;
    document.getElementById('afmDob').innerText = a.dob;
    document.getElementById('afmIdType').innerText = a.id_type;
    document.getElementById('afmIdNumber').innerText = a.id_number;

    // Documents
    const frontContainer = document.getElementById('afmFrontContainer');
    const backContainer = document.getElementById('afmBackContainer');
    frontContainer.innerHTML = a.id_front_url ? `<img src="${a.id_front_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Front ID</span>';
    backContainer.innerHTML = a.id_back_url ? `<img src="${a.id_back_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Back ID</span>';

    document.getElementById('afaReviewModal').style.display = 'flex';
}

window.closeAfaReviewModal = function() {
    document.getElementById('afaReviewModal').style.display = 'none';
}

window.updateAfaStatus = async function(id, status) {
    const action = status === 'approved' ? 'approve' : 'reject';
    if(!confirm(`Are you sure you want to ${action} this application?`)) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("Authentication required.");

        const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '';
        const response = await fetch(`${BACKEND_URL}/api/admin/afa/registration-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_id: user.id,
                registration_id: id,
                action: action
            })
        });

        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Failed to update status");

        if(window.showSuccessPopup) window.showSuccessPopup("Action Success", result.message);
        else alert(result.message);

        closeAfaReviewModal();
        loadAfaRegistrations();
    } catch (err) {
        console.error("Admin AFA Action Error:", err);
        if(window.showErrorPopup) window.showErrorPopup("Action Failed", err.message);
        else alert(err.message);
    }
}

// Realtime
// js/admin-afa.js

async function initAfaPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadAfaRegistrations();
    initAfaRealtime();
}

async function loadAfaRegistrations() {
    const tbody = document.getElementById('afaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading applications...</td></tr>';

    const { data: afa, error } = await supabase
        .from('afa_registrations')
        .select('*, users(email, phone, first_name, last_name)')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!afa || afa.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No registrations pending.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    afa.forEach(a => {
        const d = new Date(a.created_at).toLocaleDateString();
        const s = (a.status || 'pending').toLowerCase();
        let sClass = 'status-pending';
        if (s === 'approved') sClass = 'status-success';
        if (s === 'rejected') sClass = 'status-failed';
        
        const u = a.users || {};
        const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown';

        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap;">
                    <div style="font-size:12px; color:var(--text-muted);">${d}</div>
                    <div style="font-weight:600; color:white;">${a.full_name}</div>
                </td>
                <td>
                    <div style="font-size:13px; color:white;">${a.phone}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${a.id_type}: ${a.id_number}</div>
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${userName}</td>
                <td><span class="status-badge ${sClass}">${a.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn-action" onclick="openAfaReviewModal('${a.id}')">Review</button>
                </td>
            </tr>
        `;
    });
}

window.openAfaReviewModal = async function(id) {
    const { data: a, error } = await supabase.from('afa_registrations').select('*').eq('id', id).single();
    if(error || !a) return alert("Failed to load application details.");

    document.getElementById('afmId').value = a.id;
    document.getElementById('afmName').innerText = a.full_name;
    document.getElementById('afmPhone').innerText = a.phone;
    document.getElementById('afmDob').innerText = a.dob;
    document.getElementById('afmIdType').innerText = a.id_type;
    document.getElementById('afmIdNumber').innerText = a.id_number;

    // Documents
    const frontContainer = document.getElementById('afmFrontContainer');
    const backContainer = document.getElementById('afmBackContainer');
    frontContainer.innerHTML = a.id_front_url ? `<img src="${a.id_front_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Front ID</span>';
    backContainer.innerHTML = a.id_back_url ? `<img src="${a.id_back_url}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span style="color:var(--text-muted); font-size:12px;">No Back ID</span>';

    document.getElementById('afaReviewModal').style.display = 'flex';
}

window.closeAfaReviewModal = function() {
    document.getElementById('afaReviewModal').style.display = 'none';
}

window.updateAfaStatus = async function(id, status) {
    const action = status === 'approved' ? 'approve' : 'reject';
    if(!confirm(`Are you sure you want to ${action} this application?`)) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("Authentication required.");

        const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '';
        const response = await fetch(`${BACKEND_URL}/api/admin/afa/registration-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_id: user.id,
                registration_id: id,
                action: action
            })
        });

        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Failed to update status");

        if(window.showSuccessPopup) window.showSuccessPopup("Action Success", result.message);
        else alert(result.message);

        closeAfaReviewModal();
        loadAfaRegistrations();
    } catch (err) {
        console.error("Admin AFA Action Error:", err);
        if(window.showErrorPopup) window.showErrorPopup("Action Failed", err.message);
        else alert(err.message);
    }
}

// Realtime
let afaRealtimeChannel = null;
function initAfaRealtime() {
    if (afaRealtimeChannel) return;
    afaRealtimeChannel = supabase
        .channel('admin-afa-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'afa_registrations' }, () => {
            loadAfaRegistrations();
        })
        .subscribe();
}

const AFA_ROLES = ['client', 'elite_agent', 'super_agent', 'admin'];

window.openAfaSettingsModal = async function() {
    document.getElementById('afaSettingsModal').style.display = 'flex';
    document.getElementById('btnSaveAfaSettings').disabled = true;
    const tbody = document.getElementById('afaPricingTbody');
    
    try {
        const { data, error } = await supabase.from('pricing').select('*').in('product', ['afa_normal', 'afa_premium']);
        if(error) throw error;
        
        const prices = data || [];
        let html = '';
        
        AFA_ROLES.forEach(role => {
            const roleLabels = { client: 'Client', elite_agent: 'Elite Agent', super_agent: 'Super Agent', admin: 'Admin' };
            const nPrice = prices.find(p => p.product === 'afa_normal' && p.role === role)?.price || 0;
            const pPrice = prices.find(p => p.product === 'afa_premium' && p.role === role)?.price || 0;
            
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-role="${role}">
                    <td style="padding:12px 0; font-weight:600; font-size:13px; color:white;">${roleLabels[role]}</td>
                    <td style="padding:12px 0; padding-right:12px;">
                        <input type="number" step="0.01" class="afa-norm-input" value="${nPrice}" style="width:100px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); color:white; padding:8px; border-radius:6px; font-size:13px;">
                    </td>
                    <td style="padding:12px 0;">
                        <input type="number" step="0.01" class="afa-prem-input" value="${pPrice}" style="width:100px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); color:white; padding:8px; border-radius:6px; font-size:13px;">
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    } catch (err) {
        console.error('Error loading AFA settings:', err);
        tbody.innerHTML = `<tr><td colspan="3" style="padding:20px; text-align:center; color:#ef4444; font-size:13px;">Failed to load data.</td></tr>`;
    } finally {
        document.getElementById('btnSaveAfaSettings').disabled = false;
    }
}

window.closeAfaSettingsModal = function() {
    document.getElementById('afaSettingsModal').style.display = 'none';
}

window.saveAfaSettings = async function() {
    const btn = document.getElementById('btnSaveAfaSettings');
    const oldText = btn.innerText;
    btn.innerText = 'Saving...';
    btn.disabled = true;
    
    try {
        const rows = Array.from(document.querySelectorAll('#afaPricingTbody tr[data-role]'));
        const upsertPayload = [];
        
        rows.forEach(tr => {
            const role = tr.getAttribute('data-role');
            const normVal = parseFloat(tr.querySelector('.afa-norm-input').value) || 0;
            const premVal = parseFloat(tr.querySelector('.afa-prem-input').value) || 0;
            
            upsertPayload.push({
                product: 'afa_normal',
                role: role,
                price: normVal,
                provider: 'data4ghana'
            });
            
            upsertPayload.push({
                product: 'afa_premium',
                role: role,
                price: premVal,
                provider: 'data4ghana'
            });
        });

        // Delete existing pricing for these products to avoid Unique constraint dupes
        await supabase.from('pricing').delete().in('product', ['afa_normal', 'afa_premium']);
        
        // Insert new array
        const { error } = await supabase.from('pricing').insert(upsertPayload);
        if (error) throw error;
        
        closeAfaSettingsModal();
        if(window.showSuccessPopup) {
            window.showSuccessPopup('Pricing Saved', 'AFA Registration fees updated correctly.');
        } else {
            alert('AFA Pricing Settings saved.');
        }
    } catch (err) {
        console.error(err);
        alert('Failed to save settings: ' + err.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", initAfaPage);
