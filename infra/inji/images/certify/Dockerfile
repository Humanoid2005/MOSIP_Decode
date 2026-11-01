FROM injistack/inji-certify-with-plugins:0.14.0 AS upstream
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY --from=upstream /home/inji/certify-service.jar ./certify-service.jar
COPY --from=upstream /home/inji/additional_jars /build/plugins
RUN jar xf certify-service.jar
COPY src /build/src
RUN mkdir /build/classes \
    && javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*:plugins/*' -d /build/classes $(find src -name '*.java') \
    && jar cf /build/playground-demo-provider.jar -C /build/classes .
COPY patch /build/patch
WORKDIR /build/archive
RUN jar xf ../certify-service.jar \
    && javac -proc:none --release 21 -cp 'BOOT-INF/classes:BOOT-INF/lib/*' -d BOOT-INF/classes /build/patch/io/mosip/certify/utils/MDocProcessor.java \
    && jar c0fm /build/patched.jar META-INF/MANIFEST.MF . \
    && jar tf /build/patched.jar | grep -q BOOT-INF/classes/io/mosip/certify/utils/MDocProcessor.class
FROM upstream
COPY --from=build /build/playground-demo-provider.jar /home/inji/additional_jars/playground-demo-provider.jar
COPY --from=build /build/patched.jar /home/inji/certify-service.jar
