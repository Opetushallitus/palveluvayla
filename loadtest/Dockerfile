FROM maven:3.9.15-amazoncorretto-21@sha256:3a86e2ab499d09e7e45133dcd4418fbc56be44ab2eb85237e5e16e606056e489 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
