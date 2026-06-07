const API_BASE_URL = window.GEO_CONFIG.API_BASE_URL;

async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/v1/geo/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error("로그인 실패");
  }

  const data = await response.json();

  localStorage.setItem("accessToken", data.accessToken);

  return data;
}