// js/admin-dataplans.js

async function initDataPlansPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadDataPlans();
}

async function loadDataPlans() {
    const tbody = document.getElementById('dataPlansTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading plans...</td></tr>';

    const { data: plans, error } = await supabase
        .from('pricing')
        .select('*')
        .order('product', { ascending: true })
        .order('gb_size', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Failed to load pricing: ${error.message}</td></tr>`;
        return;
    }

    const baseProductKeys = ['data_per_gb', 'data_mtn_express', 'afa_premium', 'afa_normal'];
    const basePlans = plans.filter(p => baseProductKeys.includes(p.product));
    const bundlePlans = plans.filter(p => !baseProductKeys.includes(p.product) && !p.product.toLowerCase().startsWith('ecard_') && !p.product.includes('CARD_BECE'));

    renderBaseProducts(basePlans);
    renderDataBundles(bundlePlans);
}

function renderBaseProducts(plans) {
    const baseProductKeys = ['data_per_gb', 'data_mtn_express', 'afa_premium', 'afa_normal'];
    const baseMap = {};
    baseProductKeys.forEach(k => baseMap[k] = {});
    plans.forEach(p => {
        baseMap[p.product][p.role] = p.price;
    });
    window.currentBaseProductsMap = baseMap;

    const bpGrid = document.getElementById('baseProductsGrid');
    if (!bpGrid) return;
    bpGrid.innerHTML = '';
    const bpLabels = { 
        'data_per_gb': 'Standard Fallback (Per GB)', 
        'data_mtn_express': 'MTN Express Fallback',
        'afa_premium': 'AFA Premium', 
        'afa_normal': 'AFA Normal' 
    };

    baseProductKeys.forEach((prod, index, arr) => {
        const roles = baseMap[prod];
        const clientPx = roles['client'] || 0;
        const adminPx = roles['admin'] || 0;
        const borderBottom = index === arr.length - 1 ? '' : 'border-bottom:1px solid rgba(255,255,255,0.05);';

        bpGrid.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; ${borderBottom}">
                <div style="flex:1;">
                    <strong style="color:white; font-size:14px; display:block; margin-bottom:6px;">${bpLabels[prod]}</strong>
                    <div style="display:flex; gap:24px; font-size:13px;">
                        <div><span style="color:var(--text-muted); margin-right:4px;">Client:</span> <span style="color:#10b981; font-weight:600;">₵${Number(clientPx).toFixed(2)}</span></div>
                        <div><span style="color:var(--text-muted); margin-right:4px;">Admin:</span> <span style="color:white; font-weight:600;">₵${Number(adminPx).toFixed(2)}</span></div>
                    </div>
                </div>
                <div>
                    <button class="btn-action" onclick="openBaseProductModal('${prod}')">Edit Pricing</button>
                </div>
            </div>
        `;
    });
}

function renderDataBundles(plans) {
    const tbody = document.getElementById('dataPlansTableBody');
    const grouped = {};
    plans.forEach(p => {
        const size = p.gb_size === null ? 0 : p.gb_size;
        const key = `${p.product}_${size}`;
        if (!grouped[key]) {
            grouped[key] = {
                product: p.product,
                gb_size: size,
                plan_name: p.plan_name || 'N/A',
                validity: p.validity || 'N/A',
                is_in_stock: p.is_in_stock !== false,
                prices: {}
            };
        }
        grouped[key].prices[p.role] = p.price;
        if (p.plan_name && p.plan_name !== 'N/A') grouped[key].plan_name = p.plan_name;
        if (p.validity && p.validity !== 'N/A') grouped[key].validity = p.validity;
    });

    const netMap = { 'data_mtn': 'MTN', 'data_mtn_express': 'MTN Express', 'data_telecel': 'Telecel', 'data_tigo': 'Ishare' };
    const sortedGroups = Object.keys(grouped).map(k => grouped[k]).sort((a, b) => a.gb_size - b.gb_size);

    window.currentDataPlansMap = grouped;
    tbody.innerHTML = '';

    if (sortedGroups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No bundles in registry.</td></tr>`;
        return;
    }

    sortedGroups.forEach(g => {
        const clientPx = g.prices['client'] || 0;
        const adminPx = g.prices['admin'] || 0;
        const netName = netMap[g.product] || g.product.replace('data_', '').toUpperCase();
        const key = `${g.product}_${g.gb_size}`;
        const stockBadge = g.is_in_stock ? '' : '<span style="color:#ef4444; font-size:10px; margin-left:8px;">[OUT]</span>';

        tbody.innerHTML += `
            <tr style="${g.is_in_stock ? '' : 'opacity:0.6;'}">
                <td style="font-weight:600; color:white;">${netName}</td>
                <td>${g.plan_name} ${stockBadge}</td>
                <td style="color:var(--blue); font-weight:700;">${g.gb_size} GB</td>
                <td style="color:var(--text-muted);">${g.validity}</td>
                <td style="text-align:right;">
                    <div style="font-size:13px; color:#10b981;">₵${Number(clientPx).toFixed(2)}</div>
                    <div style="font-size:11px; opacity:0.6;">₵${Number(adminPx).toFixed(2)}</div>
                </td>
                <td style="text-align:right;">
                    <button class="btn-action" onclick="openBundleModal('${key}')">Edit</button>
                    <button class="btn-action" style="color:#ef4444; border-color:#ef4444;" onclick="deleteBundle('${g.product}', ${g.gb_size})">Delete</button>
                </td>
            </tr>
        `;
    });
}

// Modal Handlers
window.openBaseProductModal = function (prodKey) {
    const map = window.currentBaseProductsMap[prodKey];
    if (!map) return;

    const modal = document.getElementById('baseProductModal');
    document.getElementById('bpProductKey').value = prodKey;
    document.getElementById('bpPriceClient').value = map['client'] || '';
    document.getElementById('bpPriceVip').value = map['vip_customer'] || '';
    document.getElementById('bpPriceElite').value = map['elite_agent'] || '';
    document.getElementById('bpPriceSuper').value = map['super_agent'] || '';
    document.getElementById('bpPriceAdmin').value = map['admin'] || '';

    modal.style.display = 'flex';
}

window.closeBaseProductModal = function () {
    document.getElementById('baseProductModal').style.display = 'none';
}

window.saveBaseProductPricing = async function () {
    const prod = document.getElementById('bpProductKey').value;
    const clientPrice = Number(document.getElementById('bpPriceClient').value);
    const vipPrice = Number(document.getElementById('bpPriceVip').value);
    const elitePrice = Number(document.getElementById('bpPriceElite').value);
    const superPrice = Number(document.getElementById('bpPriceSuper').value);
    const adminPrice = Number(document.getElementById('bpPriceAdmin').value);

    const roles = ['client', 'admin', 'vip_customer', 'elite_agent', 'super_agent'];
    const updates = roles.map(role => {
        let price = clientPrice;
        if (role === 'admin') price = adminPrice || clientPrice;
        if (role === 'vip_customer') price = vipPrice || clientPrice;
        if (role === 'elite_agent') price = elitePrice || clientPrice;
        if (role === 'super_agent') price = superPrice || clientPrice;

        return supabase.from('pricing').update({ price }).match({ product: prod, role: role });
    });

    await Promise.all(updates);
    closeBaseProductModal();
    loadDataPlans();
}

window.openBundleModal = function (key) {
    const modal = document.getElementById('dataPlanModal');

    if (key) {
        const g = window.currentDataPlansMap[key];
        if (!g) return;
        document.getElementById('dpModalTitle').innerText = "Edit Bundle";
        document.getElementById('dpNetwork').value = g.product;
        document.getElementById('dpGbSize').value = g.gb_size;
        document.getElementById('dpPlanName').value = g.plan_name;
        document.getElementById('dpPriceClient').value = g.prices['client'] || '';
        document.getElementById('dpPriceVip').value = g.prices['vip_customer'] || '';
        document.getElementById('dpPriceElite').value = g.prices['elite_agent'] || '';
        document.getElementById('dpPriceSuper').value = g.prices['super_agent'] || '';
        document.getElementById('dpPriceAdmin').value = g.prices['admin'] || '';
    } else {
        document.getElementById('dpModalTitle').innerText = "Add New Bundle";
        document.getElementById('dpNetwork').value = 'data_mtn';
        document.getElementById('dpGbSize').value = '';
        document.getElementById('dpPlanName').value = '';
        document.getElementById('dpPriceClient').value = '';
        document.getElementById('dpPriceVip').value = '';
        document.getElementById('dpPriceElite').value = '';
        document.getElementById('dpPriceSuper').value = '';
        document.getElementById('dpPriceAdmin').value = '';
    }

    modal.style.display = 'flex';
}

window.closeDataPlanModal = function () {
    document.getElementById('dataPlanModal').style.display = 'none';
}

window.saveDataPlan = async function () {
    const network = document.getElementById('dpNetwork').value;
    const gbSize = Number(document.getElementById('dpGbSize').value);
    const planName = document.getElementById('dpPlanName').value;
    const priceClient = Number(document.getElementById('dpPriceClient').value);
    const priceVip = Number(document.getElementById('dpPriceVip').value);
    const priceElite = Number(document.getElementById('dpPriceElite').value);
    const priceSuper = Number(document.getElementById('dpPriceSuper').value);
    const priceAdmin = Number(document.getElementById('dpPriceAdmin').value);

    if (!gbSize || !planName || priceClient === '') return alert('Please fill required fields (Size, Name, Client Price).');

    const roles = ['client', 'admin', 'vip_customer', 'elite_agent', 'super_agent'];
    const btn = document.getElementById('btnSaveDataPlan');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    try {
        for (const role of roles) {
            let price = priceClient;
            if (role === 'admin') price = priceAdmin || priceClient;
            if (role === 'vip_customer') price = priceVip || priceClient;
            if (role === 'elite_agent') price = priceElite || priceClient;
            if (role === 'super_agent') price = priceSuper || priceClient;

            // Delete existing row for this specific plan to prevent duplicate collision
            await supabase.from('pricing').delete().match({ product: network, role: role, gb_size: gbSize });

            // Insert replacement
            await supabase.from('pricing').insert({
                product: network,
                role: role,
                gb_size: gbSize,
                plan_name: planName,
                price: price,
                is_in_stock: true
            });
        }
        closeDataPlanModal();
        loadDataPlans();
    } catch (e) {
        alert('Failed to save data plan: ' + e.message);
    } finally {
        btn.innerText = 'Confirm & Save';
        btn.disabled = false;
    }
}

window.deleteBundle = async function (productKey, gbSize) {
    if (!confirm(`Are you sure you want to permanently delete the ${gbSize}GB bundle for ${productKey}?`)) return;

    try {
        const { error } = await supabase.from('pricing').delete().match({ product: productKey, gb_size: gbSize });
        if (error) throw error;
        loadDataPlans();
    } catch (e) {
        alert('Failed to delete bundle: ' + e.message);
    }
}

document.addEventListener("DOMContentLoaded", initDataPlansPage);
