FROM maven:3.10.0-amazoncorretto-21@sha256:acc191eb1b0b8cc3fe9b88ae662a0ce7e15f6dd09e4b998a7b9c1a16e517ceaa AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
