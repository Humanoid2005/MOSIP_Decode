FROM injistack/mimoto:0.21.0 AS upstream
# Recompiles three classes against the unpacked application and repacks it:
# null-safe repeat login (gap M7), the wallet-key health indicator (M9) and
# input descriptor IDs in presentation submissions (M4). jar c0 stores entries
# uncompressed, as Spring Boot requires for nested jars.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY --from=upstream /home/mosip/mimoto.jar ./mimoto.jar
WORKDIR /build/archive
RUN jar xf ../mimoto.jar
COPY src /build/src
RUN javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*' -d BOOT-INF/classes /build/src/io/mosip/mimoto/service/UserMetadataService.java /build/src/io/mosip/mimoto/health/WalletKeyHealthIndicator.java /build/src/io/mosip/mimoto/service/impl/WalletPresentationServiceImpl.java \
    && jar c0fm /build/patched.jar META-INF/MANIFEST.MF . \
    && jar tf /build/patched.jar | grep -q META-INF/MANIFEST.MF
# Swaps the patched jar into the pinned image.
FROM upstream
COPY --from=build /build/patched.jar /home/mosip/mimoto.jar
