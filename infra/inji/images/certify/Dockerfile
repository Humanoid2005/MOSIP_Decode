FROM injistack/inji-certify-with-plugins:0.14.0 AS upstream
# Compiles the synthetic farmer data provider against the classes, libraries
# and plugins of the pinned image, so no Maven dependency download is needed.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY --from=upstream /home/inji/certify-service.jar ./certify-service.jar
COPY --from=upstream /home/inji/additional_jars /build/plugins
RUN jar xf certify-service.jar
COPY src /build/src
RUN mkdir /build/classes \
    && javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*:plugins/*' -d /build/classes $(find src -name '*.java') \
    && jar cf /build/playground-demo-provider.jar -C /build/classes .
# Backports the upstream mDoc holder-key fix (gap C5): recompiles
# MDocProcessor into a fresh copy of the application and repacks it. jar c0
# stores entries uncompressed, as Spring Boot requires for nested jars, and
# the build fails if the patched class is missing from the result.
COPY patch /build/patch
WORKDIR /build/archive
RUN jar xf ../certify-service.jar \
    && javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*' -d BOOT-INF/classes /build/patch/io/mosip/certify/utils/MDocProcessor.java \
    && jar c0fm /build/patched.jar META-INF/MANIFEST.MF . \
    && jar tf /build/patched.jar | grep -q BOOT-INF/classes/io/mosip/certify/utils/MDocProcessor.class
# Adds the provider to Certify's plugin folder and swaps in the patched jar.
FROM upstream
COPY --from=build /build/playground-demo-provider.jar /home/inji/additional_jars/playground-demo-provider.jar
COPY --from=build /build/patched.jar /home/inji/certify-service.jar
