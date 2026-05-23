FROM maven:3.9.16-amazoncorretto-21@sha256:5b37fc0d5ecb552ec57dfa215e25a3bee9475f9cbf4eab2737e4fa9d9730df75 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
