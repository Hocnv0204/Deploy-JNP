import { useNavigate } from "react-router-dom";

export default function ErrorPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
      <div className="text-center max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 max-md:p-6 max-sm:p-4">
        {/* Error Icon */}
        <div className="text-6xl mb-6 max-sm:text-5xl animate-bounce">❌</div>

        {/* Error Title */}
        <h1 className="text-4xl font-bold text-gray-800 mb-4 max-md:text-3xl max-sm:text-2xl">
          Oops!
        </h1>

        {/* Error Message */}
        <p className="text-gray-600 text-lg mb-8 leading-relaxed max-md:text-base max-sm:text-sm max-sm:mb-6">
          Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại.
        </p>

        {/* Error Code */}
        <div className="bg-gray-100 rounded-lg p-4 mb-8 font-mono text-sm text-gray-600 max-sm:mb-6 max-sm:p-3">
          Error: Page Not Found (404)
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 flex-col sm:flex-row max-sm:gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-all active:scale-95 max-sm:py-2.5 max-sm:text-sm"
          >
            ← Quay lại
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all active:scale-95 max-sm:py-2.5 max-sm:text-sm"
          >
            🏠 Về trang chủ
          </button>
        </div>
      </div>
    </div>
  );
}
