FROM maven:3.9.16-amazoncorretto-21@sha256:f39bfb9b2aa9d277f9971bb86f061e4db3b6e31340d466c5d5e2dd88734bc129 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
