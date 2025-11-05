# ----- Giai đoạn 1: Build (Xây dựng) -----
# Sử dụng image Go 1.21 (hoặc phiên bản bạn dùng) trên nền Alpine (nhẹ)
FROM golang:1.25-alpine AS builder

# Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# Tải trước các dependency (phụ thuộc)
# Copy file go.mod và go.sum
COPY go.mod go.sum ./
# Tải các module về. Bước này sẽ được cache lại nếu file mod/sum không đổi
RUN go mod download

# === THAY ĐỔI 1 ===
# Copy toàn bộ source code (các file .go) từ thư mục 'main' vào
COPY main/ ./main/

# Build ứng dụng
# -o sfu-server: Tên file binary đầu ra
# -ldflags="-s -w": Loại bỏ debug info, giảm kích thước file
# CGO_ENABLED=0: Tạo file binary tĩnh (static), rất quan trọng để chạy trên Alpine
# === THAY ĐỔI 2 ===
# Chỉ định build package ở thư mục ./main
RUN CGO_ENABLED=0 go build -o sfu-server -ldflags="-s -w" ./main

# ----- Giai đoạn 2: Final (Chạy) -----
# Sử dụng image Alpine mới, siêu nhẹ
FROM alpine:latest

# Cài đặt ca-certificates (cần cho HTTPS, ví dụ khi webhook gọi ra ngoài)
RUN apk --no-cache add ca-certificates

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy file binary "sfu-server" đã build từ giai đoạn 'builder'
COPY --from=builder /app/sfu-server .

# (QUAN TRỌNG) Mở các cổng
# Cổng 8090 (hoặc cổng HTTP_PORT bạn đặt) cho API
EXPOSE 8090
# Dải cổng UDP bạn đã cấu hình trong code cho WebRTC (RTP)
EXPOSE 50000-50100/udp

# Lệnh để chạy khi container khởi động
# Chúng ta sẽ truyền các biến môi trường (ENV) khi chạy `docker run`
CMD ["./sfu-server"]