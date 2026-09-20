const API_BASE_URL = 'http://localhost:8080/api/v1';

// Token Management
export const getAuthToken = () => localStorage.getItem('accessToken');
export const setAuthToken = (token) => localStorage.setItem('accessToken', token);
export const removeAuthToken = () => localStorage.removeItem('accessToken');

// Common Fetch Wrapper
async function request(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            removeAuthToken();
            alert('세션이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = 'geo-login.html';
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP 오류: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`[API Error] ${endpoint}:`, error);
        throw error;
    }
}

// 1. Auth API
export const AuthAPI = {
    // 로그인
    login: async (email, password) => {
        const res = await request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (res.token) setAuthToken(res.token);
        return res;
    },
    // 회원가입
    signup: async (userData) => {
        return request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },
    // Google OAuth 로그인 URL 이동
    googleLogin: () => {
        window.location.href = 'http://localhost:8080/oauth2/authorization/google';
    }
};

// 2. Order & GEO API
export const GeoAPI = {
    // 의뢰 목록 및 대시보드 통계 조회
    getOrders: async () => {
        return request('/geo/orders');
    },
    // 새 의뢰 등록
    createOrder: async (orderData) => {
        return request('/geo/order', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    },
    // 특정 의뢰 GEO 분석 결과 조회
    getReport: async (orderId) => {
        return request(`/geo/report/${orderId}`);
    }
};

// 3. User & Account API
export const UserAPI = {
    // 프로필 및 사용량 조회
    getProfile: async () => {
        return request('/user/profile');
    }
};