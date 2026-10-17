FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -B -q package

FROM quay.io/keycloak/keycloak:26.0.8
COPY --from=build /build/target/credential-nonce-1.0.0.jar /opt/keycloak/providers/credential-nonce.jar
