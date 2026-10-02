FROM maven:3.10.0-amazoncorretto-21@sha256:baa0f210ebac9946b4bb94cd4ed033cc7f5d046f4c8d5cefc87a0578ed3a3b0e AS build
WORKDIR /app

ADD pom.xml .
ADD src ./src
RUN [ "mvn", "package"]

CMD [ "mvn", "gatling:test"]
