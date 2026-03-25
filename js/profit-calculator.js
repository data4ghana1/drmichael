// js/profit-calculator.js

const NET_LABELS = {
    'data_mtn': '🟡 MTN',
    'data_tigo': '📶 AT/Ishare',
    'data_telecel': '🔴 Telecel',
    'data_bigtime': '⚡ AT Bigtime'
};

let allPricingData  = [];
let currentNetwork  = null;
let customRowCount  = 0;  // counter to give unique IDs to custom rows

// ─── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data, error } = await supabase.from('pricing').select('*');
        if (error) throw error;
        allPricingData = data || [];
    } catch (err) {
        console.error('Failed to load pricing:', err);
    }
});

// ─── Network Selection ───────────────────────────────────────────────────
window.selectNetwork = function(networkKey) {
    currentNetwork = networkKey;
    customRowCount = 0;

    // Tab styling
    document.querySelectorAll('.net-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab_${networkKey}`)?.classList.add('active');

    // Heading
    document.getElementById('netHeading').innerText =
        `${NET_LABELS[networkKey] || networkKey} — Base Costs & Margins`;

    // Show table, hide empty state & old analysis
    document.getElementById('emptyState').style.display        = 'none';
    document.getElementById('profitTableWrapper').style.display = 'block';
    document.getElementById('analysisPanel').style.display     = 'none';

    buildTable(networkKey);
};

// ─── Build Table from DB rows ────────────────────────────────────────────
function buildTable(networkKey) {
    const tbody = document.getElementById('profitTableBody');
    tbody.innerHTML = '';

    const netData = allPricingData.filter(p => p.product === networkKey);

    if (!netData.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">
            No bundles found for this network. Add them in Data Plans first.</td></tr>`;
        return;
    }

    // Group by gb_size
    const grouped = {};
    netData.forEach(p => {
        const size = p.gb_size ?? 0;
        if (!grouped[size]) {
            grouped[size] = { gb_size: size, plan_name: p.plan_name || 'N/A', prices: {} };
        }
        grouped[size].prices[p.role] = p.price;
        if (p.plan_name && p.plan_name !== 'N/A') grouped[size].plan_name = p.plan_name;
    });

    Object.values(grouped)
        .sort((a, b) => a.gb_size - b.gb_size)
        .forEach(g => appendDBRow(tbody, g));
}

// Single row from DB (size/plan not editable)
function appendDBRow(tbody, g) {
    const pClient = g.prices['client']        || 0;
    const pVip    = g.prices['vip_customer']  || 0;
    const pElite  = g.prices['elite_agent']   || 0;
    const pSuper  = g.prices['super_agent']   || 0;

    const key    = `db_${g.gb_size}`;
    const sizeLabel = g.gb_size > 0 ? `${g.gb_size} GB` : 'Custom';

    const tr = document.createElement('tr');
    tr.dataset.rowKey    = key;
    tr.dataset.pClient   = pClient;
    tr.dataset.pVip      = pVip;
    tr.dataset.pElite    = pElite;
    tr.dataset.pSuper    = pSuper;
    tr.dataset.sizeLabel = sizeLabel;

    tr.innerHTML = `
        <td><span style="color:var(--blue);font-size:16px;font-weight:700;">${sizeLabel}</span></td>
        <td style="color:var(--text-muted);font-size:13px;">${g.plan_name !== 'N/A' ? g.plan_name : '—'}</td>
        <td>
            <input type="number" id="cost_${key}" class="cost-input" step="0.01" min="0"
                placeholder="e.g. 10.00"
                oninput="recalcRow('${key}', ${pClient}, ${pVip}, ${pElite}, ${pSuper})">
        </td>
        ${profitCols(key, pClient, pVip, pElite, pSuper)}
        <td></td>
    `;
    tbody.appendChild(tr);
}

// ─── Add Custom Bundle Row ───────────────────────────────────────────────
window.addCustomRow = function() {
    const tbody = document.getElementById('profitTableBody');

    // Remove "no bundles" placeholder row if present
    if (tbody.rows.length === 1 && tbody.rows[0].cells.length === 1) tbody.innerHTML = '';

    const idx = `custom_${++customRowCount}`;

    const netData = currentNetwork ? allPricingData.filter(p => p.product === currentNetwork) : [];
    // Gather all role prices keyed by gb_size so the user can enter 0-cost and still see sell prices
    // For custom row we default sell prices to 0 until user fills in size — show editable sell price inputs
    const tr = document.createElement('tr');
    tr.id = `row_${idx}`;
    tr.dataset.rowKey = idx;
    tr.dataset.pClient = 0;
    tr.dataset.pVip    = 0;
    tr.dataset.pElite  = 0;
    tr.dataset.pSuper  = 0;
    tr.dataset.sizeLabel = 'Custom';

    tr.innerHTML = `
        <td>
            <input type="number" id="size_${idx}" class="size-input" step="0.5" min="0"
                placeholder="GB" oninput="updateCustomSellPrices('${idx}')">
        </td>
        <td>
            <input type="text" id="plan_${idx}" class="plan-input" placeholder="Plan name">
        </td>
        <td>
            <input type="number" id="cost_${idx}" class="cost-input" step="0.01" min="0"
                placeholder="0.00"
                oninput="recalcCustom('${idx}')">
        </td>
        ${customProfitCols(idx)}
        <td>
            <button class="del-btn" onclick="deleteRow('row_${idx}')">✕</button>
        </td>
    `;
    tbody.appendChild(tr);
};

// When user types a GB size in a custom row, try to auto-fill sell prices from DB
window.updateCustomSellPrices = function(idx) {
    const sizeInput = document.getElementById(`size_${idx}`);
    const gbSize = parseFloat(sizeInput.value) || 0;

    if (!currentNetwork || gbSize === 0) return;

    const match = allPricingData.filter(
        p => p.product === currentNetwork && (p.gb_size ?? 0) === gbSize
    );

    let pClient = 0, pVip = 0, pElite = 0, pSuper = 0;
    match.forEach(p => {
        if (p.role === 'client')       pClient = p.price;
        if (p.role === 'vip_customer') pVip    = p.price;
        if (p.role === 'elite_agent')  pElite  = p.price;
        if (p.role === 'super_agent')  pSuper  = p.price;
    });

    // Store on row
    const tr = document.getElementById(`row_${idx}`);
    if (tr) {
        tr.dataset.pClient    = pClient;
        tr.dataset.pVip       = pVip;
        tr.dataset.pElite     = pElite;
        tr.dataset.pSuper     = pSuper;
        tr.dataset.sizeLabel  = `${gbSize} GB`;
    }

    // Update sell-price labels
    ['client','vip','elite','super'].forEach((role, i) => {
        const prices = [pClient, pVip, pElite, pSuper];
        const sp = document.getElementById(`sp_${role}_${idx}`);
        if (sp) sp.innerText = `Sell ₵${prices[i].toFixed(2)}`;
    });

    recalcCustom(idx);
};

window.recalcCustom = function(idx) {
    const tr = document.getElementById(`row_${idx}`);
    if (!tr) return;
    const pClient = parseFloat(tr.dataset.pClient) || 0;
    const pVip    = parseFloat(tr.dataset.pVip)    || 0;
    const pElite  = parseFloat(tr.dataset.pElite)  || 0;
    const pSuper  = parseFloat(tr.dataset.pSuper)  || 0;
    recalcRow(idx, pClient, pVip, pElite, pSuper);
};

window.deleteRow = function(rowId) {
    document.getElementById(rowId)?.remove();
};

// ─── Recalculate a row's profit cells ───────────────────────────────────
window.recalcRow = function(key, client, vip, elite, superP) {
    const cost = parseFloat(document.getElementById(`cost_${key}`)?.value) || 0;
    [
        { id: `prof_client_${key}`, sell: client },
        { id: `prof_vip_${key}`,    sell: vip },
        { id: `prof_elite_${key}`,  sell: elite },
        { id: `prof_super_${key}`,  sell: superP }
    ].forEach(({ id, sell }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const profit = sell - cost;
        el.innerText  = cost === 0 ? '—' : (profit < 0 ? `-₵${Math.abs(profit).toFixed(2)}` : `+₵${profit.toFixed(2)}`);
        el.className  = 'profit-cell ' + (cost === 0 ? 'profit-neutral' : profit < 0 ? 'profit-negative' : 'profit-positive');
    });
};

// ─── HTML helpers ────────────────────────────────────────────────────────
function profitCols(key, client, vip, elite, superP) {
    return [
        { role: 'client', sell: client },
        { role: 'vip',    sell: vip },
        { role: 'elite',  sell: elite },
        { role: 'super',  sell: superP }
    ].map(({ role, sell }) => `
        <td>
            <div class="sell-price">Sell ₵${sell.toFixed(2)}</div>
            <div id="prof_${role}_${key}" class="profit-cell profit-neutral">—</div>
        </td>
    `).join('');
}

function customProfitCols(idx) {
    return ['client','vip','elite','super'].map(role => `
        <td>
            <div id="sp_${role}_${idx}" class="sell-price">Sell ₵0.00</div>
            <div id="prof_${role}_${idx}" class="profit-cell profit-neutral">—</div>
        </td>
    `).join('');
}

// ─── Run Analysis ────────────────────────────────────────────────────────
window.runAnalysis = function() {
    const tbody = document.getElementById('profitTableBody');
    const rows  = Array.from(tbody.querySelectorAll('tr'));
    const roles = ['client', 'vip', 'elite', 'super'];
    const roleLabels = { client: 'Client', vip: 'VIP', elite: 'Elite', super: 'Super Agent' };

    const results = [];

    rows.forEach(tr => {
        const key     = tr.dataset.rowKey;
        if (!key) return;

        const costEl  = document.getElementById(`cost_${key}`);
        const cost    = parseFloat(costEl?.value) || 0;
        if (cost === 0) return; // skip unfilled rows

        const sizeLabel = tr.dataset.sizeLabel || key;

        const entry = { label: sizeLabel, cost, profits: {} };
        roles.forEach(role => {
            const sell = parseFloat(tr.dataset[`p${role.charAt(0).toUpperCase() + role.slice(1)}`]) || 0;
            entry.profits[role] = { sell, profit: sell - cost, margin: sell > 0 ? ((sell - cost) / sell * 100) : 0 };
        });
        results.push(entry);
    });

    if (!results.length) {
        alert('Please enter at least one API cost to run an analysis.');
        return;
    }

    // ── Compute totals per role
    const totals = {};
    roles.forEach(r => {
        totals[r] = results.reduce((sum, e) => sum + e.profits[r].profit, 0);
    });

    // ── Find best bundle (highest avg margin across roles)
    const withAvgMargin = results.map(e => ({
        ...e,
        avgMargin: roles.reduce((s, r) => s + e.profits[r].margin, 0) / roles.length
    }));
    withAvgMargin.sort((a, b) => b.avgMargin - a.avgMargin);
    const best = withAvgMargin[0];

    // ── Best bundle banner
    const bestBannerHTML = `
        <div class="best-bundle-banner">
            <span class="star">⭐</span>
            <div>
                <div class="lbl">Highest Avg Margin Bundle</div>
                <div class="val">${best.label} — ${best.avgMargin.toFixed(1)}% average margin across all tiers</div>
            </div>
        </div>`;
    document.getElementById('analysisBestRow').innerHTML = bestBannerHTML;

    // ── Summary cards (total profit per role over given costs)
    const gridHTML = roles.map(r => `
        <div class="an-card ${totals[r] > 0 ? 'an-highlight' : ''}">
            <div class="an-card-title">${roleLabels[r]}</div>
            <div class="an-card-value" style="color:${totals[r] >= 0 ? '#10b981' : '#ef4444'};">
                ${totals[r] < 0 ? '-' : '+'}₵${Math.abs(totals[r]).toFixed(2)}
            </div>
            <div class="an-card-sub">Total profit / sale event across ${results.length} bundles</div>
        </div>
    `).join('');
    document.getElementById('analysisGrid').innerHTML = gridHTML;

    // ── Grand Total (sum of all roles combined)
    const grandTotal = roles.reduce((sum, r) => sum + totals[r], 0);
    const grandTotalColor = grandTotal >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('grandTotalCard').innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:20px 24px; background:${grandTotal >= 0 ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)'}; border:1px solid ${grandTotal >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}; border-radius:12px; margin-bottom:4px;">
            <div>
                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Combined Grand Total Profit</div>
                <div style="font-size:13px; color:var(--text-muted);">Sum across all ${roles.length} tiers × ${results.length} bundle(s) entered</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:36px; font-weight:800; color:${grandTotalColor};">${grandTotal < 0 ? '-' : '+'}₵${Math.abs(grandTotal).toFixed(2)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">= ₵${(grandTotal / roles.length).toFixed(2)} avg per tier</div>
            </div>
        </div>
    `;
    document.getElementById('grandTotalCard').style.display = 'block';

    // ── Full breakdown table
    const tableHTML = `
        <thead>
            <tr>
                <th>Bundle</th>
                <th>API Cost</th>
                ${roles.map(r => `<th>${roleLabels[r]}<br><small>Profit / Margin</small></th>`).join('')}
            </tr>
        </thead>
        <tbody>
        ${withAvgMargin.map(e => `
            <tr>
                <td style="font-weight:700;">${e.label}</td>
                <td style="color:var(--text-muted);">₵${e.cost.toFixed(2)}</td>
                ${roles.map(r => {
                    const p = e.profits[r];
                    const col = p.profit >= 0 ? '#10b981' : '#ef4444';
                    return `<td>
                        <span style="color:${col}; font-weight:700;">${p.profit < 0 ? '-' : '+'}₵${Math.abs(p.profit).toFixed(2)}</span>
                        <span style="color:var(--text-muted); font-size:11px; margin-left:6px;">${p.margin.toFixed(1)}%</span>
                    </td>`;
                }).join('')}
            </tr>
        `).join('')}
        </tbody>
    `;
    document.getElementById('analysisTable').innerHTML = tableHTML;

    // ── Draw Chart
    renderProfitChart(withAvgMargin, roles, roleLabels);

    // Show the analysis panel
    document.getElementById('analysisPanel').style.display = 'block';
    document.getElementById('analysisPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ─── Chart.js Bar Chart ─────────────────────────────────────────────────────
let profitChartInstance = null;

function renderProfitChart(results, roles, roleLabels) {
    const canvas = document.getElementById('profitChart');
    if (!canvas) return;

    // Destroy previous chart instance if it exists
    if (profitChartInstance) {
        profitChartInstance.destroy();
        profitChartInstance = null;
    }

    const labels = results.map(e => e.label); // e.g. ["1 GB", "2 GB", ...]

    const ROLE_COLORS = {
        client: { bg: 'rgba(59,130,246,0.7)',  border: '#3b82f6' },
        vip:    { bg: 'rgba(245,158,11,0.7)',  border: '#f59e0b' },
        elite:  { bg: 'rgba(139,92,246,0.7)',  border: '#8b5cf6' },
        super:  { bg: 'rgba(16,185,129,0.7)',  border: '#10b981' }
    };

    const datasets = roles.map(r => ({
        label: roleLabels[r],
        data: results.map(e => parseFloat(e.profits[r].profit.toFixed(2))),
        backgroundColor: ROLE_COLORS[r].bg,
        borderColor: ROLE_COLORS[r].border,
        borderWidth: 1.5,
        borderRadius: 4
    }));

    profitChartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 },
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            return ` ${ctx.dataset.label}: ${v >= 0 ? '+' : ''}₵${v.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 },
                        callback: v => (v >= 0 ? '+' : '') + '₵' + v.toFixed(2)
                    },
                    border: { dash: [4, 4] }
                }
            }
        }
    });
}

