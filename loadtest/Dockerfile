FROM maven:3.10.0-amazoncorretto-21@sha256:67d01e49c4c824e5a0d444414e4825b79dcbbbd40f41e47bc9b4c8e8c84a3217 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
