// Register the Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker Registered.', reg.scope))
      .catch((err) => console.error('Service Worker Failed:', err));
  });
}

// Global variable to store the native install prompt event
let deferredPrompt;

// Wait for the browser to determine if the app can be installed
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show our custom bottom popup
  showInstallPopup();
});

function showInstallPopup() {
  // Check if popup already exists
  if (document.getElementById('pwa-install-popup')) return;

  // Create Popup Container
  const popup = document.createElement('div');
  popup.id = 'pwa-install-popup';
  
  // High quality dynamic CSS styling for the bottom banner
  popup.style.cssText = `
    position: fixed;
    bottom: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 400px;
    background: rgba(11, 18, 32, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    padding: 16px 20px;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 100000;
    font-family: 'Outfit', sans-serif;
    transition: bottom 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;

  // Inner HTML Content
  popup.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <div style="width:40px; height:40px; background:#00d2ff; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold; color:#0b1220;">
        D4G
      </div>
      <div>
        <h4 style="margin:0; font-size:15px; font-weight:600;">Install Data4Ghana</h4>
        <p style="margin:2px 0 0 0; font-size:12px; color:rgba(255,255,255,0.6);">Add to home screen for quick access</p>
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <button id="pwa-dismiss" style="background:transparent; border:none; color:rgba(255,255,255,0.5); font-weight:600; font-size:13px; cursor:pointer; padding:8px;">Later</button>
      <button id="pwa-install" style="background:linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%); color:white; border:none; border-radius:8px; padding:8px 14px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 4px 15px rgba(0, 210, 255, 0.3);">Install</button>
    </div>
  `;

  document.body.appendChild(popup);

  // Trigger animation after a slight delay
  setTimeout(() => {
    popup.style.bottom = '0';
  }, 1000);

  // Bind Buttons
  document.getElementById('pwa-install').addEventListener('click', async () => {
    // Hide popup
    popup.style.bottom = '-100px';
    // Show the native browser prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User responded to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, block it out
    deferredPrompt = null;
    
    setTimeout(() => popup.remove(), 500);
  });

  document.getElementById('pwa-dismiss').addEventListener('click', () => {
    // Hide and remove
    popup.style.bottom = '-100px';
    setTimeout(() => popup.remove(), 500);
  });
}

// Confirm successful installation
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed successfully');
  // Clear the deferredPrompt so it can be garbage collected
  deferredPrompt = null;
});
