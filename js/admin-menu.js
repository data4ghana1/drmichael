// js/admin-menu.js

async function injectAdminSidebar() {
    const container = document.getElementById('admin-sidebar-container');
    if (!container) {
        console.warn("Admin sidebar container (#admin-sidebar-container) missing!");
        return;
    }

    try {
        const response = await fetch('components/admin-sidebar.html');
        if (!response.ok) throw new Error("Failed to fetch admin sidebar");
        const html = await response.text();
        container.innerHTML = html;
        
        highlightActiveAdminLink();
    } catch (err) {
        console.error("Error injecting admin sidebar:", err);
    }
}

function highlightActiveAdminLink() {
    let currentPage = window.location.pathname.split('/').pop() || 'master-dashboard.html';
    if (!currentPage.includes('.html')) currentPage = 'master-dashboard.html';
    
    const navLinks = document.querySelectorAll('#adminNavLinks a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        // Simple match for href in pathname
        if (window.location.pathname.includes(href)) {
            link.parentElement.classList.add('active');
        } else {
            link.parentElement.classList.remove('active');
        }
    });
}

window.toggleAdminMenu = function() {
    const sidebar = document.getElementById('adminSidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', injectAdminSidebar);
