function togglePassword(){
  const password = document.getElementById("password");
  const icon = document.querySelector("#passwordToggle");
  if(password.type === "password"){
    password.type = "text";
    if(icon) icon.textContent = "🙈";
  } else {
    password.type = "password";
    if(icon) icon.textContent = "👁";
  }
}

function toggleConfirm(){
  const confirmPassword = document.getElementById("confirmPassword");
  const icon = document.querySelector("#confirmToggle");
  if(confirmPassword.type === "password"){
    confirmPassword.type = "text";
    if(icon) icon.textContent = "🙈";
  } else {
    confirmPassword.type = "password";
    if(icon) icon.textContent = "👁";
  }
}

document.addEventListener("DOMContentLoaded", function() {

document.getElementById("signupForm").addEventListener("submit", async function(e){
  e.preventDefault();
  
  let pass = document.getElementById("password").value;
  let confirm = document.getElementById("confirmPassword").value;
  
  if(pass !== confirm){
    alert("Passwords do not match");
    return;
  }
  
  let email = document.getElementById("email").value.trim().toLowerCase();
  let firstName = document.getElementById("firstName").value;
  let lastName = document.getElementById("lastName").value;
  let phone = document.getElementById("phone").value.trim();
  let businessName = document.getElementById("businessName").value.trim();
  let region = document.getElementById("region").value;
  
  const submitButton = this.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.innerText = "Checking...";
  
  try {
    // ==========================================
    // CHECK IF PHONE NUMBER ALREADY EXISTS
    // ==========================================
    const { data: phoneExists, error: phoneCheckError } = await supabase
      .rpc('check_phone_exists', { phone_val: phone });

    if (!phoneCheckError && phoneExists) {
      alert("This phone number is already registered. Please use a different phone number or sign in to your existing account.");
      submitButton.disabled = false;
      submitButton.innerText = "Create Account";
      return;
    }

    // ==========================================
    // CHECK IF EMAIL ADDRESS ALREADY EXISTS
    // ==========================================
    const { data: emailExists, error: emailCheckError } = await supabase
      .rpc('check_email_exists', { email_val: email });

    if (!emailCheckError && emailExists) {
      alert("This email address is already registered. Please use a different email or sign in to your existing account.");
      submitButton.disabled = false;
      submitButton.innerText = "Create Account";
      return;
    }

    submitButton.innerText = "Creating Account...";

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          business_name: businessName,
          region: region
        }
      }
    });
    
    if (error) throw error;
    
    // Dispatch Welcome SMS
    if(window.sendSmsNotification) {
      await window.sendSmsNotification(phone, "Welcome to Data4Ghana! Your account has been successfully created. Enjoy fast, secure data and airtime purchases.");
    }
    
    alert("Account created successfully! Please log in.");
    window.location.href = "login.html";
    
  } catch(error) {
    // Friendly, specific error messages instead of raw Supabase errors
    const msg = (error.message || "").toLowerCase();

    if (msg.includes("already registered") || (msg.includes("email") && msg.includes("exist"))) {
      alert("This email address is already registered. Please sign in or use a different email.");
    } else if (msg.includes("phone") && (msg.includes("exist") || msg.includes("duplicate") || msg.includes("unique"))) {
      alert("This phone number is already registered. Please sign in or use a different phone number.");
    } else if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already")) {
      alert("An account with these details already exists. Please sign in or use different details.");
    } else if (msg.includes("database error")) {
      alert("We encountered an issue creating your account. Please ensure your email and phone number are not already in use, then try again.");
    } else {
      alert("Signup failed: " + error.message);
    }

    submitButton.disabled = false;
    submitButton.innerText = "Create Account";
  }
});

}); // end DOMContentLoaded
