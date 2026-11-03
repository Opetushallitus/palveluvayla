FROM maven:3.10.0-amazoncorretto-21@sha256:d3d7ea95ac26345438ac49a2b2db5fe2b296eacff8902da7961cb5c6b5c31632 AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
