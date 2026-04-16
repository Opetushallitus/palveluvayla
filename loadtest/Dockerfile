FROM maven:3.9.14-amazoncorretto-21@sha256:8401c372494dfb3997d9900ae82ed3dc728480e331e2ed85886e2ac3340ec759 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
