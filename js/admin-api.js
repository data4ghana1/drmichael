// js/admin-api.js

async function initApiPage() {
  const user = await checkAdminAuth();
  if (!user) return;
  loadApiEndpoints();
}

async function loadApiEndpoints() {
  const tbody = document.getElementById('apiTableBody');
  if (!tbody) return;

  const { data: endpoints, error } = await supabase
      .from('vtu_api_endpoints')
      .select('*')
      .order('created_at', { ascending: false });

  if (error) {
      console.error(error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#ef4444;">Failed to load APIs. Did you run the SQL script?</td></tr>`;
      return;
  }

  if (!endpoints || endpoints.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No VTU APIs configured.</td></tr>`;
      return;
  }

  tbody.innerHTML = '';
  endpoints.forEach(api => {
      const isLive = api.is_active;
      const statusBadge = isLive 
        ? '<span class="status-badge status-success">ACTIVE</span>' 
        : '<span class="status-badge status-failed">INACTIVE</span>';

      const toggleText = isLive ? 'Deactivate' : 'Activate';
      const toggleColor = isLive ? '#ef4444' : '#10b981';
      const toggleBg = isLive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)';

      let providerDisplay = '';
      if (api.provider === 'jaybart') {
          providerDisplay = `<span style="color:#a855f7; font-weight:700;">Justices (P${api.provider_package_id || '?'})</span>`;
      } else if (api.provider === 'spfastit') {
          providerDisplay = `<span style="color:#10b981; font-weight:700;">SPFastIT</span>`;
      } else if (api.provider === 'datawavegh') {
          providerDisplay = `<span style="color:#f59e0b; font-weight:700;">Dennis</span>`;
      } else if (api.provider === 'cleanheart') {
          providerDisplay = `<span style="color:#ef4444; font-weight:700;">Since</span>`;
      } else if (api.provider === 'iget') {
          providerDisplay = `<span style="color:#dc2626; font-weight:700;">iGet API</span>`;
      } else {
          providerDisplay = `<span style="color:#0ea5e9; font-weight:700;">Data4Ghana</span>`;
      }

      tbody.innerHTML += `
          <tr>
              <td style="font-weight:800; color:var(--blue);">${api.network}</td>
              <td>${providerDisplay}</td>
              <td style="font-family:monospace; font-size:12px; color:var(--text-muted);">${api.base_url}</td>
              <td style="font-weight:600;">${api.min_gb} - ${api.max_gb} GB</td>
              <td>${statusBadge}</td>
              <td>
                  <div style="display:flex; gap:8px;">
                      <button class="btn-action" style="background:rgba(59,130,246,0.1); border-color:var(--blue); color:var(--blue); padding:6px 12px;" onclick="openApiModal('${api.id}')">Edit</button>
                      <button class="btn-action" style="background:${toggleBg}; border-color:${toggleColor}; color:${toggleColor}; padding:6px 12px;" onclick="toggleApiStatus('${api.id}', ${!isLive})">${toggleText}</button>
                  </div>
              </td>
          </tr>
      `;
  });
}

window.openApiModal = async function(id = null) {
  document.getElementById('apiId').value = id || '';
  document.getElementById('apiModalTitle').innerText = id ? 'Edit API Configuration' : 'Add API Configuration';

  if (id) {
      const { data, error } = await supabase.from('vtu_api_endpoints').select('*').eq('id', id).single();
      if (error) return alert(error.message);

      document.getElementById('apiName').value = data.name;
      document.getElementById('apiNetwork').value = data.network;
      document.getElementById('apiProvider').value = data.provider || 'data4ghana';
      document.getElementById('apiPackageId').value = data.provider_package_id || '';
      document.getElementById('apiNetworkId').value = data.provider_network_id || '';
      document.getElementById('apiBaseUrl').value = data.base_url;
      document.getElementById('apiKey').value = data.api_key;
      document.getElementById('apiMinGb').value = data.min_gb;
      document.getElementById('apiMaxGb').value = data.max_gb;
  } else {
      document.getElementById('apiName').value = '';
      document.getElementById('apiNetwork').value = 'MTN';
      document.getElementById('apiProvider').value = 'data4ghana';
      document.getElementById('apiPackageId').value = '';
      document.getElementById('apiNetworkId').value = '';
      document.getElementById('apiBaseUrl').value = '';
      document.getElementById('apiKey').value = '';
      document.getElementById('apiMinGb').value = '1';
      document.getElementById('apiMaxGb').value = '100';
  }

  toggleProviderSettings();
  document.getElementById('apiModal').style.display = 'flex';
}

window.toggleProviderSettings = function() {
    const prov = document.getElementById('apiProvider').value;
    const pkgEl = document.getElementById('apiPackageId');
    const nwEl = document.getElementById('apiNetworkId');
    const extGrid = document.getElementById('providerExtendedGrid');
    const baseEl = document.getElementById('apiBaseUrl');
    
    if (prov === 'jaybart') {
        pkgEl.disabled = false;
        nwEl.disabled = false;
        pkgEl.parentElement.style.opacity = '1';
        extGrid.style.display = 'grid';
        if (!baseEl.value) baseEl.value = 'https://agent.jaybartservices.com/api/v1';
    } else if (prov === 'spfastit') {
        pkgEl.disabled = true;
        nwEl.disabled = true;
        pkgEl.value = '';
        nwEl.value = '';
        pkgEl.parentElement.style.opacity = '0.5';
        extGrid.style.display = 'none';
        if (!baseEl.value) baseEl.value = 'https://console.spfastit.com/api/send.html';
    } else if (prov === 'datawavegh') {
        pkgEl.disabled = true;
        nwEl.disabled = true;
        pkgEl.value = '';
        nwEl.value = '';
        pkgEl.parentElement.style.opacity = '0.5';
        extGrid.style.display = 'none';
        if (!baseEl.value) baseEl.value = 'https://dealers.datawavegh.com/wp-json/custom/v1';
    } else if (prov === 'cleanheart') {
        pkgEl.disabled = true;
        nwEl.disabled = true;
        pkgEl.value = '';
        nwEl.value = '';
        pkgEl.parentElement.style.opacity = '0.5';
        extGrid.style.display = 'none';
        if (!baseEl.value) baseEl.value = 'https://cleanheartsolutions.com/api';
    } else if (prov === 'iget') {
        pkgEl.disabled = true;
        nwEl.disabled = true;
        pkgEl.value = '';
        nwEl.value = '';
        pkgEl.parentElement.style.opacity = '0.5';
        extGrid.style.display = 'none';
        if (!baseEl.value) baseEl.value = 'https://iget.onrender.com/api/developer/orders/place';
    } else {
        pkgEl.disabled = true;
        nwEl.disabled = true;
        pkgEl.value = '';
        nwEl.value = '';
        pkgEl.parentElement.style.opacity = '0.5';
        extGrid.style.display = 'none';
        if (!baseEl.value) baseEl.value = 'https://console.data4ghana.com/backend/api/v1';
    }
}

window.closeApiModal = function() {
  document.getElementById('apiModal').style.display = 'none';
}

window.saveApiEndpoint = async function() {
  const id = document.getElementById('apiId').value;
  const payload = {
      name: document.getElementById('apiName').value.trim() || document.getElementById('apiNetwork').value,
      network: document.getElementById('apiNetwork').value,
      provider: document.getElementById('apiProvider').value,
      provider_package_id: document.getElementById('apiPackageId').value.trim() || null,
      provider_network_id: document.getElementById('apiNetworkId').value.trim() || null,
      base_url: document.getElementById('apiBaseUrl').value.trim(),
      api_key: document.getElementById('apiKey').value.trim(),
      min_gb: parseFloat(document.getElementById('apiMinGb').value) || 1,
      max_gb: parseFloat(document.getElementById('apiMaxGb').value) || 100,
      updated_at: new Date().toISOString()
  };

  if (!payload.base_url || !payload.api_key) {
      return alert("Base URL and API Key are required.");
  }

  const btn = document.getElementById('btnSaveApi');
  btn.innerText = 'Saving...';
  btn.disabled = true;

  if (id) {
      const { error } = await supabase.from('vtu_api_endpoints').update(payload).eq('id', id);
      if (error) alert("Error updating API: " + error.message);
  } else {
      payload.is_active = true;
      const { error } = await supabase.from('vtu_api_endpoints').insert(payload);
      if (error) alert("Error creating API: " + error.message);
  }

  btn.innerText = 'Save Configuration';
  btn.disabled = false;
  closeApiModal();
  loadApiEndpoints();
}

window.toggleApiStatus = async function(id, newStatus) {
  const { error } = await supabase.from('vtu_api_endpoints').update({ is_active: newStatus }).eq('id', id);
  if (error) alert(error.message);
  else loadApiEndpoints();
}

// AFA API Modal Controls
window.openAfaApiModal = async function() {
    document.getElementById('afaApiModal').style.display = 'flex';
    
    try {
        const { data } = await supabase.from('system_config').select('value').eq('key', 'afa_settings').single();
        if(data && data.value) {
            document.getElementById('afaApiKey').value = data.value.api_key || '';
            document.getElementById('afaApiEnabled').checked = data.value.enabled !== false; 
        }
    } catch (err) {
        console.error('Error loading AFA API settings:', err);
    }
};

window.closeAfaApiModal = function() {
    document.getElementById('afaApiModal').style.display = 'none';
};

window.saveAfaApiSettings = async function() {
    const btn = document.getElementById('btnSaveAfaApi');
    const oldText = btn.innerText;
    btn.innerText = 'Saving...';
    btn.disabled = true;
    
    try {
        const { data: existing } = await supabase.from('system_config').select('value').eq('key', 'afa_settings').single();
        let config = existing?.value || {};
        
        config.api_key = document.getElementById('afaApiKey').value;
        config.enabled = document.getElementById('afaApiEnabled').checked;

        const { error } = await supabase.from('system_config').upsert({ key: 'afa_settings', value: config });
        
        if (error) throw error;
        
        closeAfaApiModal();
        if(window.showSuccessPopup) {
            window.showSuccessPopup('Config Saved', 'API settings successfully updated.');
        } else {
            alert('AFA API Settings saved.');
        }
    } catch (err) {
        alert('Failed to save settings: ' + err.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
};

document.addEventListener("DOMContentLoaded", initApiPage);
