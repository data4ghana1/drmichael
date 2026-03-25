// js/admin-tickets.js

async function initTicketsPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadSupportTickets();
    initTicketsRealtime();
}

async function loadSupportTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading tickets...</td></tr>';

    const { data: tickets, error } = await supabase
        .from('support_tickets')
        .select('*, users(email, phone, first_name, last_name)')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No support tickets found.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    tickets.forEach(t => {
        const d = new Date(t.created_at).toLocaleDateString();
        const s = (t.status || 'open').toLowerCase();
        let sClass = 'status-pending';
        if (s === 'resolved' || s === 'closed') sClass = 'status-success';
        if (s === 'checking' || s === 'in_progress') sClass = 'status-warning';

        const u = t.users || {};
        const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown';

        tbody.innerHTML += `
            <tr>
                <td style="white-space:nowrap; font-size:12px; color:var(--text-muted);">${d}</td>
                <td style="font-weight:600; color:white;">${userName}</td>
                <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;">${t.issue_description}</td>
                <td><span class="status-badge ${sClass}" style="text-transform:capitalize;">${s.replace('_', ' ')}</span></td>
                <td style="text-align:right;">
                    <button class="btn-action" onclick="openTicketReviewModal('${t.id}')">View Details</button>
                </td>
            </tr>
        `;
    });
}

window.openTicketReviewModal = async function(id) {
    const { data: t, error } = await supabase.from('support_tickets').select('*, users(email, phone, first_name, last_name)').eq('id', id).single();
    if(error || !t) return alert("Failed to load ticket details.");

    document.getElementById('trmId').value = t.id;
    document.getElementById('trmTicketId').innerText = `#${t.id.split('-')[0].toUpperCase()}`;
    const u = t.users || {};
    document.getElementById('trmUser').innerText = `${u.first_name || ''} ${u.last_name || ''} (${u.email})`;
    document.getElementById('trmPhone').innerText = u.phone || 'N/A';
    document.getElementById('trmIssueText').innerText = t.issue_description;
    document.getElementById('trmAdminReply').value = t.admin_reply || '';
    document.getElementById('trmStatus').value = t.status || 'checking';

    if (t.order_id) {
        document.getElementById('trmOrderLink').innerText = `Order #${t.order_id.split('-')[0]}`;
        document.getElementById('trmOrderLink').onclick = () => window.location.href = `admin-orders.html?id=${t.order_id}`;
    } else {
        document.getElementById('trmOrderLink').innerText = 'None';
        document.getElementById('trmOrderLink').onclick = null;
    }

    const imgLink = document.getElementById('trmImageLink');
    const imgObj = document.getElementById('trmImage');
    const noImg = document.getElementById('trmNoImage');

    if (t.screenshot_url) {
        imgLink.style.display = 'block';
        imgObj.src = t.screenshot_url;
        imgLink.href = t.screenshot_url;
        noImg.style.display = 'none';
    } else {
        imgLink.style.display = 'none';
        noImg.style.display = 'block';
    }

    document.getElementById('ticketReviewModal').style.display = 'flex';
}

window.closeTicketReviewModal = function() {
    document.getElementById('ticketReviewModal').style.display = 'none';
}

window.saveTicketReview = async function() {
    const id = document.getElementById('trmId').value;
    const reply = document.getElementById('trmAdminReply').value;
    const status = document.getElementById('trmStatus').value;

    const btn = document.getElementById('btnSaveTicket');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        const { error } = await supabase.from('support_tickets').update({
            admin_reply: reply,
            status: status,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        if (error) throw error;
        alert("Ticket updated and response saved.");
        closeTicketReviewModal();
        loadSupportTickets();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save Changes & Send Reply';
    }
}

// Realtime
let ticketsRealtimeChannel = null;
function initTicketsRealtime() {
    if (ticketsRealtimeChannel) return;
    ticketsRealtimeChannel = supabase
        .channel('admin-tickets-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
            loadSupportTickets();
        })
        .subscribe();
}

document.addEventListener("DOMContentLoaded", initTicketsPage);
