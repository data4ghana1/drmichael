// js/master-dashboard.js

window.toggleAdminMenu = function() {
    const sidebar = document.querySelector('.master-sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

// Global escapeQuote fallback
if (!window.escapeQuote) {
    window.escapeQuote = (str) => String(str).replace(/'/g, "\\'");
}
const escapeQuote = window.escapeQuote;

// Tab Switching
window.switchTab = function(tabName) {
  // Mobile sidebar dismiss logic
  const sidebar = document.querySelector('.master-sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
  }

  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.getElementById('tab-' + tabName).style.display = 'block';

  document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
  if(event && event.currentTarget) {
    event.currentTarget.parentElement.classList.add('active');
  }

  const titles = {
    'overview': 'Overview',
    'users': 'User Directory',
    'orders': 'Global Orders',
    'wallets': 'Wallet Control',
    'dataplans': 'Data Plans',
    'afa': 'AFA Portal',
    'gateways': 'Payment Gateway',
    'topup': 'Wallet Top-up',
    'tickets': 'Support Tickets',
    'ecards': 'E-Cards Inventory',
    'freemode': 'Control Engine'
  };
  document.getElementById("pageTitle").innerText = titles[tabName] || 'Dashboard';
  
  if (tabName === 'users') {
      loadUsers();
  } else if (tabName === 'wallets') {
      loadWalletTransactions();
  } else if (tabName === 'dataplans') {
      loadDataPlans();
  } else if (tabName === 'afa') {
      loadAfaRegistrations();
  } else if (tabName === 'gateways') {
      loadGateways();
  } else if (tabName === 'topup') {
      loadTopupRequests();
  } else if (tabName === 'tickets') {
      loadTickets();
  } else if (tabName === 'ecards') {
      loadEcardInventory();
      loadEcardStats();
      loadEcardPrices();
  } else if (tabName === 'freemode') {
      loadFreeModeData();
  }
}

// Authentication & Initialization
let revenueChartInstance = null;

async function initializeMasterDashboard() {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    window.location.href = "master-login.html";
    return;
  }

  const { data: userData, error: userErr } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userErr || !userData || userData.role !== 'admin') {
    window.location.href = "dashboard.html";
    return;
  }

  // Use sequential loads to avoid auth lock collisions ("Lock stolen")
  await loadGlobalMetrics();
  await loadRecentOrders(1);
  await loadOrderMetrics();
  await loadUsers();
  await loadWeeklyChartData();
  await loadWalletMetrics();
  await loadDataPlans();

  initUsersRealtime();
}

let usersRealtimeChannel = null;

function initUsersRealtime() {
  if (usersRealtimeChannel) return;

  usersRealtimeChannel = supabase
    .channel('admin-users-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      () => {
        // Automatically sync the UI tables and top metrics when a user registers or updates
        loadUsers();
        loadGlobalMetrics();
        
        // Also sync the secondary free mode cache if it applies
        if (typeof loadFreeModeData === 'function') {
            loadFreeModeData();
        }
      }
    )
    .subscribe();
}


// Stats & Metrics
async function loadGlobalMetrics() {
  // Users
  const { count: userCount } = await supabase.from("users").select('*', { count: 'exact', head: true });
  if (userCount !== null) animateValue(document.getElementById("metricUsers"), 0, userCount, 1000);

  // Orders
  const { count: orderCount } = await supabase.from("orders").select('*', { count: 'exact', head: true });
  if (orderCount !== null) animateValue(document.getElementById("metricOrders"), 0, orderCount, 1000);

  // Orders Today
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const { count: ordersTodayCount } = await supabase.from("orders").select('*', { count: 'exact', head: true }).gte("created_at", todayStart.toISOString());
  if (ordersTodayCount !== null) animateValue(document.getElementById("metricOrdersToday"), 0, ordersTodayCount, 1000);

  // Pending Funding
  const { data: pendingTxs } = await supabase.from("transactions").select("amount").eq("status", "Pending").ilike("type", "%Funding%");
  if (pendingTxs) {
    const totalPending = pendingTxs.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
    animateValue(document.getElementById("metricPendingFunding"), 0, totalPending, 1000, '₵', 2);
  }

  // Revenue
  const { data: revenueData } = await supabase.from("orders").select("amount").in("status", ["completed", "success", "true"]);
  if (revenueData) {
    const totalRev = revenueData.reduce((acc, order) => acc + (Number(order.amount) || 0), 0);
    animateValue(document.getElementById("metricRevenue"), 0, totalRev, 1000, '₵', 2);
  }
}

function animateValue(obj, start, end, duration, prefix = '', decimals = 0) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = (progress * (end - start) + start).toFixed(decimals);
        obj.innerHTML = prefix + current;
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// Chart.js Timeline 
async function loadWeeklyChartData() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Get orders from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: orders } = await supabase
        .from('orders')
        .select('created_at, amount')
        .gte('created_at', sevenDaysAgo.toISOString())
        .in('status', ['completed', 'success']);

    // Group by day
    const labels = [];
    const dataPoints = [];
    
    for(let i=6; i>=0; i--) {
       let d = new Date();
       d.setDate(d.getDate() - i);
       let dateStr = d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
       labels.push(dateStr);
       
       let dayTotal = 0;
       if (orders) {
           orders.forEach(o => {
               if(new Date(o.created_at).getDate() === d.getDate()) {
                   dayTotal += Number(o.amount || 0);
               }
           });
       }
       dataPoints.push(dayTotal);
    }

    if (revenueChartInstance) revenueChartInstance.destroy();

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue (₵)',
                data: dataPoints,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
               legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#64748b', font: {family: 'Inter', size: 11} }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: { color: '#64748b', font: {family: 'Inter', size: 11}, callback: v => '₵'+v }
                }
            }
        }
    });
}

// User Management (Duplicated section removed, consolidated at line 2261)

// Orders Ledger Pagination State
let currentOrdersPage = 1;
const ORDERS_PER_PAGE = 10;

// Persistent cross-page selection
window.globalSelectedOrderIds = new Set();

async function loadRecentOrders(page = 1) {
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
    if (error.message.includes("lock")) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#f59e0b; padding:24px;">🔄 <b>Session Sync:</b> The system is refreshing your login. Please wait a second and it will load automatically.</td></tr>`;
        setTimeout(() => loadRecentOrders(page), 1500); // Auto-retry
        return;
    }
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:24px;">Failed to load orders: <b>${error.message}</b><br><br><i>Check if you ran the <b>add_order_number.sql</b> script in Supabase SQL Editor.</i></td></tr>`;
    return;
  }
  
  if (!orders) return;
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

    const orderRef = `${(order.network || 'ORD').split('-')[0].split(' ')[0].toUpperCase()}-${String(order.order_number || 0).padStart(2, '0')}`;

    tbody.innerHTML += `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="row-checkbox" value="${order.id}" onclick="handleRowCheckboxChange(this)"></td>
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

// Pivot globals for directional selection
window.phonePivotTimestamp = null;
window.phonePivotStatus = null;
window.phonePivotStatusGroup = null; // array of statuses if grouped

// Statuses treated as one "Processing" group
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

        // Fetch the latest order from this phone to detect its status
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

            // Check if status belongs to processing group
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

    // Select all orders with the same status group ABOVE (newer or equal)
    let query = supabase.from('orders').select('id')
        .in('status', statusGroup)
        .gte('created_at', window.phonePivotTimestamp);
    if (pPhone) query = query.not('phone', 'ilike', `%${pPhone}%`);

    const { data } = await query;
    if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));

    // Also include the searched phone's own orders with those statuses
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

    // Select all orders with the same status group BELOW (older or equal)
    let query = supabase.from('orders').select('id')
        .in('status', statusGroup)
        .lte('created_at', window.phonePivotTimestamp);
    if (pPhone) query = query.not('phone', 'ilike', `%${pPhone}%`);

    const { data } = await query;
    if (data) data.forEach(o => window.globalSelectedOrderIds.add(o.id));

    // Also include the searched phone's own orders with those statuses
    const { data: selfOrders } = await supabase.from('orders').select('id')
        .ilike('phone', `%${pPhone}%`)
        .in('status', statusGroup);
    if (selfOrders) selfOrders.forEach(o => window.globalSelectedOrderIds.add(o.id));

    restoreRowCheckboxStates();
}




document.addEventListener("DOMContentLoaded", () => {
   initializeMasterDashboard();
});

// Old promptAdjustWallet replaced.
window.openUserWalletModal = function(userId, currentBal) {
    document.getElementById('walletControlUserSelect').value = userId;
    populateWalletModalUser(userId, currentBal);
    openGlobalWalletModal('credit');
}

window.openRoleSelectionModal = function(userId, currentRole, email) {
    document.getElementById('roleModalUserId').value = userId;
    document.getElementById('roleModalEmail').innerText = `Updating role for ${email}`;
    document.getElementById('roleModalSelect').value = currentRole;
    document.getElementById('roleModal').style.display = 'flex';
}

window.closeRoleModal = function() {
    document.getElementById('roleModal').style.display = 'none';
}

window.confirmRoleUpdate = async function() {
    const userId = document.getElementById('roleModalUserId').value;
    const newRole = document.getElementById('roleModalSelect').value;
    const btn = document.getElementById('btnConfirmRoleUpdate');

    if (!userId || !newRole) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Updating...';
    }

    try {
        const { error } = await supabase.rpc("admin_update_role", {
            target_user_id: userId,
            new_role: newRole
        });

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Role Updated", `User role is now ${newRole.toUpperCase().replace('_', ' ')}`);
        else alert(`User role is now ${newRole}`);
        
        closeRoleModal();
        if (typeof loadUsers === 'function') loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Operation Failed", err.message);
        else alert(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Update Role';
        }
    }
}

window.toggleFreeModeAdmin = async function(userId, currentState, email) {
  const isCurrentlyFree = String(currentState) === 'true';
  const confirmation = confirm(`Are you sure you want to turn Free Mode ${isCurrentlyFree ? 'OFF' : 'ON'} for user ${email}?`);
  if (!confirmation) return;

  try {
      const { data, error } = await supabase.rpc('free_mode_account_action', {
          p_user_id: userId,
          p_action: 'toggle',
          p_order_total: null
      });

      if (error) throw error;
      if (window.showSuccessPopup) window.showSuccessPopup("Free Mode Updated", data.message || "Status changed successfully");
      else alert(data.message || "Status changed successfully");
      
      loadUsers();
  } catch (err) {
      if (window.showErrorPopup) window.showErrorPopup("Operation Failed", err.message);
      else alert("Operation Failed: " + err.message);
  }
}

// Bulk Selection Handlers
function resetBulkSelection() {
  window.globalSelectedOrderIds = new Set();
  const master = document.getElementById('masterCheckbox');
  const bar = document.getElementById('bulkActionsBar');
  if (master) master.checked = false;
  if (bar) bar.style.display = 'none';
}

// After rendering rows, re-check any previously selected IDs
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
    // Fetch ALL matching order IDs from Supabase (all pages)
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
    // Uncheck all
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

window.executeBulkUpdateStatus = async function() {
  const newStatus = document.getElementById("bulkStatusSelect").value;
  if (!newStatus) return window.showErrorPopup ? window.showErrorPopup("Error", "Please select a status first.") : alert("Please select a status first.");
  
  const ids = Array.from(window.globalSelectedOrderIds);
  if (ids.length === 0) return;
  
  if (!confirm(`Are you sure you want to mark ${ids.length} orders as ${newStatus}?`)) return;
  
  try {
    const { error } = await supabase.from('orders').update({ status: newStatus }).in('id', ids);
    if (error) throw error;
    
    document.getElementById("bulkStatusSelect").value = "";
    window.globalSelectedOrderIds = new Set();
    loadRecentOrders(currentOrdersPage);
  } catch(err) {
    alert("Bulk update failed: " + err.message);
  }
}

window.executeBulkExport = async function() {
  const ids = Array.from(window.globalSelectedOrderIds);
  if(ids.length === 0) return;
  
  // Fetch selected orders from Supabase (covers all pages)
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
    if (window.showSuccessPopup) window.showSuccessPopup("Copied", `Copied ${selectedOrders.length} numbers.`);
    else alert(`Copied ${selectedOrders.length} numbers to clipboard.`);
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
  } catch(e) {
    console.error("Failed to load order metrics", e);
  }
}

// ==========================================
// WALLET CONTROL LOGIC
// ==========================================

let walletCurrentAction = 'credit';

async function loadWalletMetrics() {
    // Total Active Wallets
    const { data: usersData } = await supabase.from('users').select('wallet_balance');
    const totalWallets = (usersData || []).reduce((acc, u) => acc + (Number(u.wallet_balance) || 0), 0);
    document.getElementById('walletMetricTotal').innerText = `₵${totalWallets.toFixed(2)}`;

    // Credits Issued Today
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const { data: creditsData } = await supabase.from('transactions')
        .select('amount')
        .gte('created_at', todayStart.toISOString())
        .ilike('type', '%Credit%');
    const totalCredits = (creditsData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricCredits').innerText = `₵${totalCredits.toFixed(2)}`;

    // Debits Issued Today
    const { data: debitsData } = await supabase.from('transactions')
        .select('amount')
        .gte('created_at', todayStart.toISOString())
        .ilike('type', '%Debit%');
    const totalDebits = (debitsData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricDebits').innerText = `₵${totalDebits.toFixed(2)}`;

    // Pending Funding
    const { data: pendingData } = await supabase.from('transactions')
        .select('amount')
        .eq('status', 'Pending')
        .ilike('type', '%Funding%');
    const totalPending = (pendingData || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    document.getElementById('walletMetricPending').innerText = `₵${totalPending.toFixed(2)}`;
    
}

async function loadWalletTransactions() {
    const tbody = document.getElementById('walletTransactionsTableBody');
    if(!tbody) return;
    
    const { data, error } = await supabase.from('transactions')
        .select('*, users!transactions_user_id_fkey(email, first_name, last_name, merchant_id)')
        .order('created_at', { ascending: false })
        .limit(50);
        
    if(error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error loading ledger.</td></tr>`;
        return;
    }
    
    if(!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No wallet transactions found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    data.forEach(tx => {
        const dateObj = new Date(tx.created_at);
        const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
        const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
        const typeColor = tx.type.toLowerCase().includes('debit') ? '#ef4444' : '#10b981';
        tbody.innerHTML += `
            <tr>
                <td data-label="Date" style="color:var(--text-muted); font-size:12px;">
                    <div style="color:white; font-weight:600;">${dateStr}</div>
                    <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                </td>
                <td data-label="User" style="white-space:nowrap;">
                    <div style="font-family:monospace; font-size:11px; color:var(--blue); font-weight:700; margin-bottom:4px;">${tx.users?.merchant_id || '—'}</div>
                    <div style="font-weight:600; color:white;">${(tx.users?.first_name || tx.users?.last_name) ? `${tx.users.first_name || ''} ${tx.users.last_name || ''}`.trim() : (tx.users?.email || 'Unknown User')}</div>
                </td>
                <td data-label="Type"><span style="color:${typeColor}; font-weight:600;">${tx.type}</span></td>
                <td data-label="Reference"><code style="color:var(--text-muted); font-size:11px;">${tx.reference || '—'}</code></td>
                <td data-label="Amount">₵${Number(tx.amount).toFixed(2)}</td>
                <td data-label="Balance After">₵${Number(tx.balance_after || 0).toFixed(2)}</td>
            </tr>
        `;
    });
}

window.filterWalletUsers = function() {
    const q = (document.getElementById('walletControlUserSearch').value || '').toLowerCase().trim();
    const resultsDiv = document.getElementById('walletControlUserResults');
    
    if (!allUsersCache || allUsersCache.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:10px 12px; color:var(--text-muted); font-size:13px;">No users loaded.</div>';
        resultsDiv.style.display = 'block';
        return;
    }
    
    let filtered = allUsersCache;
    if (q) {
        filtered = allUsersCache.filter(u => 
            (u.email || '').toLowerCase().includes(q) ||
            (u.phone || '').toLowerCase().includes(q) ||
            (u.merchant_id || '').toLowerCase().includes(q) ||
            (u.first_name || '').toLowerCase().includes(q) ||
            (u.last_name || '').toLowerCase().includes(q)
        );
    }
    
    filtered = filtered.slice(0, 20);
    
    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:10px 12px; color:var(--text-muted); font-size:13px;">No matching users.</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(u => {
            const code = u.merchant_id || 'N/A';
            const phone = u.phone || 'No Phone';
            const bal = Number(u.wallet_balance || 0).toFixed(2);
            return `<div onclick="selectWalletUser('${u.id}', ${u.wallet_balance}, '${escapeQuote(u.email)}', '${escapeQuote(phone)}')" style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; font-size:13px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <div style="font-weight:600; color:white;">${u.email}</div>
                <div style="display:flex; gap:10px; color:var(--text-muted); font-size:11px; margin-top:4px;">
                    <span>📞 ${phone}</span>
                    <span style="color:var(--blue);">${code}</span>
                    <span style="color:#10b981; font-weight:700;">₵${bal}</span>
                </div>
            </div>`;
        }).join('');
    }
    resultsDiv.style.display = 'block';
}

window.selectWalletUser = function(userId, bal, email, phone) {
    document.getElementById('walletControlUserSelect').value = userId;
    document.getElementById('walletControlUserSearch').value = `${email} (${phone})`;
    document.getElementById('walletControlCurrentBal').innerText = `₵${Number(bal).toFixed(2)}`;
    document.getElementById('walletControlUserResults').style.display = 'none';
}

document.addEventListener('click', function(e) {
    const searchInput = document.getElementById('walletControlUserSearch');
    const resultsDiv = document.getElementById('walletControlUserResults');
    if (searchInput && resultsDiv) {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    }
});

function populateWalletModalUser(userId, bal) {
    const user = allUsersCache.find(u => u.id === userId);
    document.getElementById('walletControlUserSelect').value = userId;
    if (user) {
        const phone = user.phone || 'No Phone';
        document.getElementById('walletControlUserSearch').value = `${user.email} (${phone})`;
    }
    document.getElementById('walletControlCurrentBal').innerText = `₵${Number(bal).toFixed(2)}`;
}

window.openGlobalWalletModal = function(actionType = 'credit') {
    document.getElementById('walletControlModal').style.display = 'flex';
    setWalletAction(actionType);
    if (!document.getElementById('walletControlUserSelect').value) {
         document.getElementById('walletControlCurrentBal').innerText = `₵0.00`;
         document.getElementById('walletControlUserSearch').value = '';
    }
}

window.closeWalletControlModal = function() {
    document.getElementById('walletControlModal').style.display = 'none';
    document.getElementById('walletControlAmount').value = '';
    document.getElementById('walletControlUserSelect').value = '';
    document.getElementById('walletControlUserSearch').value = '';
    document.getElementById('walletControlCurrentBal').innerText = '₵0.00';
    document.getElementById('walletControlUserResults').style.display = 'none';
}

window.setWalletAction = function(action) {
    walletCurrentAction = action;
    const btnCredit = document.getElementById('btnCreditToggle');
    const btnDebit = document.getElementById('btnDebitToggle');
    
    if (action === 'credit') {
        btnCredit.style.background = 'rgba(16,185,129,0.1)';
        btnCredit.style.borderColor = '#10b981';
        btnCredit.style.color = '#10b981';
        
        btnDebit.style.background = 'rgba(239,68,68,0.1)';
        btnDebit.style.borderColor = 'var(--glass-border)';
        btnDebit.style.color = 'var(--text-muted)';
    } else {
        btnDebit.style.background = 'rgba(239,68,68,0.1)';
        btnDebit.style.borderColor = '#ef4444';
        btnDebit.style.color = '#ef4444';
        
        btnCredit.style.background = 'rgba(16,185,129,0.1)';
        btnCredit.style.borderColor = 'var(--glass-border)';
        btnCredit.style.color = 'var(--text-muted)';
    }
}

window.executeWalletAdjustment = async function() {
    const userId = document.getElementById('walletControlUserSelect').value;
    const amountStr = document.getElementById('walletControlAmount').value;
    const amount = Number(amountStr);
    
    if (!userId) {
        return window.showErrorPopup ? window.showErrorPopup("Error", "Please select a user.") : alert("Please select a user.");
    }
    if (isNaN(amount) || amount <= 0) {
        return window.showErrorPopup ? window.showErrorPopup("Invalid Amount", "Amount must be greater than 0.") : alert("Invalid amount.");
    }
    
    const isCredit = walletCurrentAction === 'credit';
    const amountChange = isCredit ? amount : -amount;
    const trxType = isCredit ? "Admin Credit" : "Admin Debit";
    
    const btn = document.getElementById('btnExecuteWallet');
    btn.disabled = true;
    btn.innerText = 'Processing...';
    
    try {
        const { data, error } = await supabase.rpc("admin_adjust_wallet", {
          target_user_id: userId,
          amount_change: amountChange,
          trx_type: trxType
        });

        if (error) throw error;
        
        if(window.showSuccessPopup) {
            window.showSuccessPopup("Wallet Adjusted", `New balance is ₵${Number(data.new_balance).toFixed(2)}`);
        } else {
            alert(`Success! New balance is ₵${Number(data.new_balance).toFixed(2)}`);
        }
        
        closeWalletControlModal();
        loadUsers();
        loadWalletMetrics();
        loadWalletTransactions();
    } catch(err) {
        if(window.showErrorPopup) {
            window.showErrorPopup("Operation Failed", err.message);
        } else {
            alert("Error: " + err.message);
        }
    } finally {
        btn.disabled = false;
        btn.innerText = 'Confirm Adjustment';
    }
}

// ==========================================
// DATA PLANS LOGIC
// ==========================================

async function loadDataPlans() {
    const tbody = document.getElementById('dataPlansTableBody');
    if (!tbody) return;

    const { data: plans, error } = await supabase
        .from('pricing')
        .select('*')
        .order('product', { ascending: true })
        .order('gb_size', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Failed to load pricing: ${error.message}</td></tr>`;
        return;
    }

    if (!plans || plans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No data plans configured.</td></tr>`;
        return;
    }

    const baseProductKeys = [];
    const ignoredKeys = ['data_per_gb', 'afa_premium', 'afa_normal', 'data_mtn_express'];
    
    const basePlans = plans.filter(p => baseProductKeys.length > 0 && baseProductKeys.includes(p.product));
    const bundlePlans = plans.filter(p => !baseProductKeys.includes(p.product) && !ignoredKeys.includes(p.product));

    // ==========================================
    // RENDER BASE PRODUCTS GRID
    // ==========================================
    const baseMap = {};
    baseProductKeys.forEach(k => baseMap[k] = {});
    basePlans.forEach(p => {
        baseMap[p.product][p.role] = p.price;
    });
    window.currentBaseProductsMap = baseMap;

    const bpGrid = document.getElementById('baseProductsGrid');
    if (bpGrid) {
        if (baseProductKeys.length === 0) {
            if (bpGrid.parentElement) bpGrid.parentElement.style.display = 'none';
        } else {
            if (bpGrid.parentElement) bpGrid.parentElement.style.display = 'block';
            bpGrid.innerHTML = '';
            const bpLabels = {};

            Object.keys(baseMap).forEach((prod, index, arr) => {
                const roles = baseMap[prod];
                const clientPx = roles['client'] || 0;
                const adminPx  = roles['admin'] || 0;
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
                            <button class="btn-action" onclick="openBaseProductModal('${prod}')" style="background:transparent; border:1px solid var(--blue); color:var(--blue); padding:6px 16px; border-radius:6px; font-size:12px; margin:0; cursor:pointer;">Edit Pricing</button>
                        </div>
                    </div>
                `;
            });
        }
    }

    // ==========================================
    // RENDER DATA BUNDLES TABLE
    // ==========================================
    const grouped = {};
    bundlePlans.forEach(p => {
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
        if (p.is_in_stock === false) grouped[key].is_in_stock = false;
    });

    const netMap = {
        'data_mtn': 'MTN',
        'data_telecel': 'Telecel',
        'data_tigo': 'AT/Ishare',
        'data_bigtime': 'AT Bigtime'
    };

    const sortWeight = {
        'data_mtn': 1,
        'data_tigo': 2,
        'data_telecel': 3,
        'data_bigtime': 4
    };

    window.currentDataPlansMap = grouped;

    const sortedGroups = Object.keys(grouped).map(k => grouped[k]).sort((a, b) => {
        const wA = sortWeight[a.product] || 99;
        const wB = sortWeight[b.product] || 99;
        if (wA !== wB) return wA - wB;
        return a.gb_size - b.gb_size;
    });

    tbody.innerHTML = '';
    sortedGroups.forEach(g => {
        const clientPx = g.prices['client'] || 0;
        const adminPx = g.prices['admin'] || 0;
        const netName = netMap[g.product] || g.product.replace('data_','').toUpperCase();

        const key = `${g.product}_${g.gb_size}`;
        const stockBadge = g.is_in_stock ? '' : '<span style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid #ef4444; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:700;">OUT OF STOCK</span>';
        const stockBtnText = g.is_in_stock ? 'Mark Out of Stock' : 'Mark In Stock';
        const stockBtnColor = g.is_in_stock ? '#f59e0b' : '#10b981';

        tbody.innerHTML += `
            <tr style="${g.is_in_stock ? '' : 'opacity:0.6;'}">
                <td data-label="Network" style="font-weight:600; white-space:nowrap; color:white;">${netName}</td>
                <td data-label="Bundle" style="white-space:nowrap; color:var(--text-muted);">${g.plan_name} ${stockBadge}</td>
                <td data-label="Size" style="white-space:nowrap;"><span style="color:var(--blue); font-weight:700;">${g.gb_size > 0 ? g.gb_size : ''} GB</span></td>
                <td data-label="Validity" style="white-space:nowrap; color:var(--text-muted);">${g.validity}</td>
                <td data-label="Price" style="white-space:nowrap;">
                    <div style="font-size:13px;"><span style="color:#10b981; font-weight:600;">₵${Number(clientPx).toFixed(2)}</span> Client</div>
                    <div style="font-size:11px; color:var(--text-muted);">₵${Number(adminPx).toFixed(2)} Admin</div>
                </td>
                <td data-label="Actions" style="white-space:nowrap; text-align:right;">
                    <button class="btn-action" onclick="toggleDataPlanStock('${escapeQuote(g.product)}', ${g.gb_size}, ${g.is_in_stock})" style="background:transparent; border:1px solid ${stockBtnColor}; color:${stockBtnColor}; padding:6px 12px; font-size:12px; margin:0 4px;">${stockBtnText}</button>
                    <button class="btn-action" onclick="openDataPlanModal('${key}')" style="background:transparent; border:1px solid var(--blue); color:var(--blue); padding:6px 12px; font-size:12px; margin:0 4px;">Edit</button>
                    <button class="btn-action" onclick="deleteAdvancedDataPlan('${escapeQuote(g.product)}', ${g.gb_size})" style="background:transparent; border:1px solid #ef4444; color:#ef4444; padding:6px 12px; font-size:12px; margin:0;">Delete</button>
                </td>
            </tr>
        `;
    });
}

window.openDataPlanModal = function(mapKey = null) {
    const title = document.getElementById('dataPlanModalTitle');
    const prodInput = document.getElementById('dpNetwork');
    const gbInput = document.getElementById('dpGbSize');
    
    if (mapKey && window.currentDataPlansMap && window.currentDataPlansMap[mapKey]) {
        title.innerText = "Edit Bundle Pricing";
        const g = window.currentDataPlansMap[mapKey];

        prodInput.value = g.product;
        document.getElementById('dpPlanName').value = g.plan_name !== 'N/A' ? (g.plan_name || '') : '';
        gbInput.value = g.gb_size > 0 ? g.gb_size : '';
        document.getElementById('dpValidity').value = g.validity !== 'N/A' ? (g.validity || '') : '';

        document.getElementById('dpPriceClient').value = g.prices['client'] || '';
        document.getElementById('dpPriceVip').value    = g.prices['vip_customer'] || '';
        document.getElementById('dpPriceElite').value  = g.prices['elite_agent'] || '';
        document.getElementById('dpPriceSuper').value  = g.prices['super_agent'] || '';
        document.getElementById('dpPriceAdmin').value  = g.prices['admin'] || '';

        document.getElementById('dpIsInStock').value = g.is_in_stock !== false ? 'true' : 'false';

        prodInput.disabled = true;
        gbInput.disabled = true;
    } else {
        title.innerText = "Add New Bundle";
        prodInput.value = 'data_mtn';
        document.getElementById('dpPlanName').value = '';
        gbInput.value = '';
        document.getElementById('dpValidity').value = '';

        document.getElementById('dpPriceClient').value = '';
        document.getElementById('dpPriceVip').value = '';
        document.getElementById('dpPriceElite').value = '';
        document.getElementById('dpPriceSuper').value = '';
        document.getElementById('dpPriceAdmin').value = '';

        document.getElementById('dpIsInStock').value = 'true';

        prodInput.disabled = false;
        gbInput.disabled = false;
    }
    
    document.getElementById('dataPlanModal').style.display = 'flex';
}

window.closeDataPlanModal = function() {
    document.getElementById('dataPlanModal').style.display = 'none';
}

window.saveAdvancedDataPlan = async function() {
    const product = document.getElementById('dpNetwork').value;
    const planName = document.getElementById('dpPlanName').value.trim();
    const gbStr = document.getElementById('dpGbSize').value;
    const gbSize = gbStr ? parseFloat(gbStr) : null;
    const validity = document.getElementById('dpValidity').value.trim();
    
    const isInStockStr = document.getElementById('dpIsInStock').value;
    const isInStock = isInStockStr !== 'false';

    if (gbSize === null || isNaN(gbSize) || gbSize <= 0) {
        return alert("Please enter a valid Data Size (GB).");
    }

    const roles = {
        'client':       document.getElementById('dpPriceClient').value,
        'vip_customer': document.getElementById('dpPriceVip').value,
        'elite_agent':  document.getElementById('dpPriceElite').value,
        'super_agent':  document.getElementById('dpPriceSuper').value,
        'admin':        document.getElementById('dpPriceAdmin').value
    };

    const upsertPayload = [];
    for (const [role, rawPrice] of Object.entries(roles)) {
        if (!rawPrice) continue;
        const p = parseFloat(rawPrice);
        if (isNaN(p) || p < 0) return alert(`Invalid price entered for ${role}.`);
        
        upsertPayload.push({
            role: role,
            product: product,
            gb_size: gbSize,
            price: p,
            plan_name: planName || null,
            validity: validity || null,
            is_in_stock: isInStock
        });
    }

    if (upsertPayload.length === 0) {
        return alert("You must enter a price for at least one role.");
    }

    const btn = document.getElementById('btnSaveDataPlan');
    btn.disabled = true;
    btn.innerText = 'Saving Bundle...';

    try {
        const { error } = await supabase
            .from('pricing')
            .upsert(upsertPayload, { onConflict: 'role,product,gb_size' });

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Saved", "Bundle pricing updated safely.");
        closeDataPlanModal();
        loadDataPlans();
    } catch(err) {
        if (window.showErrorPopup) window.showErrorPopup("Save Failed", err.message);
        else alert("Save failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save Bundle Pricing';
    }
}

window.deleteAdvancedDataPlan = async function(product, gbSize) {
    if (!confirm(`Are you sure you want to permanently delete ALL role prices for this ${gbSize}GB bundle?`)) return;

    try {
        const { error } = await supabase
            .from('pricing')
            .delete()
            .match({ product: product, gb_size: gbSize });

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Deleted", "Bundle removed successfully.");
        loadDataPlans();
    } catch(err) {
        if (window.showErrorPopup) window.showErrorPopup("Delete Failed", err.message);
        else alert("Delete failed: " + err.message);
    }
}

window.toggleDataPlanStock = async function(product, gbSize, currentStatus) {
    const newStatus = !currentStatus;
    const actionText = newStatus ? "mark IN STOCK" : "mark OUT OF STOCK";
    if (!confirm(`Are you sure you want to ${actionText} this ${gbSize}GB bundle?`)) return;

    try {
        const { error } = await supabase
            .from('pricing')
            .update({ is_in_stock: newStatus })
            .match({ product: product, gb_size: gbSize });

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Updated", `Bundle has been marked ${newStatus ? 'In Stock' : 'Out of Stock'}.`);
        loadDataPlans();
    } catch(err) {
        if (window.showErrorPopup) window.showErrorPopup("Update Failed", err.message);
        else alert("Update failed: " + err.message);
    }
}

// ==========================================
// BASE PRODUCT PRICING LOGIC
// ==========================================

window.openBaseProductModal = function(productKey) {
    if (!window.currentBaseProductsMap) return;
    const roles = window.currentBaseProductsMap[productKey] || {};
    const bpLabels = { 'data_per_gb': 'Fallback Data (Per GB)', 'afa_premium': 'AFA Premium', 'afa_normal': 'AFA Normal' };

    document.getElementById('bpModalTitle').innerText = `Edit Pricing: ${bpLabels[productKey]}`;
    document.getElementById('bpProductKey').value = productKey;

    document.getElementById('bpPriceClient').value = roles['client'] || '';
    document.getElementById('bpPriceVip').value    = roles['vip_customer'] || '';
    document.getElementById('bpPriceElite').value  = roles['elite_agent'] || '';
    document.getElementById('bpPriceSuper').value  = roles['super_agent'] || '';
    document.getElementById('bpPriceAdmin').value  = roles['admin'] || '';

    document.getElementById('baseProductModal').style.display = 'flex';
}

window.closeBaseProductModal = function() {
    document.getElementById('baseProductModal').style.display = 'none';
}

window.saveBaseProductPricing = async function() {
    const productKey = document.getElementById('bpProductKey').value;
    if (!productKey) return;

    const roles = {
        'client':       document.getElementById('bpPriceClient').value,
        'vip_customer': document.getElementById('bpPriceVip').value,
        'elite_agent':  document.getElementById('bpPriceElite').value,
        'super_agent':  document.getElementById('bpPriceSuper').value,
        'admin':        document.getElementById('bpPriceAdmin').value
    };

    const fetchRes = await supabase.from('pricing').select('gb_size').eq('product', productKey).limit(1);
    const existingGbSize = fetchRes.data && fetchRes.data.length > 0 ? fetchRes.data[0].gb_size : null;

    const upsertPayload = [];
    for (const [role, rawPrice] of Object.entries(roles)) {
        if (!rawPrice) continue;
        const p = parseFloat(rawPrice);
        if (isNaN(p) || p < 0) return alert(`Invalid price entered for ${role}.`);
        
        const row = {
            role: role,
            product: productKey,
            price: p,
            is_in_stock: true
        };
        // To safely handle existing null vs 0 vs 1 gb_size on base products, we match the existing if any
        if (existingGbSize !== undefined) {
             row.gb_size = existingGbSize;
        }

        upsertPayload.push(row);
    }

    if (upsertPayload.length === 0) return alert("You must enter a price for at least one role.");

    const btn = document.getElementById('btnSaveBaseProduct');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        // Because of Supabase constraint matching on upsert, it's safer to delete then insert for these legacy rows
        // to avoid duplicate composite key issues with NULL gb_size.
        await supabase.from('pricing').delete().eq('product', productKey);
        
        const { error } = await supabase.from('pricing').insert(upsertPayload);
        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Saved", "Base service pricing updated safely.");
        closeBaseProductModal();
        loadDataPlans();
    } catch(err) {
        if (window.showErrorPopup) window.showErrorPopup("Save Failed", err.message);
        else alert("Save failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save Prices';
    }
}

// ==========================================
// AFA REGISTRATIONS LOGIC
// ==========================================

async function loadAfaRegistrations() {
    const tbody = document.getElementById('afaTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">Loading AFA registrations...</td></tr>`;

    try {
        const { data: afaData, error } = await supabase
            .from('afa_registrations')
            .select(`*, users!afa_registrations_user_id_fkey(first_name, last_name, email, merchant_id)`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!afaData || afaData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No AFA registrations found.</td></tr>`;
            return;
        }

        window.currentAfaData = afaData;
        tbody.innerHTML = '';

        afaData.forEach(r => {
            const dateObj = new Date(r.created_at);
            const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
            const timeStr = dateObj.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
            
            const fn = r.users?.first_name || '';
            const ln = r.users?.last_name || '';
            const fullName = `${fn} ${ln}`.trim() || r.users?.email || 'Unknown';
            const cid = r.users?.merchant_id || '—';

            // Status styling
            let statusBadge = '';
            if (r.status === 'approved') {
                statusBadge = '<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase;">Approved</span>';
            } else if (r.status === 'rejected') {
                statusBadge = '<span style="background:rgba(239,68,68,0.1); color:#ef4444; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase;">Rejected</span>';
            } else {
                statusBadge = '<span style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase;">Pending</span>';
            }

            const tierBadge = r.tier === 'premium' ? 
                '<span style="color:#f59e0b; font-weight:700;">Premium</span>' : 
                '<span style="color:var(--text-muted); font-weight:600;">Normal</span>';

            tbody.innerHTML += `
                <tr>
                    <td data-label="Date" style="white-space:nowrap; color:var(--text-muted); font-size:12px;">
                        <div style="color:white; font-weight:600;">${dateStr}</div>
                        <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                    </td>
                    <td data-label="Applicant" style="white-space:nowrap;">
                        <div style="font-family:monospace; font-size:11px; color:var(--blue); font-weight:700; margin-bottom:4px;">${cid}</div>
                        <div style="font-weight:600; color:white;">${fullName}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${escapeQuote(r.phone)}</div>
                    </td>
                    <td data-label="ID Details" style="white-space:nowrap;">
                        <div style="color:#3b82f6; font-size:12px; font-weight:600; text-transform:uppercase;">${r.id_type}</div>
                        <div style="font-size:13px; color:white;">${r.id_number}</div>
                    </td>
                    <td data-label="Tier" style="white-space:nowrap;">${tierBadge}</td>
                    <td data-label="Status" style="white-space:nowrap;">${statusBadge}</td>
                    <td data-label="Actions" style="white-space:nowrap; text-align:right;">
                        <button class="btn-action" onclick="openAfaReviewModal('${r.id}')" style="background:var(--blue); border:none; color:white; padding:6px 16px; font-size:12px; border-radius:4px; font-weight:600;">Review</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Error loading AFA:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#ef4444;">Failed to load.</td></tr>`;
    }
}

window.openAfaReviewModal = function(id) {
    if (!window.currentAfaData) return;
    const r = window.currentAfaData.find(x => String(x.id) === String(id));
    if (!r) return;

    document.getElementById('afmId').value = r.id;
    document.getElementById('afmName').innerText = r.full_name;
    document.getElementById('afmPhone').innerText = r.phone;
    document.getElementById('afmDob').innerText = r.dob || 'Not provided';
    document.getElementById('afmIdType').innerText = r.id_type;
    document.getElementById('afmIdNumber').innerText = r.id_number;

    const mkImg = (url) => {
        if (!url) return '<span style="color:var(--text-muted); font-size:12px;">No Image</span>';
        const fullUrl = url.startsWith('http') ? url : supabase.storage.from('tickets').getPublicUrl(url).data.publicUrl;
        return `<a href="${fullUrl}" target="_blank" download><img src="${fullUrl}" style="max-width:100%; max-height:100%; object-fit:contain;"></a>`;
    };
    
    document.getElementById('afmFrontContainer').innerHTML = mkImg(r.id_front_url);
    document.getElementById('afmBackContainer').innerHTML  = mkImg(r.id_back_url);

    document.getElementById('afaReviewModal').style.display = 'flex';
}

window.closeAfaReviewModal = function() {
    document.getElementById('afaReviewModal').style.display = 'none';
}

window.updateAfaStatus = async function(id, status) {
    if (!confirm(`Are you sure you want to mark this application as ${status.toUpperCase()}?`)) return;
    
    try {
        const { error } = await supabase
            .from('afa_registrations')
            .update({ status: status })
            .eq('id', id);

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Updated", `Application has been ${status}.`);
        closeAfaReviewModal();
        loadAfaRegistrations();
    } catch(err) {
        if (window.showErrorPopup) window.showErrorPopup("Update Failed", err.message);
        else alert("Update failed: " + err.message);
    }
}

// ==========================================
// PAYMENT GATEWAYS LOGIC
// ==========================================

window.loadGateways = async function() {
    try {
        console.log('Loading gateway settings...');
        const { data: settings, error } = await supabase
            .from('app_settings')
            .select('key, value')
            .in('key', ['paystack_enabled', 'paystack_public_key', 'manual_transfer_enabled', 'manual_momo_number', 'manual_momo_name', 'manual_momo_bank']);

        if (error) throw error;
        console.log('Fetched settings:', settings);

        // Default to false/empty if not found
        let conf = {
            paystack_enabled: 'false',
            paystack_public_key: '',
            manual_transfer_enabled: 'false',
            manual_momo_number: '',
            manual_momo_name: '',
            manual_momo_bank: 'MTN MOMO PAY'
        };

        if (settings) {
            settings.forEach(s => {
                conf[s.key] = s.value;
            });
        }

        // Hydrate UI
        document.getElementById('gatePaystackEnabled').value = conf.paystack_enabled === 'true' ? 'true' : 'false';
        document.getElementById('gatePaystackPublic').value  = conf.paystack_public_key;

        document.getElementById('gateMomoEnabled').value   = conf.manual_transfer_enabled === 'true' ? 'true' : 'false';
        document.getElementById('gateMomoNumber').value    = conf.manual_momo_number;
        document.getElementById('gateMomoName').value      = conf.manual_momo_name;
        document.getElementById('gateMomoBank').value      = conf.manual_momo_bank;

    } catch (err) {
        console.error('Failed to load gateway settings:', err);
        if (window.showErrorPopup) window.showErrorPopup("Load Failed", "Could not load gateway settings: " + err.message);
    }
}

window.saveGateways = async function() {
    const btn = document.getElementById('btnSaveGateways');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const payload = [
        { key: 'paystack_enabled',        value: document.getElementById('gatePaystackEnabled').value },
        { key: 'paystack_public_key',     value: document.getElementById('gatePaystackPublic').value.trim() },
        { key: 'manual_transfer_enabled', value: document.getElementById('gateMomoEnabled').value },
        { key: 'manual_momo_number',      value: document.getElementById('gateMomoNumber').value.trim() },
        { key: 'manual_momo_name',        value: document.getElementById('gateMomoName').value.trim() },
        { key: 'manual_momo_bank',        value: document.getElementById('gateMomoBank').value.trim() }
    ];
    console.log('Saving gateway payload:', payload);

    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert(payload, { onConflict: 'key' });

        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Saved", "Global Payment Settings Updated.");
        else alert("Payment Gateways updated successfully!");

        loadGateways(); // Reload to confirm
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Save Failed", err.message);
        else alert("Failed to save gateways: " + err.message);
    } finally {
        btn.innerText = 'Save Global Payment Configuration';
        btn.disabled = false;
    }
}

// ==========================================
// WALLET TOP-UP MANAGEMENT
// ==========================================

let currentTopupPage = 1;
const TOPUP_PER_PAGE = 10;

async function loadTopupRequests() {
    const tbody = document.getElementById('topupTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">Loading requests...</td></tr>`;

    try {
        const { data: txs, error } = await supabase
            .from('transactions')
            .select('id, user_id, amount, status, reference, created_at, users(first_name, last_name, email, phone, merchant_id)')
            .ilike('type', '%Deposit%')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        // Summary stats
        const pending = (txs || []).filter(t => t.status === 'pending');
        const pendingTotal = pending.reduce((s, t) => s + Number(t.amount || 0), 0);
        document.getElementById('topupCountPending').innerText = pending.length;
        document.getElementById('topupAmountPending').innerText = `₵${pendingTotal.toFixed(2)}`;

        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const approvedToday = (txs || []).filter(t =>
            (t.status === 'approved' || t.status === 'Approved') &&
            new Date(t.created_at) >= todayStart
        );
        const approvedTodayTotal = approvedToday.reduce((s, t) => s + Number(t.amount || 0), 0);
        document.getElementById('topupApprovedToday').innerText = `₵${approvedTodayTotal.toFixed(2)}`;

        window.allTopupData = txs || [];
        window.allTopupDataFull = txs || []; // reset search base on fresh load
        currentTopupPage = 1;
        renderTopupPage();

    } catch (err) {
        console.error('Error loading top-ups:', err);
        document.getElementById('topupTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#ef4444;">Failed to load: ${err.message}</td></tr>`;
    }
}

function renderTopupPage() {
    const tbody = document.getElementById('topupTableBody');
    if (!tbody) return;

    const all = window.allTopupData || [];
    const totalPages = Math.ceil(all.length / TOPUP_PER_PAGE) || 1;
    const from = (currentTopupPage - 1) * TOPUP_PER_PAGE;
    const pageTxs = all.slice(from, from + TOPUP_PER_PAGE);

    // Update pagination UI
    const pageInfo = document.getElementById('topupPageInfo');
    const prevBtn  = document.getElementById('topupPrevBtn');
    const nextBtn  = document.getElementById('topupNextBtn');
    if (pageInfo) pageInfo.innerText = `Page ${currentTopupPage} of ${totalPages}  (${all.length} total)`;
    if (prevBtn)  prevBtn.disabled = currentTopupPage <= 1;
    if (nextBtn)  nextBtn.disabled = currentTopupPage >= totalPages;

    if (pageTxs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No manual top-up requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pageTxs.forEach(tx => {
        const dateObj = new Date(tx.created_at);
        const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
        const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
        const name = `${tx.users?.first_name || ''} ${tx.users?.last_name || ''}`.trim() || tx.users?.email || 'Unknown';
        const phone = tx.users?.phone || '';
        const cid = tx.users?.merchant_id || '—';
        // Use the reference exactly as the user submitted it (e.g. D4G-XXXX)
        const ref = tx.reference || '—';

        let statusBadge;
        if (tx.status === 'pending') {
            statusBadge = `<span style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600;">Pending</span>`;
        } else if (tx.status === 'approved' || tx.status === 'Approved') {
            statusBadge = `<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600;">Approved</span>`;
        } else if (tx.status === 'rejected' || tx.status === 'Rejected') {
            statusBadge = `<span style="background:rgba(239,68,68,0.1); color:#ef4444; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600;">Rejected</span>`;
        } else {
            statusBadge = `<span style="color:var(--text-muted); font-size:12px;">${tx.status}</span>`;
        }

        const isPending = tx.status === 'pending';

        tbody.innerHTML += `
            <tr>
                <td data-label="Date" style="white-space:nowrap; color:var(--text-muted); font-size:12px;">
                    <div style="color:white; font-weight:600;">${dateStr}</div>
                    <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                </td>
                <td data-label="User" style="white-space:nowrap;">
                    <div style="font-family:monospace; font-size:11px; color:var(--blue); font-weight:700; margin-bottom:4px;">${cid}</div>
                    <div style="font-weight:600;">${name}</div>
                    ${phone ? `<div style="font-size:12px; color:var(--text-muted);">${phone}</div>` : ''}
                </td>
                <td data-label="Ref" style="white-space:nowrap; font-family:monospace; color:#3b82f6; font-weight:700; font-size:13px; letter-spacing:0.5px;">${ref}</td>
                <td data-label="Amount" style="white-space:nowrap;"><strong style="font-size:15px;">₵${Number(tx.amount).toFixed(2)}</strong></td>
                <td data-label="Status" style="white-space:nowrap;">${statusBadge}</td>
                <td data-label="Actions" style="white-space:nowrap; text-align:right;">
                    ${isPending ? `
                        <button onclick="approveTopup('${tx.id}', '${tx.user_id}', ${tx.amount})" style="background:#10b981; border:none; color:white; padding:6px 14px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer; margin-right:6px;">✓ Approve</button>
                        <button onclick="rejectTopup('${tx.id}')" style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#ef4444; padding:6px 14px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">✕ Reject</button>
                    ` : '<span style="color:var(--text-muted); font-size:12px;">—</span>'}
                </td>
            </tr>
        `;
    });
}

window.changeTopupPage = function(dir) {
    const totalPages = Math.ceil((window.allTopupData || []).length / TOPUP_PER_PAGE) || 1;
    currentTopupPage = Math.max(1, Math.min(totalPages, currentTopupPage + dir));
    renderTopupPage();
}

window.filterTopupSearch = function() {
    const q = (document.getElementById('topupSearchInput')?.value || '').toLowerCase().trim();
    const full = window.allTopupDataFull || window.allTopupData || [];

    // Store the unfiltered full set if not already saved
    if (!window.allTopupDataFull) window.allTopupDataFull = [...(window.allTopupData || [])];

    if (!q) {
        window.allTopupData = [...window.allTopupDataFull];
    } else {
        window.allTopupData = window.allTopupDataFull.filter(tx => {
            const phone  = (tx.users?.phone || '').toLowerCase();
            const ref    = (tx.reference || '').toLowerCase();
            // merchant_id is now fetched, use it for search
            const fn = tx.users?.first_name || '';
            const ln = tx.users?.last_name || '';
            const fullName = `${fn} ${ln}`.trim();
            const cid = (tx.users?.merchant_id || '').toLowerCase();
            const email = (tx.users?.email || '').toLowerCase();
            return phone.includes(q) || ref.includes(q) || email.includes(q) || fullName.toLowerCase().includes(q) || cid.includes(q);
        });
    }
    currentTopupPage = 1;
    renderTopupPage();
}

window.clearTopupSearch = function() {
    const input = document.getElementById('topupSearchInput');
    if (input) input.value = '';
    if (window.allTopupDataFull) window.allTopupData = [...window.allTopupDataFull];
    currentTopupPage = 1;
    renderTopupPage();
}

window.approveTopup = async function(txId, userId, amount) {
    if (!confirm(`Approve this ₵${Number(amount).toFixed(2)} top-up and credit the user's wallet?`)) return;

    try {
        // 1. Get current wallet balance
        const { data: userData, error: fetchErr } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', userId)
            .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!userData) throw new Error('User not found. Cannot credit wallet.');

        const currentBalance = Number(userData.wallet_balance || 0);
        const newBalance = currentBalance + Number(amount);

        // 2. Credit the user's wallet
        const { error: walletErr } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', userId);
        if (walletErr) throw walletErr;

        // 3. Mark the transaction as approved
        const { error: txErr } = await supabase
            .from('transactions')
            .update({ status: 'approved', balance_after: newBalance })
            .eq('id', txId);
        if (txErr) throw txErr;

        if (window.showSuccessPopup) window.showSuccessPopup('Approved!', `₵${Number(amount).toFixed(2)} has been credited to the user's wallet.`);
        loadTopupRequests();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup('Failed', err.message);
        else alert('Approval failed: ' + err.message);
    }
}

window.rejectTopup = async function(txId) {
    if (!confirm('Reject this top-up request? The user will NOT receive any funds.')) return;

    try {
        const { error } = await supabase
            .from('transactions')
            .update({ status: 'rejected' })
            .eq('id', txId);
        if (error) throw error;

        if (window.showSuccessPopup) window.showSuccessPopup('Rejected', 'The top-up request has been rejected.');
        loadTopupRequests();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup('Failed', err.message);
        else alert('Rejection failed: ' + err.message);
    }
}

// ==========================================
// SUPPORT TICKETS LOGIC
// ==========================================

let currentTicketsPage = 1;
const TICKETS_PER_PAGE = 10;
let allTicketsCache = [];

window.loadTickets = async function(page = 1) {
    currentTicketsPage = page;
    const from = (page - 1) * TICKETS_PER_PAGE;
    const to = from + TICKETS_PER_PAGE - 1;

    // Build query
    let query = supabase
        .from('support_tickets')
        .select(`
            id, created_at, phone, issue, screenshot_url, status, admin_reply, order_id,
            orders ( network, order_number ),
            users ( id, first_name, last_name, email, merchant_id )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

    // Apply Filters
    const searchVal = document.getElementById("ticketSearch")?.value?.trim().toLowerCase();
    const statusVal = document.getElementById("ticketStatusFilter")?.value;

    if (searchVal) {
        query = query.or(`phone.ilike.%${searchVal}%,issue.ilike.%${searchVal}%`);
    }
    if (statusVal) {
        query = query.eq('status', statusVal);
    }

    query = query.range(from, to);

    const { data: tickets, error, count } = await query;

    const tbody = document.getElementById("ticketsTableBody");
    if (!tbody) return;

    if (error) {
        console.error("Failed to load tickets:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Failed to load tickets: ${error.message}</td></tr>`;
        return;
    }

    allTicketsCache = tickets || [];
    renderTicketsTable(allTicketsCache);

    // Pagination
    const prevBtn = document.getElementById("ticketsPrevBtn");
    const nextBtn = document.getElementById("ticketsNextBtn");
    const pageInfo = document.getElementById("ticketsPageInfo");

    if (prevBtn) prevBtn.disabled = page === 1;
    if (nextBtn) nextBtn.disabled = to >= (count - 1) || count === 0;
    const totalPages = Math.max(1, Math.ceil((count || 0) / TICKETS_PER_PAGE));
    if (pageInfo) pageInfo.innerText = `Page ${page} of ${totalPages}`;
    
    // Update Metrics
    loadTicketMetrics();
}

function renderTicketsTable(tickets) {
    const tbody = document.getElementById("ticketsTableBody");
    tbody.innerHTML = "";

    if (tickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No support tickets found.</td></tr>`;
        return;
    }

    tickets.forEach(t => {
        const dateObj = new Date(t.created_at);
        const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const timeStr = dateObj.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        
        const fn = t.users?.first_name || '';
        const ln = t.users?.last_name || '';
        const fullName = `${fn} ${ln}`.trim() || t.users?.email || 'Unknown User';
        
        const shortIssue = (t.issue || '').substring(0, 40) + ((t.issue && t.issue.length > 40) ? '...' : '');
        
        const hasImage = !!t.screenshot_url;
        const imgBadge = hasImage ? `<span style="font-size:11px; background:rgba(59,130,246,0.1); color:#3b82f6; padding:2px 6px; border-radius:4px; border:1px solid rgba(59,130,246,0.2);">🖼️ Attached</span>` : `<span style="font-size:11px; color:#64748b;">None</span>`;

        let statusColor = '#64748b'; // default
        let statusBg = 'rgba(255,255,255,0.05)';
        if (t.status === 'checking') { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,0.1)'; }
        if (t.status === 'in_progress') { statusColor = '#3b82f6'; statusBg = 'rgba(59,130,246,0.1)'; }
        if (t.status === 'resolved') { statusColor = '#10b981'; statusBg = 'rgba(16,185,129,0.1)'; }
        if (t.status === 'closed') { statusColor = '#64748b'; statusBg = 'rgba(255,255,255,0.05)'; }
        
        const statusLabel = String(t.status || 'checking').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

        tbody.innerHTML += `
            <tr>
                <td data-label="Date" style="color:var(--text-muted); font-size:12px; white-space:nowrap;">
                    <div style="color:white; font-weight:600;">${dateStr}</div>
                    <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                </td>
                <td data-label="User" style="white-space:nowrap;">
                    <div style="font-family:monospace; font-size:11px; color:var(--blue); font-weight:700; margin-bottom:4px;">${t.users?.merchant_id || '—'}</div>
                    <div style="font-weight:600; text-transform:capitalize;">${fullName}</div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">📞 ${t.phone || 'N/A'}</div>
                </td>
                <td data-label="Issue">
                    <div style="font-size:13px; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${(t.issue || '').replace(/"/g, '&quot;')}">${shortIssue}</div>
                </td>
                <td data-label="Image">${imgBadge}</td>
                <td data-label="Status"><span style="background:${statusBg}; color:${statusColor}; font-weight:600; font-size:11px; padding:4px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; border:1px solid ${statusBg}; white-space:nowrap;">${statusLabel}</span></td>
                <td data-label="Actions" style="text-align:right;">
                    <button class="btn-action" onclick="openTicketReviewModal('${t.id}')" style="background:var(--bg-dark); border:1px solid var(--glass-border); color:white; font-size:12px; padding:6px 12px; margin:0;">Review</button>
                </td>
            </tr>
        `;
    });
}

window.filterTickets = function() {
    loadTickets(1);
}

window.changeTicketsPage = function(dir) {
    loadTickets(currentTicketsPage + dir);
}

window.loadTicketMetrics = async function() {
    try {
        const [{ count: open }, { count: progress }, { count: resolved }] = await Promise.all([
            supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'checking'),
            supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
            supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved')
        ]);
        
        document.getElementById('ticketCountOpen').innerText = open || 0;
        document.getElementById('ticketCountProgress').innerText = progress || 0;
        document.getElementById('ticketCountResolved').innerText = resolved || 0;
    } catch(err) {}
}

// Modal Logic
window.openTicketReviewModal = function(ticketId) {
    const ticket = allTicketsCache.find(t => String(t.id) === String(ticketId));
    if (!ticket) return;

    document.getElementById('trmId').value = ticket.id;
    document.getElementById('trmTicketId').innerText = `#TKT-${String(ticket.id).split('-')[0].toUpperCase()}`;
    
    // User details
    const fn = ticket.users?.first_name || '';
    const ln = ticket.users?.last_name || '';
    document.getElementById('trmUser').innerText = `${fn} ${ln}`.trim() || ticket.users?.email || 'Unknown';
    document.getElementById('trmPhone').innerText = ticket.phone || 'N/A';
    
    // Order Link
    const orderLink = document.getElementById('trmOrderLink');
    if (ticket.order_id && ticket.orders) {
        const network = (ticket.orders.network || 'ORD').split('-')[0].split(' ')[0].toUpperCase();
        const num = String(ticket.orders.order_number || 0).padStart(2, '0');
        const friendlyId = `${network}-${num}`;
        
        orderLink.innerText = `#${friendlyId}`;
        orderLink.style.display = 'inline';
        orderLink.onclick = () => { 
            // Set search input to the friendly ID for easy finding
            const searchInput = document.getElementById('ticketSearch') || document.getElementById('orderSearchInput'); 
            if (searchInput) searchInput.value = friendlyId;
            closeTicketReviewModal();
            // If in tickets tab, maybe trigger filter
            if (window.filterTickets) window.filterTickets();
            return false; 
        };
    } else {
        orderLink.innerText = 'No Order Linked';
        orderLink.style.display = 'none';
        orderLink.onclick = null;
    }

    document.getElementById('trmIssueText').innerText = ticket.issue || 'No description provided.';
    document.getElementById('trmAdminReply').value = ticket.admin_reply || '';
    document.getElementById('trmStatus').value = ticket.status || 'checking';

    const trmNoImage = document.getElementById('trmNoImage');
    const trmImageLink = document.getElementById('trmImageLink');
    const trmImage = document.getElementById('trmImage');

    if (ticket.screenshot_url) {
        trmNoImage.style.display = 'none';
        trmImageLink.style.display = 'block';
        trmImageLink.href = ticket.screenshot_url;
        trmImage.src = ticket.screenshot_url;
    } else {
        trmNoImage.style.display = 'block';
        trmImageLink.style.display = 'none';
        trmImageLink.href = '#';
        trmImage.src = '';
    }

    document.getElementById('ticketReviewModal').style.display = 'flex';
}

window.closeTicketReviewModal = function() {
    document.getElementById('ticketReviewModal').style.display = 'none';
    document.getElementById('trmId').value = '';
}

window.saveTicketReview = async function() {
    const ticketId = document.getElementById('trmId').value;
    const adminReply = document.getElementById('trmAdminReply').value.trim();
    const newStatus = document.getElementById('trmStatus').value;
    const btn = document.getElementById('btnSaveTicket');

    if (!ticketId) return;

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const { error } = await supabase
            .from('support_tickets')
            .update({
                status: newStatus,
                admin_reply: adminReply || null
            })
            .eq('id', ticketId);

        if (error) throw error;

        // Auto-refresh the current page of tickets
        loadTickets(currentTicketsPage);
        closeTicketReviewModal();

        if (window.showSuccessPopup) {
            window.showSuccessPopup("Ticket Updated", "The ticket status and reply have been saved successfully.");
        } else {
            alert("Ticket updated successfully.");
        }
    } catch (err) {
        if (window.showErrorPopup) {
            window.showErrorPopup("Update Failed", err.message);
        } else {
            alert("Failed to update ticket: " + err.message);
        }
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Changes & Send Reply";
    }
}

// ═════════════════════════════════════════════════════
//  E-CARDS ADMIN FUNCTIONS
// ═════════════════════════════════════════════════════

// Load inventory stats (counts)
async function loadEcardStats() {
    try {
        const { data, error } = await supabase
            .from('ecard_inventory')
            .select('product, is_used');
        if (error) throw error;

        const wAvail = data.filter(r => r.product === 'ecard_wassce' && !r.is_used).length;
        const bAvail = data.filter(r => r.product === 'ecard_bece'  && !r.is_used).length;
        const used   = data.filter(r => r.is_used).length;

        const wa = document.getElementById('ec_wassce_avail');
        const ba = document.getElementById('ec_bece_avail');
        const tu = document.getElementById('ec_total_used');
        if (wa) wa.textContent = wAvail;
        if (ba) ba.textContent = bAvail;
        if (tu) tu.textContent = used;
    } catch (err) {
        console.error('loadEcardStats error:', err);
    }
}

// Load PIN inventory table
window.loadEcardInventory = async function() {
    const tbody = document.getElementById('ecInventoryBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:28px; color:var(--text-muted);">Loading...</td></tr>`;

    try {
        const typeFilter   = document.getElementById('ecFilterType')?.value   || '';
        const statusFilter = document.getElementById('ecFilterStatus')?.value || '';

        let query = supabase
            .from('ecard_inventory')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (typeFilter)   query = query.eq('product', typeFilter);
        if (statusFilter !== '') query = query.eq('is_used', statusFilter === 'true');

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:28px; color:var(--text-muted);">No PIN records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((r, i) => {
            const typeLabel = r.product === 'ecard_wassce' ? 'WASSCE' : 'BECE';
            const statusBadge = r.is_used
                ? `<span style="background:rgba(239,68,68,.12); color:#f87171; border:1px solid rgba(239,68,68,.2); padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700;">USED</span>`
                : `<span style="background:rgba(16,185,129,.12); color:#34d399; border:1px solid rgba(16,185,129,.2); padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700;">AVAILABLE</span>`;
            const usedAtObj = r.used_at ? new Date(r.used_at) : null;
            const usedDate = usedAtObj ? usedAtObj.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—';
            const usedTime = usedAtObj ? usedAtObj.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '';
            const usedAt = usedAtObj ? `<div>${usedDate}</div><div style="font-size:11px; opacity:0.7;">${usedTime}</div>` : '—';
            return `
                <tr>
                    <td style="color:var(--text-muted); font-size:12px;">${i + 1}</td>
                    <td><span style="font-weight:700; color:${r.product === 'ecard_wassce' ? '#10b981' : '#3b82f6'};">${typeLabel}</span></td>
                    <td><code style="background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:4px; font-size:13px; letter-spacing:.5px;">${r.pin}</code></td>
                    <td><code style="background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:4px; font-size:12px; color:var(--text-muted);">${r.serial}</code></td>
                    <td>${statusBadge}</td>
                    <td style="font-size:12px; color:var(--text-muted);">${usedAt}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('loadEcardInventory error:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:28px; color:#ef4444;">Error: ${err.message}</td></tr>`;
    }
};

// Parse and upload bulk PINs
window.uploadEcardPins = async function() {
    const product  = document.getElementById('ecUploadType')?.value;
    const rawInput = document.getElementById('ecBulkInput')?.value?.trim();
    const statusEl = document.getElementById('ecUploadStatus');

    if (!rawInput) {
        if (statusEl) statusEl.textContent = '⚠ Please paste PIN entries first.';
        return;
    }

    // Parse lines — support: "PIN - 12345 SERIAL - ABC123"
    const lines = rawInput.split('\n').map(l => l.trim()).filter(Boolean);
    const rows = [];
    const pinRegex  = /PIN\s*[-:]\s*(\S+)/i;
    const serialRegex = /SERIAL\s*[-:]\s*(\S+)/i;

    for (const line of lines) {
        const pinMatch    = line.match(pinRegex);
        const serialMatch = line.match(serialRegex);
        if (pinMatch && serialMatch) {
            rows.push({ product, pin: pinMatch[1], serial: serialMatch[1], is_used: false });
        }
    }

    if (rows.length === 0) {
        if (statusEl) statusEl.textContent = '⚠ No valid entries found. Use format: PIN - 12345 SERIAL - ABC123';
        return;
    }

    if (statusEl) statusEl.textContent = `Uploading ${rows.length} PINs...`;

    try {
        const { error } = await supabase.from('ecard_inventory').insert(rows);
        if (error) throw error;

        if (statusEl) statusEl.textContent = `✅ ${rows.length} PINs uploaded successfully!`;
        document.getElementById('ecBulkInput').value = '';
        loadEcardInventory();
        loadEcardStats();
    } catch (err) {
        console.error('uploadEcardPins error:', err);
        if (statusEl) statusEl.textContent = `❌ Upload failed: ${err.message}`;
    }
};

// Load E-Card Prices into inputs
window.loadEcardPrices = async function() {
    try {
        const { data, error } = await supabase
            .from('pricing')
            .select('*')
            .in('product', ['ecard_wassce', 'ecard_bece']);
            
        if (error) throw error;
        
        // Reset all inputs to blank first
        const roles = ['client', 'vip_customer', 'elite_agent', 'super_agent'];
        const types = ['wassce', 'bece'];
        types.forEach(type => {
            roles.forEach(role => {
                const suffix = role === 'vip_customer' ? 'vip' : role.replace('_agent', '');
                const el = document.getElementById(`ec_price_${type}_${suffix}`);
                if (el) el.value = '';
            });
        });

        if (data) {
            data.forEach(r => {
                const type = r.product.replace('ecard_', '');
                const suffix = r.role === 'vip_customer' ? 'vip' : r.role.replace('_agent', '');
                const el = document.getElementById(`ec_price_${type}_${suffix}`);
                if (el) el.value = r.price;
            });
        }
    } catch (err) {
        console.error('loadEcardPrices error:', err);
    }
};

// Save E-Card Prices from inputs
window.saveEcardPrices = async function() {
    const statusEl = document.getElementById('ecPriceStatus');
    if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.style.color = '#3b82f6';
    }

    const payload = [];

    const addProduct = (typeBase, inputPrefix, planName) => {
        const clientPrice = document.getElementById(inputPrefix + 'client')?.value;
        const vipPrice    = document.getElementById(inputPrefix + 'vip')?.value;
        const elitePrice  = document.getElementById(inputPrefix + 'elite')?.value;
        const superPrice  = document.getElementById(inputPrefix + 'super')?.value;

        if (clientPrice) payload.push({ product: typeBase, role: 'client',       price: parseFloat(clientPrice), plan_name: planName, is_in_stock: true });
        if (vipPrice)    payload.push({ product: typeBase, role: 'vip_customer', price: parseFloat(vipPrice),    plan_name: planName, is_in_stock: true });
        if (elitePrice)  payload.push({ product: typeBase, role: 'elite_agent',  price: parseFloat(elitePrice),  plan_name: planName, is_in_stock: true });
        if (superPrice)  payload.push({ product: typeBase, role: 'super_agent',  price: parseFloat(superPrice),  plan_name: planName, is_in_stock: true });
    };

    addProduct('ecard_wassce', 'ec_price_wassce_', 'WASSCE Results Checker');
    addProduct('ecard_bece',   'ec_price_bece_',   'BECE Results Checker');

    if (payload.length === 0) {
        if (statusEl) {
            statusEl.textContent = '⚠ Enter at least one price to save.';
            statusEl.style.color = '#f59e0b';
        }
        return;
    }

    try {
        // Delete existing pricing for these e-cards to avoid unique constraint errors
        await supabase.from('pricing').delete().in('product', ['ecard_wassce', 'ecard_bece']);
        // Insert new pricing
        const { error } = await supabase.from('pricing').insert(payload);
        if (error) throw error;

        if (statusEl) {
            statusEl.textContent = '✅ E-Card Prices updated successfully!';
            statusEl.style.color = '#10b981';
        }
        if (window.showSuccessPopup) window.showSuccessPopup("Saved", "E-Card pricing updated.");
        
        // Reload to confirm
        loadEcardPrices();
    } catch (err) {
        console.error('saveEcardPrices error:', err);
        if (statusEl) {
            statusEl.textContent = `❌ Update failed: ${err.message}`;
            statusEl.style.color = '#ef4444';
        }
        if (window.showErrorPopup) window.showErrorPopup("Save Failed", err.message);
    }
};

// ==========================================
// USER GLOBAL DIRECTORY LOGIC
// ==========================================

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">Loading users...</td></tr>`;

    try {
        const { data: usersData, error } = await supabase
            .from('users')
            .select('id, email, phone, first_name, last_name, role, wallet_balance, created_at, is_free_mode, balance_owed, merchant_id, api_key')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        window.allUsersDataFull = usersData || [];
        window.allUsersData = [...window.allUsersDataFull];
        renderUsersTable();

    } catch (err) {
        console.error('loadUsers error:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#ef4444;">
          <strong>Failed to load users</strong><br>
          <span style="font-size:11px; opacity:0.8;">${err.message}</span>
        </td></tr>`;
    }
}

function renderUsersTable() {
    const listContainer = document.getElementById('usersTableBody');
    if (!listContainer) return;

    const users = window.allUsersData || [];
    listContainer.innerHTML = "";

    try {
        if (users.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:32px; background:var(--bg-darker); border-radius:12px; border:1px solid var(--glass-border); width:100%;">No users found.</div>`;
            return;
        }

        users.forEach(u => {
            const roleColor = u.role === 'admin' ? '#ef4444' : u.role === 'super_agent' ? '#8b5cf6' : u.role === 'elite_agent' ? '#10b981' : u.role === 'vip_customer' ? '#3b82f6' : '#10b981';
            const fn = u.first_name || '';
            const ln = u.last_name || '';
            const fullName = `${fn} ${ln}`.trim() || u.email || 'Unknown';
            const initials = fullName === 'Unknown' ? 'U' : fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const code = u.merchant_id || '—';
            
            const fmBadge = u.is_free_mode 
                ? `<span style="background:rgba(22,101,52,0.1); color:#16a34a; font-weight:800; font-size:9px; padding:2px 6px; border-radius:6px; letter-spacing:0.5px;">FREE ON</span>`
                : `<span style="background:rgba(100,116,139,0.1); color:#64748b; font-weight:800; font-size:9px; padding:2px 6px; border-radius:6px; letter-spacing:0.5px;">FREE OFF</span>`;
            
            const owed = (u.balance_owed && u.balance_owed > 0) ? `<div class="uc-owed">Owes: ₵${Number(u.balance_owed).toFixed(2)}</div>` : '';

            // API Access check (if exists in this context)
            const apiActive = u.api_key ? true : false;
            const apiRender = apiActive
                ? `<div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <span style="color:#10b981; font-weight:800; font-size:11px; display:flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; background:#10b981; border-radius:50%; display:inline-block; box-shadow:0 0 8px #10b981;"></span> ACTIVE</span>
                    <button onclick="resetUserApiKey('${u.id}', '${escapeQuote(u.email)}')" style="font-size:10px; font-weight:700; padding:4px 10px; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); border-radius:6px; cursor:pointer; transition:0.2s;">RESET</button>
                </div>` 
                : `<span style="color:#94a3b8; font-weight:700; font-size:11px;">INACTIVE</span>`;

            listContainer.innerHTML += `
                <div class="user-card-premium">
                    <div class="uc-identity">
                        <div class="uc-avatar" style="background:linear-gradient(135deg, ${roleColor}, ${roleColor}aa); box-shadow:0 4px 10px ${roleColor}33;">${initials}</div>
                        <div class="uc-info">
                            <h4>${fullName} ${fmBadge}</h4>
                            <div class="uc-email">${u.email}</div>
                            <div class="uc-tags">
                                <span style="background:${roleColor}15; color:${roleColor}; font-weight:800; font-size:9px; text-transform:uppercase; padding:4px 8px; border-radius:6px; border:1px solid ${roleColor}22;">${u.role}</span>
                                ${u.phone ? `<span style="font-size:10px; font-weight:700; color:var(--text-muted); background:var(--bg-dark); padding:4px 8px; border-radius:6px; border:1px solid var(--glass-border);">📞 ${u.phone}</span>` : ''}
                                <span style="font-family:monospace; font-size:10px; font-weight:800; color:var(--blue); background:rgba(37,99,235,0.1); padding:4px 8px; border-radius:6px;">${code}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="uc-treasury">
                        <div class="uc-label">Treasury</div>
                        <div class="uc-balance">₵${Number(u.wallet_balance || 0).toFixed(2)}</div>
                        ${owed}
                    </div>
                    
                    <div class="uc-api">
                        <div class="uc-label">API Access</div>
                        ${apiRender}
                    </div>
                    
                    <div class="uc-actions">
                        <button class="btn-action" onclick="openUserWalletModal('${u.id}', ${u.wallet_balance})" style="display:flex; align-items:center; justify-content:center; gap:6px;"><span>🏦</span> Bank</button>
                        <button class="btn-action" onclick="openUserTransactionsModal('${u.id}', '${escapeQuote(fullName)}')" style="display:flex; align-items:center; justify-content:center; gap:6px;"><span>📜</span> History</button>
                        <button class="btn-action" onclick="openRoleSelectionModal('${u.id}', '${u.role}', '${escapeQuote(u.email)}')" style="display:flex; align-items:center; justify-content:center; gap:6px;"><span>🎭</span> Role</button>
                        <button class="btn-action" onclick="toggleFreeModeAdmin('${u.id}', ${u.is_free_mode}, '${escapeQuote(u.email)}')" style="display:flex; align-items:center; justify-content:center; gap:6px; background:var(--text-main); color:var(--bg-darker); border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><span>⚙️</span> Free</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error("renderUsersTable Error:", err);
        listContainer.innerHTML = `<div style="padding:20px; color:#ef4444; border:1px solid #ef4444; border-radius:8px; width:100%;">Render Error: ${err.message}</div>`;
    }
}

window.filterUsersTable = function() {
    const q = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    if (!q) {
        window.allUsersData = [...(window.allUsersDataFull || [])];
    } else {
        window.allUsersData = (window.allUsersDataFull || []).filter(u => {
            const fn = (u.first_name || '').toLowerCase();
            const ln = (u.last_name || '').toLowerCase();
            const em = (u.email || '').toLowerCase();
            const ph = (u.phone || '').toLowerCase();
            const cid = (u.merchant_id || '').toLowerCase();
            return fn.includes(q) || ln.includes(q) || em.includes(q) || ph.includes(q) || cid.includes(q);
        });
    }
    renderUsersTable();
}

window.updateUserRole = async function(userId, newRole) {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`)) {
        renderUsersTable(); // Reset dropdown
        return;
    }
    try {
        const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
        if (error) throw error;
        if (window.showSuccessPopup) window.showSuccessPopup("Role Updated", `User is now a ${newRole}.`);
        loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Update Failed", err.message);
        else alert(err.message);
        renderUsersTable(); // Reset
    }
}

// User Transactions Modal Logic
window.openUserTransactionsModal = async function(userId, userName) {
    document.getElementById('utmUserName').innerText = userName;
    document.getElementById('userTransactionsModal').style.display = 'flex';
    
    // Reset views
    switchUtTab('orders');
    document.getElementById('utOrdersBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Loading orders...</td></tr>`;
    document.getElementById('utWalletsBody').innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Loading wallets...</td></tr>`;

    try {
        // Fetch Orders
        const { data: orders, error: oErr } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (oErr) throw oErr;

        // Fetch Transactions (Wallets)
        const { data: txs, error: tErr } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (tErr) throw tErr;

        // Render Orders
        const oBody = document.getElementById('utOrdersBody');
        if (!orders || orders.length === 0) {
            oBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No orders found.</td></tr>`;
        } else {
            oBody.innerHTML = orders.map(o => {
                const dateObj = new Date(o.created_at);
                const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
                const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                let statusBadge = `<span style="color:var(--text-muted);">${o.status}</span>`;
                if (o.status === 'Completed' || o.status === 'SUCCESS') statusBadge = `<span style="color:#10b981; font-weight:600;">Completed</span>`;
                else if (o.status === 'Failed' || o.status === 'FAILD') statusBadge = `<span style="color:#ef4444; font-weight:600;">Failed</span>`;
                else statusBadge = `<span style="color:#f59e0b; font-weight:600;">Pending</span>`;
                
                const network = (o.network || 'ORD').split('-')[0].split(' ')[0].toUpperCase();
                const num = String(o.order_number || 0).padStart(2, '0');
                const friendlyId = `${network}-${num}`;
                
                return `
                    <tr>
                        <td data-label="Date" style="color:var(--text-muted); font-size:12px; white-space:nowrap;">
                            <div style="color:white; font-weight:600;">${dateStr}</div>
                            <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                        </td>
                        <td data-label="Order ID" style="font-family:monospace; color:#3b82f6; white-space:nowrap; font-weight:700;">${friendlyId}</td>
                        <td data-label="Product" style="font-weight:600;">${o.data_plan || o.product || 'Bundle'} <span style="font-size:11px; color:var(--text-muted);">(${o.recipient_number || 'N/A'})</span></td>
                        <td data-label="Amount"><strong style="white-space:nowrap;">₵${Number(o.amount_charged || o.amount || 0).toFixed(2)}</strong></td>
                        <td data-label="Status" style="white-space:nowrap;">${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        }

        // Render Wallets
        const wBody = document.getElementById('utWalletsBody');
        if (!txs || txs.length === 0) {
            wBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No wallet transactions found.</td></tr>`;
        } else {
            wBody.innerHTML = txs.map(t => {
                const dateObj = new Date(t.created_at);
                const dateStr = dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
                const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                let statusBadge = `<span style="color:var(--text-muted);">${t.status}</span>`;
                if (t.status === 'approved' || t.status === 'Approved') statusBadge = `<span style="color:#10b981; font-weight:600;">Approved</span>`;
                else if (t.status === 'rejected' || t.status === 'Rejected') statusBadge = `<span style="color:#ef4444; font-weight:600;">Rejected</span>`;
                else if (t.status === 'pending') statusBadge = `<span style="color:#f59e0b; font-weight:600;">Pending</span>`;
                else statusBadge = `<span style="color:#10b981; font-weight:600;">${t.status}</span>`; // manual credits
                
                let amtColor = 'white';
                if ((t.type || '').includes('Deposit') || (t.type || '').includes('Refund')) amtColor = '#10b981';
                if ((t.type || '').includes('Debit') || (t.type || '').includes('Purchase')) amtColor = '#ef4444';

                return `
                    <tr>
                        <td data-label="Date" style="color:var(--text-muted); font-size:12px; white-space:nowrap;">
                            <div style="color:white; font-weight:600;">${dateStr}</div>
                            <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                        </td>
                        <td data-label="Reference" style="font-family:monospace; color:#3b82f6; white-space:nowrap;">${t.reference || '-'}</td>
                        <td data-label="Type" style="white-space:nowrap;">${t.type || 'Deposit'}</td>
                        <td data-label="Amount"><strong style="color:${amtColor}; white-space:nowrap;">₵${Number(t.amount).toFixed(2)}</strong></td>
                        <td data-label="Balance After" style="white-space:nowrap;">${t.balance_after ? `₵${Number(t.balance_after).toFixed(2)}` : '-'}</td>
                        <td data-label="Status" style="white-space:nowrap;">${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        }

    } catch (err) {
        console.error("Modal fetch error:", err);
        document.getElementById('utOrdersBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#ef4444;">Error loading data: ${err.message}</td></tr>`;
    }
}

window.closeUserTransactionsModal = function() {
    document.getElementById('userTransactionsModal').style.display = 'none';
}

window.switchUtTab = function(tab) {
    const btnOrders = document.getElementById('utTabOrders');
    const btnWallets = document.getElementById('utTabWallets');
    const viewOrders = document.getElementById('utViewOrders');
    const viewWallets = document.getElementById('utViewWallets');

    if (tab === 'orders') {
        btnOrders.style.color = 'white';
        btnOrders.style.borderBottom = '2px solid var(--blue)';
        btnWallets.style.color = 'var(--text-muted)';
        btnWallets.style.borderBottom = '2px solid transparent';
        viewOrders.style.display = 'block';
        viewWallets.style.display = 'none';
    } else {
        btnWallets.style.color = 'white';
        btnWallets.style.borderBottom = '2px solid var(--blue)';
        btnOrders.style.color = 'var(--text-muted)';
        btnOrders.style.borderBottom = '2px solid transparent';
        viewWallets.style.display = 'block';
        viewOrders.style.display = 'none';
    }
}

// ==========================================
// FREE MODE TAB LOGIC
// ==========================================
window.loadFreeModeData = async function() {
    const { data: users, error } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, is_free_mode, balance_owed")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Failed to load users for Free Mode:", error);
        return;
    }

    const userOpts = users.map(u => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
        return `<option value="${u.id}">${name} (Free Mode: ${u.is_free_mode ? 'ON' : 'OFF'})</option>`;
    });
    
    const userSelects = document.getElementById('fmUserSelect');
    const checkoutSelects = document.getElementById('fmCheckoutUserSelect');
    
    if (userSelects) userSelects.innerHTML = `<option value="">Select a user...</option>` + userOpts.join('');
    if (checkoutSelects) checkoutSelects.innerHTML = `<option value="">Select a user...</option>` + userOpts.join('');

    const activeOrDebtUsers = users.filter(u => u.is_free_mode || (u.balance_owed && Number(u.balance_owed) > 0));
    
    const tbody = document.getElementById('freemodeTableBody');
    if (!tbody) return;
    
    if (activeOrDebtUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No users currently using Free Mode or carrying a debt.</td></tr>`;
    } else {
        tbody.innerHTML = activeOrDebtUsers.map(u => {
            const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
            const badge = u.is_free_mode 
              ? `<span style="background:#166534; color:#86efac; font-weight:700; font-size:11px; padding:4px 10px; border-radius:20px;">ON</span>` 
              : `<span style="background:#374151; color:#9ca3af; font-weight:700; font-size:11px; padding:4px 10px; border-radius:20px;">OFF</span>`;
            
            return `
                <tr>
                    <td><div style="font-weight:600;">${name}</div> <span style="font-size:11px; color:var(--text-muted);">${u.email}</span></td>
                    <td>${badge}</td>
                    <td><strong style="color:${(u.balance_owed && Number(u.balance_owed) > 0) ? '#f59e0b' : 'white'};">₵${Number(u.balance_owed || 0).toFixed(2)}</strong></td>
                    <td style="text-align:right;">
                        <button onclick="modifyFreeModeBalance('${u.id}', '${u.balance_owed || 0}')" style="background:var(--glass-border); color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Update Balance</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Also load settlement requests
    const { data: settlements, error: setErr } = await supabase
        .from('free_mode_settlements')
        .select(`*, users!free_mode_settlements_user_id_fkey(first_name, last_name, email, merchant_id)`)
        .order('created_at', { ascending: false });

    const setBody = document.getElementById('fmSettlementsTableBody');
    if (setBody) {
        if (setErr || !settlements || settlements.length === 0) {
            setBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No settlement records found.</td></tr>`;
        } else {
            setBody.innerHTML = settlements.map(s => {
                const u = s.users || {};
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown User';
                const dateObj = new Date(s.created_at);
                const dateStr = dateObj.toLocaleDateString('en-GB');
                const timeStr = dateObj.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                
                let badge = `<span style="background:#374151; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">${s.status}</span>`;
                if (s.status === 'pending') badge = `<span style="background:#b45309; color:white; padding:4px 10px; border-radius:12px; font-size:11px;">Pending</span>`;
                if (s.status === 'approved') badge = `<span style="background:#166534; color:#86efac; padding:4px 10px; border-radius:12px; font-size:11px;">Approved</span>`;
                if (s.status === 'rejected') badge = `<span style="background:#991b1b; color:#fca5a5; padding:4px 10px; border-radius:12px; font-size:11px;">Rejected</span>`;

                let actions = '-';
                if (s.status === 'pending') {
                    actions = `
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            <button onclick="approveSettlement('${s.id}')" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">Approve</button>
                            <button onclick="rejectSettlement('${s.id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">Reject</button>
                        </div>
                    `;
                }

                return `
                    <tr>
                        <td data-label="Date" style="font-size:12px; color:var(--text-muted);">
                            <div style="color:white; font-weight:600;">${dateStr}</div>
                            <div style="font-size:11px; opacity:0.8;">${timeStr}</div>
                        </td>
                        <td data-label="User"><div style="font-weight:600; font-size:13px;">${name}</div></td>
                        <td data-label="Amount"><strong style="color:white;">₵${Number(s.amount_paid).toFixed(2)}</strong></td>
                        <td data-label="Ref" style="font-size:12px;">${(s.payment_method || '').toUpperCase()}<br><span style="color:var(--text-muted);">${s.reference || 'N/A'}</span></td>
                        <td data-label="Status">${badge}</td>
                        <td data-label="Actions" style="text-align:right;">${actions}</td>
                    </tr>
                `;
            }).join('');
        }
    }
}

window.executeAdminFreeModeToggle = async function() {
    const userId = document.getElementById('fmUserSelect').value;
    if (!userId) return alert('Please select a user');

    try {
        const { data, error } = await supabase.rpc('free_mode_account_action', {
            p_user_id: userId,
            p_action: 'toggle',
            p_order_total: null
        });

        if (error) throw error;
        if (window.showSuccessPopup) window.showSuccessPopup("Success", data.message || "Toggled Free Mode");
        else alert(data.message || "Status changed successfully");
        
        loadFreeModeData();
        loadUsers(); 
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Failed", err.message);
        else alert("Failed: " + err.message);
    }
}

window.executeAdminFreeModeCheckout = async function() {
    const userId = document.getElementById('fmCheckoutUserSelect').value;
    const amountElem = document.getElementById('fmOrderTotal');
    const amount = amountElem ? amountElem.value : 0; // Default to 0 or handle removal

    if (!userId) return alert("Please select a user.");
    if (amountElem && (isNaN(amount) || Number(amount) <= 0)) {
        return alert("Please enter a valid amount.");
    }

    try {
        const { data, error } = await supabase.rpc('free_mode_account_action', {
            p_user_id: userId,
            p_action: 'checkout',
            p_order_total: Number(amount)
        });

        if (error) throw error;
        
        const detail = data.free_mode 
          ? `${data.message} New Balance Owed: ₵${Number(data.new_balance_owed || 0).toFixed(2)}`
          : (data.message || 'Checkout completed normally.');
          
        if (window.showSuccessPopup) window.showSuccessPopup("Order Placed", detail);
        else alert(detail);
        
        loadFreeModeData();
        loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Failed", err.message);
        else alert("Failed: " + err.message);
    }
}

// ==========================================
// FREE MODE TAB SEARCH FILTERS
// ==========================================
window.filterSelectOptions = function(inputId, selectId) {
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const select = document.getElementById(selectId);
    if (!select || !input) return;
    
    const options = select.getElementsByTagName('option');
    for (let i = 1; i < options.length; i++) {
        const txtValue = options[i].textContent || options[i].innerText;
        if (txtValue.toLowerCase().indexOf(filter) > -1) {
            options[i].style.display = "";
        } else {
            options[i].style.display = "none";
        }
    }
}

window.searchFreeModeTable = function(query) {
    query = query.toLowerCase();
    const table = document.getElementById('freemodeTableBody');
    if (!table) return;
    const trs = table.getElementsByTagName('tr');
    
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0]; 
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toLowerCase().indexOf(query) > -1) {
                trs[i].style.display = "";
            } else {
                trs[i].style.display = "none";
            }
        }
    }
}

window.approveSettlement = async function(recordId) {
    if (!confirm('Are you sure you want to approve this settlement? This will deduct the amount from their Balance Owed.')) return;
    
    const note = prompt('Add an optional admin note for this approval (or leave blank):');
    
    try {
        const { error } = await supabase.rpc('admin_approve_free_mode_settlement', {
            p_record_id: recordId,
            p_admin_note: note || ''
        });
        
        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Approved", "Settlement approved successfully.");
        else alert("Settlement approved successfully.");
        
        loadFreeModeData();
        loadUsers();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Failed", err.message);
        else alert("Failed to approve: " + err.message);
    }
}

window.rejectSettlement = async function(recordId) {
    if (!confirm('Are you sure you want to reject this settlement request?')) return;
    
    const note = prompt('Add a reason/admin note for this rejection (required):');
    if (!note) return alert('An admin note is required for rejection.');
    
    try {
        const { error } = await supabase.rpc('admin_reject_free_mode_settlement', {
            p_record_id: recordId,
            p_admin_note: note
        });
        
        if (error) throw error;
        
        if (window.showSuccessPopup) window.showSuccessPopup("Rejected", "Settlement request formally rejected.");
        else alert("Settlement rejected successfully.");
        
        loadFreeModeData();
    } catch (err) {
        if (window.showErrorPopup) window.showErrorPopup("Failed", err.message);
        else alert("Failed to reject: " + err.message);
    }
}

window.searchSettlementTable = function(query) {
    query = query.toLowerCase();
    const table = document.getElementById('fmSettlementsTableBody');
    if (!table) return;
    const trs = table.getElementsByTagName('tr');
    
    for (let i = 0; i < trs.length; i++) {
        const txtValue = trs[i].textContent || trs[i].innerText;
        if (txtValue.toLowerCase().indexOf(query) > -1) {
            trs[i].style.display = "";
        } else {
            trs[i].style.display = "none";
        }
    }
}

// ==========================================
// AFA ROLE-BASED PRICING (MASTER DASH)
// ==========================================

window.openAfaPricingModal = async function() {
    const modal = document.getElementById('afaPricingModal');
    const tbody = document.getElementById('mAfaPricingTbody');
    if (!modal || !tbody) return;

    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="3" style="padding:20px; text-align:center;">Loading matrix...</td></tr>';

    try {
        const roles = ['client', 'elite_agent', 'super_agent', 'admin'];
        
        // Fetch all current AFA pricing
        const { data: pricingData, error } = await supabase
            .from('pricing')
            .select('*')
            .in('product', ['afa_normal', 'afa_premium']);

        if (error) throw error;

        let html = '';
        roles.forEach(role => {
            const normalPrice  = pricingData.find(p => p.role === role && p.product === 'afa_normal')?.price || 0;
            const premiumPrice = pricingData.find(p => p.role === role && p.product === 'afa_premium')?.price || 0;

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding:12px 0; font-size:13px; font-weight:600; color:white; text-transform:capitalize;">${role.replace('_', ' ')}</td>
                    <td style="padding:12px 0;">
                        <input type="number" step="0.01" class="afa-m-input" data-role="${role}" data-tier="normal" value="${normalPrice}" 
                               style="background:black; border:1px solid var(--glass-border); color:white; padding:8px; border-radius:4px; width:80px; outline:none; font-size:13px;">
                    </td>
                    <td style="padding:12px 0;">
                        <input type="number" step="0.01" class="afa-m-input" data-role="${role}" data-tier="premium" value="${premiumPrice}" 
                               style="background:black; border:1px solid var(--glass-border); color:white; padding:8px; border-radius:4px; width:80px; outline:none; font-size:13px;">
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

    } catch (err) {
        console.error('Failed to load AFA pricing:', err);
        tbody.innerHTML = `<tr><td colspan="3" style="padding:20px; text-align:center; color:#ef4444;">Error: ${err.message}</td></tr>`;
    }
}

window.closeAfaPricingModal = function() {
    document.getElementById('afaPricingModal').style.display = 'none';
}

window.saveMAfaSettings = async function() {
    const btn = document.getElementById('btnSaveMAfaSettings');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const inputs = document.querySelectorAll('.afa-m-input');
    const updates = [];

    inputs.forEach(input => {
        updates.push({
            role: input.dataset.role,
            product: input.dataset.tier === 'premium' ? 'afa_premium' : 'afa_normal',
            price: parseFloat(input.value) || 0
        });
    });

    try {
        // We use upsert to simplify. Upsert needs a unique constraint on (role, product)
        // In this system, 'pricing' table usually has id as PK but we manualy handle row by row 
        // to ensure we don't duplicate.
        
        for (const up of updates) {
            const { error } = await supabase
                .from('pricing')
                .upsert(up, { onConflict: 'role,product' }); // In case they have the constraint
            
            if (error) {
                // Fallback if no constraint: select then insert/update
                const { data: existing } = await supabase
                    .from('pricing')
                    .select('id')
                    .eq('role', up.role)
                    .eq('product', up.product)
                    .single();
                
                if (existing) {
                    await supabase.from('pricing').update({ price: up.price }).eq('id', existing.id);
                } else {
                    await supabase.from('pricing').insert(up);
                }
            }
        }

        if (window.showSuccessPopup) window.showSuccessPopup("Prices Saved", "AFA Role-based pricing updated across the system.");
        else alert("AFA Role-based pricing updated successfully.");
        closeAfaPricingModal();
    } catch (err) {
        console.error('Save failed:', err);
        if (window.showErrorPopup) window.showErrorPopup("Save Failed", err.message);
        else alert("Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}
