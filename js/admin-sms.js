// js/admin-sms.js

async function initSmsProvidersPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadProviders();
    loadNetworkSmsConfig();
}

async function loadNetworkSmsConfig() {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'network_sms_config')
            .single();

        let config = {"MTN": true, "Telecel": true, "AT": true};
        if (data && data.value) {
            config = data.value;
        }

        // Update UI
        ['MTN', 'Telecel', 'AT'].forEach(net => {
            const toggle = document.getElementById(`toggleSMS_${net}`);
            const label = document.getElementById(`labelSMS_${net}`);
            if (toggle && label) {
                toggle.checked = config[net] !== false; // default true
                label.innerText = toggle.checked ? 'Enabled' : 'Disabled';
                label.style.color = toggle.checked ? '#10b981' : '#ef4444';
            }
        });
    } catch (e) {
        console.error("Failed to load network SMS config:", e);
    }
}

window.toggleNetworkSMS = async function(network, isEnabled) {
    try {
        const label = document.getElementById(`labelSMS_${network}`);
        if(label) {
            label.innerText = 'Saving...';
            label.style.color = 'var(--text-muted)';
        }

        // 1. Fetch current config
        let config = {"MTN": true, "Telecel": true, "AT": true};
        const { data: fetchRes, error: fetchErr } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'network_sms_config')
            .single();

        if (fetchRes && fetchRes.value) {
            config = fetchRes.value;
        }

        // 2. Update config state
        config[network] = isEnabled;

        // 3. Save back to DB. Use insert if it doesn't exist yet, update if it does.
        if (fetchErr && fetchErr.code === 'PGRST116') {
             const { error: insErr } = await supabase.from('system_config').insert({ key: 'network_sms_config', value: config });
             if (insErr) throw insErr;
        } else {
             const { error: upErr } = await supabase.from('system_config').update({ value: config, updated_at: new Date().toISOString() }).eq('key', 'network_sms_config');
             if (upErr) throw upErr;
        }

        // 4. Finalize UI
        if(label) {
            label.innerText = isEnabled ? 'Enabled' : 'Disabled';
            label.style.color = isEnabled ? '#10b981' : '#ef4444';
        }
    } catch (e) {
        console.error("Failed to save network config:", e);
        alert("Failed to save configuration. Please try again.");
        loadNetworkSmsConfig(); // revert UI to actual state
    }
}

document.addEventListener("DOMContentLoaded", initSmsProvidersPage);

async function loadProviders() {
    const container = document.getElementById('providersContainer');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Loading configurations...</div>';

    const { data: providers, error } = await supabase
        .from('sms_providers')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Error: ${error.message}. Please ensure the sms_providers table exists.</div>`;
        return;
    }

    if (!providers || providers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No SMS providers configured.</div>`;
        return;
    }

    container.innerHTML = '';
    providers.forEach(p => {
        const isActive = p.is_active;
        const statusBadge = isActive ? '<span class="status-badge status-success">ACTIVE</span>' : '<span class="status-badge status-pending">INACTIVE</span>';
        
        const secValue = p.api_key && p.api_key.length > 5 ? `••••••••${String(p.api_key).slice(-4)}` : (p.api_key || '—');

        container.innerHTML += `
            <div class="glass-card" style="padding:24px; margin-bottom:20px; border-color:${isActive ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0; font-size:16px;">${p.display_name}</h3>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Internal ID: ${p.id}</div>
                    </div>
                    ${statusBadge}
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr; gap:16px; margin-top:20px;">
                    <div>
                        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">API Key (Partial)</label>
                        <div style="background:black; padding:10px; border-radius:6px; border:1px solid var(--glass-border); font-family:monospace; font-size:12px; word-break:break-all;">${secValue}</div>
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Sender ID</label>
                        <div style="background:black; padding:10px; border-radius:6px; border:1px solid var(--glass-border); font-family:monospace; font-size:12px;">${p.sender_id || '—'}</div>
                    </div>
                </div>

                <div style="display:flex; justify-content:center; gap:12px; margin-top:24px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.05);">
                    <button class="btn-action" style="background:${isActive ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.1)'}; color:${isActive ? '#6b7280' : '#10b981'}; border-color:${isActive ? 'rgba(255,255,255,0.1)' : '#10b981'}; font-weight:700;" onclick="makeActive('${p.id}')" ${isActive ? 'disabled' : ''}>
                        ${isActive ? 'Currently Active' : 'Set as Active'}
                    </button>
                    <button class="btn-action" style="background:rgba(59,130,246,0.1); border-color:var(--blue); color:var(--blue); font-weight:700;" onclick="openProviderEditModal('${p.id}')">
                        Edit Keys
                    </button>
                </div>
            </div>
        `;
    });
}

window.openProviderEditModal = async function (id) {
    const { data, error } = await supabase.from('sms_providers').select('*').eq('id', id).single();
    if (error) return alert(error.message);

    document.getElementById('pemId').value = data.id;
    document.getElementById('pemApiKey').value = data.api_key || '';
    document.getElementById('pemSenderId').value = data.sender_id || '';

    document.getElementById('pemTitle').innerText = `Update ${data.display_name} Config`;
    document.getElementById('providerEditModal').style.display = 'flex';
}

window.closeProviderEditModal = function () {
    document.getElementById('providerEditModal').style.display = 'none';
}

window.saveProviderKeys = async function () {
    const id = document.getElementById('pemId').value;
    const apiKey = document.getElementById('pemApiKey').value;
    const senderId = document.getElementById('pemSenderId').value;

    if (!senderId || senderId.length > 11) {
        alert("Sender ID must be 1-11 characters long.");
        return;
    }

    const btn = document.getElementById('btnSaveProvider');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const { error } = await supabase
        .from('sms_providers')
        .update({
            api_key: apiKey,
            sender_id: senderId,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) {
        alert("Failed to save: " + error.message);
    } else {
        closeProviderEditModal();
        loadProviders();
    }

    btn.innerText = 'Save Credentials';
    btn.disabled = false;
}

window.makeActive = async function (id) {
    if (!confirm("Are you sure you want to switch the active SMS provider? All immediate outgoing messages will route through the new provider.")) return;
    
    // Update all that are currently active to false
    await supabase.from('sms_providers').update({ is_active: false }).eq('is_active', true);

    // Then set the selected to active
    const { error: err2 } = await supabase.from('sms_providers').update({ is_active: true }).eq('id', id);

    if (err2) alert(err2.message);
    else loadProviders();
}

document.addEventListener("DOMContentLoaded", initSmsProvidersPage);
