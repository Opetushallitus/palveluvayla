FROM maven:3.9.16-amazoncorretto-21@sha256:378d7b2d07742a557989e3494e5d6bf31ed599ff9f0a0b2f490ceaac48c91370 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
