// js/admin-freemode.js

async function initFreeModePage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadFreeModeConfig();
    loadFreeModeUsers();
    initFreeModeRealtime();
}

async function loadFreeModeConfig() {
    const { data: config, error } = await supabase.from('app_settings').select('*').eq('key', 'free_mode_settings').single();
    if (error || !config) return;

    const s = config.value || {};
    document.getElementById('fmEnabled').checked = s.is_enabled;
    document.getElementById('fmLimitGb').value = s.limit_gb || '0.5';
    document.getElementById('fmMtnMax').value = s.mtn_max || '500';
    document.getElementById('fmTelecelMax').value = s.telecel_max || '500';
    document.getElementById('fmTigoMax').value = s.tigo_max || '500';
}

async function loadFreeModeUsers() {
    const tbody = document.getElementById('fmUsersBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading users...</td></tr>';

    const { data: users, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, is_free_mode, merchant_id, balance_owed')
        .or('is_free_mode.eq.true,balance_owed.gt.0')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No users currently in Free Mode.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    users.forEach(u => {
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
        const bal = u.balance_owed || 0;
        const isFM = u.is_free_mode;
        
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:600; color:white;">${fullName}</td>
                <td>${u.email}</td>
                <td style="font-family:monospace; color:var(--blue);">${u.merchant_id || '—'}</td>
                <td style="font-weight:600; color:#f59e0b;">₵${bal.toFixed(2)}</td>
                <td><span class="status-badge ${isFM ? 'status-success' : 'status-warning'}">${isFM ? 'ACTIVE' : 'DEBT ONLY'}</span></td>
                <td style="text-align:right;">
                    <button class="btn-action" style="color:var(--blue); border-color:var(--blue); margin-right:8px;" onclick="modifyFreeModeBalance('${u.id}', ${bal})">Update Balance</button>
                    ${isFM ? `<button class="btn-action" style="color:#ef4444; border-color:#ef4444;" onclick="removeFreeMode('${u.id}', '${u.email}')">Remove FM</button>` : ''}
                </td>
            </tr>
        `;
    });
}

window.modifyFreeModeBalance = async function(userId, currentBalance) {
    const newBalance = prompt(`Enter new Balance Owed (current: ₵${currentBalance}):`, currentBalance);
    if (newBalance === null) return;
    
    const balanceNum = parseFloat(newBalance);
    if (isNaN(balanceNum) || balanceNum < 0) {
        return alert("Please enter a valid number (0 or greater).");
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                balance_owed: balanceNum,
                is_free_mode: balanceNum > 0 // Keep FM active if there is debt
            })
            .eq('id', userId);

        if (error) throw error;
        alert(`Balance updated to ₵${balanceNum.toFixed(2)}`);
        loadFreeModeUsers();
    } catch (err) {
        alert("Failed to update balance: " + err.message);
    }
}

window.saveFreeModeConfig = async function() {
    const isEnabled = document.getElementById('fmEnabled').checked;
    const limitGb = Number(document.getElementById('fmLimitGb').value);
    const mtnMax = Number(document.getElementById('fmMtnMax').value);
    const telecelMax = Number(document.getElementById('fmTelecelMax').value);
    const tigoMax = Number(document.getElementById('fmTigoMax').value);

    const btn = document.getElementById('btnSaveFM');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const config = {
        is_enabled: isEnabled,
        limit_gb: limitGb,
        mtn_max: mtnMax,
        telecel_max: telecelMax,
        tigo_max: tigoMax,
        updated_at: new Date()
    };

    const { error } = await supabase.from('app_settings').upsert({
        key: 'free_mode_settings',
        value: config
    });

    if (error) alert("Failed to save: " + error.message);
    else alert("Global Free Mode configuration updated.");
    
    btn.disabled = false;
    btn.innerText = 'Save Global Settings';
}

window.removeFreeMode = async function(userId, email) {
    if(!confirm(`Remove Free Mode access for ${email}?`)) return;

    const { data, error } = await supabase.rpc('free_mode_account_action', {
        p_user_id: userId,
        p_action: 'toggle',
        p_order_total: null
    });

    if (error) alert(error.message);
    else loadFreeModeUsers();
}

// Realtime
let fmRealtimeChannel = null;
function initFreeModeRealtime() {
    if (fmRealtimeChannel) return;
    fmRealtimeChannel = supabase
        .channel('admin-freemode-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            loadFreeModeUsers();
        })
        .subscribe();
}

document.addEventListener("DOMContentLoaded", initFreeModePage);
