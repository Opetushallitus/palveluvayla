FROM maven:3.9.15-amazoncorretto-21@sha256:f226521a1e1ecd9b0494f7d9090af261e2d358dd65327155098ab5dcd4490473 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
