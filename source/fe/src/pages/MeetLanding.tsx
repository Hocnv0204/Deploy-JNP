import { useState } from "react";

export default function MeetLanding() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "Nhận đường liên kết bạn có thể chia sẻ",
      subtitle:
        "Nhập vào Cuộc họp mới để nhận đường liên kết mà bạn có thể gửi cho những người mình muốn họp cùng",
    },
    {
      title: "Bảo vệ cuộc họp của bạn",
      subtitle:
        "Chủ cuộc họp có thể kiểm soát ai có thể tham gia, ghi âm cuộc họp và những người tham gia có thể được yêu cầu xác thực",
    },
    {
      title: "Chia sẻ màn hình của bạn",
      subtitle:
        "Chia sẻ màn hình máy tính, một cửa sổ hoặc thẻ với những người tham gia cuộc họp",
    },
  ];

  const handlePrevSlide = () => {
    setCurrentSlide((p) => (p - 1 + slides.length) % slides.length);
  };

  const handleNextSlide = () => {
    setCurrentSlide((p) => (p + 1) % slides.length);
  };

  return (
    <div className="flex w-full min-h-screen bg-white text-gray-800 font-sans">
      {/* ===== SIDEBAR ===== */}
      <aside className="w-64 bg-gray-50 border-r border-gray-300 p-4 flex flex-col gap-4 flex-shrink-0 lg:w-64 md:w-56 max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-b max-md:p-3 max-sm:p-2">
        {/* Menu Icon */}
        <button className="text-2xl cursor-pointer p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors max-md:text-xl max-md:p-1 max-sm:text-lg">
          ☰
        </button>

        {/* Navigation */}
        <nav className="w-full flex flex-col gap-2 max-md:flex-row max-md:gap-4 max-md:flex-1 max-md:ml-3 max-sm:gap-2 max-sm:ml-1">
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer text-gray-600 text-sm font-medium hover:bg-gray-200 bg-blue-50 text-blue-600 transition-all max-md:px-3 max-md:py-2 max-md:text-xs max-sm:px-2 max-sm:py-1.5 max-sm:text-xs whitespace-nowrap">
            <span className="text-xl max-md:text-base max-sm:text-sm">📅</span>
            <span>Cuộc họp</span>
          </button>
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer text-gray-600 text-sm font-medium hover:bg-gray-200 transition-all max-md:px-3 max-md:py-2 max-md:text-xs max-sm:px-2 max-sm:py-1.5 max-sm:text-xs whitespace-nowrap">
            <span className="text-xl max-md:text-base max-sm:text-sm">📋</span>
            <span>Cuộc gọi</span>
          </button>
        </nav>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flex-1 flex flex-col bg-white overflow-y-auto max-md:w-full">
        {/* ===== HEADER ===== */}
        <header className="flex justify-between items-center px-8 py-4 border-b border-gray-300 bg-white sticky top-0 z-10 max-md:px-4 max-md:py-3 max-sm:px-3 max-sm:py-2 shadow-sm">
          {/* Logo */}
          <div className="flex items-center gap-2 font-semibold text-gray-800 shrink-0">
            <span className="text-3xl leading-none max-md:text-2xl max-sm:text-xl">
              📹
            </span>
            <span className="text-xl max-md:text-base max-sm:text-sm">
              Google Meet
            </span>
          </div>

          {/* Header Icons */}
          <div className="flex gap-2 max-md:gap-1">
            <button
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors text-lg max-md:text-base max-md:p-1.5 max-sm:text-sm max-sm:p-1"
              title="Help"
            >
              ❓
            </button>
            <button
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors text-lg max-md:text-base max-md:p-1.5 max-sm:text-sm max-sm:p-1"
              title="Chat"
            >
              💬
            </button>
            <button
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors text-lg max-md:text-base max-md:p-1.5 max-sm:text-sm max-sm:p-1"
              title="Settings"
            >
              ⚙️
            </button>
            <button
              className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors text-lg max-md:text-base max-md:p-1.5 max-sm:text-sm max-sm:p-1"
              title="More"
            >
              ⋮
            </button>
          </div>
        </header>

        {/* ===== HERO SECTION ===== */}
        <section className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-12 bg-white max-lg:gap-8 max-md:px-4 max-md:py-8 max-md:gap-6 max-sm:px-3 max-sm:py-5 max-sm:gap-4">
          {/* Title & Subtitle */}
          <div className="max-w-2xl text-center flex flex-col gap-4 max-md:gap-3 max-sm:gap-2">
            <h1 className="text-5xl font-bold text-gray-800 leading-tight max-lg:text-4xl max-md:text-3xl max-sm:text-2xl max-xs:text-xl">
              Tính năng họp và gọi video dành cho tất cả mọi người
            </h1>
            <p className="text-base text-gray-600 leading-relaxed max-md:text-sm max-sm:text-xs">
              Kết nối, cộng tác và ăn mừng ở mọi nơi với Google Meet
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center flex-wrap pt-2 max-md:gap-2 max-sm:flex-col max-sm:pt-1">
              <button className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 active:scale-95 transition-all shadow-md hover:shadow-lg max-md:px-4 max-md:py-2 max-md:text-sm max-sm:w-full max-sm:px-3 max-sm:py-2.5">
                <span>➕</span>
                <span className="max-sm:hidden">Cuộc họp mới</span>
              </button>
              <button className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-medium border-2 border-gray-300 rounded-full hover:bg-gray-50 active:scale-95 transition-all max-md:px-4 max-md:py-2 max-md:text-sm max-sm:w-full max-sm:px-3 max-sm:py-2.5">
                <span>🔗</span>
                <span className="max-sm:hidden">
                  Nhập một mã hoặc đường liên kết
                </span>
              </button>
              <button className="px-6 py-3 text-blue-600 font-medium underline hover:text-blue-700 active:scale-95 transition-all max-md:px-4 max-md:py-2 max-md:text-sm max-sm:w-full max-sm:px-3 max-sm:py-2.5">
                Thảo luận
              </button>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-gray-300 pt-2 max-sm:pt-1"></div>
          </div>

          {/* ===== CAROUSEL SECTION ===== */}
          <div className="flex items-center justify-center gap-6 w-full max-w-5xl max-lg:gap-4 max-md:gap-2 max-md:px-2 max-sm:flex-col max-sm:gap-4">
            {/* Previous Button */}
            <button
              onClick={handlePrevSlide}
              className="hidden sm:flex w-10 h-10 bg-white border-2 border-gray-300 rounded-full items-center justify-center text-gray-600 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-95 max-lg:w-9 max-lg:h-9 max-lg:text-sm max-md:hidden"
              title="Previous slide"
            >
              ◀
            </button>

            {/* Carousel Content */}
            <div className="flex flex-col items-center gap-6 text-center flex-1 max-lg:gap-4 max-md:gap-3 max-sm:w-full">
              {/* Illustration Circle */}
              <div className="w-72 h-72 rounded-full bg-gradient-to-br from-blue-100 via-blue-50 to-blue-100 flex items-center justify-center shadow-xl max-lg:w-64 max-lg:h-64 max-md:w-48 max-md:h-48 max-sm:w-40 max-sm:h-40 flex-shrink-0">
                <div className="text-center">
                  <span className="text-6xl max-lg:text-5xl max-md:text-4xl max-sm:text-3xl">
                    🎯
                  </span>
                </div>
              </div>

              {/* Slide Content */}
              <div className="flex flex-col gap-4 max-w-md max-sm:max-w-full max-md:gap-3 max-sm:gap-2">
                <h2 className="text-xl font-bold text-gray-800 leading-tight max-lg:text-lg max-md:text-base max-sm:text-sm">
                  {slides[currentSlide].title}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed max-lg:text-xs max-md:text-xs max-sm:text-xs">
                  {slides[currentSlide].subtitle}
                </p>

                {/* Slide Indicators */}
                <div className="flex gap-3 justify-center pt-2 max-sm:gap-2 max-sm:pt-1">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`transition-all rounded-full border-0 cursor-pointer active:scale-90 ${
                        index === currentSlide
                          ? "w-8 h-2 bg-blue-600"
                          : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Next Button */}
            <button
              onClick={handleNextSlide}
              className="hidden sm:flex w-10 h-10 bg-white border-2 border-gray-300 rounded-full items-center justify-center text-gray-600 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-95 max-lg:w-9 max-lg:h-9 max-lg:text-sm max-md:hidden"
              title="Next slide"
            >
              ▶
            </button>
          </div>

          {/* ===== FOOTER LINK ===== */}
          <footer className="text-center text-xs text-gray-600 pt-4 max-md:pt-2 max-sm:pt-1">
            <a
              href="#"
              className="text-blue-600 font-medium hover:underline transition-colors"
            >
              Tìm hiểu thêm
            </a>
            <span> về Google Meet</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
