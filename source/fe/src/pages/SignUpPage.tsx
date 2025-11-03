import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

interface SignUpFormData {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
}

interface RegisteredUser {
  username: string;
  password: string;
  fullName: string;
}

export default function SignUpPage() {
  const [formData, setFormData] = useState<SignUpFormData>({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  const validateForm = (): boolean => {
    // Validate full name
    if (!formData.fullName.trim()) {
      setError("Vui lòng nhập tên đầy đủ");
      return false;
    }

    if (formData.fullName.trim().length < 3) {
      setError("Tên phải có ít nhất 3 ký tự");
      return false;
    }

    // Validate username
    if (!formData.username.trim()) {
      setError("Vui lòng nhập username");
      return false;
    }

    if (formData.username.trim().length < 3) {
      setError("Username phải có ít nhất 3 ký tự");
      return false;
    }

    // Validate password
    if (!formData.password) {
      setError("Vui lòng nhập password");
      return false;
    }

    if (formData.password.length < 6) {
      setError("Password phải có ít nhất 6 ký tự");
      return false;
    }

    // Validate confirm password
    if (!formData.confirmPassword) {
      setError("Vui lòng xác nhận password");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password không trùng khớp");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      // Validate form
      if (!validateForm()) {
        setIsLoading(false);
        return;
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get existing users
      const existingUsers = JSON.parse(
        localStorage.getItem("users") || "[]"
      ) as RegisteredUser[];

      // Check if username already exists
      if (existingUsers.some((u) => u.username === formData.username)) {
        setError("Username đã tồn tại. Vui lòng chọn username khác.");
        setIsLoading(false);
        return;
      }

      // Add demo user for testing
      const usersToSave: RegisteredUser[] = [
        {
          username: "demo",
          password: "123456",
          fullName: "Demo User",
        },
        ...existingUsers,
        {
          username: formData.username,
          password: formData.password,
          fullName: formData.fullName,
        },
      ];

      // Save to localStorage
      localStorage.setItem("users", JSON.stringify(usersToSave));

      // Show success message
      setSuccess("✅ Đăng ký thành công! Đang chuyển hướng...");

      // Clear form
      setFormData({
        fullName: "",
        username: "",
        password: "",
        confirmPassword: "",
      });

      // Redirect to login after 1.5 seconds
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-lg shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Đăng Ký</h1>
            <p className="text-gray-600">Tạo tài khoản mới để bắt đầu</p>
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

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-800">Thành công</p>
                <p className="text-sm text-green-700">{success}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                👤 Tên đầy đủ
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Nhập tên đầy đủ của bạn"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition"
                disabled={isLoading}
              />
            </div>

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
                placeholder="Nhập username (tối thiểu 3 ký tự)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition"
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
                placeholder="Nhập password (tối thiểu 6 ký tự)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition"
                disabled={isLoading}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ✅ Xác nhận Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Nhập lại password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition"
                disabled={isLoading}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Đang xử lý...
                </>
              ) : (
                <>✨ Đăng Ký</>
              )}
            </button>
          </form>

          {/* Requirements */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              📋 Yêu cầu:
            </p>
            <ul className="text-xs text-gray-700 space-y-1">
              <li>✓ Tên phải có ít nhất 3 ký tự</li>
              <li>✓ Username phải có ít nhất 3 ký tự</li>
              <li>✓ Password phải có ít nhất 6 ký tự</li>
              <li>✓ Password phải trùng khớp</li>
            </ul>
          </div>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 text-sm">hoặc</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-gray-600">
              Đã có tài khoản?{" "}
              <Link
                to="/login"
                className="font-semibold text-green-600 hover:text-green-700 hover:underline transition"
              >
                Đăng nhập ngay
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
