FROM maven:3.10.0-amazoncorretto-21@sha256:2d2f6cfef10fa7b8ef897aa98d61ee1d06ac888bba4daa4740e959ff3e3de351 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
