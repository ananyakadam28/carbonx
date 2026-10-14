/* CarbonX API client
   Change only API_BASE if your backend runs somewhere else. */
const API_BASE = window.CARBONX_API_URL || "http://localhost:5002/api";

function getToken(){
  return localStorage.getItem("carbonxToken");
}

function setAuth(token, user){
  if(token) localStorage.setItem("carbonxToken", token);
  if(user) localStorage.setItem("carbonxUser", JSON.stringify(user));
}

function clearAuth(){
  localStorage.removeItem("carbonxToken");
  localStorage.removeItem("carbonxUser");
}

function getStoredUser(){
  try { return JSON.parse(localStorage.getItem("carbonxUser") || "null"); }
  catch { return null; }
}

async function apiRequest(endpoint, options = {}){
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if(!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if(token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch(err){
    throw new Error("Cannot connect to CarbonX backend. Make sure your Node/Express server is running.");
  }

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

  if(!response.ok){
    if(response.status === 401){
      clearAuth();
      const path = location.pathname.toLowerCase();
      if(!path.includes("carbonx(3)") && !path.includes("carbonx.html")){
        // Let the current page show the actual API error first.
      }
    }
    throw new Error(data.message || data.error || "Request failed");
  }
  return data;
}

function unwrap(data){
  return data?.data ?? data?.result ?? data;
}

function authTokenFrom(data){
  return data?.token || data?.accessToken || data?.data?.token || data?.data?.accessToken;
}

function authUserFrom(data){
  return data?.user || data?.data?.user || data?.data?.account || data?.account || null;
}

function requireAuth(){
  if(!getToken()){
    location.href = "carbonx.html";
    return false;
  }
  return true;
}

function logout(){
  clearAuth();
  location.href = "carbonx.html";
}

window.CarbonXAPI = { API_BASE, getToken, setAuth, clearAuth, getStoredUser, apiRequest, unwrap, authTokenFrom, authUserFrom, requireAuth, logout };
