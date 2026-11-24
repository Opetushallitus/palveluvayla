FROM maven:3.10.2-amazoncorretto-21@sha256:1ab8d1b69babd2a4fdaaec40bcfc22bfbd417b8b8e6c137017cf53f7999e2ec3 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
