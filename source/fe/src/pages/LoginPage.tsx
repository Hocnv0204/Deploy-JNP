import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

interface LoginFormData {
  username: string;
  password: string;
}

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginFormData>({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Validation
      if (!formData.username.trim()) {
        setError("Vui lòng nhập username");
        setIsLoading(false);
        return;
      }

      if (!formData.password) {
        setError("Vui lòng nhập password");
        setIsLoading(false);
        return;
      }

      if (formData.password.length < 6) {
        setError("Password phải có ít nhất 6 ký tự");
        setIsLoading(false);
        return;
      }

      // 🔥 Call backend API
      const response = await fetch("http://localhost:8081/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || "Username hoặc password không chính xác");
        setIsLoading(false);
        return;
      }

      // Parse response
      const data = await response.json();
      const { accessToken, refreshToken } = data;

      if (!accessToken || !refreshToken) {
        setError("Lỗi server: Không nhận được token");
        setIsLoading(false);
        return;
      }

      // Save tokens to localStorage
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);

      // Save user info to localStorage
      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          username: formData.username,
          fullName: formData.username, // Backend không trả về fullName, dùng username tạm
          loginTime: new Date().toISOString(),
        })
      );

      // Navigate to home
      navigate("/");
    } catch (err) {
      console.error("Login error:", err);
      setError("Không thể kết nối đến server. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-lg shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Đăng Nhập</h1>
            <p className="text-gray-600">Chào mừng quay lại</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-red-800">Lỗi</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📧 Username
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Nhập username của bạn"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔑 Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Nhập password của bạn"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                disabled={isLoading}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Đang xử lý...
                </>
              ) : (
                <>🚀 Đăng Nhập</>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 text-sm">hoặc</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-gray-600">
              Chưa có tài khoản?{" "}
              <Link
                to="/signup"
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
              >
                Đăng ký ngay
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white text-sm mt-8 opacity-80">
          © 2024 Meeting App. All rights reserved.
        </p>
      </div>
    </div>
  );
}
