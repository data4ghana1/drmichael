// js/admin-ecards.js

async function initEcardsPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadEcardInventory();
    loadEcardStats();
    loadEcardPricing();
}

async function loadEcardStats() {
    try {
        const { data: pins } = await supabase.from('ecard_inventory').select('product, is_used');
        if (!pins) return;

        const wassceAvail = pins.filter(p => p.product === 'ecard_wassce' && !p.is_used).length;
        const beceAvail = pins.filter(p => p.product === 'ecard_bece' && !p.is_used).length;
        const totalUsed = pins.filter(p => p.is_used).length;

        document.getElementById('ec_wassce_avail').innerText = wassceAvail;
        document.getElementById('ec_bece_avail').innerText = beceAvail;
        document.getElementById('ec_total_used').innerText = totalUsed;
    } catch (e) { console.error(e); }
}

async function loadEcardInventory() {
    const tbody = document.getElementById('ecInventoryBody');
    if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading inventory...</td></tr>';

    let query = supabase.from('ecard_inventory').select('*');
    
    const type = document.getElementById('ecFilterType')?.value;
    const status = document.getElementById('ecFilterStatus')?.value;
    
    if (type) query = query.eq('product', type);
    if (status) query = query.eq('is_used', status === 'true');

    const { data: inventory, error } = await query.order('created_at', { ascending: false }).limit(100);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!inventory || inventory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No PINs found.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    inventory.forEach((item, idx) => {
        const typeLabel = item.product === 'ecard_wassce' ? 'WASSCE' : 'BECE';
        const statusLabel = item.is_used ? '<span class="status-badge status-failed">USED</span>' : '<span class="status-badge status-success">AVAIL</span>';
        const usedDate = item.used_at ? new Date(item.used_at).toLocaleDateString() : '—';

        tbody.innerHTML += `
            <tr>
                <td style="font-size:12px; color:var(--text-muted);">${idx + 1}</td>
                <td style="font-weight:600; font-size:13px; color:white;">${typeLabel}</td>
                <td style="font-family:monospace; font-size:13px; color:var(--blue);">${item.pin}</td>
                <td style="font-family:monospace; font-size:13px; color:var(--text-muted);">${item.serial || '—'}</td>
                <td>${statusLabel}</td>
                <td style="font-size:12px; color:var(--text-muted);">${usedDate}</td>
            </tr>
        `;
    });
}

async function loadEcardPricing() {
    const { data: pricing } = await supabase.from('pricing').select('*').ilike('product', 'ecard_%');
    if (!pricing) return;

    pricing.forEach(p => {
        const id = `ec_price_${p.product.replace('ecard_', '')}_${p.role}`;
        const input = document.getElementById(id);
        if (input) input.value = p.price;
    });
}

window.saveEcardPrices = async function() {
    const roles = ['client', 'vip_customer', 'elite_agent', 'super_agent'];
    const types = ['wassce', 'bece'];
    const status = document.getElementById('ecPriceStatus');
    status.innerText = 'Saving...';

    try {
        const updates = [];
        types.forEach(t => {
            roles.forEach(r => {
                const val = document.getElementById(`ec_price_${t}_${r}`).value;
                updates.push(supabase.from('pricing').update({ price: Number(val) }).match({ product: `ecard_${t}`, role: r }));
            });
        });

        await Promise.all(updates);
        status.innerText = '✅ Saved successfully';
        setTimeout(() => status.innerText = '', 3000);
    } catch (e) {
        status.innerText = '❌ Failed to save';
    }
}

window.uploadEcardPins = async function() {
    const type = document.getElementById('ecUploadType').value;
    const input = document.getElementById('ecBulkInput').value.trim();
    const status = document.getElementById('ecUploadStatus');

    if (!input) return alert("Paste some PINs first.");
    status.innerText = 'Processing...';

    const lines = input.split('\n');
    const pinsToInsert = [];

    lines.forEach(line => {
        // Match both formats
        // Format 1: PIN - XXXXXXXXXXXX SERIAL - XXXXXXXXXXXX
        // Format 2: PIN: XXXXXXXXXXXX | SERIAL: XXXXXXXXXXXX
        const pinMatch = line.match(/PIN\s*[:|-]\s*([A-Z0-9]+)/i);
        const serialMatch = line.match(/SERIAL\s*[:|-]\s*([A-Z0-9]+)/i);

        if (pinMatch) {
            pinsToInsert.push({
                product: type,
                pin: pinMatch[1].trim(),
                serial: serialMatch ? serialMatch[1].trim() : null,
                is_used: false
            });
        }
    });

    if (pinsToInsert.length === 0) {
        status.innerText = '❌ No valid PINs found in text.';
        return;
    }

    const { error } = await supabase.from('ecard_inventory').insert(pinsToInsert);
    if (error) {
        status.innerText = '❌ Error: ' + error.message;
    } else {
        status.innerText = `✅ Uploaded ${pinsToInsert.length} PINs successfully.`;
        document.getElementById('ecBulkInput').value = '';
        loadEcardInventory();
        loadEcardStats();
    }
}

// Realtime
let ecRealtimeChannel = null;
function initEcardsRealtime() {
    if (ecRealtimeChannel) return;
    ecRealtimeChannel = supabase
        .channel('admin-ecards-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ecard_inventory' }, () => {
            loadEcardInventory();
            loadEcardStats();
        })
        .subscribe();
}

document.addEventListener("DOMContentLoaded", initEcardsPage);
