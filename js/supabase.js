// js/supabase.js

// Replace these values with your actual Supabase URL and Anon Key
window.SUPABASE_URL = "https://wynmejzsybkxhqvazjzu.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bm1lanpzeWJreGhxdmF6anp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzU4MzAsImV4cCI6MjA4OTE1MTgzMH0.f9MFrnPZ4ODzJOz71zuWtuCThWO5UUyEv1FkWDEzRiU";

// Correctly initialize window.supabase so all scripts can access it
// We check if it's already an initialized client (has .from) vs the library (has .createClient)
if (!window.supabase || typeof window.supabase.from !== 'function') {
  const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);

  if (lib && typeof lib.createClient === 'function') {
    window.supabase = lib.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
}

// Ensure 'supabase' is available globally for all scripts
var supabase = window.supabase;

// Ensure 'supabase' is available globally for all scripts
var supabase = window.supabase;

// Removed global getUser promise cache as it was causing stale auth states during redirects
function detectGhanaNetwork(phone) {
    if (!phone) return 'UNKNOWN';
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('233')) cleanPhone = '0' + cleanPhone.substring(3);
    if (cleanPhone.length !== 10) return 'UNKNOWN';
    
    const prefix = cleanPhone.substring(0, 3);
    const mtnPrefixes = ['024', '025', '053', '054', '055', '059', '098'];
    const telecelPrefixes = ['020', '050'];
    const atPrefixes = ['026', '056', '027', '057'];

    if (mtnPrefixes.includes(prefix)) return 'MTN';
    if (telecelPrefixes.includes(prefix)) return 'Telecel';
    if (atPrefixes.includes(prefix)) return 'AT';

    return 'UNKNOWN';
}

// GLOBAL SMS DISPATCHER (EDGE FUNCTION CALL)
window.sendSmsNotification = async function (phone, message) {
  try {
    if (!window.supabase) return;

    // Smart Network Skipping Logic
    const networkName = detectGhanaNetwork(phone);
    if (networkName !== 'UNKNOWN') {
        const { data: configRow } = await window.supabase
            .from('system_config')
            .select('value')
            .eq('key', 'network_sms_config')
            .single();

        if (configRow && configRow.value) {
            // Strictly check if toggle is specifically set to false. If undefined, allow sending.
            if (configRow.value[networkName] === false) {
                console.warn(`[SMS ABORTED] Notifications are currently globally disabled for the ${networkName} network by Admin control.`);
                return; // Skips calling the Edge Function, saving balance!
            }
        }
    }

    // Call our secure backend Edge Function
    const { data, error } = await window.supabase.functions.invoke('send-sms', {
      body: { to: phone, msg: message }
    });

    if (error) throw error;
    console.log("SMS Dispatch Triggered:", data);
  } catch (err) {
    console.error("SMS Dispatch Failed:", err.message);
  }
};
