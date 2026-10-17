FROM injistack/mimoto:0.21.0 AS upstream
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY --from=upstream /home/mosip/mimoto.jar ./mimoto.jar
WORKDIR /build/archive
RUN jar xf ../mimoto.jar
COPY src /build/src
RUN javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*' -d BOOT-INF/classes /build/src/io/mosip/mimoto/service/UserMetadataService.java /build/src/io/mosip/mimoto/health/WalletKeyHealthIndicator.java \
    && jar c0fm /build/patched.jar META-INF/MANIFEST.MF . \
    && jar tf /build/patched.jar | grep -q META-INF/MANIFEST.MF
FROM upstream
COPY --from=build /build/patched.jar /home/mosip/mimoto.jar
