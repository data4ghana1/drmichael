// js/admin-gateways.js

async function initGatewaysPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadGateways();
}

async function loadGateways() {
    const container = document.getElementById('gatewaysContainer');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Loading configurations...</div>';

    const { data: gateways, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Error: ${error.message}</div>`;
        return;
    }

    if (!gateways || gateways.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No gateways configured.</div>`;
        return;
    }

    container.innerHTML = '';
    gateways.forEach(g => {
        const isLive = g.is_live;
        const statusBadge = isLive ? '<span class="status-badge status-success">LIVE</span>' : '<span class="status-badge status-pending">TEST/OFF</span>';
        
        const isManual = g.id === 'manual';
        const pubLabel = isManual ? 'Account Name / Bank' : 'Public Key / Identifier';
        const secLabel = isManual ? 'Account Number / Info' : 'Secret Key (Partial)';
        const secValue = isManual ? (g.secret_key || '—') : `••••••••${String(g.secret_key || '').slice(-4)}`;
        
        let webhookHtml = '';
        if (!isManual) {
            webhookHtml = `
                <div style="margin-top:16px;">
                    <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Webhook Secret (Partial)</label>
                    <div style="background:black; padding:10px; border-radius:6px; border:1px solid var(--glass-border); font-family:monospace; font-size:12px;">••••••••${String(g.webhook_secret || '').slice(-4)}</div>
                </div>
            `;
        }

        container.innerHTML += `
            <div class="glass-card" style="padding:24px; margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0; font-size:16px;">${g.display_name}</h3>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Internal ID: ${g.id}</div>
                    </div>
                    ${statusBadge}
                </div>
                
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-top:20px;">
                    <div>
                        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">${pubLabel}</label>
                        <div style="background:black; padding:10px; border-radius:6px; border:1px solid var(--glass-border); font-family:monospace; font-size:12px; word-break:break-all;">${g.public_key || '—'}</div>
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">${secLabel}</label>
                        <div style="background:black; padding:10px; border-radius:6px; border:1px solid var(--glass-border); font-family:monospace; font-size:12px;">${secValue}</div>
                    </div>
                </div>
                ${webhookHtml}

                <div style="display:flex; justify-content:center; gap:12px; margin-top:24px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.05);">
                    <button class="btn-action" style="background:${isLive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; color:${isLive ? '#ef4444' : '#10b981'}; border-color:${isLive ? '#ef4444' : '#10b981'}; font-weight:700;" onclick="toggleGatewayStatus('${g.id}', ${!isLive})">
                        ${isLive ? 'Switch to Test' : 'Go Live'}
                    </button>
                    <button class="btn-action" style="background:rgba(59,130,246,0.1); border-color:var(--blue); color:var(--blue); font-weight:700;" onclick="openGatewayEditModal('${g.id}')">
                        Edit Keys
                    </button>
                </div>
            </div>
        `;
    });
}

window.openGatewayEditModal = async function (id) {
    const { data, error } = await supabase.from('payment_gateways').select('*').eq('id', id).single();
    if (error) return alert(error.message);

    document.getElementById('gemId').value = data.id;
    document.getElementById('gemPublicKey').value = data.public_key || '';
    document.getElementById('gemSecretKey').value = data.secret_key || '';
    document.getElementById('gemWebhookSecret').value = data.webhook_secret || '';

    const pubLabel = document.getElementById('labelPublicKey');
    const secLabel = document.getElementById('labelSecretKey');
    const webContainer = document.getElementById('webhookContainer');

    if (id === 'manual') {
        pubLabel.innerText = "Account Name / Bank";
        secLabel.innerText = "Account Number / Info";
        document.getElementById('gemSecretKey').type = "text";
        webContainer.style.display = 'none';
    } else {
        pubLabel.innerText = "Public Key";
        secLabel.innerText = "Secret Key";
        document.getElementById('gemSecretKey').type = "password";
        webContainer.style.display = 'block';
    }

    document.getElementById('gatewayEditModal').style.display = 'flex';
}

window.closeGatewayEditModal = function () {
    document.getElementById('gatewayEditModal').style.display = 'none';
}

window.saveGatewayKeys = async function () {
    const id = document.getElementById('gemId').value;
    const publicKey = document.getElementById('gemPublicKey').value;
    const secretKey = document.getElementById('gemSecretKey').value;
    const webhookSecret = document.getElementById('gemWebhookSecret').value;

    const btn = document.getElementById('btnSaveGateway');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const { error } = await supabase
        .from('payment_gateways')
        .update({
            public_key: publicKey,
            secret_key: secretKey,
            webhook_secret: webhookSecret,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) {
        alert("Failed to save: " + error.message);
    } else {
        closeGatewayEditModal();
        loadGateways();
    }

    btn.innerText = 'Save Credentials';
    btn.disabled = false;
}

window.toggleGatewayStatus = async function (id, newStatus) {
    const { error } = await supabase.from('payment_gateways').update({ is_live: newStatus }).eq('id', id);
    if (error) alert(error.message);
    else loadGateways();
}

document.addEventListener("DOMContentLoaded", initGatewaysPage);
