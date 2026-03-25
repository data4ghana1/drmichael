// js/admin-bulk-sms.js

function toggleCustomNumbers() {
    const type = document.getElementById('recipientType').value;
    const group = document.getElementById('customNumbersGroup');
    group.style.display = (type === 'custom') ? 'block' : 'none';
}

function updateCharCount() {
    const text = document.getElementById('smsMessage').value;
    const charCount = text.length;
    // Basic SMS is 160 chars. If > 160, it's concatenated (usually 153 chars per part)
    const units = charCount <= 160 ? (charCount > 0 ? 1 : 0) : Math.ceil(charCount / 153);
    
    document.getElementById('charCount').innerText = charCount;
    document.getElementById('smsPages').innerText = units;
}

async function startSmsBroadcast() {
    const type = document.getElementById('recipientType').value;
    const msg = document.getElementById('smsMessage').value.trim();
    const sendBtn = document.getElementById('sendBtn');
    const logs = document.getElementById('statusLogs');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');

    if (!msg) {
        alert("Please enter a message.");
        return;
    }

    let recipients = [];

    if (type === 'all') {
        const { data: users, error } = await supabase
            .from('users')
            .select('phone')
            .not('phone', 'is', null);

        if (error) {
            alert("Failed to fetch users: " + error.message);
            return;
        }
        recipients = users.map(u => u.phone).filter(p => p && p.length >= 9);
    } else {
        const raw = document.getElementById('manualNumbers').value;
        recipients = raw.split(',').map(n => n.trim()).filter(n => n.length >= 9);
    }

    if (recipients.length === 0) {
        alert("No valid recipients found.");
        return;
    }

    if (!confirm(`Confirm sending to ${recipients.length} recipients?`)) return;

    // UI Feedback
    sendBtn.disabled = true;
    progressSection.style.display = 'block';
    logs.innerHTML = '';
    addLog(`Broadcast started for ${recipients.length} recipients...`, 'info');

    const BATCH_SIZE = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        try {
            addLog(`Sending batch of ${batch.length} (${i + 1} to ${Math.min(i + BATCH_SIZE, recipients.length)})...`, 'info');

            // Call the Edge Function directly via fetch (handles CORS + avoids SDK strict 2xx error)
            const edgeFnUrl = `${window.SUPABASE_URL}/functions/v1/send-sms`;
            const res = await fetch(edgeFnUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ to: batch, msg: msg })
            });

            let responseText = '';
            try { 
                const data = await res.json(); 
                responseText = (data?.body || JSON.stringify(data) || '').toLowerCase();
            } catch(e) { 
                responseText = (await res.text()).toLowerCase(); 
            }

            if (responseText.includes("1000") || responseText.includes("success")) {
                successCount += batch.length;
                addLog(`✅ Batch of ${batch.length} sent successfully`, 'success');
            } else {
                addLog(`⚠️ Provider response: ${responseText || 'No response'}`, 'warning');
                failCount += batch.length;
            }
        } catch (err) {
            failCount += batch.length;
            console.error("SMS Batch Error:", err);
            addLog(`❌ Batch failed: ${err.message || "Network Error"}`, 'error');
        }

        // Update progress
        const currentProcessed = Math.min(i + BATCH_SIZE, recipients.length);
        const percent = Math.round((currentProcessed / recipients.length) * 100);
        progressFill.style.width = percent + '%';
        progressPercent.innerText = percent + '%';
        
        // Auto-scroll logs
        logs.scrollTop = logs.scrollHeight;
    }

    addLog(`Broadcast complete. Success: ${successCount}, Failed: ${failCount}`, 'info');
    document.getElementById('progressLabel').innerText = "Broadcast Complete";
    sendBtn.disabled = false;
}

function addLog(text, type) {
    const logs = document.getElementById('statusLogs');
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    logs.appendChild(div);
}
