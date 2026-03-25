let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize syntax highlighting for code blocks
    if(window.hljs) {
        hljs.highlightAll();
    }

    if (!window.supabase) return;

    // 2. Auth Check
    const { data: { user }, error } = await window.supabase.auth.getUser();
    if (!user || error) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    loadDeveloperKeys();
});

async function loadDeveloperKeys() {
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('merchant_id, api_key, role')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        // Update UI
        if (data.merchant_id) {
            document.getElementById('merchantId').value = data.merchant_id.toUpperCase();
            document.getElementById('dashboardMerchantId').innerText = data.merchant_id.toUpperCase();
        }
        
        const rolePill = document.getElementById('bannerRole');
        if (rolePill) {
            rolePill.innerText = (data.role || 'Client').toUpperCase();
        }

        // If no API key exists, generate one automatically for the first time
        if (!data.api_key) {
            await generateNewKey(false); // silent generation
        } else {
            document.getElementById('secretKey').value = data.api_key;
        }

    } catch (err) {
        console.error("Failed to load developer profile:", err);
        document.getElementById('merchantId').value = "Error loading key";
    }
}

async function generateNewKey(notify = true) {
    // Generate a secure-looking key
    // Prefix 'sk_live_' followed by 32 random hex chars
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    const newKey = `sk_live_${randomHex}`;

    try {
        const { error } = await window.supabase
            .from('users')
            .update({ api_key: newKey })
            .eq('id', currentUser.id);

        if (error) throw error;

        document.getElementById('secretKey').value = newKey;
        
        if (notify && window.showSuccessPopup) {
            window.showSuccessPopup("Key Rolled", "Your new API key is active. Please update your integrations.");
        } else if (notify) {
            alert("New API key generated successfully!");
        }
    } catch (err) {
        console.error("Key generation failed:", err);
        alert("Failed to generate API key: " + err.message);
    }
}

// UI Helpers
function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Mobile compatibility
    navigator.clipboard.writeText(copyText.value);
    
    alert("Copied directly to clipboard!");
}

function toggleVisibility(elementId) {
    const input = document.getElementById(elementId);
    if (input.type === "password") {
        input.type = "text";
    } else {
        input.type = "password";
    }
}

async function rollKey() {
    const confirmed = confirm("WARNING: Rolling your API key will immediately break any existing API integrations you have running. Are you absolutely sure you want to generate a new key?");
    
    if(!confirmed) return;

    await generateNewKey(true);
}
