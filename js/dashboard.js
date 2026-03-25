// js/dashboard.js

let notificationRotationInterval = null;
let notificationRealtimeChannel = null;

// Load user data, wallet balance, and dashboard stats from Supabase
async function loadDashboardData() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if(error || !user){
    window.location.href="login.html";
    return;
  }

  // Populate user information from metadata
  const metadata = user.user_metadata || {};
  const firstName = metadata.first_name || "User";
  const lastName = metadata.last_name || "";
  const fullName = (firstName + " " + lastName).trim() || "User";

  const welcomeMsgElem = document.getElementById("welcomeMessage");
  if(welcomeMsgElem) welcomeMsgElem.innerText = "Hello, " + (lastName || "User") + "!";

  // Load User Details
  let { data: userData } = await supabase
    .from("users")
    .select("wallet_balance, role, merchant_id, is_free_mode, balance_owed")
    .eq("id", user.id)
    .single();

  if(userData){
    const balElem = document.getElementById("walletBalance");
    if(balElem) animateValue(balElem, 0, Number(userData.wallet_balance || 0), 1000, '', 2);

    // Populate merchant ID
    const merchantId = userData.merchant_id || "D4G-XXXXX";
    const dashMerchantElem = document.getElementById("dashboardMerchantId");
    if(dashMerchantElem) dashMerchantElem.innerText = merchantId;

    // Dynamic role display
    const roleLabels = {
      'admin': 'ADMINISTRATOR',
      'super_agent': 'SUPER AGENT',
      'elite_agent': 'ELITE AGENT',
      'vip_customer': 'VIP CUSTOMER',
      'client': 'CLIENT'
    };
    const roleElem = document.getElementById("bannerRole");
    if(roleElem && userData.role) {
      roleElem.innerText = roleLabels[userData.role] || 'CLIENT';
      // Specialized colors for badges if needed (optional since CSS handles base)
      if (userData.role === 'admin') roleElem.style.background = '#ef4444';
    }

    // Free Mode indicators for account visibility
    const freeModeOn = userData.is_free_mode === true;
    const owed = Number(userData.balance_owed || 0);
    const badge = document.getElementById("accountModeBadge");
    const owedElem = document.getElementById("freeModeBalanceOwed");

    if (badge) {
      badge.style.display = freeModeOn ? 'inline-flex' : 'none';
      badge.innerText = freeModeOn ? 'Free Mode Active' : '';
    }

    if (owedElem) {
      owedElem.style.display = freeModeOn ? 'block' : 'none';
      owedElem.innerText = `Balance Owed: ₵${owed.toFixed(2)}`;
    }
  }

  // Load Dashboard Stats
  loadDashboardStats(user.id);

  // Load Activity Chart
  loadActivityChart(user.id);

  // Load Dynamic Notifications
  loadNotifications();
  initNotificationRealtime();
}

// Notification System Logic
async function loadNotifications() {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("content, type")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error || !notifications || notifications.length === 0) return;

  const slider = document.getElementById("notificationSlider");
  const track = document.getElementById("notificationTrack");
  const dots = document.getElementById("sliderDots");

  if (!slider || !track || !dots) return;

  // Clear and Populate
  track.innerHTML = "";
  dots.innerHTML = "";

  if (notificationRotationInterval) {
    clearInterval(notificationRotationInterval);
    notificationRotationInterval = null;
  }
  
  notifications.forEach((note, index) => {
    // Add Slide
    const slide = document.createElement("div");
    slide.className = `notification-slide ${note.type || 'info'}`;
    slide.innerText = note.content;
    track.appendChild(slide);

    // Add Dot
    const dot = document.createElement("div");
    dot.className = index === 0 ? "dot active" : "dot";
    dots.appendChild(dot);
  });

  slider.style.display = "block";

  // Start Animation
  let currentSlide = 0;
  const slideCount = notifications.length;
  if (slideCount <= 1) return;

  notificationRotationInterval = setInterval(() => {
    currentSlide = (currentSlide + 1) % slideCount;
    track.style.transform = `translateY(-${currentSlide * 50}px)`;
    
    // Update Dots
    const allDots = dots.querySelectorAll(".dot");
    allDots.forEach((d, i) => {
      d.classList.toggle("active", i === currentSlide);
    });
  }, 5000); // 5 seconds per slide
}

function initNotificationRealtime() {
  if (notificationRealtimeChannel) return;

  notificationRealtimeChannel = supabase
    .channel('notifications-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => {
        loadNotifications();
      }
    )
    .subscribe();
}

async function loadDashboardStats(userId) {
  // Get today's date bounds in local time
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("amount, plan")
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("Error fetching orders:", error);
    return;
  }

  const ordersToday = orders.length;
  let amountToday = 0;
  let bundleToday = 0;

  const parseGbFromPlan = (planText) => {
    if (!planText) return 0;
    const match = String(planText).match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : 0;
  };

  orders.forEach(order => {
    amountToday += Number(order.amount) || 0;
    bundleToday += parseGbFromPlan(order.plan);
  });

  const ordersElem = document.getElementById("ordersToday");
  const amountElem = document.getElementById("amountToday");
  const bundleElem = document.getElementById("bundleToday");

  if(ordersElem) animateValue(ordersElem, 0, ordersToday, 800);
  if(amountElem) {
      animateValue(amountElem, 0, amountToday, 800, '₵', 2);
  }
  
  if(bundleElem) {
    let bundleText = bundleToday + "GB";
    if (bundleToday === 0) {
      bundleText = "0GB";
    } else if (bundleToday < 1) {
      bundleText = (bundleToday * 1000).toFixed(0) + "MB";
    } else {
      bundleText = bundleToday.toFixed(1).replace(/\.0$/, '') + "GB";
    }
    bundleElem.innerText = bundleText;
  }
}

// Professional Counter Animation
function animateValue(obj, start, end, duration, prefix = '', decimals = 0) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = (progress * (end - start) + start).toFixed(decimals);
        obj.innerHTML = prefix + current;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

async function loadActivityChart(userId) {
  const ctx = document.getElementById("activityChart");
  if (!ctx) return;

  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const minDate = last7Days[0];

  const { data: txData, error } = await supabase
    .from("transactions")
    .select("amount, created_at")
    .eq("user_id", userId)
    .gte("created_at", minDate + "T00:00:00.000Z");

  if (error || !txData) return;

  const dataset = last7Days.map(date => {
    return txData.filter(tx => (tx.created_at || '').startsWith(date))
                 .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  });

  const displayLabels = last7Days.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [{
        label: 'Volume (₵)',
        data: dataset,
        backgroundColor: 'rgba(37, 99, 235, 0.8)',
        hoverBackgroundColor: 'rgba(37, 99, 235, 1)',
        borderRadius: 6,
        barThickness: 24,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#0f172a',
            padding: 12,
            titleFont: { size: 13, family: 'Inter' },
            bodyFont: { size: 14, family: 'Inter', weight: 'bold' },
            callbacks: {
                label: function(context) {
                    return 'Volume: ₵' + context.parsed.y.toFixed(2);
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          border: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' }
        }
      }
    }
  });
}

// Start Loading Process
loadDashboardData();
