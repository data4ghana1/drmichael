// js/admin-core.js

async function checkAdminAuth() {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
        window.location.href = "master-login.html";
        return null;
    }

    const { data: userData, error: userErr } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

    if (userErr || !userData || userData.role !== 'admin') {
        window.location.href = "dashboard.html";
        return null;
    }

    return user;
}

function animateValue(obj, start, end, duration, prefix = '', decimals = 0) {
    if (!obj) return;
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

const escapeQuote = (str) => String(str).replace(/'/g, "\\'");

// Expose shared functions globally if needed
window.checkAdminAuth = checkAdminAuth;
window.animateValue = animateValue;
window.escapeQuote = escapeQuote;
