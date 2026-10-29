FROM quay.io/keycloak/keycloak:26.0.8 AS upstream
# Compiled against the image's own Keycloak jars, so no Maven dependency download is needed.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY --from=upstream /opt/keycloak/lib/lib/main ./lib
COPY src ./src
RUN mkdir classes \
    && javac -proc:none --release 17 -cp 'lib/*' -d classes $(find src/main/java -name '*.java') \
    && cp -r src/main/resources/. classes/ \
    && jar cf credential-nonce.jar -C classes .

FROM upstream
COPY --from=build /build/credential-nonce.jar /opt/keycloak/providers/credential-nonce.jar
