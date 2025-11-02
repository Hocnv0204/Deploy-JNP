# Stage 1: Build jar with Maven
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

# Copy pom.xml trước để cache dependency
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source và build
COPY src ./src
RUN mvn clean package -DskipTests -Dspring.profiles.active=deploy

# Stage 2: Run application with smaller image
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app
# Copy jar từ stage build
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]