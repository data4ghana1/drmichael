let allOrders = [];
let currentPage = 1;
let perPage = 10;  // default: 10 per page
let filteredOrders = [];
let currentCategory = 'data'; // 'data' or 'ecard'

async function fetchOrders() {
  const { data: { user } } = await supabase.auth.getUser()

  if(!user){
    window.location.href="login.html"
    return
  }

  let { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  allOrders = data || [];
  filteredOrders = allOrders;
  currentPage = 1;
  renderOrders(filteredOrders);
}

function getFriendlyRef(order, index) {
  const net = (order.network || 'ORD').split('-')[0].split(' ')[0];
  const digit = String(order.order_number || index).padStart(2, '0');
  return `${net}-${digit}`;
}

function formatBalance(val) {
  if (val === undefined || val === null) return '—';
  return `₵${Number(val).toFixed(2)}`;
}

function renderOrders(filteredData) {
  let table = document.getElementById("ordersTable");
  let thead = document.querySelector("table thead tr");
  table.innerHTML = "";

  // Update table headers based on category
  if (currentCategory === 'ecard') {
    thead.innerHTML = `
      <th>ID</th>
      <th>Status</th>
      <th>Recipient</th>
      <th>Product</th>
      <th>Serial</th>
      <th>PIN</th>
      <th>Price</th>
      <th>Date</th>
    `;
  } else {
    thead.innerHTML = `
      <th>ID</th>
      <th>Status</th>
      <th>Recipient</th>
      <th>PLAN</th>
      <th>BF</th>
      <th>PRICES</th>
      <th>AF</th>
      <th>Network</th>
      <th>Delivered</th>
      <th>Date</th>
    `;
  }

  // Determine page slice
  const showAll = perPage === 'all' || perPage === Infinity;
  const pageSize = showAll ? filteredData.length : parseInt(perPage);
  const totalPages = showAll ? 1 : Math.ceil(filteredData.length / pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageData = showAll ? filteredData : filteredData.slice(start, start + pageSize);

  // Update stats from the full filtered set
  if (filteredData) {
    document.getElementById('totalOrdersCount').innerText = filteredData.length;
    const completedCount = filteredData.filter(o => 
        o.status && (o.status.toLowerCase() === 'completed' || o.status.toString().toLowerCase() === 'true')
    ).length;
    const receivedCount = filteredData.filter(o =>
        o.status && o.status.toLowerCase() === 'received'
    ).length;
    document.getElementById('completedOrdersCount').innerText = completedCount + receivedCount;
  }

  if(!pageData || pageData.length === 0){
    const colSpan = currentCategory === 'ecard' ? 8 : 10;
    table.innerHTML = `
    <tr class="empty">
      <td colspan="${colSpan}">
        <div class="loading-state">
          <span style="font-size: 48px; margin-bottom: 10px;">📦</span>
          <span>No ${currentCategory === 'ecard' ? 'E-Card' : 'Data Bundle'} orders matching your criteria.</span>
        </div>
      </td>
    </tr>
    `;
    return;
  }
  
  pageData.forEach((order) => {
    const fullAsc = [...allOrders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const sequenceNum = fullAsc.findIndex(o => o.id === order.id) + 1;

    let row = document.createElement("tr");
    
    let statusClass = order.status ? order.status.toLowerCase().replace(/\s+/g, '-') : 'pending';
    if (statusClass === 'true') statusClass = 'completed';
    if (statusClass === 'received') statusClass = 'received';

    const net = (order.network || '').toLowerCase();
    let netIcon = '🌐';
    if (net.includes('mtn')) netIcon = '🟡';
    else if (net.includes('telecel') || net.includes('vodafone')) netIcon = '🔴';
    else if (net.includes('tigo') || net.includes('airtel')) netIcon = '🔵';
    else if (net.includes('bigtime') || net.includes('big')) netIcon = '🟣';

    const isDelivered = order.status && (order.status.toLowerCase() === 'completed' || order.status.toString().toLowerCase() === 'true');
    const isReceived  = order.status && order.status.toLowerCase() === 'received';
    const orderDate = new Date(order.created_at);
    const dateStr = orderDate.toLocaleDateString('en-GB', {
        day:'numeric',
        month:'short',
        year:'numeric'
    });
    const timeStr = orderDate.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let statusLabel = isDelivered ? 'Completed' : isReceived ? 'Sent to Provider' : (order.status || 'Pending');
    if (currentCategory === 'ecard' && isDelivered) statusLabel = 'Delivered';
    const deliveredLabel = isDelivered
        ? '<b style="color:#059669;">YES</b>'
        : isReceived
        ? '<b style="color:#0e7490;">PROCESSING</b>'
        : '<b style="color:#ef4444;">NO</b>';

    if (currentCategory === 'ecard') {
      row.innerHTML = `
        <td data-label="ID" style="font-weight:800; color:#2563eb; white-space:nowrap;">
          ${getFriendlyRef(order, sequenceNum)}
        </td>
        <td data-label="Status"><span class="status ${statusClass}">${statusLabel}</span></td>
        <td data-label="Recipient"><span class="recipient-badge">${order.phone || '-'}</span></td>
        <td data-label="Product" style="font-weight:700; color:#334155;">
          ${order.product === 'ecard_wassce' ? 'WASSCE' : 'BECE'}
        </td>
        <td data-label="Serial" style="font-family:monospace; color:#64748b; font-weight:600;">${order.ecard_serial || '-'}</td>
        <td data-label="PIN" style="font-family:monospace; color:#2563eb; font-weight:800; letter-spacing:1px;">
          ${order.ecard_pin ? `<span style="background:#eff6ff; padding:4px 8px; border-radius:6px; border:1px solid #dbeafe;">${order.ecard_pin}</span>` : '-'}
        </td>
        <td data-label="Price" style="font-weight:800; color:#059669;">₵${order.price || order.amount || '0'}</td>
        <td data-label="Date" style="color:#64748b; font-weight:500;">
          <div>${dateStr}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${timeStr}</div>
        </td>
      `;
    } else {
      row.innerHTML = `
        <td data-label="ID" style="font-weight:800; color:#2563eb; white-space:nowrap;">
          ${getFriendlyRef(order, sequenceNum)}
          ${order.is_store_order ? '<span style="display:inline-block; font-size:9px; background:#f0fdf4; color:#059669; border:1px solid #bbf7d0; padding:1px 4px; border-radius:4px; margin-left:4px;">STORE</span>' : ''}
        </td>
        <td data-label="Status"><span class="status ${statusClass}">${statusLabel}</span></td>
        <td data-label="Recipient"><span class="recipient-badge">${order.phone || '-'}</span></td>
        <td data-label="PLAN" style="font-weight:700; color:#334155;">
          ${(order.bundle || order.plan || '-').toString().includes('GB') ? (order.bundle || order.plan) : (order.bundle || order.plan) + ' GB'}
        </td>
        <td data-label="BF" style="color:#64748b; font-weight:600;">${formatBalance(order.balance_before || order.before_balance)}</td>
        <td data-label="PRICES" style="font-weight:800; color:#059669;">₵${order.price || order.amount || '0'}</td>
        <td data-label="AF" style="color:#64748b; font-weight:600;">${formatBalance(order.balance_after || order.after_balance)}</td>
        <td data-label="Network">
          <div class="network-badge">
              ${order.network || '-'}
          </div>
        </td>
        <td data-label="Delivered">${deliveredLabel}</td>
        <td data-label="Date" style="color:#64748b; font-weight:500;">
          <div>${dateStr}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${timeStr}</div>
        </td>
      `;
    }
    table.appendChild(row);
  });

  // Render pagination controls
  renderPagination(filteredData.length, pageSize, showAll);
}

function resetFilters() {
    document.getElementById("searchOrder").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("dateFilter").value = "";
    document.getElementById("phoneFilter").value = "";
    filteredOrders = allOrders;
    currentPage = 1;
    renderOrders(filteredOrders);
}





function applyFilters() {
  const searchVal = document.getElementById("searchOrder").value.toLowerCase();
  const statusVal = document.getElementById("statusFilter").value;
  const dateVal = document.getElementById("dateFilter").value;
  const phoneVal = document.getElementById("phoneFilter").value;

  let filtered = allOrders.filter(order => {
    let match = true;

    // Filter by Category
    if (currentCategory === 'ecard') {
      match = match && (order.network === 'ecard' || (order.product && order.product.startsWith('ecard_')));
    } else {
      match = match && (order.network !== 'ecard' && !(order.product && order.product.startsWith('ecard_')));
    }
    
    // Search by ID or Product (Network/Bundle logic fallback)
      const friendlyRef = getFriendlyRef(order).toLowerCase();
      const searchTarget = `${friendlyRef} ${order.id} ${order.network} ${order.bundle || order.plan || ''}`.toLowerCase();
      match = match && searchTarget.includes(searchVal);
    
    // Filter by Exact Status
    if (statusVal) {
      match = match && (order.status && order.status.toLowerCase() === statusVal.toLowerCase());
    }
    
    // Filter by Exact Date Formatted
    if (dateVal) {
      if(order.created_at) {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        match = match && (orderDate === dateVal);
      } else {
        match = false; // If no date on record, drop it from results
      }
    }
    
    // Filter by Phone
    if (phoneVal) {
      match = match && (order.phone && String(order.phone).includes(phoneVal));
    }
    
    return match;
  });

  filteredOrders = filtered;
  currentPage = 1;
  renderOrders(filteredOrders);
}

// Switch between Data and E-Card tabs
window.switchCategory = function(category) {
    currentCategory = category;
    
    // Update UI tabs
    document.getElementById('tabData').classList.toggle('active', category === 'data');
    document.getElementById('tabEcard').classList.toggle('active', category === 'ecard');
    
    // Reset filters and apply
    applyFilters();
};

// Change per-page setting
window.changePerPage = function() {
    perPage = document.getElementById('perPageFilter').value;
    currentPage = 1;
    renderOrders(filteredOrders);
};

// Navigate to a specific page
window.goToPage = function(page) {
    currentPage = page;
    renderOrders(filteredOrders);
};

// Render the pagination buttons and info text
function renderPagination(total, pageSize, showAll) {
    const info = document.getElementById('paginationInfo');
    const btns = document.getElementById('paginationButtons');
    if (!info || !btns) return;

    if (showAll || total <= pageSize) {
        info.textContent = `Showing all ${total} records`;
        btns.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(total / pageSize);
    const start = (currentPage - 1) * pageSize + 1;
    const end   = Math.min(currentPage * pageSize, total);
    info.textContent = `Showing ${start}–${end} of ${total} records`;

    // Build page buttons
    let html = '';
    const btnStyle = (active) => `style="padding:5px 11px; border-radius:6px; border:1px solid ${
        active ? '#3b82f6' : 'rgba(100,116,139,0.3)'}; background:${
        active ? '#3b82f6' : 'transparent'}; color:${
        active ? '#fff' : '#64748b'}; font-weight:600; cursor:pointer; font-size:13px;"`;

    // Prev button
    if (currentPage > 1) {
        html += `<button onclick="goToPage(${currentPage - 1})" ${btnStyle(false)}>‹ Prev</button>`;
    }

    // Page number buttons (show up to 5 around current)
    let startPage = Math.max(1, currentPage - 2);
    let endPage   = Math.min(totalPages, currentPage + 2);
    if (startPage > 1) html += `<button onclick="goToPage(1)" ${btnStyle(false)}>1</button>${startPage > 2 ? '<span style="color:#64748b;">…</span>' : ''}`;
    for (let p = startPage; p <= endPage; p++) {
        html += `<button onclick="goToPage(${p})" ${btnStyle(p === currentPage)}>${p}</button>`;
    }
    if (endPage < totalPages) html += `${endPage < totalPages - 1 ? '<span style="color:#64748b;">…</span>' : ''}<button onclick="goToPage(${totalPages})" ${btnStyle(false)}>${totalPages}</button>`;

    // Next button
    if (currentPage < totalPages) {
        html += `<button onclick="goToPage(${currentPage + 1})" ${btnStyle(false)}>Next ›</button>`;
    }

    btns.innerHTML = html;
}

// Attach Event Listeners to all 4 inputs
document.getElementById("searchOrder").addEventListener("input", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("dateFilter").addEventListener("change", applyFilters);
document.getElementById("phoneFilter").addEventListener("input", applyFilters);

// Initial Load
fetchOrders()
