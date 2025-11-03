import { Outlet } from "react-router-dom";

export default function RootLayout() {
  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      {/* Optional Global Navigation */}
      <nav className="hidden bg-gray-100 border-b border-gray-300 px-6 py-3 max-md:px-4 max-md:py-2 max-sm:px-3 max-sm:py-1.5">
        <div className="flex items-center gap-4 max-sm:gap-2">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-700 font-medium max-sm:text-sm"
          >
            Trang chủ
          </a>
          <span className="text-gray-400">|</span>
          <a
            href="#"
            className="text-blue-600 hover:text-blue-700 font-medium max-sm:text-sm"
          >
            Cài đặt
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>
    </div>
  );
}
