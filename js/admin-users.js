let allUsersCache = [];

// Use global escapeQuote or define a safe fallback
if (!window.escapeQuote) {
    window.escapeQuote = (str) => String(str).replace(/'/g, "\\'");
}
const escapeQuote = window.escapeQuote;

async function initUsersPage() {
    const user = await checkAdminAuth();
    if (!user) return;

    loadUsers();
    initUsersRealtime();
}

async function loadUsers() {
    const tbody = document.getElementById("usersTableBody");
    const { data: users, error, count } = await supabase
        .from("users")
        .select("id, email, phone, first_name, last_name, merchant_id, role, wallet_balance, created_at, is_free_mode, balance_owed, api_key", { count: 'exact' })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Supabase Error:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding:24px;">Failed to load users: ${error.message}</td></tr>`;
        return;
    }

    console.log(`Supabase Count: ${count}, Array Length: ${users?.length || 0}`);
    
    if (count > 0 && (!users || users.length === 0)) {
        console.warn("RLS may be blocking row data while allowing count.");
    }

    if (users) allUsersCache = users;
    renderUsersTable(allUsersCache);
}

function renderUsersTable(users) {
    const listContainer = document.getElementById("usersTableBody");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    try {
        if (!users || users.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:32px; background:var(--bg-darker); border-radius:12px; border:1px solid var(--glass-border);">No users found.</div>`;
            return;
        }

        users.forEach(u => {
            const roleColor = u.role === 'admin' ? '#ef4444' : u.role === 'super_agent' ? '#8b5cf6' : u.role === 'agent' ? '#f59e0b' : '#10b981';
            const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown';
            const initials = fullName === 'Unknown' ? 'U' : fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const code = u.merchant_id || '—';
            const fmBadge = u.is_free_mode 
                ? `<span style="background:rgba(22,101,52,0.1); color:#16a34a; font-weight:800; font-size:9px; padding:2px 6px; border-radius:6px; letter-spacing:0.5px;">FREE ON</span>`
                : `<span style="background:rgba(100,116,139,0.1); color:#64748b; font-weight:800; font-size:9px; padding:2px 6px; border-radius:6px; letter-spacing:0.5px;">FREE OFF</span>`;
            const owed = (u.balance_owed && u.balance_owed > 0) ? `<div class="uc-owed">Owes: ₵${Number(u.balance_owed).toFixed(2)}</div>` : '';

            const apiRender = u.api_key 
                ? `<div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <span style="color:#10b981; font-weight:800; font-size:11px; display:flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; background:#10b981; border-radius:50%; display:inline-block; box-shadow:0 0 8px #10b981;"></span> ACTIVE</span>
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
                        <button class="btn-action" onclick="toggleFreeModeAdmin('${u.id}', ${u.is_free_mode}, '${escapeQuote(u.email)}')" style="display:flex; align-items:center; justify-content:center; gap:6px; background:var(--text-main); color:white; border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><span>⚙️</span> Free</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error("renderUsersTable Error:", err);
        listContainer.innerHTML = `<div style="padding:20px; color:#ef4444; border:1px solid #ef4444; border-radius:8px;">Render Error: ${err.message}</div>`;
    }
}

function filterUsersTable() {
    const q = (document.getElementById("userSearchInput")?.value || "").toLowerCase().trim();
    if (!q) return renderUsersTable(allUsersCache);
    const filtered = allUsersCache.filter(u =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q) ||
        (u.merchant_id || "").toLowerCase().includes(q)
    );
    renderUsersTable(filtered);
}

let usersRealtimeChannel = null;
function initUsersRealtime() {
    if (usersRealtimeChannel) return;
    usersRealtimeChannel = supabase
        .channel('admin-users-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            loadUsers();
        })
        .subscribe();
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

// Global exposure
window.filterUsersTable = filterUsersTable;

document.addEventListener("DOMContentLoaded", initUsersPage);
