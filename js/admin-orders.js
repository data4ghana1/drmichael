// js/admin-orders.js

// Orders Ledger Pagination State
let currentOrdersPage = 1;
const ORDERS_PER_PAGE = 100;

// Persistent cross-page selection
window.globalSelectedOrderIds = new Set();

async function initOrdersPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadRecentOrders(1);
    loadOrderMetrics();
    initOrdersRealtime();
}

async function loadRecentOrders(page = 1) {
  if (!supabase) {
    console.error("Supabase client not initialized.");
    const tbody = document.getElementById("allOrdersTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:24px;">Supabase client not initialized. Check console.</td></tr>`;
    return;
  }

  currentOrdersPage = page;
  const from = (page - 1) * ORDERS_PER_PAGE;
  const to = from + ORDERS_PER_PAGE - 1;

  try {
    let query = supabase
      .from("orders")
      .select("id, user_id, network, phone, plan, amount, status, created_at, order_number, users(first_name, last_name, email, merchant_id)", { count: "exact" })
      .order("created_at", { ascending: false });

    // Apply Active Filters
    const pPhone = document.getElementById("filterPhone")?.value;
    const pStatus = document.getElementById("filterStatus")?.value;
    const pNetwork = document.getElementById("filterNetwork")?.value;
    const pDate = document.getElementById("filterDate")?.value;

    if (pPhone && pPhone.trim() !== '') {
        query = query.ilike('phone', `%${pPhone.trim()}%`);
    }
    
    if (pStatus && pStatus !== '') {
        if (pStatus.toLowerCase() === 'processing') {
             query = query.not('status', 'in', '("Completed","completed","true","Success","success","Failed","failed","false")');
        } else {
             query = query.ilike('status', `%${pStatus}%`);
        }
    }

    if (pNetwork && pNetwork !== '') {
        query = query.ilike('network', `%${pNetwork}%`);
    }

    if (pDate && pDate !== '') {
        const start = new Date(pDate);
        start.setHours(0,0,0,0);
        const end = new Date(pDate);
        end.setHours(23,59,59,999);
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    }

    // Apply pagination range AFTER filters
    query = query.range(from, to);

    const { data: orders, error, count } = await query;

  window.currentLoadedOrders = orders;

  const tbody = document.getElementById("allOrdersTableBody");
  if (!tbody) return;
  
  if (error) {
    console.error("Supabase Error:", error);
    let errorMsg = error.message;
    if (error.message.includes("order_number") || error.message.includes("column does not exist")) {
        errorMsg += "<br><br><span style='font-size:12px; opacity:0.8;'>TIP: Did you run the <b>add_order_number.sql</b> script in the Supabase SQL Editor?</span>";
    }
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:24px;">Failed to load orders: <b>${errorMsg}</b></td></tr>`;
    return;
  }
  
  if (!orders || orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No orders match criteria.</td></tr>`;
      return;
  }
  
  tbody.innerHTML = "";

  orders.forEach(order => {
    const dateObj = new Date(order.created_at);
    const dateStr = dateObj.toLocaleDateString('en-GB');
    const timeStr = dateObj.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
    
    const fn = order.users?.first_name || '';
    const ln = order.users?.last_name || '';
    const fullName = `${fn} ${ln}`.trim() || order.users?.email || 'Unknown User';
    const cid = order.users?.merchant_id || '—';

    let statusCls = 'st-pending';
    const st = String(order.status).toLowerCase();
    if(st.includes('success') || st.includes('completed') || st.includes('true')) statusCls = 'st-success';
    else if(st.includes('failed')) statusCls = 'st-failed';

    const orderRef = `${(order.network || 'ORD').split('-')[0].split(' ')[0].toUpperCase()}-${String(order.order_number || 0).padStart(3, '0')}`;

    tbody.innerHTML += `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="row-checkbox" value="${order.id}" onchange="handleRowCheckboxChange(this)"></td>
        <td data-label="Order ID" style="font-weight:700; color:#3b82f6;">${orderRef}</td>
        <td data-label="Customer">
            <div style="font-family:monospace; font-size:11px; color:#3b82f6; font-weight:700; margin-bottom:4px;">${cid}</div>
            <div style="font-weight:600;">${fullName}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Recip: ${order.phone}</div>
        </td>
        <td data-label="Vector">
          <div style="font-weight:600;">${order.network}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${order.plan}</div>
        </td>
        <td data-label="Value"><span style="font-weight:700; color:white;">₵${Number(order.amount).toFixed(2)}</span></td>
        <td data-label="State"><span class="st-badge ${statusCls}">${order.status}</span></td>
        <td data-label="Timestamp" style="color:var(--text-muted); font-size:12px; font-family:monospace;">
            <div style="color:white; font-weight:600;">${dateStr}</div>
            <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
        </td>
      </tr>
    `;
  });

  restoreRowCheckboxStates();

  // Update pagination UI
  const prevBtn = document.getElementById("prevOrdersBtn");
  const nextBtn = document.getElementById("nextOrdersBtn");
  const pageInfo = document.getElementById("ordersPageInfo");

  if (prevBtn) prevBtn.disabled = page === 1;
  if (nextBtn) nextBtn.disabled = to >= (count - 1) || count === 0;
  if (pageInfo) pageInfo.innerText = `Page ${page} of ${Math.ceil(count / ORDERS_PER_PAGE) || 1}`;
  } catch (err) {
    console.error("Error loading orders:", err);
  }
}

window.changeOrdersPage = function(direction) {
  loadRecentOrders(currentOrdersPage + direction);
}

window.applyOrderFilters = function() {
    loadRecentOrders(1);
}

window.resetOrderFilters = function() {
    if(document.getElementById("filterPhone")) document.getElementById("filterPhone").value = "";
    if(document.getElementById("filterStatus")) document.getElementById("filterStatus").value = "";
    if(document.getElementById("filterNetwork")) document.getElementById("filterNetwork").value = "";
    if(document.getElementById("filterDate")) document.getElementById("filterDate").value = "";
    const hint = document.getElementById("phoneStatusHint");
    if (hint) { hint.style.display = 'none'; hint.innerText = ''; }
    window.phonePivotTimestamp = null;
    window.phonePivotStatus = null;
    loadRecentOrders(1);
}

// Bulk Selection Handlers
function resetBulkSelection() {
  window.globalSelectedOrderIds = new Set();
  const master = document.getElementById('masterCheckbox');
  const bar = document.getElementById('bulkActionsBar');
  if (master) master.checked = false;
  if (bar) bar.style.display = 'none';
}

function restoreRowCheckboxStates() {
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.checked = window.globalSelectedOrderIds.has(cb.value);
  });
  const allOnPage = document.querySelectorAll('.row-checkbox');
  const master = document.getElementById('masterCheckbox');
  if (master) master.checked = allOnPage.length > 0 && Array.from(allOnPage).every(cb => cb.checked);
  updateBulkActionBar();
}

window.toggleAllBulkSelect = async function() {
  const master = document.getElementById('masterCheckbox');
  if (!master) return;
  const isChecking = master.checked;

  if (isChecking) {
    try {
      let query = supabase.from('orders').select('id');
      const pPhone = document.getElementById('filterPhone')?.value;
      const pStatus = document.getElementById('filterStatus')?.value;
      const pNetwork = document.getElementById('filterNetwork')?.value;
      const pDate = document.getElementById('filterDate')?.value;
      
      if (pPhone && pPhone.trim()) query = query.ilike('phone', `%${pPhone.trim()}%`);
      if (pStatus && pStatus !== '') {
        if (pStatus.toLowerCase() === 'processing') {
          query = query.not('status', 'in', '("Completed","completed","true","Success","success","Failed","failed","false")');
        } else {
          query = query.ilike('status', `%${pStatus}%`);
        }
      }
      if (pNetwork && pNetwork !== '') query = query.ilike('network', `%${pNetwork}%`);
      if (pDate && pDate !== '') {
        const start = new Date(pDate); start.setHours(0,0,0,0);
        const end = new Date(pDate); end.setHours(23,59,59,999);
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      }
      const { data } = await query;
      if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));
    } catch(e) { console.error(e); }
  } else {
    window.globalSelectedOrderIds = new Set();
  }
  restoreRowCheckboxStates();
}

window.handleRowCheckboxChange = function(cb) {
  if (cb.checked) {
    window.globalSelectedOrderIds.add(cb.value);
  } else {
    window.globalSelectedOrderIds.delete(cb.value);
  }
  const allOnPage = document.querySelectorAll('.row-checkbox');
  const master = document.getElementById('masterCheckbox');
  if (master) master.checked = allOnPage.length > 0 && Array.from(allOnPage).every(c => c.checked);
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionsBar');
  const countSpan = document.getElementById('bulkSelectCount');
  const count = window.globalSelectedOrderIds.size;
  
  if (count > 0 && bar) {
    bar.style.display = 'flex';
    if (countSpan) countSpan.innerText = count;
  } else if (bar) {
    bar.style.display = 'none';
  }
}

// Realtime
let ordersRealtimeChannel = null;
function initOrdersRealtime() {
    if (ordersRealtimeChannel) return;
    ordersRealtimeChannel = supabase
        .channel('admin-orders-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            loadRecentOrders(currentOrdersPage);
            loadOrderMetrics();
        })
        .subscribe();
}

async function loadOrderMetrics() {
    try {
        const [{ count: total }, { count: completed }, { count: failed }] = await Promise.all([
            supabase.from('orders').select('*', { count: 'exact', head: true }),
            supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['Completed', 'completed', 'true', 'Success', 'success']),
            supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['Failed', 'failed', 'false'])
        ]);
        
        document.getElementById('globalMetricTotal').innerText = total || 0;
        document.getElementById('globalMetricCompleted').innerText = completed || 0;
        document.getElementById('globalMetricFailed').innerText = failed || 0;
        document.getElementById('globalMetricProcessing').innerText = Math.max(0, (total || 0) - (completed || 0) - (failed || 0));
    } catch(e) { console.error(e); }
}

// Bulk Actions Logic
function restoreRowCheckboxStates() {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = window.globalSelectedOrderIds.has(cb.value);
    });
    const allOnPage = document.querySelectorAll('.row-checkbox');
    const master = document.getElementById('masterCheckbox');
    if (master) master.checked = allOnPage.length > 0 && Array.from(allOnPage).every(cb => cb.checked);
    updateBulkActionBar();
}

window.handleRowCheckboxChange = function(cb) {
    if (cb.checked) window.globalSelectedOrderIds.add(cb.value);
    else window.globalSelectedOrderIds.delete(cb.value);
    
    const allOnPage = document.querySelectorAll('.row-checkbox');
    const master = document.getElementById('masterCheckbox');
    if (master) master.checked = allOnPage.length > 0 && Array.from(allOnPage).every(c => c.checked);
    updateBulkActionBar();
}

window.toggleAllBulkSelect = async function() {
    const master = document.getElementById('masterCheckbox');
    if (!master) return;
    const isChecking = master.checked;

    if (isChecking) {
        // Fetch matching order IDs based on current filters
        let query = supabase.from('orders').select('id');
        const pPhone = document.getElementById('filterPhone')?.value;
        const pStatus = document.getElementById('filterStatus')?.value;
        const pNetwork = document.getElementById('filterNetwork')?.value;
        const pDate = document.getElementById('filterDate')?.value;

        if (pPhone && pPhone.trim()) query = query.ilike('phone', `%${pPhone.trim()}%`);
        if (pStatus && pStatus !== '') query = query.ilike('status', `%${pStatus}%`);
        if (pNetwork && pNetwork !== '') query = query.ilike('network', `%${pNetwork}%`);
        if (pDate && pDate !== '') {
            const dStart = new Date(pDate); dStart.setHours(0,0,0,0);
            const dEnd = new Date(pDate); dEnd.setHours(23,59,59,999);
            query = query.gte('created_at', dStart.toISOString()).lte('created_at', dEnd.toISOString());
        }

        const { data } = await query;
        if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));
    } else {
        window.globalSelectedOrderIds = new Set();
    }
    restoreRowCheckboxStates();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulkActionsBar');
    const countSpan = document.getElementById('bulkSelectCount');
    const count = window.globalSelectedOrderIds.size;
    
    if (count > 0 && bar) {
        bar.style.display = 'flex';
        if (countSpan) countSpan.innerText = count;
    } else if (bar) {
        bar.style.display = 'none';
    }
}

window.executeBulkUpdateStatus = async function() {
    const newStatus = document.getElementById("bulkStatusSelect").value;
    if (!newStatus) return alert("Select a status.");
    const ids = Array.from(window.globalSelectedOrderIds);
    if (ids.length === 0) return;
    if (!confirm(`Update ${ids.length} orders to ${newStatus}?`)) return;

    // Suppress individual SMS if we are marking as processed/completed and it's a bulk action > 1
    const isSuccessUpdate = (newStatus.toLowerCase() === 'completed' || newStatus.toLowerCase() === 'processed');
    const shouldSuppress = isSuccessUpdate && ids.length > 1;

    let updatePayload = { status: newStatus };
    if (shouldSuppress) {
        updatePayload.suppress_sms = true;
    }

    const { error } = await supabase.from('orders').update(updatePayload).in('id', ids);
    if (error) {
        alert(error.message);
        return;
    }

    // ── Bulk Order Completion SMS Dispatch ──
    if (shouldSuppress) {
        try {
            const { data: orderData } = await supabase
                .from('orders')
                .select('order_number, user_id')
                .in('id', ids)
                .order('order_number', { ascending: true });
                
            if (orderData && orderData.length > 0) {
                const firstOrderId = orderData[0].order_number;
                const lastOrderId = orderData[orderData.length - 1].order_number;
                const agentUserId = orderData[0].user_id;

                const { data: agentData } = await supabase.from('users').select('phone').eq('id', agentUserId).single();
                
                if (agentData && agentData.phone && window.sendSmsNotification) {
                    const bulkMsg = `Your order (${firstOrderId} to ${lastOrderId}) has been completed successfully. Thank you for using Data4Ghana.`;
                    window.sendSmsNotification(agentData.phone, bulkMsg);
                }
            }
        } catch (smsErr) {
            console.warn("Bulk SMS Notification failed:", smsErr);
        }
    }

    window.globalSelectedOrderIds = new Set();
    loadRecentOrders(currentOrdersPage);
}

// --- Smart Phone Search & Bulk Directional Selection ---
window.phonePivotTimestamp = null;
window.phonePivotStatus = null;
window.phonePivotStatusGroup = null;

const PROCESSING_STATUSES = ['pending', 'in transit', 'processing', 'undelivered', 'received', 'waiting',
                              'Pending', 'In Transit', 'Processing', 'Undelivered', 'Received', 'Waiting'];

let phoneSearchTimer = null;
window.smartPhoneSearch = async function() {
    clearTimeout(phoneSearchTimer);
    phoneSearchTimer = setTimeout(async () => {
        const phone = document.getElementById("filterPhone")?.value?.trim();
        const hint = document.getElementById("phoneStatusHint");
        const statusSelect = document.getElementById("filterStatus");

        if (!phone) {
            if (hint) { hint.style.display = 'none'; hint.innerText = ''; }
            window.phonePivotTimestamp = null;
            window.phonePivotStatus = null;
            window.phonePivotStatusGroup = null;
            if (statusSelect) statusSelect.value = "";
            loadRecentOrders(1);
            return;
        }

        const { data: pivot } = await supabase
            .from('orders')
            .select('id, status, created_at')
            .ilike('phone', `%${phone}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (pivot && pivot.length > 0) {
            const latestOrder = pivot[0];
            window.phonePivotTimestamp = latestOrder.created_at;
            window.phonePivotStatus = latestOrder.status;

            const isProcessingGroup = PROCESSING_STATUSES.map(s => s.toLowerCase()).includes(latestOrder.status.toLowerCase());

            if (isProcessingGroup) {
                window.phonePivotStatusGroup = PROCESSING_STATUSES;
                if (statusSelect) statusSelect.value = latestOrder.status; // set to closest match
                if (hint) {
                    hint.style.display = 'block';
                    hint.innerHTML = `Auto-detected: <strong style="color:#fbbf24;">Pending · In Transit · Processing · Undelivered · Received · Waiting</strong><br><span style="opacity:0.7;">Use ↑ ↓ to select all orders with these statuses around this phone</span>`;
                }
            } else {
                window.phonePivotStatusGroup = null;
                if (statusSelect) statusSelect.value = latestOrder.status;
                if (hint) {
                    hint.style.display = 'block';
                    hint.innerHTML = `Auto-detected status: <strong style="color:#fbbf24;">${latestOrder.status}</strong> — Use ↑ ↓ to select orders around this phone`;
                }
            }
        } else {
            window.phonePivotTimestamp = null;
            window.phonePivotStatus = null;
            window.phonePivotStatusGroup = null;
            if (hint) { hint.style.display = 'none'; }
        }

        loadRecentOrders(1);
    }, 400);
}

window.selectFromPhoneUp = async function() {
    if (!window.phonePivotTimestamp || !window.phonePivotStatus) {
        alert("Please search for a phone number first.");
        return;
    }
    const pPhone = document.getElementById("filterPhone")?.value?.trim();
    const statusGroup = window.phonePivotStatusGroup || [window.phonePivotStatus];

    let query = supabase.from('orders').select('id')
        .in('status', statusGroup)
        .gte('created_at', window.phonePivotTimestamp);
    if (pPhone) query = query.not('phone', 'ilike', `%${pPhone}%`);

    const { data } = await query;
    if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));

    const { data: selfOrders } = await supabase.from('orders').select('id')
        .ilike('phone', `%${pPhone}%`)
        .in('status', statusGroup);
    if (selfOrders) selfOrders.forEach(o => window.globalSelectedOrderIds.add(o.id));

    restoreRowCheckboxStates();
}

window.selectFromPhoneDown = async function() {
    if (!window.phonePivotTimestamp || !window.phonePivotStatus) {
        alert("Please search for a phone number first.");
        return;
    }
    const pPhone = document.getElementById("filterPhone")?.value?.trim();
    const statusGroup = window.phonePivotStatusGroup || [window.phonePivotStatus];

    let query = supabase.from('orders').select('id')
        .in('status', statusGroup)
        .lte('created_at', window.phonePivotTimestamp);
    if (pPhone) query = query.not('phone', 'ilike', `%${pPhone}%`);

    const { data } = await query;
    if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));

    const { data: selfOrders } = await supabase.from('orders').select('id')
        .ilike('phone', `%${pPhone}%`)
        .in('status', statusGroup);
    if (selfOrders) selfOrders.forEach(o => window.globalSelectedOrderIds.add(o.id));

    restoreRowCheckboxStates();
}

window.executeBulkExport = async function() {
  const ids = Array.from(window.globalSelectedOrderIds);
  if(ids.length === 0) return;
  
  const { data: selectedOrders } = await supabase.from('orders').select('phone, plan').in('id', ids);
  if (!selectedOrders) return;
  
  let csv = "";
  selectedOrders.forEach(o => {
    const rawPlan = String(o.plan || '').toUpperCase().replace('GB', '').trim();
    csv += `${o.phone},${rawPlan}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `orders_export_${Date.now()}.csv`;
  link.click();
}

window.executeBulkCopy = async function() {
  const ids = Array.from(window.globalSelectedOrderIds);
  if(ids.length === 0) return;
  
  const { data: selectedOrders } = await supabase.from('orders').select('phone, plan').in('id', ids);
  if (!selectedOrders) return;
  
  let msg = "";
  selectedOrders.forEach(o => {
    const rawPlan = String(o.plan || '').toUpperCase().replace('GB', '').trim();
    msg += `${o.phone}\t${rawPlan}\n`;
  });
  
  navigator.clipboard.writeText(msg).then(() => {
    alert(`Copied ${selectedOrders.length} numbers to clipboard.`);
  }).catch(err => {
    alert("Copy failed. Check browser permissions.");
  });
}

window.executeBulkWhatsApp = async function() {
  const ids = Array.from(window.globalSelectedOrderIds);
  if(ids.length === 0) return;
  
  const { data: selectedOrders } = await supabase.from('orders').select('phone, plan').in('id', ids);
  if (!selectedOrders) return;
  
  let msg = "";
  selectedOrders.forEach(o => {
    const rawPlan = String(o.plan || '').toUpperCase().replace('GB', '').trim();
    msg += `${o.phone} ${rawPlan}\n`;
  });
  
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// Global exposure
window.loadRecentOrders = loadRecentOrders;

document.addEventListener("DOMContentLoaded", initOrdersPage);
