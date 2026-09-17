FROM maven:3.9.16-amazoncorretto-21@sha256:e98293b3e59b4d77d8a5986883128c0242eb5cfc8dad13c8b1f0460653eaae96 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
